// 保存まわり: データ本体は localStorage（JSON）、写真は IndexedDB

const PREFIX = 'ph.v1.';
export const COLLECTIONS = ['products', 'stores', 'records', 'settings', 'meta'];

export class StorageFullError extends Error {
  constructor() {
    super('端末の保存容量がいっぱいです');
    this.name = 'StorageFullError';
  }
}

function isQuotaError(err) {
  return err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
}

export function loadAll() {
  const out = {};
  for (const name of COLLECTIONS) {
    try {
      const raw = localStorage.getItem(PREFIX + name);
      out[name] = raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error(`読み込みに失敗: ${name}`, err);
      out[name] = null;
    }
  }
  return out;
}

export function save(name, value) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
  } catch (err) {
    if (isQuotaError(err)) throw new StorageFullError();
    throw err;
  }
}

export function removeAll() {
  for (const name of COLLECTIONS) localStorage.removeItem(PREFIX + name);
}

// localStorage の使用量（だいたい。文字数 × 2 バイト）
export function localUsageBytes() {
  let n = 0;
  for (const name of COLLECTIONS) {
    const v = localStorage.getItem(PREFIX + name);
    if (v) n += (PREFIX.length + name.length + v.length) * 2;
  }
  return n;
}

// ---------------- IndexedDB（写真） ----------------

const DB_NAME = 'price-hikaku';
const STORE = 'images';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // iOS で裏に回したあと接続が切れることがあるので、閉じたら作り直す
        db.onclose = () => { dbPromise = null; };
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => console.warn('IndexedDB の更新が他のタブでブロックされています');
    });
  }
  return dbPromise;
}

async function run(mode, fn, retry = true) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      const req = fn(store);
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } catch (err) {
    if (isQuotaError(err)) throw new StorageFullError();
    if (retry && err && (err.name === 'InvalidStateError' || /connection|closing/i.test(String(err.message)))) {
      dbPromise = null;
      return run(mode, fn, false);
    }
    throw err;
  }
}

export function putImage(rec) {
  return run('readwrite', (s) => s.put(rec));
}

export function getImage(id) {
  return run('readonly', (s) => s.get(id));
}

export function deleteImage(id) {
  return run('readwrite', (s) => s.delete(id));
}

export function allImages() {
  return run('readonly', (s) => s.getAll());
}

export function imageKeys() {
  return run('readonly', (s) => s.getAllKeys());
}

export function clearImages() {
  return run('readwrite', (s) => s.clear());
}
