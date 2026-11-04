// お店一覧（最近の記録順 ／ 近い順）
import { html, mount, appBar, emptyState } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as geo from '../geo.js';
import { bestStoreCounts } from '../compare.js';
import { relativeDay, todayStr } from '../format.js';
import { allSummaries, segmented, pressSeg } from './common.js';
import { canAutoLocate, locationEnabled } from './location.js';

const ui = { sort: 'recent' }; // 'recent' | 'near'

// どのお店が安い？（最安になっている商品数の横棒。1店だけなら棒にせず文で）
function winnersHtml(counts) {
  const ranking = [...counts.entries()]
    .map(([id, n]) => ({ store: state.store(id), n }))
    .filter((x) => x.store && x.n > 0)
    .sort((a, b) => b.n - a.n || a.store.name.localeCompare(b.store.name, 'ja'));
  if (!ranking.length) return '';
  const head = html`<h2 class="section-title">どのお店が安い？</h2>`;
  if (ranking.length === 1) {
    return html`<section class="section">${head}
      <p class="section-note">2店以上で比べた商品は、いまのところ全部（${ranking[0].n}品）<strong>${ranking[0].store.name}</strong>がいちばん安いです。</p>
    </section>`;
  }
  const max = ranking[0].n;
  return html`<section class="section">${head}
    <p class="section-note">2店以上で比べた商品のうち、いちばん安いお店になっている数</p>
    <div class="card"><ul class="hbar-list">
      ${ranking.map((x) => html`<li class="hbar-row"><a href="#/stores/${x.store.id}">
        <span class="hbar-name">${x.store.name}</span>
        <span class="hbar-track" aria-hidden="true"><span class="hbar-fill" style="width:${((x.n / max) * 100).toFixed(1)}%"></span></span>
        <span class="hbar-value">${x.n}品</span>
      </a></li>`)}
    </ul></div>
  </section>`;
}
const loc = { status: 'idle', error: null }; // 近い順のときの現在地の取得状況

export default {
  live: true,
  render(el) {
    let pos = geo.cachedPosition(5 * 60 * 1000);

    function draw() {
      const today = todayStr();
      // 2店以上で比べた商品のうち、最安になっている数
      const counts = bestStoreCounts(allSummaries(), { minStores: 2 });
      const recordCount = new Map();
      const lastDate = new Map();
      for (const r of state.records()) {
        recordCount.set(r.storeId, (recordCount.get(r.storeId) || 0) + 1);
        if (r.date > (lastDate.get(r.storeId) || '')) lastDate.set(r.storeId, r.date);
      }
      const dist = (s) => (pos && geo.hasLocation(s) ? geo.distanceM(pos, s) : Infinity);
      const byRecent = (a, b) => (lastDate.get(b.id) || '').localeCompare(lastDate.get(a.id) || '') || a.name.localeCompare(b.name, 'ja');
      const near = ui.sort === 'near' && pos;
      const stores = [...state.stores()].sort(near ? (a, b) => dist(a) - dist(b) || byRecent(a, b) : byRecent);

      let note = '最近記録した順';
      if (ui.sort === 'near') {
        if (pos) note = '現在地から近い順（位置が未登録のお店は最後）';
        else if (loc.status === 'locating') note = '📍 現在地を確認しています…';
        else if (loc.status === 'error') note = geo.geoErrorMessage(loc.error);
      }

      mount(el, html`
        ${appBar({ title: 'お店', large: true, right: html`<a class="appbar-btn" href="#/stores/new" aria-label="お店を追加">${icons.plus}</a>` })}
        <div class="page">
          ${stores.length
            ? html`
              ${locationEnabled() ? html`<div class="toolbar">${segmented('sort', [['recent', '最近の記録順'], ['near', '📍 近い順']], ui.sort, { label: '並び替え' })}</div>` : ''}
              <p class="section-note">${note}</p>
              <ul class="card list">
                ${stores.map((s) => {
                  const n = counts.get(s.id) || 0;
                  const d = dist(s);
                  const sub = [
                    s.chain,
                    `記録 ${recordCount.get(s.id) || 0}件`,
                    lastDate.get(s.id) ? relativeDay(lastDate.get(s.id), today) : '',
                  ].filter(Boolean).join(' ・ ');
                  return html`<li><a class="row" href="#/stores/${s.id}">
                    <span class="thumb" data-fallback="🏪" aria-hidden="true"></span>
                    <span class="row-main">
                      <span class="row-title">${s.name}</span>
                      <span class="row-sub">${sub}</span>
                    </span>
                    <span class="row-end">
                      ${Number.isFinite(d) ? html`<span class="distance">${geo.fmtDistance(d)}</span>` : ''}
                      ${n ? html`<span class="badge is-best">最安 ${n}品</span>` : ''}
                    </span>
                    ${icons.chevron}
                  </a></li>`;
                })}
              </ul>
              ${winnersHtml(counts)}`
            : emptyState({
                emoji: '🏪',
                title: 'まだお店がありません',
                text: '価格を記録するときにも追加できます。',
                action: html`<a class="btn is-primary" href="#/stores/new">${icons.plus}<span>お店を追加</span></a>`,
              })}
        </div>`);
    }

    async function locate() {
      if (loc.status === 'locating') return;
      loc.status = 'locating';
      draw();
      try {
        pos = await geo.getPosition();
        loc.status = 'located';
      } catch (err) {
        loc.status = 'error';
        loc.error = err;
      }
      if (el.isConnected) draw();
    }

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-seg="sort"] button');
      if (!btn) return;
      ui.sort = pressSeg(btn);
      if (ui.sort === 'near' && !pos) locate();
      else draw();
    });

    draw();
    // 許可済みなら距離も出す
    if (!pos) {
      canAutoLocate().then((ok) => {
        if (ok && el.isConnected) locate();
      });
    } else if (ui.sort === 'near') {
      loc.status = 'located';
    }
  },
};
