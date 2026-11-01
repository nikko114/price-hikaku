// 価格の記録（新規・編集）
import { html, mount, appBar, toast, confirmDanger, saveErrorMessage } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as images from '../images.js';
import * as router from '../router.js';
import {
  UNIT_TYPES, UNIT_TYPE_KEYS, unitsOf, unitTypeOf, defaultUnitOf, defaultCompareAmount,
  parseNumber, unitPrice, priceWithTax,
} from '../units.js';
import { summarize, judge, byNewest } from '../compare.js';
import {
  todayStr, isValidDateStr, fmtDate, relativeDay, fmtPrice, perText, unitPriceText, diffAmountText, fmtPercent,
} from '../format.js';
import { matchScore } from '../search.js';
import { categoryInfo, DEFAULT_TAX_RATE } from '../defaults.js';
import { thumb, segmented, pressSeg, notFound, storeName, requestPersistOnce, categoryNames } from './common.js';

const RECENT_STORE_MS = 2 * 60 * 60 * 1000; // 2時間以内に記録したお店を最初から選んでおく
const MAX_STORE_CHIPS = 8;

function latestRecordTime(productId) {
  let max = '';
  for (const r of state.records()) if (r.productId === productId && r.date > max) max = r.date;
  return max;
}

// お店を最近使った順に
function storesByRecent() {
  const last = new Map();
  for (const r of state.records()) {
    const t = r.createdAt || '';
    if (t > (last.get(r.storeId) || '')) last.set(r.storeId, t);
  }
  return [...state.stores()].sort((a, b) => (last.get(b.id) || b.createdAt || '').localeCompare(last.get(a.id) || a.createdAt || ''));
}

