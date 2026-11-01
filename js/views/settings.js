// 設定: 表示・バックアップ・データ
import { html, mount, appBar, toast, ask, confirmDanger, saveErrorMessage, isStandalone, isIOS } from '../ui.js';
import { icons } from '../icons.js';
import * as state from '../state.js';
import * as db from '../db.js';
import * as images from '../images.js';
import { APP_VERSION } from '../version.js';
import { todayStr, fmtBytes, relativeDay, fmtDate } from '../format.js';
import {
  buildBackupFile, readBackupFile, validateBackup, mergeData, deliverFile, downloadFile, dataUrlToBlob,
} from '../backup.js';
import { segmented, pressSeg } from './common.js';

// 画面を作り直してもバックアップの準備状態は残す
const bk = { status: 'idle', file: null };

const STALE_OPTIONS = [30, 60, 90, 180, 365];

function backupBoxHtml() {
  const m = state.meta();
  const today = todayStr();
  const last = m.lastBackupAt ? m.lastBackupAt.slice(0, 10) : null;
  const canShare = typeof navigator.canShare === 'function';
  return html`
    <div class="field">
      <p class="field-text">最後のバックアップ: <strong>${last ? `${fmtDate(last, today)}（${relativeDay(last, today)}）` : 'まだありません'}</strong></p>
      <p class="field-hint">写真も含めて1つのファイルに書き出します。「"ファイル"に保存」やAirDrop・LINEなどで保管してください。</p>
    </div>
    <div class="field">
      ${bk.status === 'ready'
        ? html`<p class="field-text">✅ 準備できました（${fmtBytes(bk.file.size)}）</p>
          <div class="button-row">
            ${canShare ? html`<button type="button" class="btn is-primary" data-act="share">${icons.share}<span>共有して保存</span></button>` : ''}
            <button type="button" class="btn ${canShare ? '' : 'is-primary'}" data-act="download">${icons.download}<span>ダウンロード</span></button>
          </div>`
        : html`<button type="button" class="btn is-primary is-block" data-act="prepare" ${bk.status === 'preparing' ? 'disabled' : ''}>
            ${bk.status === 'preparing' ? '準備しています…' : html`${icons.download}<span>バックアップを作る</span>`}
          </button>`}
    </div>
    <div class="field">
      <button type="button" class="btn is-block" data-act="import">${icons.upload}<span>バックアップから復元</span></button>
      <input type="file" accept="application/json,.json" data-ref="importFile" hidden>
    </div>`;
}

