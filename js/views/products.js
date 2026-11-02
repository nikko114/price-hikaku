// 商品一覧（ホーム）
import { html, mount, appBar, emptyState, isStandalone, isMobile, isIOS } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as images from '../images.js';
import { matches } from '../search.js';
import { relativeDay, todayStr, daysBetween } from '../format.js';
import { DEFAULT_CATEGORIES } from '../defaults.js';
import { thumb, priceTag, allSummaries, storeName } from './common.js';
import * as geo from '../geo.js';
import { canAutoLocate } from './location.js';

// 画面を作り直しても検索条件は残す
const ui = { query: '', category: '', sort: 'recent' };

const SORTS = [
  ['recent', '最近の記録順'],
  ['name', '名前順'],
  ['created', '登録が新しい順'],
];

function installHint() {
  const m = state.meta();
  if (isStandalone() || !isMobile() || m.installHintDismissed) return '';
  const how = isIOS() ? 'Safari の共有ボタン →「ホーム画面に追加」' : 'ブラウザのメニュー →「ホーム画面に追加」';
  return html`<div class="notice">
    <p class="notice-title">📲 ホーム画面に追加して使うのがおすすめ</p>
    <p class="notice-text">${how}で、アプリのように使えます。ブラウザとホーム画面のアプリではデータが別々なので、記録はホーム画面のアプリで始めてください。</p>
    <div class="notice-actions"><button type="button" class="btn is-small" data-act="dismiss-install">閉じる</button></div>
  </div>`;
}

function backupHint() {
  const m = state.meta();
  const today = todayStr();
  if (state.records().length < 10) return '';
  const last = m.lastBackupAt ? m.lastBackupAt.slice(0, 10) : null;
  if (last && daysBetween(last, today) < 30) return '';
  if (m.backupHintSnoozedAt && daysBetween(m.backupHintSnoozedAt.slice(0, 10), today) < 7) return '';
  return html`<div class="notice">
    <p class="notice-title">💾 ${last ? '30日以上バックアップしていません' : 'バックアップしておきませんか？'}</p>
    <p class="notice-text">データはこの端末の中だけにあります。もしものために、ときどき書き出しておくと安心です。</p>
    <div class="notice-actions">
      <a class="btn is-small is-primary" href="#/settings">バックアップする</a>
      <button type="button" class="btn is-small" data-act="snooze-backup">あとで</button>
    </div>
  </div>`;
}

function sortItems(items) {
  const byName = (a, b) => a.product.name.localeCompare(b.product.name, 'ja');
  if (ui.sort === 'name') return items.sort(byName);
  if (ui.sort === 'created') return items.sort((a, b) => (b.product.createdAt || '').localeCompare(a.product.createdAt || ''));
  // 最近の記録順（記録のない商品は後ろ）
  return items.sort((a, b) => {
    const la = a.latest?.record;
    const lb = b.latest?.record;
    if (la && lb) return la.date !== lb.date ? lb.date.localeCompare(la.date) : (lb.createdAt || '').localeCompare(la.createdAt || '');
    if (la) return -1;
    if (lb) return 1;
    return (b.product.createdAt || '').localeCompare(a.product.createdAt || '');
  });
}

function rowHtml(sum, mode, today) {
  const p = sum.product;
  const best = sum.best;
  return html`<li><a class="row" href="#/products/${p.id}">
    ${thumb(p)}
    <span class="row-main">
      <span class="row-title">${p.name}</span>
      ${best
        ? html`<span class="row-sub">最安 <strong>${storeName(best.storeId)}</strong>${best.stale ? html` <span class="badge is-stale">古い</span>` : ''}${best.saleOnly ? html` <span class="badge is-sale">特売</span>` : ''}</span>
           <span class="row-meta">${sum.stores.length}店舗 ・ ${relativeDay(sum.latest.record.date, today)}</span>`
        : html`<span class="row-sub">まだ記録がありません</span>`}
    </span>
    ${best ? html`<span class="row-end">${priceTag(best.rankPrice, p, mode)}</span>` : ''}
    ${icons.chevron}
  </a></li>`;
}