export default {
  live: false,
  render(el, { params, query }) {
    const today = todayStr();
    const settings = state.settings();
    const editing = params.id ? state.record(params.id) : null;
    if (params.id && !editing) return notFound(el, '記録が見つかりません');

    // ---- フォームの状態 ----
    const f = {
      productId: null,
      productQuery: '',
      newProductName: '', // 入っていれば「新しい商品」
      newCategory: '',
      newTaxRate: DEFAULT_TAX_RATE,
      newPhoto: null, // { full, thumb, previewUrl }
      storeId: null,
      addingStore: false,
      newStoreName: '',
      price: '',
      taxMode: settings.lastTaxMode || 'incl',
      amount: '',
      unit: 'g',
      pack: '1',
      date: today,
      isSale: false,
      note: '',
    };

    if (editing) {
      Object.assign(f, {
        productId: editing.productId,
        storeId: editing.storeId,
        price: String(editing.price),
        taxMode: editing.taxIncluded ? 'incl' : 'excl',
        amount: String(editing.amount),
        unit: editing.unit,
        pack: String(editing.packCount || 1),
        date: editing.date,
        isSale: !!editing.isSale,
        note: editing.note || '',
      });
    } else {
      if (query.product && state.product(query.product)) f.productId = query.product;
      if (query.store && state.store(query.store)) {
        f.storeId = query.store;
      } else {
        const last = [...state.records()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
        if (last && Date.now() - Date.parse(last.createdAt) < RECENT_STORE_MS && state.store(last.storeId)) f.storeId = last.storeId;
      }
      if (query.price) f.price = query.price;
      if (query.amount) f.amount = query.amount;
      if (query.unit && unitTypeOf(query.unit)) f.unit = query.unit;
      if (query.pack) f.pack = query.pack;
      if (f.storeId) f.taxMode = state.store(f.storeId).priceInput || f.taxMode;
      applyProductDefaults();
    }

    const fallback = editing ? `/products/${editing.productId}` : query.product ? `/products/${query.product}` : '/';

    // ---- 計算用 ----
    function currentProduct() {
      return f.productId ? state.product(f.productId) : null;
    }

    // 商品が決まっていないときは、選んだ単位から仮の商品を作って単価を出す
    function calcProduct() {
      const p = currentProduct();
      if (p) return p;
      const type = unitTypeOf(f.unit) || 'weight';
      return { id: null, unitType: type, compareAmount: defaultCompareAmount(type), countLabel: type === 'count' ? f.unit : null, taxRate: f.newTaxRate };
    }

    function currentRecord(p) {
      return {
        price: parseNumber(f.price),
        taxIncluded: f.taxMode === 'incl',
        taxRate: p.taxRate ?? DEFAULT_TAX_RATE,
        amount: parseNumber(f.amount),
        unit: f.unit,
        packCount: f.pack === '' ? 1 : parseNumber(f.pack),
      };
    }

    // 商品を選んだら、単位を合わせて、内容量が空なら前回の記録から入れる
    function applyProductDefaults() {
      const p = currentProduct();
      if (!p) return;
      if (unitTypeOf(f.unit) !== p.unitType) f.unit = defaultUnitOf(p.unitType, p.countLabel);
      if (!f.amount) {
        const recs = state.recordsOfProduct(p.id).filter((r) => unitTypeOf(r.unit) === p.unitType).sort(byNewest);
        const last = recs.find((r) => r.storeId === f.storeId) || recs[0];
        if (last) {
          f.amount = String(last.amount);
          f.unit = last.unit;
          f.pack = String(last.packCount || 1);
        }
      }
    }

    // ---- 部分ごとの描画 ----
    function productSectionHtml() {
      const p = currentProduct();
      if (p) {
        return html`<div class="row picked">
          ${thumb(p)}
          <span class="row-main"><span class="row-title">${p.name}</span><span class="row-sub">${p.category ? `${p.category} ・ ` : ''}${perText(p)}で比較</span></span>
          <button type="button" class="link-btn" data-act="change-product">変更</button>
        </div>`;
      }
      if (f.newProductName) {
        const cats = categoryNames();
        return html`<div class="row picked">
            <span class="thumb is-new" aria-hidden="true">${f.newPhoto ? html`<img src="${f.newPhoto.previewUrl}" alt="">` : '🆕'}</span>
            <span class="row-main"><span class="row-title">${f.newProductName}</span><span class="row-sub">新しい商品として登録します</span></span>
            <button type="button" class="link-btn" data-act="change-product">変更</button>
          </div>
          <div class="field">
            <span class="field-label">カテゴリ</span>
            <div class="chips is-wrap" role="group" aria-label="カテゴリ">
              ${cats.map((c) => html`<button type="button" class="chip" data-new-cat="${c}" aria-pressed="${String(f.newCategory === c)}">${c}</button>`)}
            </div>
          </div>
          <div class="field field-inline">
            <span class="field-label">消費税率</span>
            ${segmented('newTax', [[8, '8%'], [10, '10%']], f.newTaxRate, { label: '消費税率', small: true })}
          </div>
          <div class="field field-inline">
            <span class="field-label">写真（なくてもOK）</span>
            <span class="photo-actions">
              ${f.newPhoto ? html`<button type="button" class="link-btn is-danger" data-act="remove-photo">写真を外す</button>` : ''}
              <button type="button" class="btn is-small" data-act="pick-photo">${icons.camera}<span>${f.newPhoto ? '撮り直す' : '写真を追加'}</span></button>
            </span>
          </div>`;
      }
      return html`<div class="field">
          <label class="search is-boxed">
            ${icons.search}
            <input type="search" data-ref="productQuery" value="${f.productQuery}" placeholder="商品名（例: 鶏むね肉）" autocomplete="off" enterkeyhint="done" aria-label="商品名">
          </label>
        </div>
        <ul class="list suggest" data-ref="suggest">${suggestionsHtml()}</ul>`;
    }

    function suggestionsHtml() {
      const q = f.productQuery.trim();
      const all = state.products();
      let list;
      if (!q) {
        list = [...all].sort((a, b) => latestRecordTime(b.id).localeCompare(latestRecordTime(a.id)) || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6);
      } else {
        list = all
          .map((p) => ({ p, score: matchScore(q, p.name) }))
          .filter((x) => x.score >= 0)
          .sort((a, b) => b.score - a.score || latestRecordTime(b.p.id).localeCompare(latestRecordTime(a.p.id)))
          .slice(0, 8)
          .map((x) => x.p);
      }
      const exact = q && all.some((p) => matchScore(q, p.name) === 3);
      return html`${!q && list.length ? html`<li class="suggest-label">最近の商品</li>` : ''}
        ${list.map((p) => html`<li><button type="button" class="row suggest-row" data-pick-product="${p.id}">
          ${thumb(p)}
          <span class="row-main"><span class="row-title">${p.name}</span>${p.category ? html`<span class="row-sub">${p.category}</span>` : ''}</span>
        </button></li>`)}
        ${q && !exact ? html`<li><button type="button" class="row suggest-row is-new" data-act="new-product">
          <span class="thumb is-new" aria-hidden="true">${icons.plus}</span>
          <span class="row-main"><span class="row-title">「${q}」を新しい商品として追加</span></span>
        </button></li>` : ''}
        ${!q && !list.length ? html`<li class="suggest-label">商品名を入れると、新しい商品として登録できます</li>` : ''}`;
    }

    function storeSectionHtml() {
      const s = f.storeId ? state.store(f.storeId) : null;
      if (s) {
        return html`<div class="row picked">
          <span class="thumb" data-fallback="🏪" aria-hidden="true"></span>
          <span class="row-main"><span class="row-title">${s.name}</span>${s.chain ? html`<span class="row-sub">${s.chain}</span>` : ''}</span>
          <button type="button" class="link-btn" data-act="change-store">変更</button>
        </div>`;
      }
      if (f.addingStore) {
        return html`<div class="field">
          <label class="field-label" for="f-new-store">新しいお店の名前</label>
          <input id="f-new-store" class="input" data-ref="newStoreName" value="${f.newStoreName}" placeholder="例: イオン 〇〇店" autocomplete="off" enterkeyhint="next">
          <div class="field-foot"><button type="button" class="link-btn" data-act="cancel-new-store">登録済みのお店から選ぶ</button></div>
        </div>`;
      }
      const list = storesByRecent();
      const chips = list.slice(0, MAX_STORE_CHIPS);
      const rest = list.slice(MAX_STORE_CHIPS).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      return html`<div class="field">
        <div class="chips is-wrap" role="group" aria-label="お店">
          ${chips.map((st) => html`<button type="button" class="chip" data-pick-store="${st.id}">${st.name}</button>`)}
          <button type="button" class="chip is-add" data-act="new-store">＋ 新しいお店</button>
        </div>
        ${rest.length ? html`<select class="input select" data-ref="storeSelect" aria-label="その他のお店">
          <option value="">その他のお店から選ぶ…</option>
          ${rest.map((st) => html`<option value="${st.id}">${st.name}</option>`)}
        </select>` : ''}
        ${!list.length ? html`<p class="field-hint">まだお店がありません。「＋ 新しいお店」から登録してください。</p>` : ''}
      </div>`;
    }

    function unitOptionsHtml() {
      const p = currentProduct();
      const opt = (u) => html`<option value="${u}" ${u === f.unit ? 'selected' : ''}>${u}</option>`;
      if (p) return unitsOf(p.unitType).map(opt);
      return UNIT_TYPE_KEYS.map((t) => html`<optgroup label="${UNIT_TYPES[t].label}">${unitsOf(t).map(opt)}</optgroup>`);
    }

    function taxHintHtml() {
      if (f.taxMode !== 'excl') return '';
      const p = calcProduct();
      const price = parseNumber(f.price);
      const withTax = priceWithTax({ price, taxIncluded: false, taxRate: p.taxRate });
      return html`税${p.taxRate}%を足して計算します${Number.isFinite(withTax) && price > 0 ? `（税込 ${fmtPrice(Math.round(withTax * 100) / 100)}）` : ''}`;
    }

    function verdictHtml() {
      const p = calcProduct();
      const mode = state.settings().priceDisplay;
      const u = unitPrice(currentRecord(p), p.compareAmount);
      if (!Number.isFinite(u)) {
        return { cls: 'is-empty', body: html`<p class="verdict-placeholder">値段と量を入れると、${perText(p)}の値段が出ます</p>` };
      }
      const main = unitPriceText(u, p, mode);
      const other = unitPriceText(u, p, mode === 'qtyPerYen' ? 'yenPerQty' : 'qtyPerYen');
      const head = html`<p class="verdict-price">${main.long}</p><p class="verdict-sub">${other.long}</p>`;

      if (!p.id) {
        const msg = f.newProductName ? '📝 はじめての記録です' : '商品を選ぶと、ほかのお店と比べられます';
        return { cls: '', body: html`${head}<p class="verdict-msg">${msg}</p>` };
      }
      const recs = state.recordsOfProduct(p.id).filter((r) => !editing || r.id !== editing.id);
      const summary = summarize(p, recs, { today, staleDays: state.settings().staleDays });
      const j = judge({ unitPrice: u, storeId: f.storeId, summary });
      const diffText = (a, b) => diffAmountText(a, b, p, mode);
      const per = perText(p);
      const staleNote = (s) => (s && s.stale ? html`<span class="verdict-note">※ ${storeName(s.storeId)}の記録は${relativeDay(s.ref.record.date, today)}のものです</span>` : '');
      let cls = '';
      let msg;
      let detail = '';
      switch (j.level) {
        case 'first':
          msg = '📝 この商品のはじめての記録です';
          break;
        case 'record':
          cls = 'is-good';
          msg = '🎉 過去最安！';
          detail = html`これまでの最安（${storeName(j.prevMin.record.storeId)}・${fmtDate(j.prevMin.record.date, today)}）より${mode === 'qtyPerYen' ? ` 100円で ${diffText(u, j.prevMin.unitPrice)} 多い` : ` ${per} ${diffText(u, j.prevMin.unitPrice)} 安い`}`;
          break;
        case 'best':
          cls = 'is-good';
          msg = '✅ いちばん安い';
          detail = j.diff < -1e-9
            ? html`2番目の${storeName(j.bestOther.storeId)}より${mode === 'qtyPerYen' ? ` 100円で ${diffText(u, j.bestOther.rankPrice)} 多い` : ` ${per} ${diffText(u, j.bestOther.rankPrice)} 安い`} ${staleNote(j.bestOther)}`
            : html`${storeName(j.bestOther.storeId)}と同じ値段です ${staleNote(j.bestOther)}`;
          break;
        case 'near':
          cls = 'is-near';
          msg = '🙂 ほぼ最安';
          detail = html`最安の${storeName(j.bestOther.storeId)}より${mode === 'qtyPerYen' ? ` 100円で ${diffText(u, j.bestOther.rankPrice)} 少ない` : ` ${per} ${diffText(u, j.bestOther.rankPrice)} 高い`}（${fmtPercent(j.ratio)}）${staleNote(j.bestOther)}`;
          break;
        case 'expensive':
          cls = 'is-bad';
          msg = '⚠️ 割高';
          detail = html`${storeName(j.bestOther.storeId)}のほうが${mode === 'qtyPerYen' ? ` 100円で ${diffText(u, j.bestOther.rankPrice)} 多く買える` : ` ${per} ${diffText(u, j.bestOther.rankPrice)} 安い`}（${fmtPercent(j.ratio)}高い）${staleNote(j.bestOther)}`;
          break;
        case 'onlyStore': {
          const d = j.diff;
          msg = '📝 ほかのお店の記録はまだありません';
          if (j.ref) {
            const when = fmtDate(j.ref.record.date, today);
            detail = Math.abs(d) < 1e-9
              ? html`このお店の前回（${when}）と同じ値段です`
              : html`このお店の前回（${when}）より${mode === 'qtyPerYen' ? ` 100円で ${diffText(u, j.ref.unitPrice)} ${d < 0 ? '多い' : '少ない'}` : ` ${per} ${diffText(u, j.ref.unitPrice)} ${d < 0 ? '安い' : '高い'}`}`;
          }
          break;
        }
        default:
          msg = '';
      }
      return { cls, body: html`${head}<p class="verdict-msg">${msg}</p>${detail ? html`<p class="verdict-detail">${detail}</p>` : ''}` };
    }

    const ref = (name) => el.querySelector(`[data-ref="${name}"]`);

    function renderProduct() {
      mount(ref('product'), productSectionHtml());
      images.hydrate(ref('product'));
    }
    function renderStore() {
      mount(ref('store'), storeSectionHtml());
    }
    function renderUnits() {
      mount(ref('unit'), unitOptionsHtml());
      ref('unit').value = f.unit;
    }
    function renderVerdict() {
      const v = verdictHtml();
      const box = ref('verdict');
      box.className = `verdict ${v.cls}`;
      mount(box, v.body);
      mount(ref('taxHint'), taxHintHtml());
    }
    function syncAmountInputs() {
      ref('amount').value = f.amount;
      ref('pack').value = f.pack;
    }

    function renderAll() {
      mount(el, html`
        ${appBar({
          title: editing ? '記録を編集' : '価格を記録',
          left: html`<button type="button" class="appbar-btn" data-act="cancel">キャンセル</button>`,
          right: html`<button type="button" class="appbar-btn is-strong" data-act="save">保存</button>`,
        })}
        <form class="page" data-ref="form" novalidate autocomplete="off">
          <section class="section">
            <h2 class="section-title">商品</h2>
            <div class="card" data-ref="product"></div>
          </section>

          <section class="section">
            <h2 class="section-title">お店</h2>
            <div class="card" data-ref="store"></div>
          </section>

          <section class="section">
            <h2 class="section-title">値段と量</h2>
            <div class="card">
              <div class="field">
                <label class="field-label" for="f-price">値段</label>
                <div class="field-row">
                  <span class="input-affix">
                    <input id="f-price" class="input" data-ref="price" inputmode="decimal" value="${f.price}" placeholder="298" enterkeyhint="next">
                    <span class="affix">円</span>
                  </span>
                  ${segmented('taxMode', [['incl', '税込'], ['excl', '税抜']], f.taxMode, { label: '値段の入力方法' })}
                </div>
                <p class="field-hint" data-ref="taxHint"></p>
              </div>
              <div class="field">
                <label class="field-label" for="f-amount">内容量 × 入数</label>
                <div class="field-row amount-row">
                  <input id="f-amount" class="input" data-ref="amount" inputmode="decimal" value="${f.amount}" placeholder="500" enterkeyhint="next">
                  <select class="input select unit-select" data-ref="unit" aria-label="単位"></select>
                  <span class="times" aria-hidden="true">×</span>
                  <input class="input pack-input" data-ref="pack" inputmode="numeric" value="${f.pack}" aria-label="入数" enterkeyhint="next">
                </div>
                <p class="field-hint">例: 500ml×6本 → 500・ml・6 ／ 70g×4個 → 70・g・4 ／ 卵10個 → 10・個・1</p>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="verdict" data-ref="verdict" aria-live="polite"></div>
          </section>

          <section class="section">
            <h2 class="section-title">そのほか</h2>
            <div class="card">
              <div class="field field-inline">
                <label class="field-label" for="f-date">日付</label>
                <input id="f-date" type="date" class="input date-input" data-ref="date" value="${f.date}" max="${today}">
              </div>
              <div class="field field-inline">
                <label class="field-label" for="f-sale">特売・値引き</label>
                <input id="f-sale" type="checkbox" class="switch" data-ref="sale" ${f.isSale ? 'checked' : ''}>
              </div>
              <div class="field">
                <label class="field-label" for="f-note">メモ（銘柄・産地など）</label>
                <input id="f-note" class="input" data-ref="note" value="${f.note}" placeholder="例: トップバリュ、国産" enterkeyhint="done">
              </div>
            </div>
          </section>

          <div class="actions">
            <button type="submit" class="btn is-primary is-block">${editing ? '更新する' : '保存'}</button>
            ${editing
              ? html`<button type="button" class="btn is-danger is-block" data-act="delete">${icons.trash}<span>この記録を削除</span></button>`
              : html`<button type="button" class="btn is-block" data-act="save-continue">保存して同じお店で続ける</button>`}
          </div>
          <input type="file" accept="image/*" data-ref="photo" hidden>
        </form>`);
      renderProduct();
      renderStore();
      renderUnits();
      renderVerdict();
    }

    // ---- 操作 ----
    function pickProduct(id) {
      f.productId = id;
      f.newProductName = '';
      f.productQuery = '';
      applyProductDefaults();
      renderProduct();
      renderUnits();
      syncAmountInputs();
      renderVerdict();
      if (!f.storeId) return;
      focusField(ref('price'));
    }

    function pickStore(id) {
      f.storeId = id;
      f.addingStore = false;
      const s = state.store(id);
      if (s?.priceInput) {
        f.taxMode = s.priceInput;
        for (const b of el.querySelectorAll('[data-seg="taxMode"] button')) b.setAttribute('aria-pressed', String(b.dataset.value === f.taxMode));
      }
      applyProductDefaults();
      renderStore();
      renderUnits();
      syncAmountInputs();
      renderVerdict();
    }

    function focusField(input) {
      if (!input) return;
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function validate() {
      const p = currentProduct();
      if (!p && !f.newProductName.trim()) return ['商品を選んでください', ref('productQuery')];
      if (!f.storeId && !f.newStoreName.trim()) return ['お店を選んでください', ref('newStoreName')];
      if (!(parseNumber(f.price) > 0)) return ['値段を入れてください', ref('price')];
      if (!(parseNumber(f.amount) > 0)) return ['内容量を入れてください', ref('amount')];
      const pack = f.pack === '' ? 1 : parseNumber(f.pack);
      if (!(pack >= 1) || !Number.isInteger(pack)) return ['入数は1以上の整数で入れてください', ref('pack')];
      if (p && unitTypeOf(f.unit) !== p.unitType) return ['単位が商品と合っていません', ref('unit')];
      if (!unitTypeOf(f.unit)) return ['単位を選んでください', ref('unit')];
      if (!isValidDateStr(f.date)) return ['日付が正しくありません', ref('date')];
      return null;
    }

    let saving = false;
    async function save({ continueSameStore = false } = {}) {
      if (saving) return;
      const err = validate();
      if (err) {
        toast(err[0]);
        focusField(err[1]);
        return;
      }
      saving = true;
      try {
        const p = currentProduct();
        let newProduct = null;
        if (!p) {
          const type = unitTypeOf(f.unit);
          let imageId = null;
          if (f.newPhoto) {
            try {
              imageId = await images.savePhoto(f.newPhoto);
            } catch (e) {
              console.error(e);
              toast('写真は保存できませんでした（記録は保存します）');
            }
          }
          newProduct = {
            name: f.newProductName.trim(),
            category: f.newCategory,
            unitType: type,
            countLabel: type === 'count' ? f.unit : null,
            compareAmount: defaultCompareAmount(type),
            taxRate: f.newTaxRate,
            imageId,
            memo: '',
            favorite: false,
          };
        }
        const newStore = f.storeId ? null : { name: f.newStoreName.trim(), chain: '', lat: null, lng: null, osmId: null, priceInput: f.taxMode, memo: '' };
        const record = {
          productId: p ? p.id : null,
          storeId: f.storeId,
          date: f.date,
          price: parseNumber(f.price),
          taxIncluded: f.taxMode === 'incl',
          taxRate: p ? p.taxRate : f.newTaxRate,
          amount: parseNumber(f.amount),
          unit: f.unit,
          packCount: f.pack === '' ? 1 : parseNumber(f.pack),
          isSale: f.isSale,
          note: f.note.trim(),
        };
        let saved;
        try {
          saved = state.saveRecord({
            recordId: editing ? editing.id : null,
            record,
            newProduct,
            newStore,
            storePatch: f.storeId ? { priceInput: f.taxMode } : null,
          });
          if (state.settings().lastTaxMode !== f.taxMode) state.updateSettings({ lastTaxMode: f.taxMode });
        } catch (e) {
          console.error(e);
          toast(saveErrorMessage(e));
          return;
        }
        requestPersistOnce();

        if (continueSameStore) {
          if (f.newPhoto) URL.revokeObjectURL(f.newPhoto.previewUrl);
          Object.assign(f, {
            productId: null, productQuery: '', newProductName: '', newCategory: '', newTaxRate: DEFAULT_TAX_RATE, newPhoto: null,
            storeId: saved.storeId, addingStore: false, newStoreName: '',
            price: '', amount: '', pack: '1', isSale: false, note: '',
          });
          renderAll();
          window.scrollTo(0, 0);
          toast('保存しました。続けてどうぞ');
          ref('productQuery')?.focus({ preventScroll: true });
        } else {
          toast(editing ? '記録を更新しました' : '保存しました');
          router.back(fallback);
        }
      } finally {
        saving = false;
      }
    }

    async function remove() {
      if (!(await confirmDanger({ title: 'この記録を削除しますか？' }))) return;
      let undo;
      try {
        undo = state.deleteRecord(editing.id);
      } catch (e) {
        toast(saveErrorMessage(e));
        return;
      }
      router.back(fallback);
      toast('記録を削除しました', {
        actionLabel: '元に戻す',
        onAction: () => {
          try {
            undo();
          } catch (e) {
            toast(saveErrorMessage(e));
          }
        },
      });
    }

    // ---- イベント ----
    el.addEventListener('input', (e) => {
      const name = e.target.dataset.ref;
      if (name === 'productQuery') {
        f.productQuery = e.target.value;
        mount(ref('suggest'), suggestionsHtml());
        images.hydrate(ref('suggest'));
        return;
      }
      if (name === 'newStoreName') {
        f.newStoreName = e.target.value;
        return;
      }
      if (['price', 'amount', 'pack', 'note'].includes(name)) {
        f[name] = e.target.value;
        if (name !== 'note') renderVerdict();
      }
    });

    el.addEventListener('change', (e) => {
      const name = e.target.dataset.ref;
      if (name === 'unit') {
        f.unit = e.target.value;
        renderVerdict();
      } else if (name === 'date') {
        f.date = e.target.value;
      } else if (name === 'sale') {
        f.isSale = e.target.checked;
      } else if (name === 'storeSelect' && e.target.value) {
        pickStore(e.target.value);
      } else if (name === 'photo') {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        images.processPhoto(file).then((blobs) => {
          if (f.newPhoto) URL.revokeObjectURL(f.newPhoto.previewUrl);
          f.newPhoto = { ...blobs, previewUrl: URL.createObjectURL(blobs.thumb) };
          renderProduct();
        }).catch((err) => {
          console.error(err);
          toast('この写真は読み込めませんでした');
        });
      }
    });

    el.addEventListener('click', (e) => {
      const t = e.target;
      const pickP = t.closest('[data-pick-product]');
      if (pickP) return pickProduct(pickP.dataset.pickProduct);
      const pickS = t.closest('[data-pick-store]');
      if (pickS) return pickStore(pickS.dataset.pickStore);
      const cat = t.closest('[data-new-cat]');
      if (cat) {
        f.newCategory = f.newCategory === cat.dataset.newCat ? '' : cat.dataset.newCat;
        const info = categoryInfo(f.newCategory, state.settings());
        if (info) f.newTaxRate = info.taxRate;
        renderProduct();
        renderVerdict();
        return;
      }
      const segBtn = t.closest('[data-seg] button');
      if (segBtn) {
        const seg = segBtn.closest('[data-seg]').dataset.seg;
        const v = pressSeg(segBtn);
        if (seg === 'taxMode') f.taxMode = v;
        if (seg === 'newTax') f.newTaxRate = Number(v);
        renderVerdict();
        return;
      }
      const act = t.closest('[data-act]')?.dataset.act;
      switch (act) {
        case 'cancel':
          router.back(fallback);
          break;
        case 'save':
          save();
          break;
        case 'save-continue':
          save({ continueSameStore: true });
          break;
        case 'delete':
          remove();
          break;
        case 'new-product':
          f.newProductName = f.productQuery.trim();
          f.productQuery = '';
          renderProduct();
          renderUnits();
          renderVerdict();
          break;
        case 'change-product':
          f.productId = null;
          f.newProductName = '';
          renderProduct();
          renderUnits();
          renderVerdict();
          ref('productQuery')?.focus();
          break;
        case 'pick-photo':
          ref('photo').click();
          break;
        case 'remove-photo':
          if (f.newPhoto) URL.revokeObjectURL(f.newPhoto.previewUrl);
          f.newPhoto = null;
          renderProduct();
          break;
        case 'new-store':
          f.addingStore = true;
          renderStore();
          ref('newStoreName')?.focus();
          break;
        case 'cancel-new-store':
          f.addingStore = false;
          f.newStoreName = '';
          renderStore();
          break;
        case 'change-store':
          f.storeId = null;
          renderStore();
          renderVerdict();
          break;
        default:
      }
    });

    el.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });

    // キーボードの「改行/次へ」で保存されないように、次の欄へ移る
    el.addEventListener('keydown', (e) => {
      // 日本語入力の変換確定の Enter は無視する（Safari は keyCode 229）
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      const name = e.target.dataset.ref;
      if (name === 'productQuery') {
        const q = f.productQuery.trim();
        if (!q) return;
        const exact = state.products().find((p) => matchScore(q, p.name) === 3);
        if (exact) pickProduct(exact.id);
        else el.querySelector('[data-act="new-product"]')?.click();
        return;
      }
      const order = ['newStoreName', 'price', 'amount', 'pack', 'note'];
      const next = order[order.indexOf(name) + 1];
      if (next && ref(next)) focusField(ref(next));
      else e.target.blur();
    });

    renderAll();
    if (!editing && !f.productId) ref('productQuery')?.focus({ preventScroll: true });

    return () => {
      if (f.newPhoto) URL.revokeObjectURL(f.newPhoto.previewUrl);
    };
  },
};
