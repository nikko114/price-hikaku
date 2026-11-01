// 商品の追加・編集
import { html, mount, appBar, toast, confirmDanger, saveErrorMessage } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as images from '../images.js';
import * as router from '../router.js';
import { UNIT_TYPES, UNIT_TYPE_KEYS, COUNT_LABELS, compareUnitText, unitTypeOf, defaultCompareAmount } from '../units.js';
import { categoryInfo, DEFAULT_TAX_RATE } from '../defaults.js';
import { segmented, pressSeg, notFound, categoryNames } from './common.js';

export default {
  live: false,
  render(el, { params }) {
    const editing = params.id ? state.product(params.id) : null;
    if (params.id && !editing) return notFound(el, '商品が見つかりません');
    const recs = editing ? state.recordsOfProduct(editing.id) : [];

    const f = {
      name: editing?.name || '',
      category: editing?.category || '',
      customCategory: '',
      unitType: editing?.unitType || 'weight',
      countLabel: editing?.countLabel || '個',
      compareAmount: editing?.compareAmount || 100,
      taxRate: editing?.taxRate ?? DEFAULT_TAX_RATE,
      memo: editing?.memo || '',
      imageId: editing?.imageId || null,
      newPhoto: null, // { full, thumb, previewUrl }
      removePhoto: false,
    };
    // 記録があるときは、量の種類（重さ⇄容量など）を変えられない
    const typeLocked = recs.some((r) => unitTypeOf(r.unit) === editing?.unitType);
    const fallback = editing ? `/products/${editing.id}` : '/';
    const ref = (name) => el.querySelector(`[data-ref="${name}"]`);

    function photoHtml() {
      const hasExisting = f.imageId && !f.removePhoto;
      const preview = f.newPhoto
        ? html`<img src="${f.newPhoto.previewUrl}" alt="">`
        : hasExisting ? html`<img data-img="${f.imageId}" data-variant="thumb" alt="">` : '';
      return html`<div class="photo-field">
        <span class="thumb is-large ${preview ? 'has-img' : ''}" data-fallback="📷" aria-hidden="true">${preview}</span>
        <span class="photo-actions">
          <button type="button" class="btn is-small" data-act="pick-photo">${icons.camera}<span>${preview ? '写真を変える' : '写真を追加'}</span></button>
          ${preview ? html`<button type="button" class="link-btn is-danger" data-act="remove-photo">写真を外す</button>` : ''}
        </span>
      </div>`;
    }

    function categoryHtml() {
      const cats = categoryNames();
      return html`<div class="chips is-wrap" role="group" aria-label="カテゴリ">
          ${cats.map((c) => html`<button type="button" class="chip" data-cat="${c}" aria-pressed="${String(f.category === c)}">${c}</button>`)}
        </div>
        <input class="input" data-ref="customCategory" value="${f.customCategory}" placeholder="ほかのカテゴリ名を入力" autocomplete="off">`;
    }

    function unitHtml() {
      const opts = UNIT_TYPES[f.unitType].compareOptions;
      if (!opts.includes(f.compareAmount)) f.compareAmount = defaultCompareAmount(f.unitType);
      return html`
        <div class="field">
          <span class="field-label">量の種類</span>
          ${segmented('unitType', UNIT_TYPE_KEYS.map((k) => [k, UNIT_TYPES[k].label]), f.unitType, { label: '量の種類' })}
          ${typeLocked ? html`<p class="field-hint">記録があるので、量の種類は変えられません</p>` : ''}
        </div>
        ${f.unitType === 'count'
          ? html`<div class="field field-inline">
              <label class="field-label" for="p-count">数え方</label>
              <select id="p-count" class="input select is-short" data-ref="countLabel">
                ${COUNT_LABELS.map((l) => html`<option value="${l}" ${l === f.countLabel ? 'selected' : ''}>${l}</option>`)}
              </select>
            </div>`
          : ''}
        <div class="field">
          <span class="field-label">比べる単位</span>
          ${segmented('compare', opts.map((n) => [n, `${compareUnitText(f.unitType, n, f.countLabel)}あたり`]), f.compareAmount, { label: '比べる単位' })}
        </div>`;
    }

    function renderPhoto() {
      mount(ref('photoBox'), photoHtml());
      images.hydrate(ref('photoBox'));
    }
    function renderUnit() {
      mount(ref('unitBox'), unitHtml());
      if (typeLocked) for (const b of el.querySelectorAll('[data-seg="unitType"] button')) b.disabled = b.dataset.value !== f.unitType;
    }

    mount(el, html`
      ${appBar({
        title: editing ? '商品を編集' : '商品を追加',
        left: html`<button type="button" class="appbar-btn" data-act="cancel">キャンセル</button>`,
        right: html`<button type="button" class="appbar-btn is-strong" data-act="save">保存</button>`,
      })}
      <form class="page" novalidate autocomplete="off">
        <section class="section">
          <div class="card">
            <div class="field">
              <label class="field-label" for="p-name">商品名</label>
              <input id="p-name" class="input" data-ref="name" value="${f.name}" placeholder="例: 鶏むね肉、牛乳" enterkeyhint="done">
            </div>
            <div class="field" data-ref="photoBox"></div>
          </div>
        </section>
        <section class="section">
          <h2 class="section-title">カテゴリ</h2>
          <div class="card"><div class="field" data-ref="catBox">${categoryHtml()}</div></div>
        </section>
        <section class="section">
          <h2 class="section-title">比べ方</h2>
          <div class="card" data-ref="unitBox"></div>
        </section>
        <section class="section">
          <div class="card">
            <div class="field field-inline">
              <span class="field-label">消費税率</span>
              ${segmented('tax', [[8, '8%（食品）'], [10, '10%']], f.taxRate, { label: '消費税率' })}
            </div>
            <div class="field">
              <label class="field-label" for="p-memo">メモ</label>
              <input id="p-memo" class="input" data-ref="memo" value="${f.memo}" placeholder="例: 冷凍のほうが安いことが多い" enterkeyhint="done">
            </div>
          </div>
          <p class="section-note">税率は、税抜の値段を入れたときに税込に直すために使います。</p>
        </section>
        <div class="actions">
          <button type="submit" class="btn is-primary is-block">${editing ? '更新する' : '追加する'}</button>
          ${editing ? html`<button type="button" class="btn is-danger is-block" data-act="delete">${icons.trash}<span>この商品を削除</span></button>` : ''}
        </div>
        <input type="file" accept="image/*" data-ref="photo" hidden>
      </form>`);
    renderPhoto();
    renderUnit();

    let saving = false;
    async function save() {
      if (saving) return;
      const name = f.name.trim();
      if (!name) {
        toast('商品名を入れてください');
        ref('name').focus();
        return;
      }
      saving = true;
      try {
        let imageId = f.removePhoto ? null : f.imageId;
        if (f.newPhoto) {
          try {
            imageId = await images.savePhoto(f.newPhoto);
          } catch (e) {
            console.error(e);
            toast('写真を保存できませんでした');
            return;
          }
        }
        const fields = {
          name,
          category: f.customCategory.trim() || f.category,
          unitType: f.unitType,
          countLabel: f.unitType === 'count' ? f.countLabel : null,
          compareAmount: f.compareAmount,
          taxRate: f.taxRate,
          memo: f.memo.trim(),
          imageId,
        };
        let saved;
        try {
          saved = editing ? state.updateProduct(editing.id, fields) : state.createProduct({ ...fields, favorite: false });
        } catch (e) {
          if (f.newPhoto) images.deletePhoto(imageId);
          toast(saveErrorMessage(e));
          return;
        }
        // 差し替え・外した写真は消す
        if (editing?.imageId && editing.imageId !== imageId) images.deletePhoto(editing.imageId);
        toast(editing ? '更新しました' : '商品を追加しました');
        if (editing) router.back(fallback);
        else router.navigate(`/products/${saved.id}`, { replace: true });
      } finally {
        saving = false;
      }
    }

    async function remove() {
      const n = recs.length;
      const ok = await confirmDanger({
        title: `「${editing.name}」を削除しますか？`,
        message: n ? `この商品の記録 ${n}件も一緒に削除されます。` : '',
      });
      if (!ok) return;
      let undo;
      try {
        undo = state.deleteProduct(editing.id);
      } catch (e) {
        toast(saveErrorMessage(e));
        return;
      }
      router.resetTo('/');
      toast('商品を削除しました', {
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
      if (name === 'name' || name === 'memo') f[name] = e.target.value;
      if (name === 'customCategory') {
        f.customCategory = e.target.value;
        if (f.customCategory.trim()) {
          f.category = '';
          for (const c of el.querySelectorAll('[data-cat]')) c.setAttribute('aria-pressed', 'false');
        }
      }
    });

    el.addEventListener('change', (e) => {
      const name = e.target.dataset.ref;
      if (name === 'countLabel') {
        f.countLabel = e.target.value;
        renderUnit();
      }
      if (name === 'photo') {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        images.processPhoto(file).then((blobs) => {
          if (f.newPhoto) URL.revokeObjectURL(f.newPhoto.previewUrl);
          f.newPhoto = { ...blobs, previewUrl: URL.createObjectURL(blobs.thumb) };
          f.removePhoto = false;
          renderPhoto();
        }).catch((err) => {
          console.error(err);
          toast('この写真は読み込めませんでした');
        });
      }
    });

    el.addEventListener('click', (e) => {
      const cat = e.target.closest('[data-cat]');
      if (cat) {
        f.category = f.category === cat.dataset.cat ? '' : cat.dataset.cat;
        f.customCategory = '';
        ref('customCategory').value = '';
        for (const c of el.querySelectorAll('[data-cat]')) c.setAttribute('aria-pressed', String(c.dataset.cat === f.category));
        const info = categoryInfo(f.category, state.settings());
        if (info && !editing) {
          f.taxRate = info.taxRate;
          for (const b of el.querySelectorAll('[data-seg="tax"] button')) b.setAttribute('aria-pressed', String(Number(b.dataset.value) === f.taxRate));
        }
        return;
      }
      const segBtn = e.target.closest('[data-seg] button');
      if (segBtn && !segBtn.disabled) {
        const seg = segBtn.closest('[data-seg]').dataset.seg;
        const v = pressSeg(segBtn);
        if (seg === 'unitType' && v !== f.unitType) {
          f.unitType = v;
          f.compareAmount = defaultCompareAmount(v);
          renderUnit();
        }
        if (seg === 'compare') f.compareAmount = Number(v);
        if (seg === 'tax') f.taxRate = Number(v);
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') router.back(fallback);
      if (act === 'save') save();
      if (act === 'delete') remove();
      if (act === 'pick-photo') ref('photo').click();
      if (act === 'remove-photo') {
        if (f.newPhoto) URL.revokeObjectURL(f.newPhoto.previewUrl);
        f.newPhoto = null;
        f.removePhoto = true;
        renderPhoto();
      }
    });

    el.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && e.target.tagName === 'INPUT') {
        e.preventDefault();
        e.target.blur();
      }
    });

    if (!editing) ref('name').focus({ preventScroll: true });

    return () => {
      if (f.newPhoto) URL.revokeObjectURL(f.newPhoto.previewUrl);
    };
  },
};
