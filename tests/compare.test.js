import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, judge, bestStoreCounts, byNewest, groupBy } from '../js/compare.js';

const chicken = { id: 'p1', name: '鶏むね肉', unitType: 'weight', compareAmount: 100, countLabel: null, taxRate: 8 };
const TODAY = '2026-11-01';

let seq = 0;
const rec = (o) => ({
  id: `r${++seq}`, productId: 'p1', taxIncluded: true, taxRate: 8, packCount: 1, isSale: false,
  createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z`, ...o,
});

// 計画書の例
const records = [
  rec({ storeId: 'gyomu', date: '2026-11-01', price: 1160, amount: 2, unit: 'kg' }), // 58.0
  rec({ storeId: 'aeon', date: '2026-10-28', price: 204, amount: 300, unit: 'g' }), // 68.0
  rec({ storeId: 'aeon', date: '2026-09-12', price: 249, amount: 500, unit: 'g', isSale: true }), // 49.8 特売
  rec({ storeId: 'maruetsu', date: '2026-08-18', price: 199, amount: 250, unit: 'g' }), // 79.6
  rec({ storeId: 'aeon', date: '2026-07-01', price: 300, amount: 300, unit: 'g' }), // 100 古い通常
];

test('summarize: 各お店の最新の通常価格で安い順', () => {
  const s = summarize(chicken, records, { today: TODAY, staleDays: 60 });
  assert.equal(s.count, 5);
  assert.deepEqual(s.stores.map((x) => x.storeId), ['gyomu', 'aeon', 'maruetsu']);
  assert.equal(s.best.storeId, 'gyomu');
  assert.ok(Math.abs(s.stores[1].rankPrice - 68) < 1e-9);
  assert.ok(Math.abs(s.allTimeMin.unitPrice - 49.8) < 1e-9);
  assert.equal(s.allTimeMin.record.isSale, true);
  // マルエツは75日前 → 古い
  assert.equal(s.stores[2].stale, true);
  assert.equal(s.stores[2].daysAgo, 75);
  assert.equal(s.stores[0].stale, false);
  assert.equal(s.latest.record.storeId, 'gyomu');
});

test('summarize: 特売しかないお店は特売価格で比べる。新しい特売は併記', () => {
  const rs = [
    rec({ storeId: 'a', date: '2026-10-01', price: 100, amount: 100, unit: 'g' }), // 100
    rec({ storeId: 'a', date: '2026-10-20', price: 70, amount: 100, unit: 'g', isSale: true }), // 70 特売（新しい）
    rec({ storeId: 'b', date: '2026-10-10', price: 80, amount: 100, unit: 'g', isSale: true }), // 80 特売のみ
  ];
  const s = summarize(chicken, rs, { today: TODAY });
  const a = s.stores.find((x) => x.storeId === 'a');
  const b = s.stores.find((x) => x.storeId === 'b');
  assert.equal(a.rankPrice, 100);
  assert.equal(a.recentSale.unitPrice, 70);
  assert.equal(b.saleOnly, true);
  assert.equal(b.rankPrice, 80);
  assert.equal(b.recentSale, null);
  assert.deepEqual(s.stores.map((x) => x.storeId), ['b', 'a']);
});

test('summarize: 単位の種類が違う記録・他の商品の記録は無視', () => {
  const rs = [
    rec({ storeId: 'a', date: '2026-10-01', price: 100, amount: 100, unit: 'ml' }),
    rec({ storeId: 'a', date: '2026-10-01', price: 100, amount: 100, unit: 'g', productId: 'other' }),
  ];
  const s = summarize(chicken, rs, { today: TODAY });
  assert.equal(s.count, 0);
  assert.equal(s.best, null);
});

test('judge: 計画書の例 → イオンで 64.4 は割高（業務スーパーのほうが ¥6.4 安い）', () => {
  const s = summarize(chicken, records, { today: TODAY });
  const j = judge({ unitPrice: 64.368, storeId: 'aeon', summary: s });
  assert.equal(j.level, 'expensive');
  assert.equal(j.bestOther.storeId, 'gyomu');
  assert.ok(Math.abs(j.diff - 6.368) < 1e-9);
  assert.ok(Math.abs(j.ratio - 0.10979) < 1e-4);
});

test('judge: 各レベル', () => {
  const s = summarize(chicken, records, { today: TODAY });
  assert.equal(judge({ unitPrice: 45, storeId: 'aeon', summary: s }).level, 'record');
  assert.equal(judge({ unitPrice: 55, storeId: 'aeon', summary: s }).level, 'best');
  assert.equal(judge({ unitPrice: 58, storeId: 'aeon', summary: s }).level, 'best');
  assert.equal(judge({ unitPrice: 60, storeId: 'aeon', summary: s }).level, 'near'); // +3.4%
  assert.equal(judge({ unitPrice: 61, storeId: 'aeon', summary: s }).level, 'expensive'); // +5.2%
  // 業務スーパーで入力 → 比べる相手はイオン（68）
  const j = judge({ unitPrice: 60, storeId: 'gyomu', summary: s });
  assert.equal(j.level, 'best');
  assert.equal(j.bestOther.storeId, 'aeon');
  // 新しいお店（storeId なし）
  assert.equal(judge({ unitPrice: 70, storeId: null, summary: s }).level, 'expensive');
  assert.equal(judge({ unitPrice: NaN, summary: s }).level, 'none');
  assert.equal(judge({ unitPrice: 50, summary: summarize(chicken, [], {}) }).level, 'first');
});

test('judge: このお店の記録しかないときは前回と比べる', () => {
  const rs = [rec({ storeId: 'a', date: '2026-10-01', price: 100, amount: 100, unit: 'g' })];
  const s = summarize(chicken, rs, { today: TODAY });
  const j = judge({ unitPrice: 110, storeId: 'a', summary: s });
  assert.equal(j.level, 'onlyStore');
  assert.ok(Math.abs(j.diff - 10) < 1e-9);
  assert.equal(judge({ unitPrice: 90, storeId: 'a', summary: s }).level, 'record');
});

test('bestStoreCounts / byNewest / groupBy', () => {
  const s1 = summarize(chicken, records, { today: TODAY });
  const milk = { id: 'p2', unitType: 'volume', compareAmount: 100 };
  const s2 = summarize(milk, [rec({ productId: 'p2', storeId: 'aeon', date: '2026-10-27', price: 198, amount: 1, unit: 'L' })], { today: TODAY });
  const counts = bestStoreCounts([s1, s2]);
  assert.equal(counts.get('gyomu'), 1);
  assert.equal(counts.get('aeon'), 1);
  // 2店以上で比べた商品だけ数える（牛乳はイオンだけなので数えない）
  const compared = bestStoreCounts([s1, s2], { minStores: 2 });
  assert.equal(compared.get('gyomu'), 1);
  assert.equal(compared.get('aeon'), undefined);
  const sorted = [...records].sort(byNewest).map((r) => r.date);
  assert.deepEqual(sorted, ['2026-11-01', '2026-10-28', '2026-09-12', '2026-08-18', '2026-07-01']);
  assert.equal(groupBy(records, (r) => r.storeId).get('aeon').length, 3);
});
