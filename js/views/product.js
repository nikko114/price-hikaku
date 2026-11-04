// 商品ページ: お店ランキングと記録
import { html, mount, appBar, backButton, emptyState } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as images from '../images.js';
import { summarize } from '../compare.js';
import {
  todayStr, fmtDate, relativeDay, fmtAmount, fmtPrice, perText, diffAmountText, fmtPercent, unitPriceText, fmtYen, fmtQty,
} from '../format.js';
import { compareUnitText, UNIT_TYPES, qtyPerYen, baseUnitLabel } from '../units.js';
import { thumb, priceTag, segmented, pressSeg, notFound, storeName } from './common.js';
import { lineChart, assignSlots, dateToMs, tickDecimals } from '../chart.js';

// 価格推移の期間（画面を作り直しても残す）
const ui = { period: 'all' };
const PERIODS = [
  ['3m', '3ヶ月', 92],
  ['6m', '半年', 183],
  ['1y', '1年', 366],
  ['all', '全期間', null],
];

// 表示に使う値（円/量 なら単価、量/円 なら 100円で買える量）
function metric(u, product, mode) {
  return mode === 'qtyPerYen' ? qtyPerYen(u, product.compareAmount) : u;
}

function rankingHtml(sum, product, mode, today) {
  if (!sum.stores.length) {
    return emptyState({
      emoji: '📝',
      title: 'まだ記録がありません',
      text: 'お店で見た値段を記録すると、ここにお店ごとのランキングが出ます。',
    });
  }
  const best = sum.best;
  // 棒の長さ＝表示している値（0 から）。いちばん長いものを 100%
  const maxMetric = Math.max(...sum.stores.map((s) => metric(s.rankPrice, product, mode)));
  return html`<ol class="card list">
    ${sum.stores.map((s, i) => {
      const diff = s.rankPrice - best.rankPrice;
      const width = Math.max(2, (metric(s.rankPrice, product, mode) / maxMetric) * 100);
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
          ${sum.stores.length > 1 ? html`<span class="rank-bar" aria-hidden="true"><span class="rank-bar-fill${i === 0 ? ' is-best' : ''}" style="width:${width.toFixed(1)}%"></span></span>` : ''}
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

        ${sum.priced.length >= 2
          ? html`<section class="section">
              <div class="section-head">
                <h2 class="section-title">価格の推移（${mode === 'qtyPerYen' ? '100円で買える量' : `${perText(product)}の値段`}）</h2>
              </div>
              <div class="chips is-tight" role="group" aria-label="期間">
                ${PERIODS.map(([v, label]) => html`<button type="button" class="chip" data-period="${v}" aria-pressed="${String(ui.period === v)}">${label}</button>`)}
              </div>
              <div class="card chart-card"><div data-ref="trend"></div></div>
              <p class="section-note">○ は特売。グラフをなぞると、その日の値段が上に出ます。</p>
            </section>`
          : ''}

        ${recordsHtml(sum, product, mode, today)}
      </div>`);

    images.hydrate(el);

    // ---- 価格の推移 ----
    let chart = null;
    function drawTrend() {
      const box = el.querySelector('[data-ref="trend"]');
      if (!box) return;
      chart?.destroy();
      const period = PERIODS.find(([v]) => v === ui.period) || PERIODS[PERIODS.length - 1];
      const todayMs = dateToMs(today);
      const from = period[2] ? todayMs - period[2] * 86400000 : null;
      // 色は「この商品で先に記録したお店」から順に固定（期間を変えても変わらない）
      const chrono = [...sum.priced].sort((a, b) => a.record.date.localeCompare(b.record.date) || (a.record.createdAt || '').localeCompare(b.record.createdAt || ''));
      const slots = assignSlots(chrono.map((x) => x.record.storeId));
      const byStore = new Map();
      for (const { record: r, unitPrice: u } of chrono) {
        const x = dateToMs(r.date);
        if (from != null && x < from) continue;
        if (!byStore.has(r.storeId)) byStore.set(r.storeId, { key: r.storeId, name: storeName(r.storeId), slot: slots.get(r.storeId), points: [] });
        byStore.get(r.storeId).points.push({
          x,
          y: metric(u, product, mode),
          sale: !!r.isSale,
          detail: `${fmtAmount(r)} ${fmtPrice(r.price)}${r.taxIncluded ? '' : '（税抜）'}`,
        });
      }
      const series = [...byStore.values()].sort((a, b) => (a.slot || 99) - (b.slot || 99));
      const first = chrono.length ? dateToMs(chrono[0].record.date) : todayMs;
      const unit = baseUnitLabel(product.unitType, product.countLabel);
      const cmp = compareUnitText(product.unitType, product.compareAmount, product.countLabel);
      chart = lineChart(box, {
        series,
        xMin: from != null ? Math.max(from, Math.min(first, todayMs)) : first,
        xMax: todayMs,
        label: `${product.name}の${mode === 'qtyPerYen' ? '100円で買える量' : `${cmp}あたりの値段`}の推移（${series.length}店）`,
        yFormat: (v, step) => {
          const n = v.toLocaleString('ja-JP', { minimumFractionDigits: tickDecimals(step), maximumFractionDigits: tickDecimals(step) });
          return mode === 'qtyPerYen' ? `${n}${unit}` : `¥${n}`;
        },
        valueFormat: (v) => (mode === 'qtyPerYen' ? `100円で ${fmtQty(v, product.unitType, product.countLabel)}` : `${fmtYen(v)}/${cmp}`),
        hint: series.length === 1 ? `${series[0].name}の記録です。グラフをタップすると、その日の値段が出ます` : undefined,
      });
    }
    drawTrend();

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-seg="mode"] button');
      if (btn) {
        const v = pressSeg(btn);
        if (v && v !== state.settings().priceDisplay) state.updateSettings({ priceDisplay: v });
        return;
      }
      const chip = e.target.closest('[data-period]');
      if (chip) {
        ui.period = chip.dataset.period;
        for (const c of el.querySelectorAll('[data-period]')) c.setAttribute('aria-pressed', String(c === chip));
        drawTrend();
      }
    });

    return () => chart?.destroy();
  },
};
