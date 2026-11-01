// お店ページ: この店が最安の商品と、記録
import { html, mount, appBar, backButton, emptyState } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as images from '../images.js';
import { byNewest } from '../compare.js';
import { todayStr, fmtDate, fmtAmount, fmtPrice } from '../format.js';
import { unitPrice } from '../units.js';
import { thumb, priceTag, notFound, allSummaries } from './common.js';

export default {
  live: true,
  render(el, { params }) {
    const store = state.store(params.id);
    if (!store) return notFound(el, 'お店が見つかりません');
    const mode = state.settings().priceDisplay;
    const today = todayStr();
    const summaries = allSummaries();
    const cheapestHere = summaries.filter((s) => s.best && s.best.storeId === store.id);
    const recs = state.recordsOfStore(store.id).sort(byNewest);

    mount(el, html`
      ${appBar({
        title: store.name,
        left: backButton('/stores'),
        right: html`<a class="appbar-btn" href="#/stores/${store.id}/edit">編集</a>`,
      })}
      <div class="page">
        <div class="product-head">
          <div class="product-meta">
            <h2 class="product-name">${store.name}</h2>
            <p class="product-tags">
              ${store.chain ? html`<span class="tag">${store.chain}</span>` : ''}
              <span class="tag">値札は${store.priceInput === 'excl' ? '税抜' : '税込'}で入力</span>
            </p>
            ${store.memo ? html`<p class="product-memo">${store.memo}</p>` : ''}
          </div>
        </div>

        <div class="actions">
          <a class="btn is-primary is-block" href="#/record?store=${store.id}">${icons.plus}<span>このお店で記録</span></a>
        </div>

        <section class="section">
          <h2 class="section-title">このお店がいちばん安い商品（${cheapestHere.length}品）</h2>
          ${cheapestHere.length
            ? html`<ul class="card list">
                ${cheapestHere.map((s) => html`<li><a class="row" href="#/products/${s.product.id}">
                  ${thumb(s.product)}
                  <span class="row-main">
                    <span class="row-title">${s.product.name}</span>
                    <span class="row-sub">${s.stores.length > 1 ? `${s.stores.length}店舗で比較` : 'このお店の記録だけ'}${s.best.stale ? ' ・ 古い記録' : ''}</span>
                  </span>
                  <span class="row-end">${priceTag(s.best.rankPrice, s.product, mode)}</span>
                </a></li>`)}
              </ul>`
            : html`<p class="section-note">まだありません</p>`}
        </section>

        <section class="section">
          <h2 class="section-title">記録（${recs.length}件）</h2>
          ${recs.length
            ? html`<ul class="card list">
                ${recs.map((r) => {
                  const p = state.product(r.productId);
                  if (!p) return '';
                  return html`<li><a class="row record-row" href="#/records/${r.id}/edit">
                    <span class="record-date">${fmtDate(r.date, today)}</span>
                    <span class="row-main">
                      <span class="row-title">${p.name}</span>
                      <span class="row-sub">${fmtAmount(r)} ・ ${fmtPrice(r.price)}${r.taxIncluded ? '' : '（税抜）'}${r.isSale ? html` <span class="badge is-sale">特売</span>` : ''}</span>
                    </span>
                    <span class="row-end">${priceTag(unitPrice(r, p.compareAmount), p, mode)}</span>
                  </a></li>`;
                })}
              </ul>`
            : emptyState({ emoji: '📝', title: 'このお店の記録はまだありません' })}
        </section>
      </div>`);
    images.hydrate(el);
  },
};