export default {
  live: true,
  render(el) {
    const s = state.settings();
    const counts = { products: state.products().length, stores: state.stores().length, records: state.records().length };

    mount(el, html`
      ${appBar({ title: '設定', large: true })}
      <div class="page">
        ${!isStandalone()
          ? html`<div class="notice">
              <p class="notice-title">📲 ホーム画面に追加できます</p>
              <p class="notice-text">${isIOS() ? 'Safari の共有ボタン →「ホーム画面に追加」' : 'ブラウザのメニュー →「ホーム画面に追加」'}で、アプリのように使えます。ブラウザとホーム画面のアプリではデータが別々です（移すときはバックアップを使ってください）。</p>
            </div>`
          : ''}

        <section class="section">
          <h2 class="section-title">表示</h2>
          <div class="card">
            <div class="field">
              <span class="field-label">単価の表示</span>
              ${segmented('priceDisplay', [['yenPerQty', '100gあたりの値段'], ['qtyPerYen', '100円で買える量']], s.priceDisplay, { label: '単価の表示' })}
            </div>
            <div class="field field-inline">
              <label class="field-label" for="st-stale">「古い記録」にする日数</label>
              <select id="st-stale" class="input select is-short" data-ref="staleDays">
                ${STALE_OPTIONS.map((d) => html`<option value="${d}" ${d === s.staleDays ? 'selected' : ''}>${d}日</option>`)}
              </select>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">バックアップ</h2>
          <div class="card" data-ref="backupBox">${backupBoxHtml()}</div>
        </section>

        <section class="section">
          <h2 class="section-title">データ</h2>
          <div class="card">
            <div class="field">
              <p class="field-text">商品 ${counts.products}件 ・ お店 ${counts.stores}件 ・ 記録 ${counts.records}件</p>
              <p class="field-hint" data-ref="usage">使用量を計算しています…</p>
            </div>
            <div class="field">
              <button type="button" class="btn is-danger is-block" data-act="clear">${icons.trash}<span>すべてのデータを削除</span></button>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">このアプリについて</h2>
          <div class="card">
            <div class="field">
              <p class="field-text">単価くらべ（price-hikaku） v${APP_VERSION}</p>
              <p class="field-hint">データはこの端末の中だけに保存されます。<a href="https://github.com/nikko114/price-hikaku" target="_blank" rel="noopener">GitHub</a></p>
            </div>
          </div>
        </section>
      </div>`);

    // 使用量（非同期）
    (async () => {
      const local = db.localUsageBytes();
      const img = await images.imageStats();
      let persisted = null;
      try {
        persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
      } catch {
        persisted = null;
      }
      const box = el.querySelector('[data-ref="usage"]');
      if (box) {
        mount(box, html`データ ${fmtBytes(local)} ・ 写真 ${img.count}枚（${fmtBytes(img.bytes)}）${
          persisted === true ? ' ・ 🛡 消されにくい設定になっています' : ''
        }`);
      }
    })();

    async function prepare() {
      bk.status = 'preparing';
      mount(el.querySelector('[data-ref="backupBox"]'), backupBoxHtml());
      try {
        const imageRecords = await db.allImages().catch(() => []);
        bk.file = await buildBackupFile({
          data: { products: state.products(), stores: state.stores(), records: state.records(), settings: state.settings() },
          imageRecords,
          appVersion: APP_VERSION,
          dateStr: todayStr(),
        });
        bk.status = 'ready';
      } catch (e) {
        console.error(e);
        bk.status = 'idle';
        toast('バックアップを作れませんでした');
      }
      const box = el.querySelector('[data-ref="backupBox"]');
      if (box) mount(box, backupBoxHtml());
    }

    function markBackedUp() {
      try {
        state.updateMeta({ lastBackupAt: new Date().toISOString() });
      } catch (e) {
        console.warn(e);
      }
    }

    async function importBackup(file) {
      const obj = await readBackupFile(file);
      const v = validateBackup(obj);
      if (!v.ok) {
        await ask({ title: '読み込めませんでした', message: v.errors.join('\n'), buttons: [{ label: 'OK', value: true, style: 'primary' }] });
        return;
      }
      const d = v.data;
      const lines = [
        `商品 ${d.products.length}件・お店 ${d.stores.length}件・記録 ${d.records.length}件・写真 ${v.images.length}枚`,
        v.exportedAt ? `（${v.exportedAt.slice(0, 10)} に作ったバックアップ）` : '',
        v.skipped ? `読み込めない行が ${v.skipped}件あったので飛ばします。` : '',
      ].filter(Boolean);
      const mode = await ask({
        title: 'バックアップを読み込みますか？',
        message: lines.join('\n'),
        buttons: [
          { label: '今のデータに足す（統合）', value: 'merge', style: 'primary' },
          { label: '今のデータと置き換える', value: 'replace', style: 'danger' },
          { label: 'キャンセル', value: null, style: 'cancel' },
        ],
      });
      if (!mode) return;
      try {
        if (mode === 'replace') await db.clearImages();
        for (const im of v.images) {
          await db.putImage({ id: im.id, full: dataUrlToBlob(im.full), thumb: im.thumb ? dataUrlToBlob(im.thumb) : null, createdAt: im.createdAt || null });
        }
        if (mode === 'replace') {
          state.replaceData(d);
        } else {
          state.replaceData(mergeData({ products: state.products(), stores: state.stores(), records: state.records() }, d));
        }
        images.gcImages();
        toast(mode === 'replace' ? 'バックアップで置き換えました' : 'バックアップを統合しました');
      } catch (e) {
        console.error(e);
        toast(saveErrorMessage(e));
      }
    }

    el.addEventListener('click', async (e) => {
      const segBtn = e.target.closest('[data-seg="priceDisplay"] button');
      if (segBtn) {
        state.updateSettings({ priceDisplay: pressSeg(segBtn) });
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'prepare') prepare();
      if (act === 'share' && bk.file) {
        const result = await deliverFile(bk.file);
        if (result !== 'cancelled') {
          bk.status = 'idle';
          bk.file = null;
          markBackedUp();
          toast(result === 'shared' ? 'バックアップを書き出しました' : 'バックアップをダウンロードしました');
        }
      }
      if (act === 'download' && bk.file) {
        downloadFile(bk.file);
        bk.status = 'idle';
        bk.file = null;
        markBackedUp();
        toast('バックアップをダウンロードしました');
      }
      if (act === 'import') el.querySelector('[data-ref="importFile"]').click();
      if (act === 'clear') {
        const ok = await confirmDanger({
          title: 'すべてのデータを削除しますか？',
          message: '商品・お店・記録・写真がすべて消えて、元に戻せません。先にバックアップを作っておくのがおすすめです。',
          ok: 'すべて削除',
        });
        if (!ok) return;
        try {
          state.clearAll();
          await db.clearImages();
          toast('すべてのデータを削除しました');
        } catch (err) {
          toast(saveErrorMessage(err));
        }
      }
    });

    el.addEventListener('change', (e) => {
      const name = e.target.dataset.ref;
      if (name === 'staleDays') state.updateSettings({ staleDays: Number(e.target.value) });
      if (name === 'importFile') {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (file) importBackup(file);
      }
    });
  },
};
