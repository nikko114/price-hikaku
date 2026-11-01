// アプリのデータ（メモリ上）と保存・変更通知
import * as db from './db.js';
import { DEFAULT_SETTINGS, DEFAULT_META } from './defaults.js';

const KEYS = ['products', 'stores', 'records', 'settings', 'meta'];

let data = {
  products: [],
  stores: [],
  records: [],
  settings: { ...DEFAULT_SETTINGS },
  meta: { ...DEFAULT_META },
};

const listeners = new Set();

export function init() {
  const raw = db.loadAll();
  data = {
    products: Array.isArray(raw.products) ? raw.products : [],
    stores: Array.isArray(raw.stores) ? raw.stores : [],
    records: Array.isArray(raw.records) ? raw.records : [],
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
    meta: { ...DEFAULT_META, ...(raw.meta || {}) },
  };
}

// ---- 読み取り ----
export const products = () => data.products;
export const stores = () => data.stores;
export const records = () => data.records;
export const settings = () => data.settings;
export const meta = () => data.meta;
export const product = (id) => data.products.find((p) => p.id === id) || null;
export const store = (id) => data.stores.find((s) => s.id === id) || null;
export const record = (id) => data.records.find((r) => r.id === id) || null;
export const recordsOfProduct = (id) => data.records.filter((r) => r.productId === id);
export const recordsOfStore = (id) => data.records.filter((r) => r.storeId === id);

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(changed) {
  for (const fn of listeners) {
    try {
      fn(changed);
    } catch (err) {
      console.error(err);
    }
  }
}

// 短いID（時刻 + ランダム）
export function uid() {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('');
  return Date.now().toString(36) + rand;
}

function stamp(obj, isNew) {
  const now = new Date().toISOString();
  return isNew ? { ...obj, createdAt: now, updatedAt: now } : { ...obj, updatedAt: now };
}

/**
 * まとめて変更して保存する。fn の中で draft.xxx に新しい配列/オブジェクトを代入する。
 * 保存に失敗したら（容量オーバーなど）元に戻して例外を投げる。
 */
export function batch(fn) {
  const draft = { ...data };
  const result = fn(draft);
  const changed = KEYS.filter((k) => draft[k] !== data[k]);
  if (!changed.length) return result;
  const saved = [];
  try {
    for (const k of changed) {
      db.save(k, draft[k]);
      saved.push(k);
    }
  } catch (err) {
    for (const k of saved) {
      try {
        db.save(k, data[k]);
      } catch {
        /* 元に戻せなくても続ける */
      }
    }
    throw err;
  }
  for (const k of changed) data[k] = draft[k];
  emit(changed);
  return result;
}

// ---- 商品 ----
export function createProduct(fields) {
  return batch((d) => {
    const p = stamp({ id: uid(), ...fields }, true);
    d.products = [...d.products, p];
    return p;
  });
}

export function updateProduct(id, fields) {
  return batch((d) => {
    let updated = null;
    d.products = d.products.map((p) => (p.id === id ? (updated = stamp({ ...p, ...fields }, false)) : p));
    return updated;
  });
}

// 商品と、その記録を削除。元に戻す関数を返す（写真は起動時の掃除で消える）
export function deleteProduct(id) {
  const removed = { product: product(id), records: recordsOfProduct(id) };
  batch((d) => {
    d.products = d.products.filter((p) => p.id !== id);
    d.records = d.records.filter((r) => r.productId !== id);
  });
  return () =>
    batch((d) => {
      if (removed.product && !d.products.some((p) => p.id === id)) d.products = [...d.products, removed.product];
      const ids = new Set(d.records.map((r) => r.id));
      d.records = [...d.records, ...removed.records.filter((r) => !ids.has(r.id))];
    });
}

// ---- お店 ----
export function createStore(fields) {
  return batch((d) => {
    const s = stamp({ id: uid(), ...fields }, true);
    d.stores = [...d.stores, s];
    return s;
  });
}

export function updateStore(id, fields) {
  return batch((d) => {
    let updated = null;
    d.stores = d.stores.map((s) => (s.id === id ? (updated = stamp({ ...s, ...fields }, false)) : s));
    return updated;
  });
}

export function deleteStore(id) {
  const removed = { store: store(id), records: recordsOfStore(id) };
  batch((d) => {
    d.stores = d.stores.filter((s) => s.id !== id);
    d.records = d.records.filter((r) => r.storeId !== id);
  });
  return () =>
    batch((d) => {
      if (removed.store && !d.stores.some((s) => s.id === id)) d.stores = [...d.stores, removed.store];
      const ids = new Set(d.records.map((r) => r.id));
      d.records = [...d.records, ...removed.records.filter((r) => !ids.has(r.id))];
    });
}

// ---- 記録 ----
/**
 * 記録を保存する。必要なら新しい商品・お店も一緒に作る（すべて成功するか、何も変えないか）
 * @param {{recordId?:string, record:object, newProduct?:object, newStore?:object, storePatch?:object}} p
 */
export function saveRecord({ recordId = null, record: fields, newProduct = null, newStore = null, storePatch = null }) {
  return batch((d) => {
    let { productId, storeId } = fields;
    if (newProduct) {
      const p = stamp({ id: uid(), ...newProduct }, true);
      d.products = [...d.products, p];
      productId = p.id;
    }
    if (newStore) {
      const s = stamp({ id: uid(), ...newStore }, true);
      d.stores = [...d.stores, s];
      storeId = s.id;
    }
    if (storePatch && storeId) {
      d.stores = d.stores.map((s) => {
        if (s.id !== storeId) return s;
        const changed = Object.keys(storePatch).some((k) => s[k] !== storePatch[k]);
        return changed ? stamp({ ...s, ...storePatch }, false) : s;
      });
    }
    let saved = null;
    if (recordId) {
      d.records = d.records.map((r) => (r.id === recordId ? (saved = stamp({ ...r, ...fields, productId, storeId }, false)) : r));
    } else {
      saved = stamp({ id: uid(), ...fields, productId, storeId }, true);
      d.records = [...d.records, saved];
    }
    return saved;
  });
}

export function deleteRecord(id) {
  const removed = record(id);
  batch((d) => {
    d.records = d.records.filter((r) => r.id !== id);
  });
  return () =>
    batch((d) => {
      if (removed && !d.records.some((r) => r.id === id)) d.records = [...d.records, removed];
    });
}

// ---- 設定など ----
export function updateSettings(patch) {
  return batch((d) => {
    d.settings = { ...d.settings, ...patch };
  });
}

export function updateMeta(patch) {
  return batch((d) => {
    d.meta = { ...d.meta, ...patch };
  });
}

// バックアップから戻すとき（settings を渡さなければ今の設定のまま）
export function replaceData({ products: ps, stores: ss, records: rs, settings: st }) {
  return batch((d) => {
    d.products = ps;
    d.stores = ss;
    d.records = rs;
    if (st) d.settings = { ...DEFAULT_SETTINGS, ...st };
  });
}

export function clearAll() {
  return batch((d) => {
    d.products = [];
    d.stores = [];
    d.records = [];
    d.settings = { ...DEFAULT_SETTINGS };
    d.meta = { ...DEFAULT_META, installHintDismissed: d.meta.installHintDismissed, persistRequested: d.meta.persistRequested };
  });
}

export function referencedImageIds() {
  return new Set(data.products.map((p) => p.imageId).filter(Boolean));
}
