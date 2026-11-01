// バックアップの書き出し・読み込み
// 前半は DOM に触らない純粋関数（tests/backup.test.js でテスト）

export const BACKUP_APP = 'price-hikaku';
export const BACKUP_FORMAT = 1;

export function backupFileName(dateStr) {
  return `price-hikaku-backup-${dateStr}.json`;
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.length > 0;
const isPos = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

function validProduct(p) {
  return isObj(p) && isStr(p.id) && isStr(p.name) && ['weight', 'volume', 'length', 'count'].includes(p.unitType) && isPos(p.compareAmount);
}

function validStore(s) {
  return isObj(s) && isStr(s.id) && isStr(s.name);
}

function validRecord(r) {
  return (
    isObj(r) && isStr(r.id) && isStr(r.productId) && isStr(r.storeId) && isStr(r.unit) &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) && isPos(r.price) && isPos(r.amount)
  );
}

/**
 * 読み込んだ JSON を確かめて、使える形にする
 * @returns {{ok:boolean, errors:string[], data?:object, images?:object[], skipped?:number}}
 */
export function validateBackup(obj) {
  if (!isObj(obj)) return { ok: false, errors: ['バックアップファイルの形式ではありません'] };
  const errors = [];
  if (obj.app !== BACKUP_APP) errors.push('このアプリのバックアップではありません');
  if (typeof obj.format !== 'number') errors.push('バックアップファイルの形式ではありません');
  else if (obj.format > BACKUP_FORMAT) errors.push('新しいバージョンのアプリで作ったバックアップです。アプリを更新してから読み込んでください');
  const d = isObj(obj.data) ? obj.data : null;
  if (!d || !Array.isArray(d.products) || !Array.isArray(d.stores) || !Array.isArray(d.records)) errors.push('データが壊れています');
  if (errors.length) return { ok: false, errors };

  const products = d.products.filter(validProduct);
  const stores = d.stores.filter(validStore);
  const productIds = new Set(products.map((p) => p.id));
  const storeIds = new Set(stores.map((s) => s.id));
  const records = d.records.filter((r) => validRecord(r) && productIds.has(r.productId) && storeIds.has(r.storeId));
  const images = (Array.isArray(obj.images) ? obj.images : []).filter(
    (im) => isObj(im) && isStr(im.id) && typeof im.full === 'string' && im.full.startsWith('data:image/'),
  );
  const skipped =
    d.products.length - products.length + (d.stores.length - stores.length) + (d.records.length - records.length);
  return {
    ok: true,
    errors: [],
    data: { products, stores, records, settings: isObj(d.settings) ? d.settings : null },
    images,
    skipped,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : null,
  };
}

const ts = (x) => Date.parse(x?.updatedAt || x?.createdAt || '') || 0;

// 同じ ID は更新日時が新しいほうを残す
export function mergeById(current, incoming) {
  const map = new Map(current.map((x) => [x.id, x]));
  for (const x of incoming) {
    const cur = map.get(x.id);
    if (!cur || ts(x) > ts(cur)) map.set(x.id, x);
  }
  return [...map.values()];
}

export function mergeData(current, incoming) {
  return {
    products: mergeById(current.products, incoming.products),
    stores: mergeById(current.stores, incoming.stores),
    records: mergeById(current.records, incoming.records),
  };
}

// ---------------- ここから下はブラウザ専用 ----------------

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const mime = /^data:([^;,]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * バックアップファイルを作る
 * @param {{products:any[], stores:any[], records:any[], settings:object}} data
 * @param {any[]} imageRecords IndexedDB の写真 { id, full: Blob, thumb: Blob, createdAt }
 */
export async function buildBackupFile({ data, imageRecords, appVersion, dateStr }) {
  const used = new Set(data.products.map((p) => p.imageId).filter(Boolean));
  const images = [];
  for (const im of imageRecords) {
    if (!used.has(im.id) || !im.full) continue;
    images.push({
      id: im.id,
      full: await blobToDataUrl(im.full),
      thumb: im.thumb ? await blobToDataUrl(im.thumb) : null,
      createdAt: im.createdAt || null,
    });
  }
  const payload = {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    appVersion,
    exportedAt: new Date().toISOString(),
    data,
    images,
  };
  const json = JSON.stringify(payload);
  return new File([json], backupFileName(dateStr), { type: 'application/json' });
}

export async function readBackupFile(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 共有シート（「"ファイル"に保存」など）で渡す。使えなければダウンロード
export async function deliverFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      console.warn('共有に失敗したのでダウンロードします', err);
    }
  }
  downloadFile(file);
  return 'downloaded';
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
