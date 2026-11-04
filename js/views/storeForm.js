// お店の追加・編集
import { html, mount, appBar, toast, confirmDanger, saveErrorMessage } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as router from '../router.js';
import * as geo from '../geo.js';
import { segmented, pressSeg, notFound } from './common.js';
import { createLocator, locationLineHtml, osmListHtml, locationEnabled, canAutoLocate } from './location.js';

export default {
  live: false,
  render(el, { params }) {
    const editing = params.id ? state.store(params.id) : null;
    if (params.id && !editing) return notFound(el, 'お店が見つかりません');
    const f = {
      name: editing?.name || '',
      chain: editing?.chain || '',
      priceInput: editing?.priceInput || state.settings().lastTaxMode || 'incl',
      memo: editing?.memo || '',
      lat: geo.hasLocation(editing) ? editing.lat : null,
      lng: geo.hasLocation(editing) ? editing.lng : null,
      osmId: editing?.osmId || null,
      accuracy: null, // いまの場所にしたときの誤差
      locating: false,
    };
    const fallback = editing ? `/stores/${editing.id}` : '/stores';
    const chains = [...new Set(state.stores().map((s) => s.chain).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    const ref = (name) => el.querySelector(`[data-ref="${name}"]`);

    // 新しいお店: 周辺のお店（地図データ）から選べる
    const loc = createLocator(() => renderNearby());

    function nearbyHtml() {
      if (editing || !locationEnabled()) return '';
      return html`<section class="section">
        <h2 class="section-title">近くのお店から選ぶ</h2>
        <div class="card"><div class="field loc-field">
          ${locationLineHtml(loc, { idleLabel: '現在地から探す' })}
          ${osmListHtml(loc, { limit: 8 })}
        </div></div>
      </section>`;
    }

    function locationHtml() {
      const has = Number.isFinite(f.lat) && Number.isFinite(f.lng);
      return html`
        <span class="field-label">お店の位置</span>
        <p class="field-text">${has
          ? html`📍 登録済み${f.accuracy ? `（誤差 ±${Math.round(f.accuracy)}m）` : ''} <a class="link-btn is-small" href="${geo.mapsUrl({ name: f.name || 'お店', lat: f.lat, lng: f.lng })}" target="_blank" rel="noopener">地図で確認</a>`
          : '未登録'}</p>
        <p class="field-hint">位置を登録しておくと、近くに来たときに記録画面で自動で選ばれます。</p>
        <div class="button-row loc-buttons">
          ${geo.isSupported()
            ? html`<button type="button" class="btn is-small" data-act="set-here" ${f.locating ? 'disabled' : ''}>${f.locating ? '📍 確認しています…' : '📍 いまの場所にする'}</button>`
            : ''}
          ${has ? html`<button type="button" class="btn is-small" data-act="clear-loc">位置を消す</button>` : ''}
        </div>`;
    }

    function renderNearby() {
      const box = ref('nearbyBox');
      if (!box) return;
      mount(box, nearbyHtml());
      if (loc.state.status === 'located' && loc.state.osm.status === 'idle' && state.settings().onlineStoreSearch) {
        setTimeout(() => loc.searchOsm(), 0);
      }
    }

    function renderLocation() {
      mount(ref('locBox'), locationHtml());
    }

    mount(el, html`
      ${appBar({
        title: editing ? 'お店を編集' : 'お店を追加',
        left: html`<button type="button" class="appbar-btn" data-act="cancel">キャンセル</button>`,
        right: html`<button type="button" class="appbar-btn is-strong" data-act="save">保存</button>`,
      })}
      <form class="page" novalidate autocomplete="off">
        <div data-ref="nearbyBox"></div>
        <section class="section">
          ${editing || !locationEnabled() ? '' : html`<h2 class="section-title">または、自分で入力</h2>`}
          <div class="card">
            <div class="field">
              <label class="field-label" for="s-name">お店の名前</label>
              <input id="s-name" class="input" data-ref="name" value="${f.name}" placeholder="例: イオン 〇〇店" enterkeyhint="next">
            </div>
            <div class="field">
              <label class="field-label" for="s-chain">チェーン名（なくてもOK）</label>
              <input id="s-chain" class="input" data-ref="chain" value="${f.chain}" placeholder="例: イオン" list="chain-list" enterkeyhint="next">
              <datalist id="chain-list">${chains.map((c) => html`<option value="${c}"></option>`)}</datalist>
            </div>
            <div class="field field-inline">
              <span class="field-label">値札の入力</span>
              ${segmented('priceInput', [['incl', '税込'], ['excl', '税抜']], f.priceInput, { label: '値札の入力' })}
            </div>
            <div class="field" data-ref="locBox"></div>
            <div class="field">
              <label class="field-label" for="s-memo">メモ</label>
              <input id="s-memo" class="input" data-ref="memo" value="${f.memo}" placeholder="例: 火曜は特売日" enterkeyhint="done">
            </div>
          </div>
          <p class="section-note">「値札の入力」は、このお店で記録するときの最初の選択です（本体価格が大きく書いてあるお店は税抜がラク）。</p>
        </section>
        <div class="actions">
          <button type="submit" class="btn is-primary is-block">${editing ? '更新する' : '追加する'}</button>
          ${editing ? html`<button type="button" class="btn is-danger is-block" data-act="delete">${icons.trash}<span>このお店を削除</span></button>` : ''}
        </div>
      </form>`);
    renderNearby();
    renderLocation();

    function save() {
      const name = f.name.trim();
      if (!name) {
        toast('お店の名前を入れてください');
        ref('name').focus();
        return;
      }
      const fields = {
        name,
        chain: f.chain.trim(),
        priceInput: f.priceInput,
        memo: f.memo.trim(),
        lat: Number.isFinite(f.lat) ? f.lat : null,
        lng: Number.isFinite(f.lng) ? f.lng : null,
        osmId: f.osmId,
      };
      let saved;
      try {
        saved = editing ? state.updateStore(editing.id, fields) : state.createStore(fields);
      } catch (e) {
        toast(saveErrorMessage(e));
        return;
      }
      toast(editing ? '更新しました' : 'お店を追加しました');
      if (editing) router.back(fallback);
      else router.navigate(`/stores/${saved.id}`, { replace: true });
    }

    async function remove() {
      const n = state.recordsOfStore(editing.id).length;
      const ok = await confirmDanger({
        title: `「${editing.name}」を削除しますか？`,
        message: n ? `このお店の記録 ${n}件も一緒に削除されます。` : '',
      });
      if (!ok) return;
      let undo;
      try {
        undo = state.deleteStore(editing.id);
      } catch (e) {
        toast(saveErrorMessage(e));
        return;
      }
      router.resetTo('/stores');
      toast('お店を削除しました', {
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

    async function setHere() {
      f.locating = true;
      renderLocation();
      try {
        const pos = await geo.getPosition({ maxAgeMs: 0 });
        Object.assign(f, { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
        if (pos.accuracy > 150) toast(`位置の誤差が大きめです（±${Math.round(pos.accuracy)}m）。お店の中か近くで登録し直すと正確になります`);
      } catch (err) {
        toast(geo.geoErrorMessage(err));
      } finally {
        f.locating = false;
        if (el.isConnected) renderLocation();
      }
    }

    function pickCandidate(c) {
      Object.assign(f, { name: c.name, chain: c.chain, lat: c.lat, lng: c.lng, osmId: c.osmId, accuracy: null });
      ref('name').value = f.name;
      ref('chain').value = f.chain;
      renderLocation();
      toast(`「${c.name}」を入れました。よければ保存してください`);
      ref('name').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    el.addEventListener('input', (e) => {
      const name = e.target.dataset.ref;
      if (['name', 'chain', 'memo'].includes(name)) f[name] = e.target.value;
    });
    el.addEventListener('click', (e) => {
      const segBtn = e.target.closest('[data-seg] button');
      if (segBtn) {
        f.priceInput = pressSeg(segBtn);
        return;
      }
      const osm = e.target.closest('[data-osm]');
      if (osm) {
        const c = loc.candidate(osm.dataset.osm);
        if (c) pickCandidate(c);
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      switch (act) {
        case 'cancel':
          router.back(fallback);
          break;
        case 'save':
          save();
          break;
        case 'delete':
          remove();
          break;
        case 'set-here':
          setHere();
          break;
        case 'clear-loc':
          Object.assign(f, { lat: null, lng: null, accuracy: null, osmId: null });
          renderLocation();
          break;
        case 'locate':
          loc.locate();
          break;
        case 'relocate':
          loc.locate({ force: true });
          break;
        case 'search-osm':
          loc.searchOsm();
          break;
        case 'search-osm-force':
          loc.searchOsm({ force: true });
          break;
        case 'osm-more':
          loc.expand();
          break;
        default:
      }
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      const order = ['name', 'chain', 'memo'];
      const next = order[order.indexOf(e.target.dataset.ref) + 1];
      if (next) ref(next).focus();
      else e.target.blur();
    });

    if (!editing && !locationEnabled()) ref('name').focus({ preventScroll: true });
    // 位置情報が許可済みなら、聞かずに周辺のお店を探しはじめる
    if (!editing) {
      canAutoLocate().then((ok) => {
        if (ok && el.isConnected) loc.locate();
      });
    }

    return () => loc.dispose();
  },
};
