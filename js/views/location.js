// 現在地と「周辺のお店（地図データ）」の部品。記録フォームとお店フォームで使う
import { html } from '../ui.js';
import * as state from '../state.js';
import * as geo from '../geo.js';
import { relativeDay, todayStr } from '../format.js';

export const OSM_CREDIT = html`<p class="osm-credit">地図データ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</p>`;

// 位置情報の機能を使う設定になっているか
export function locationEnabled() {
  return !!state.settings().autoSuggestStore && geo.isSupported();
}

// 許可済みなら、聞かずに現在地を取りにいってよい（iPhone では毎回聞かれることがあるので勝手に聞かない）
export async function canAutoLocate() {
  if (!locationEnabled()) return false;
  return (await geo.permissionState()) === 'granted';
}

/**
 * 現在地と周辺のお店の状態。変わるたびに onChange が呼ばれる
 */
export function createLocator(onChange) {
  const s = {
    status: 'idle', // idle | locating | located | error
    pos: null,
    error: null,
    osm: { status: 'idle', items: [], error: null, expanded: false, slow: false, cachedAt: null, stale: false }, // idle | loading | done | error
  };
  let alive = true;
  const changed = () => {
    if (alive) onChange(s);
  };

  async function locate({ force = false } = {}) {
    if (s.status === 'locating') return;
    s.status = 'locating';
    s.error = null;
    changed();
    try {
      s.pos = await geo.getPosition({ maxAgeMs: force ? 0 : 60_000 });
      s.status = 'located';
      s.osm = { status: 'idle', items: [], error: null, expanded: false, slow: false, cachedAt: null, stale: false };
    } catch (err) {
      s.status = 'error';
      s.error = err;
    }
    changed();
  }

  async function searchOsm({ force = false } = {}) {
    if (!s.pos || s.osm.status === 'loading' || !state.settings().onlineStoreSearch) return;
    s.osm.status = 'loading';
    s.osm.error = null;
    s.osm.slow = false;
    changed();
    try {
      const r = await geo.searchNearbyShops(s.pos, {
        radius: 500,
        force,
        onSlow: () => {
          s.osm.slow = true;
          changed();
        },
      });
      Object.assign(s.osm, { items: r.items, cachedAt: r.cachedAt, stale: !!r.stale, status: 'done' });
    } catch (err) {
      s.osm.status = 'error';
      s.osm.error = err;
    }
    changed();
  }

  function candidate(osmId) {
    return s.osm.items.find((c) => c.osmId === osmId) || null;
  }

  return {
    state: s,
    locate,
    searchOsm,
    candidate,
    expand() {
      s.osm.expanded = true;
      changed();
    },
    dispose() {
      alive = false;
    },
  };
}

// 「📍 現在地からお店を探す」ボタン、または現在地の状態
export function locationLineHtml(loc, { idleLabel = '現在地からお店を探す' } = {}) {
  if (!locationEnabled()) return '';
  const s = loc.state;
  if (s.status === 'idle') {
    return html`<button type="button" class="btn is-small is-tonal" data-act="locate">📍 ${idleLabel}</button>`;
  }
  if (s.status === 'locating') return html`<p class="loc-line is-busy">📍 現在地を確認しています…</p>`;
  if (s.status === 'error') {
    return html`<p class="loc-line is-error">${geo.geoErrorMessage(s.error)} <button type="button" class="link-btn is-small" data-act="locate">もう一度</button></p>`;
  }
  return html`<p class="loc-line">📍 現在地の近く（誤差 ±${Math.round(s.pos.accuracy)}m） <button type="button" class="link-btn is-small" data-act="relocate">位置を更新</button></p>`;
}

function searchedWhen(at) {
  const rel = relativeDay(todayStr(new Date(at)));
  return /^(今日|昨日)$/.test(rel) ? rel : `${rel}に`;
}

// 周辺のお店（地図データ）の一覧。data-osm="ID" のボタンを押すと選べる
export function osmListHtml(loc, { limit = 5 } = {}) {
  const s = loc.state;
  if (!locationEnabled() || !state.settings().onlineStoreSearch || s.status !== 'located') return '';
  const o = s.osm;
  if (o.status === 'idle') {
    return html`<button type="button" class="link-btn" data-act="search-osm">周辺のお店を地図データから探す</button>`;
  }
  if (o.status === 'loading') {
    return html`<p class="loc-line is-busy">周辺のお店を探しています…${o.slow ? html`<br><span class="loc-sub">地図データのサーバーが混んでいるので、別のサーバーにも聞いています</span>` : ''}</p>`;
  }
  if (o.status === 'error') {
    return html`<p class="loc-line is-error">${geo.osmErrorMessage(o.error)} <button type="button" class="link-btn is-small" data-act="search-osm">もう一度</button></p>`;
  }
  const items = geo.excludeRegistered(o.items, state.stores());
  const footer = html`<p class="osm-credit">地図データ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors${
    o.cachedAt ? ` ・ ${searchedWhen(o.cachedAt)}探した結果` : ''
  } ・ <button type="button" class="link-btn is-small" data-act="search-osm-force">探し直す</button></p>`;
  const staleNote = o.stale ? html`<p class="loc-line is-error">いまはつながらないので、前に探した結果を出しています</p>` : '';
  if (!items.length) return html`${staleNote}<p class="loc-line">近くに、まだ登録していないお店は見つかりませんでした</p>${footer}`;
  const shown = items.slice(0, o.expanded ? 20 : limit);
  return html`${staleNote}<p class="sub-label">周辺のお店（タップで登録）</p>
    <ul class="list osm-list">
      ${shown.map((c) => html`<li><button type="button" class="row osm-row" data-osm="${c.osmId}">
        <span class="row-main">
          <span class="row-title">${c.name}</span>
          <span class="row-sub">${[geo.SHOP_LABELS[c.shop], c.chain && !c.name.startsWith(c.chain) ? c.chain : ''].filter(Boolean).join(' ・ ')}</span>
        </span>
        <span class="distance">${geo.fmtDistance(c.distance)}</span>
      </button></li>`)}
    </ul>
    ${items.length > shown.length ? html`<button type="button" class="link-btn" data-act="osm-more">もっと見る（あと${Math.min(items.length, 20) - shown.length}件）</button>` : ''}
    ${footer}`;
}
