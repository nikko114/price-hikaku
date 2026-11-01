// 商品ページ: お店ランキングと記録
import { html, mount, appBar, backButton, emptyState } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as images from '../images.js';
import { summarize } from '../compare.js';
import { todayStr, fmtDate, relativeDay, fmtAmount, fmtPrice, perText, diffAmountText, fmtPercent, unitPriceText } from '../format.js';
import { compareUnitText, UNIT_TYPES } from '../units.js';
import { thumb, priceTag, segmented, pressSeg, notFound, storeName } from './common.js';

function rankingHtml(sum, product, mode, today) {
  if (!sum.stores.length) {
    return emptyState({
      emoji: '📝',
      title: 'まだ記録がありません',
      text: 'お店で見た値段を記録すると、ここにお店ごとのランキングが出ます。',
    });
  }
  const best = sum.best;
  return html`<ol class="card list">
    ${sum.stores.map((s, i) => {
      const diff = s.rankPrice - best.rankPrice;
      return html`<li><a class="row rank-row" href="#/stores/${s.storeId}">
        <span class="rank-no ${i === 0 ? 'is-first' : ''}">${i + 1}</span>
        <span class="row-main">
          <span class="row-title">${storeName(s.storeId)}</span>
          <span class="row-sub">${fmtDate(s.ref.record.date, today)}（${relativeDay(s.ref.record.date, today)}）
            ${i === 0 ? html`<span class="badge is-best">最安</span>` : ''}
            ${s.saleOnly ? html`<span class="badge is-sale">特売</span>` : ''}
            ${s.stale ? html`<span class="badge is-stale">古い</span>` : ''}
          </span>
          ${s.recentSale ? html`<span class="row-meta">特売 ${unitPriceText(s.recentSale.unitPrice, product, mode).value}（${fmtDate(s.recentSale.record.date, today)}）</span>` : ''}
        </span>
        <span class="row-end">
          ${priceTag(s.rankPrice, product, mode)}
          ${i > 0 && diff > 1e-9 ? html`<span class="diff">${mode === 'qtyPerYen' ? '−' : '+'}${diffAmountText(s.rankPrice, best.rankPrice, product, mode)}（${fmtPercent(diff / best.rankPrice)}高い）</span>` : ''}
        </span>
      </a></li>`;
    })}
  </ol>
  ${sum.allTimeMin
    ? html`<p class="footnote">過去最安 <strong>${unitPriceText(sum.allTimeMin.unitPrice, product, mode).long}</strong>（${storeName(sum.allTimeMin.record.storeId)}・${fmtDate(sum.allTimeMin.record.date, today)}${sum.allTimeMin.record.isSale ? '・特売' : ''}）</p>`
    : ''}`;
}

function recordsHtml(sum, product, mode, today) {
  if (!sum.priced.length) return '';
  return html`<section class="section">
    <h2 class="section-title">記録（${sum.priced.length}件）</h2>
    <ul class="card list">
      ${sum.priced.map(({ record: r, unitPrice: u }) => html`<li><a class="row record-row" href="#/records/${r.id}/edit">
        <span class="record-date">${fmtDate(r.date, today)}</span>
        <span class="row-main">
          <span class="row-title">${storeName(r.storeId)}</span>
          <span class="row-sub">${fmtAmount(r)} ・ ${fmtPrice(r.price)}${r.taxIncluded ? '' : '（税抜）'}
            ${r.isSale ? html`<span class="badge is-sale">特売</span>` : ''}</span>
          ${r.note ? html`<span class="row-meta">${r.note}</span>` : ''}
        </span>
        <span class="row-end">${priceTag(u, product, mode)}</span>
      </a></li>`)}
    </ul>
  </section>`;
}

export default {
  live: true,
  render(el, { params }) {
    const product = state.product(params.id);
    if (!product) return notFound(el, '商品が見つかりません');
    const settings = state.settings();
    const mode = settings.priceDisplay;
    const today = todayStr();
    const sum = summarize(product, state.recordsOfProduct(product.id), { today, staleDays: settings.staleDays });
    const typeLabel = UNIT_TYPES[product.unitType]?.label || '';

    mount(el, html`
      ${appBar({
        title: product.name,
        left: backButton('/'),
        right: html`<a class="appbar-btn" href="#/products/${product.id}/edit">編集</a>`,
      })}
      <div class="page">
        <div class="product-head">
          ${product.imageId ? thumb(product, { size: 'is-hero' }) : ''}
          <div class="product-meta">
            <h2 class="product-name">${product.name}</h2>
            <p class="product-tags">
              ${product.category ? html`<span class="tag">${product.category}</span>` : ''}
              <span class="tag">${perText(product)}で比較</span>
              <span class="tag">${typeLabel}</span>
              <span class="tag">税${product.taxRate}%</span>
            </p>
            ${product.memo ? html`<p class="product-memo">${product.memo}</p>` : ''}
          </div>
        </div>

        <section class="section">
          <div class="section-head">
            <h2 class="section-title">お店ランキング</h2>
            ${segmented('mode', [['yenPerQty', `${compareUnitText(product.unitType, product.compareAmount, product.countLabel)}あたり`], ['qtyPerYen', '100円で']], mode, { label: '単価の表示', small: true })}
          </div>
          <p class="section-note">各お店の最新の通常価格（特売を除く）で比べています</p>
          ${rankingHtml(sum, product, mode, today)}
        </section>

        <div class="actions">
          <a class="btn is-primary is-block" href="#/record?product=${product.id}">${icons.plus}<span>この商品の価格を記録</span></a>
        </div>

        ${recordsHtml(sum, product, mode, today)}
      </div>`);

    images.hydrate(el);

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-seg="mode"] button');
      if (btn) {
        const v = pressSeg(btn);
        if (v && v !== state.settings().priceDisplay) state.updateSettings({ priceDisplay: v });
      }
    });
  },
};
