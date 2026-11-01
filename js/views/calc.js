// 単価電卓: 棚の前で「500g 298円 vs 1kg 548円」を保存せずに比べる
import { html, mount, appBar } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import { UNIT_TYPES, UNIT_TYPE_KEYS, unitsOf, unitTypeOf, defaultCompareAmount, parseNumber, unitPrice } from '../units.js';
import { unitPriceText, diffAmountText, fmtPercent } from '../format.js';

const KEY = 'ph.calc';
const MAX_ROWS = 6;
const LETTERS = 'ABCDEF';
const emptyRow = (unit = 'g') => ({ price: '', amount: '', unit, pack: '1' });

function load() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY));
    if (Array.isArray(v) && v.length >= 2) return v.slice(0, MAX_ROWS);
  } catch {
    /* なければ初期値 */
  }
  return [emptyRow(), emptyRow()];
}

function persist(rows) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* 保存できなくても困らない */
  }
}

function pseudoProduct(unit) {
  const type = unitTypeOf(unit) || 'weight';
  return { unitType: type, compareAmount: defaultCompareAmount(type), countLabel: type === 'count' ? unit : null };
}

function compute(rows) {
  const items = rows.map((r) => {
    const p = pseudoProduct(r.unit);
    const u = unitPrice(
      { price: parseNumber(r.price), taxIncluded: true, amount: parseNumber(r.amount), unit: r.unit, packCount: r.pack === '' ? 1 : parseNumber(r.pack) },
      p.compareAmount,
    );
    return { p, u: Number.isFinite(u) ? u : null };
  });
  const valid = items.filter((x) => x.u != null);
  const types = new Set(valid.map((x) => x.p.unitType));
  const comparable = valid.length >= 2 && types.size === 1;
  const min = comparable ? Math.min(...valid.map((x) => x.u)) : null;
  return { items, comparable, mixed: types.size > 1, min };
}

export default {
  live: false,
  render(el) {
    const rows = load();
    const mode = state.settings().priceDisplay;

    const unitOptions = (selected) =>
      UNIT_TYPE_KEYS.map((t) => html`<optgroup label="${UNIT_TYPES[t].label}">${unitsOf(t).map((u) => html`<option value="${u}" ${u === selected ? 'selected' : ''}>${u}</option>`)}</optgroup>`);

    function rowHtml(r, i) {
      return html`<div class="card calc-row" data-row="${i}">
        <div class="calc-head">
          <span class="calc-letter">${LETTERS[i]}</span>
          <span class="calc-result" data-result="${i}"></span>
          ${rows.length > 2 ? html`<button type="button" class="icon-btn" data-act="remove" data-i="${i}" aria-label="${LETTERS[i]}を消す">${icons.close}</button>` : ''}
        </div>
        <div class="field">
          <div class="field-row amount-row">
            <span class="input-affix">
              <input class="input" data-k="price" data-i="${i}" inputmode="decimal" value="${r.price}" placeholder="値段" aria-label="${LETTERS[i]}の値段">
              <span class="affix">円</span>
            </span>
          </div>
          <div class="field-row amount-row">
            <input class="input" data-k="amount" data-i="${i}" inputmode="decimal" value="${r.amount}" placeholder="内容量" aria-label="${LETTERS[i]}の内容量">
            <select class="input select unit-select" data-k="unit" data-i="${i}" aria-label="${LETTERS[i]}の単位">${unitOptions(r.unit)}</select>
            <span class="times" aria-hidden="true">×</span>
            <input class="input pack-input" data-k="pack" data-i="${i}" inputmode="numeric" value="${r.pack}" aria-label="${LETTERS[i]}の入数">
          </div>
        </div>
      </div>`;
    }

    function renderResults() {
      const { items, comparable, mixed, min } = compute(rows);
      items.forEach((x, i) => {
        const box = el.querySelector(`[data-result="${i}"]`);
        if (!box) return;
        if (x.u == null) {
          mount(box, html`<span class="muted">—</span>`);
          return;
        }
        const t = unitPriceText(x.u, x.p, mode);
        const r = rows[i];
        const recordHref = `#/record?price=${encodeURIComponent(r.price)}&amount=${encodeURIComponent(r.amount)}&unit=${encodeURIComponent(r.unit)}&pack=${encodeURIComponent(r.pack || '1')}`;
        let badge = '';
        if (comparable) {
          badge = x.u - min < 1e-9
            ? html`<span class="badge is-best">✅ 最安</span>`
            : html`<span class="badge is-warn">${mode === 'qtyPerYen' ? '−' : '+'}${diffAmountText(x.u, min, x.p, mode)}（${fmtPercent(x.u / min - 1)}高い）</span>`;
        }
        mount(box, html`<span class="price">${t.value}</span><span class="price-unit">${t.suffix}</span> ${badge}
          <a class="link-btn is-small" href="${recordHref}">記録する</a>`);
      });
      mount(el.querySelector('[data-ref="note"]'), mixed ? '重さと容量など、種類のちがう単位どうしは比べられません。' : '値段は、税込・税抜のどちらかにそろえて入れてください。');
    }

    function renderAll() {
      mount(el, html`
        ${appBar({ title: '単価電卓', large: true, right: html`<button type="button" class="appbar-btn" data-act="clear">クリア</button>` })}
        <div class="page">
          <p class="section-note">保存はされません。棚の前でサッと比べる用です。</p>
          <div class="calc-rows">${rows.map(rowHtml)}</div>
          ${rows.length < MAX_ROWS ? html`<div class="actions"><button type="button" class="btn is-block" data-act="add">${icons.plus}<span>比べるものを追加</span></button></div>` : ''}
          <p class="section-note" data-ref="note"></p>
        </div>`);
      renderResults();
    }

    el.addEventListener('input', (e) => {
      const { k, i } = e.target.dataset;
      if (!k) return;
      rows[Number(i)][k] = e.target.value;
      persist(rows);
      renderResults();
    });
    el.addEventListener('change', (e) => {
      const { k, i } = e.target.dataset;
      if (k === 'unit') {
        rows[Number(i)].unit = e.target.value;
        persist(rows);
        renderResults();
      }
    });
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'add' && rows.length < MAX_ROWS) {
        rows.push(emptyRow(rows[rows.length - 1].unit));
        persist(rows);
        renderAll();
        el.querySelector(`[data-k="price"][data-i="${rows.length - 1}"]`)?.focus();
      }
      if (act === 'remove') {
        rows.splice(Number(btn.dataset.i), 1);
        persist(rows);
        renderAll();
      }
      if (act === 'clear') {
        rows.splice(0, rows.length, emptyRow(), emptyRow());
        persist(rows);
        renderAll();
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      const inputs = [...el.querySelectorAll('input[data-k]')];
      const next = inputs[inputs.indexOf(e.target) + 1];
      if (next) next.focus();
      else e.target.blur();
    });

    renderAll();
  },
};