function renderList(listEl, summaries) {
  const mode = state.settings().priceDisplay;
  const today = todayStr();
  const filtered = summaries.filter((s) => {
    if (ui.category && s.product.category !== ui.category) return false;
    return matches(ui.query, s.product.name, s.product.category, s.product.memo);
  });
  if (!filtered.length) {
    mount(listEl, html`<li class="list-empty">「${ui.query || ui.category}」に合う商品はありません</li>`);
    return;
  }
  mount(listEl, sortItems(filtered).map((s) => rowHtml(s, mode, today)));
  images.hydrate(listEl);
}

// 「📍 〇〇店の近くにいます」（位置情報が許可済みのときだけ。勝手に許可は聞かない）
async function showHereBanner(el) {
  if (!state.stores().some(geo.hasLocation) || !(await canAutoLocate())) return;
  let pos;
  try {
    pos = await geo.getPosition({ maxAgeMs: 2 * 60 * 1000 });
  } catch {
    return;
  }
  const store = geo.autoPick(geo.nearbyStores(state.stores(), pos, 300), pos, { maxDistance: 150, maxAccuracy: 150 });
  const box = el.querySelector('[data-ref="here"]');
  if (!store || !box || !el.isConnected) return;
  mount(box, html`<div class="here-banner">
    <p class="here-text">📍 <strong>${store.name}</strong> の近くにいます</p>
    <div class="here-actions">
      <a class="btn is-small is-primary" href="#/record?store=${store.id}">${icons.plus}<span>ここで記録</span></a>
      <a class="btn is-small" href="#/stores/${store.id}">このお店で安いもの</a>
    </div>
  </div>`);
}

export default {
  live: true,
  render(el) {
    const summaries = allSummaries();
    const used = new Set(state.products().map((p) => p.category).filter(Boolean));
    const order = DEFAULT_CATEGORIES.map((c) => c.name);
    const categories = [...used].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'ja');
    });
    if (ui.category && !used.has(ui.category)) ui.category = '';

    mount(el, html`
      ${appBar({ title: '商品', large: true, right: html`<a class="appbar-btn" href="#/products/new" aria-label="商品を追加">${icons.plus}</a>` })}
      <div class="page">
        <div data-ref="here"></div>
        ${installHint()}
        ${backupHint()}
        ${summaries.length
          ? html`
            <div class="toolbar">
              <label class="search">
                ${icons.search}
                <input type="search" placeholder="商品をさがす" value="${ui.query}" data-ref="q" autocomplete="off" enterkeyhint="search" aria-label="商品をさがす">
              </label>
              <select class="sort-select" data-ref="sort" aria-label="並び替え">
                ${SORTS.map(([v, t]) => html`<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${t}</option>`)}
              </select>
            </div>
            ${categories.length > 1
              ? html`<div class="chips" role="group" aria-label="カテゴリで絞り込む">
                  <button type="button" class="chip" data-cat="" aria-pressed="${String(!ui.category)}">すべて</button>
                  ${categories.map((c) => html`<button type="button" class="chip" data-cat="${c}" aria-pressed="${String(ui.category === c)}">${c}</button>`)}
                </div>`
              : ''}
            <ul class="card list" data-ref="list"></ul>`
          : emptyState({
              emoji: '🛒',
              title: 'まだ商品がありません',
              text: 'お店で見た値段と量を記録すると、100gあたりの値段などで比べられます。',
              action: html`<a class="btn is-primary" href="#/record">${icons.plus}<span>最初の記録をする</span></a>`,
            })}
      </div>`);

    const listEl = el.querySelector('[data-ref="list"]');
    if (listEl) renderList(listEl, summaries);
    showHereBanner(el);

    el.addEventListener('input', (e) => {
      if (e.target.dataset.ref === 'q') {
        ui.query = e.target.value;
        renderList(listEl, summaries);
      }
    });
    el.addEventListener('change', (e) => {
      if (e.target.dataset.ref === 'sort') {
        ui.sort = e.target.value;
        renderList(listEl, summaries);
      }
    });
    el.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cat]');
      if (chip) {
        ui.category = chip.dataset.cat;
        for (const c of el.querySelectorAll('[data-cat]')) c.setAttribute('aria-pressed', String(c === chip));
        renderList(listEl, summaries);
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'dismiss-install') state.updateMeta({ installHintDismissed: true });
      if (act === 'snooze-backup') state.updateMeta({ backupHintSnoozedAt: new Date().toISOString() });
    });
    // Enter で検索欄を閉じる（キーボードを下げる）
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.dataset.ref === 'q') e.target.blur();
    });
  },
};
