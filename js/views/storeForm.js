// お店の追加・編集
import { html, mount, appBar, toast, confirmDanger, saveErrorMessage } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as router from '../router.js';
import { segmented, pressSeg, notFound } from './common.js';

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
    };
    const fallback = editing ? `/stores/${editing.id}` : '/stores';
    const chains = [...new Set(state.stores().map((s) => s.chain).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    const ref = (name) => el.querySelector(`[data-ref="${name}"]`);

    mount(el, html`
      ${appBar({
        title: editing ? 'お店を編集' : 'お店を追加',
        left: html`<button type="button" class="appbar-btn" data-act="cancel">キャンセル</button>`,
        right: html`<button type="button" class="appbar-btn is-strong" data-act="save">保存</button>`,
      })}
      <form class="page" novalidate autocomplete="off">
        <section class="section">
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

    function save() {
      const name = f.name.trim();
      if (!name) {
        toast('お店の名前を入れてください');
        ref('name').focus();
        return;
      }
      const fields = { name, chain: f.chain.trim(), priceInput: f.priceInput, memo: f.memo.trim() };
      let saved;
      try {
        saved = editing ? state.updateStore(editing.id, fields) : state.createStore({ ...fields, lat: null, lng: null, osmId: null });
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

    el.addEventListener('input', (e) => {
      const name = e.target.dataset.ref;
      if (name in f) f[name] = e.target.value;
    });
    el.addEventListener('click', (e) => {
      const segBtn = e.target.closest('[data-seg] button');
      if (segBtn) {
        f.priceInput = pressSeg(segBtn);
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') router.back(fallback);
      if (act === 'save') save();
      if (act === 'delete') remove();
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

    if (!editing) ref('name').focus({ preventScroll: true });
  },
};
