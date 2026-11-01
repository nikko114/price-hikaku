// お店一覧
import { html, mount, appBar, emptyState } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import { bestStoreCounts } from '../compare.js';
import { relativeDay, todayStr } from '../format.js';
import { allSummaries } from './common.js';

export default {
  live: true,
  render(el) {
    const today = todayStr();
    const counts = bestStoreCounts(allSummaries());
    const recordCount = new Map();
    const lastDate = new Map();
    for (const r of state.records()) {
      recordCount.set(r.storeId, (recordCount.get(r.storeId) || 0) + 1);
      if (r.date > (lastDate.get(r.storeId) || '')) lastDate.set(r.storeId, r.date);
    }
    const stores = [...state.stores()].sort(
      (a, b) => (lastDate.get(b.id) || '').localeCompare(lastDate.get(a.id) || '') || a.name.localeCompare(b.name, 'ja'),
    );

    mount(el, html`
      ${appBar({ title: 'お店', large: true, right: html`<a class="appbar-btn" href="#/stores/new" aria-label="お店を追加">${icons.plus}</a>` })}
      <div class="page">
        ${stores.length
          ? html`<p class="section-note">最近記録した順</p>
            <ul class="card list">
              ${stores.map((s) => {
                const n = counts.get(s.id) || 0;
                return html`<li><a class="row" href="#/stores/${s.id}">
                  <span class="thumb" data-fallback="🏪" aria-hidden="true"></span>
                  <span class="row-main">
                    <span class="row-title">${s.name}</span>
                    <span class="row-sub">${s.chain ? `${s.chain} ・ ` : ''}記録 ${recordCount.get(s.id) || 0}件${lastDate.get(s.id) ? ` ・ ${relativeDay(lastDate.get(s.id), today)}` : ''}</span>
                  </span>
                  ${n ? html`<span class="row-end"><span class="badge is-best">最安 ${n}品</span></span>` : ''}
                  ${icons.chevron}
                </a></li>`;
              })}
            </ul>`
          : emptyState({
              emoji: '🏪',
              title: 'まだお店がありません',
              text: '価格を記録するときにも追加できます。',
              action: html`<a class="btn is-primary" href="#/stores/new">${icons.plus}<span>お店を追加</span></a>`,
            })}
      </div>`);
  },
};
