import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumber, totalBase, priceWithTax, unitPrice, qtyPerYen,
  unitTypeOf, compareUnitText, defaultUnitOf, unitsOf,
} from '../js/units.js';
import {
  fmtYen, fmtPrice, fmtQty, fmtAmount, unitPriceText, diffAmountText, fmtPercent,
  todayStr, daysBetween, fmtDate, relativeDay, isValidDateStr, fmtBytes,
} from '../js/format.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≒ ${b}`);

test('parseNumber: 全角・カンマ・円記号を読める', () => {
  assert.equal(parseNumber('298'), 298);
  assert.equal(parseNumber('２９８'), 298);
  assert.equal(parseNumber('1,160'), 1160);
  assert.equal(parseNumber('¥1,160円'), 1160);
  assert.equal(parseNumber('321.84'), 321.84);
  assert.equal(parseNumber('３２１．８４'), 321.84);
  assert.equal(parseNumber('.5'), 0.5);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('-3')));
  assert.ok(Number.isNaN(parseNumber('1.2.3')));
});

test('totalBase: 内容量 × 単位換算 × 入数', () => {
  assert.equal(totalBase({ amount: 500, unit: 'g' }), 500);
  assert.equal(totalBase({ amount: 2, unit: 'kg' }), 2000);
  assert.equal(totalBase({ amount: 500, unit: 'ml', packCount: 6 }), 3000);
  assert.equal(totalBase({ amount: 1.5, unit: 'L', packCount: 2 }), 3000);
  assert.equal(totalBase({ amount: 70, unit: 'g', packCount: 4 }), 280);
  assert.equal(totalBase({ amount: 10, unit: '個', packCount: '' }), 10);
  assert.ok(Number.isNaN(totalBase({ amount: 0, unit: 'g' })));
  assert.ok(Number.isNaN(totalBase({ amount: 5, unit: 'トン' })));
  assert.ok(Number.isNaN(totalBase({ amount: 5, unit: 'g', packCount: 0 })));
});

test('priceWithTax: 税抜なら税率をかける', () => {
  close(priceWithTax({ price: 298, taxIncluded: false, taxRate: 8 }), 321.84);
  close(priceWithTax({ price: 1000, taxIncluded: false, taxRate: 10 }), 1100);
  assert.equal(priceWithTax({ price: 321, taxIncluded: true, taxRate: 8 }), 321);
});

test('unitPrice / qtyPerYen: 計画書の例（税抜298円・500g・8%）', () => {
  const rec = { price: 298, taxIncluded: false, taxRate: 8, amount: 500, unit: 'g', packCount: 1 };
  const u = unitPrice(rec, 100);
  close(u, 64.368);
  close(qtyPerYen(u, 100), 155.3567, 1e-3);
  const product = { unitType: 'weight', compareAmount: 100, countLabel: null };
  assert.deepEqual(unitPriceText(u, product, 'yenPerQty'), { value: '¥64.4', suffix: '/100g', long: '100gあたり ¥64.4' });
  assert.deepEqual(unitPriceText(u, product, 'qtyPerYen'), { value: '155g', suffix: '/100円', long: '100円で 155g' });
});

test('unitPrice: 業務スーパー 2kg 1,160円 → 100gあたり ¥58.0', () => {
  const u = unitPrice({ price: 1160, taxIncluded: true, taxRate: 8, amount: 2, unit: 'kg', packCount: 1 }, 100);
  close(u, 58);
  assert.equal(fmtYen(u), '¥58.0');
});

test('unitPrice: 個数・長さ', () => {
  close(unitPrice({ price: 258, taxIncluded: true, amount: 10, unit: '個' }, 1), 25.8);
  // トイレットペーパー 25m × 12ロール 398円 → 1mあたり
  close(unitPrice({ price: 398, taxIncluded: true, amount: 25, unit: 'm', packCount: 12 }, 1), 398 / 300);
  assert.ok(Number.isNaN(unitPrice({ price: 0, taxIncluded: true, amount: 1, unit: 'g' }, 100)));
});

test('単位の種類と表示', () => {
  assert.equal(unitTypeOf('kg'), 'weight');
  assert.equal(unitTypeOf('L'), 'volume');
  assert.equal(unitTypeOf('ロール'), 'count');
  assert.equal(unitTypeOf('m'), 'length');
  assert.equal(unitTypeOf('cc'), null);
  assert.equal(compareUnitText('weight', 100), '100g');
  assert.equal(compareUnitText('weight', 1000), '1kg');
  assert.equal(compareUnitText('volume', 1000), '1L');
  assert.equal(compareUnitText('count', 1, 'ロール'), '1ロール');
  assert.equal(compareUnitText('length', 10), '10m');
  assert.equal(defaultUnitOf('count', '枚'), '枚');
  assert.equal(defaultUnitOf('volume'), 'ml');
  assert.deepEqual(unitsOf('weight'), ['g', 'kg']);
});

test('表示の整形', () => {
  assert.equal(fmtYen(1160), '¥1,160');
  assert.equal(fmtYen(64.368), '¥64.4');
  assert.equal(fmtYen(1.333), '¥1.33');
  assert.equal(fmtYen(0.4533), '¥0.453');
  assert.equal(fmtPrice(1160), '¥1,160');
  assert.equal(fmtPrice(321.84), '¥321.84');
  assert.equal(fmtQty(155.36, 'weight'), '155g');
  assert.equal(fmtQty(4.65, 'count', '個'), '4.7個');
  assert.equal(fmtAmount({ amount: 500, unit: 'ml', packCount: 6 }), '500ml×6');
  assert.equal(fmtAmount({ amount: 2, unit: 'kg', packCount: 1 }), '2kg');
  assert.equal(fmtPercent(0.1098), '11%');
  assert.equal(fmtPercent(0.088), '8.8%');
  assert.equal(fmtPercent(0.05), '5%');
  assert.equal(fmtBytes(512), '512B');
  assert.equal(fmtBytes(1536), '1.5KB');
  assert.equal(fmtBytes(5 * 1024 * 1024), '5.0MB');
});

test('差の表示（円/量 と 量/円）', () => {
  const product = { unitType: 'weight', compareAmount: 100, countLabel: null };
  assert.equal(diffAmountText(64.368, 58, product, 'yenPerQty'), '¥6.37');
  // 100円で買える量: 172.41g と 155.36g → 17.1g 多い
  assert.equal(diffAmountText(64.368, 58, product, 'qtyPerYen'), '17.1g');
});

test('日付', () => {
  assert.equal(todayStr(new Date(2026, 10, 1)), '2026-11-01');
  assert.equal(daysBetween('2026-08-18', '2026-11-01'), 75);
  assert.equal(daysBetween('2026-11-01', '2026-11-01'), 0);
  assert.equal(fmtDate('2026-09-12', '2026-11-01'), '9/12');
  assert.equal(fmtDate('2025-12-31', '2026-11-01'), '2025/12/31');
  assert.equal(relativeDay('2026-11-01', '2026-11-01'), '今日');
  assert.equal(relativeDay('2026-10-31', '2026-11-01'), '昨日');
  assert.equal(relativeDay('2026-10-27', '2026-11-01'), '5日前');
  assert.equal(relativeDay('2026-10-18', '2026-11-01'), '2週間前');
  assert.equal(relativeDay('2026-08-18', '2026-11-01'), '2ヶ月前');
  assert.equal(relativeDay('2025-10-01', '2026-11-01'), '1年前');
  assert.ok(isValidDateStr('2026-02-28'));
  assert.ok(!isValidDateStr('2026-02-30'));
  assert.ok(!isValidDateStr('2026/02/01'));
});
