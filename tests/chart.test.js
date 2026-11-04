import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, tickDecimals, dateToMs, fmtDateMs, dateTicks, nearestIndex, assignSlots } from '../js/chart.js';

test('niceTicks: きりのいい目盛り（count 個くらい）', () => {
  assert.deepEqual(niceTicks(52, 79, 4).ticks, [50, 60, 70, 80]);
  assert.deepEqual(niceTicks(58, 68, 4).ticks, [55, 60, 65, 70]);
  assert.deepEqual(niceTicks(0.42, 0.61, 4).ticks, [0.4, 0.45, 0.5, 0.55, 0.6, 0.65]);
  const one = niceTicks(64.4, 64.4, 4); // 値が1つだけでも幅を持たせる
  assert.ok(one.lo < 64.4 && one.hi > 64.4);
  assert.deepEqual(niceTicks(NaN, 1).ticks, [0, 1]);
});

test('tickDecimals', () => {
  assert.equal(tickDecimals(10), 0);
  assert.equal(tickDecimals(1), 0);
  assert.equal(tickDecimals(0.5), 1);
  assert.equal(tickDecimals(0.05), 2);
});

test('日付 ⇄ ミリ秒', () => {
  const t = dateToMs('2026-11-04');
  assert.equal(t, Date.UTC(2026, 10, 4));
  assert.equal(fmtDateMs(t), '11/4');
  assert.equal(fmtDateMs(t, { withYear: true }), '2026/11/4');
});

test('dateTicks: 期間に合わせた刻み', () => {
  const lab = (a, b, n) => dateTicks(dateToMs(a), dateToMs(b), n).map((x) => x.label);
  assert.deepEqual(lab('2026-11-01', '2026-11-08', 5), ['11/1', '11/3', '11/5', '11/7']);
  assert.deepEqual(lab('2026-08-01', '2026-11-04', 5), ['8月', '9月', '10月', '11月']);
  assert.deepEqual(lab('2025-11-15', '2026-11-04', 5), ['2026年1月', '4月', '7月', '10月']);
  assert.deepEqual(lab('2022-01-01', '2026-11-04', 5), ['2022年', '2023年', '2024年', '2025年', '2026年']);
  for (const tk of dateTicks(dateToMs('2026-01-10'), dateToMs('2026-06-20'), 4)) {
    assert.ok(tk.t >= dateToMs('2026-01-10') && tk.t <= dateToMs('2026-06-20'));
  }
});

test('nearestIndex', () => {
  assert.equal(nearestIndex([10, 20, 30], 24), 1);
  assert.equal(nearestIndex([10, 20, 30], 26), 2);
  assert.equal(nearestIndex([10, 20, 30], -5), 0);
  assert.equal(nearestIndex([10, 20, 30], 99), 2);
  assert.equal(nearestIndex([10], 3), 0);
  assert.equal(nearestIndex([], 3), -1);
});

test('assignSlots: 登場順に 1〜8、9番目からは「その他」(0)', () => {
  const map = assignSlots(['a', 'b', 'a', 'c']);
  assert.deepEqual([...map.entries()], [['a', 1], ['b', 2], ['c', 3]]);
  const many = assignSlots(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']);
  assert.equal(many.get('s8'), 8);
  assert.equal(many.get('s9'), 0);
  assert.equal(many.get('s10'), 0);
});
