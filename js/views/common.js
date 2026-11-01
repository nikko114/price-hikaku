// 画面どうしで使い回す部品
import { html, appBar, backButton, emptyState, mount } from '../ui.js';
import { unitPriceText } from '../format.js';
import { categoryEmoji } from '../defaults.js';
import { summarize, groupBy } from '../compare.js';
import { todayStr } from '../format.js';
import * as state from '../state.js';

// 商品の写真（なければカテゴリの絵文字 or 名前の1文字目）
export function thumb(product, { size = '' } = {}) {
  const fallback = categoryEmoji(product.category, state.settings()) || [...(product.name || '?')][0];
  return html`<span class="thumb ${size}" data-fallback="${fallback}" aria-hidden="true">${
    product.imageId ? html`<img data-img="${product.imageId}" data-variant="${size === 'is-hero' ? 'full' : 'thumb'}" alt="">` : ''
  }</span>`;
}

// 単価の表示（例: ¥64.4 /100g）
export function priceTag(u, product, mode = state.settings().priceDisplay, cls = '') {
  const t = unitPriceText(u, product, mode);
  return html`<span class="price ${cls}">${t.value}</span><span class="price-unit">${t.suffix}</span>`;
}

export function segmented(name, options, value, { label = '', small = false } = {}) {
  return html`<div class="seg${small ? ' is-small' : ''}" role="group" aria-label="${label || name}" data-seg="${name}">
    ${options.map(([v, text]) => html`<button type="button" data-value="${v}" aria-pressed="${String(String(v) === String(value))}">${text}</button>`)}
  </div>`;
}

// segmented の選択を切り替える（押されたボタンの値を返す）
export function pressSeg(btn) {
  const seg = btn.closest('[data-seg]');
  if (!seg) return null;
  for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
  return btn.dataset.value;
}

export function notFound(el, message = '見つかりませんでした') {
  mount(el, html`${appBar({ title: '', left: backButton('/') })}
    <div class="page">${emptyState({ emoji: '🔍', title: message, action: html`<a class="btn" href="#/" data-replace="true">ホームへ</a>` })}</div>`);
}

// 全商品の集計（商品一覧・お店画面で使う）
export function allSummaries() {
  const s = state.settings();
  const today = todayStr();
  const groups = groupBy(state.records(), (r) => r.productId);
  return state.products().map((p) => summarize(p, groups.get(p.id) || [], { today, staleDays: s.staleDays }));
}

export function storeName(id) {
  return state.store(id)?.name || '（削除されたお店）';
}

// 最初にデータを保存したとき、ブラウザに「消さないで」とお願いする（効くかは端末しだい）
export async function requestPersistOnce() {
  if (state.meta().persistRequested || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    /* 失敗しても困らない */
  }
  try {
    state.updateMeta({ persistRequested: true });
  } catch {
    /* 容量オーバーでも困らない */
  }
}

// 商品カテゴリの候補（初期カテゴリ＋使われているもの）
export function categoryNames() {
  const names = state.settings().categories.map((c) => c.name);
  for (const p of state.products()) if (p.category && !names.includes(p.category)) names.push(p.category);
  return names;
}
