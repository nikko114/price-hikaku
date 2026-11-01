import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, mergeById, mergeData, backupFileName, BACKUP_APP } from '../js/backup.js';

const product = { id: 'p1', name: '牛乳', unitType: 'volume', compareAmount: 100, updatedAt: '2026-10-01T00:00:00.000Z' };
const store = { id: 's1', name: 'イオン 〇〇店' };
const record = { id: 'r1', productId: 'p1', storeId: 's1', date: '2026-10-27', price: 198, amount: 1, unit: 'L', taxIncluded: true, taxRate: 8 };

const backup = (data, extra = {}) => ({ app: BACKUP_APP, format: 1, exportedAt: '2026-11-01T00:00:00.000Z', data, images: [], ...extra });

test('validateBackup: 正しいバックアップ', () => {
  const v = validateBackup(backup({ products: [product], stores: [store], records: [record], settings: { staleDays: 30 } }, {
    images: [{ id: 'img1', full: 'data:image/jpeg;base64,AAAA', thumb: null }, { id: 'bad', full: 'http://example.com/x.jpg' }],
  }));
  assert.equal(v.ok, true);
  assert.equal(v.data.products.length, 1);
  assert.equal(v.data.records.length, 1);
  assert.deepEqual(v.data.settings, { staleDays: 30 });
  assert.equal(v.images.length, 1);
  assert.equal(v.skipped, 0);
});

test('validateBackup: 壊れた行や参照先のない記録は飛ばす', () => {
  const v = validateBackup(backup({
    products: [product, { id: 'p2' }],
    stores: [store],
    records: [record, { ...record, id: 'r2', productId: 'nope' }, { ...record, id: 'r3', price: -1 }, { ...record, id: 'r4', date: '2026/10/27' }],
  }));
  assert.equal(v.ok, true);
  assert.equal(v.data.products.length, 1);
  assert.equal(v.data.records.length, 1);
  assert.equal(v.skipped, 4);
});

test('validateBackup: 違うファイルはエラー', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup([]).ok, false);
  assert.equal(validateBackup({ app: 'other', format: 1, data: { products: [], stores: [], records: [] } }).ok, false);
  const newer = validateBackup({ app: BACKUP_APP, format: 99, data: { products: [], stores: [], records: [] } });
  assert.equal(newer.ok, false);
  assert.match(newer.errors[0], /新しいバージョン/);
  assert.equal(validateBackup({ app: BACKUP_APP, format: 1, data: { products: [] } }).ok, false);
});

test('mergeById: 更新日時が新しいほうを残す', () => {
  const a = [{ id: '1', v: 'old', updatedAt: '2026-01-01T00:00:00Z' }, { id: '2', v: 'keep', updatedAt: '2026-05-01T00:00:00Z' }];
  const b = [{ id: '1', v: 'new', updatedAt: '2026-02-01T00:00:00Z' }, { id: '2', v: 'older', updatedAt: '2026-04-01T00:00:00Z' }, { id: '3', v: 'add' }];
  const m = mergeById(a, b);
  assert.deepEqual(m.map((x) => x.v).sort(), ['add', 'keep', 'new']);
});

test('mergeData / backupFileName', () => {
  const merged = mergeData({ products: [product], stores: [], records: [] }, { products: [], stores: [store], records: [record] });
  assert.equal(merged.products.length, 1);
  assert.equal(merged.stores.length, 1);
  assert.equal(merged.records.length, 1);
  assert.equal(backupFileName('2026-11-01'), 'price-hikaku-backup-2026-11-01.json');
});
