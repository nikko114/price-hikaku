import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  distanceM, fmtDistance, buildOverpassQuery, storeNameFromTags, chainFromTags, parseOverpass,
  excludeRegistered, nearbyStores, autoPick, mapsUrl, hasLocation,
  findCachedCell, itemsFromCell, addCell, overpassFailed, OSM_CACHE_TTL, OSM_CACHE_STALE_MAX, OVERPASS_ENDPOINTS,
} from '../js/geo.js';

const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };
const fixture = JSON.parse(readFileSync(new URL('./fixtures/overpass-tokyo-station.json', import.meta.url), 'utf8'));

test('distanceM: 東京駅 → ローソン（約393m）', () => {
  const d = distanceM(TOKYO_STATION, { lat: 35.6847212, lng: 139.7674365 });
  assert.ok(Math.abs(d - 392.7) < 2, `${d}`);
  assert.equal(distanceM(TOKYO_STATION, TOKYO_STATION), 0);
});

test('fmtDistance', () => {
  assert.equal(fmtDistance(83), '80m');
  assert.equal(fmtDistance(4), '10m');
  assert.equal(fmtDistance(994), '990m');
  assert.equal(fmtDistance(995), '1.0km');
  assert.equal(fmtDistance(1234), '1.2km');
  assert.equal(fmtDistance(12345), '12km');
  assert.equal(fmtDistance(NaN), '');
});

test('buildOverpassQuery', () => {
  const q = buildOverpassQuery(TOKYO_STATION, 500);
  assert.match(q, /^\[out:json\]\[timeout:10\]\[maxsize:\d+\];/);
  assert.match(q, /around:500,35\.681200,139\.767100/);
  assert.match(q, /"shop"~"\^\(supermarket\|convenience\|chemist\|/);
  assert.match(q, /out center 60;$/);
});

test('storeNameFromTags: name ＋ branch、なければ町名', () => {
  assert.equal(storeNameFromTags({ name: 'セブン-イレブン', 'name:ja': 'セブン-イレブン', branch: '丸の内店' }), 'セブン-イレブン 丸の内店');
  assert.equal(storeNameFromTags({ name: 'ファミリーマート' }), 'ファミリーマート');
  assert.equal(storeNameFromTags({ name: 'ファミリーマート', 'addr:neighbourhood': '丸の内二丁目' }), 'ファミリーマート 丸の内二丁目');
  assert.equal(storeNameFromTags({ name: 'トモズ', branch: '丸の内店', 'addr:neighbourhood': '丸の内二丁目' }), 'トモズ 丸の内店');
  assert.equal(storeNameFromTags({ name: 'イオン〇〇店', branch: '〇〇店' }), 'イオン〇〇店');
  assert.equal(storeNameFromTags({ brand: 'LAWSON', 'brand:ja': 'ローソン' }), 'ローソン');
  assert.equal(storeNameFromTags({ shop: 'convenience' }), '');
});

test('chainFromTags: brand:ja → brand → (branch があれば) name', () => {
  assert.equal(chainFromTags({ brand: '7-ELEVEN', 'brand:ja': 'セブン-イレブン' }), 'セブン-イレブン');
  assert.equal(chainFromTags({ brand: 'AEON' }), 'AEON');
  assert.equal(chainFromTags({ name: 'イオン', branch: '〇〇店' }), 'イオン');
  assert.equal(chainFromTags({ name: '駅弁屋 祭' }), '');
});

test('parseOverpass: 実データ（東京駅周辺）を近い順の候補にする', () => {
  const items = parseOverpass(fixture, TOKYO_STATION);
  assert.equal(items.length, 7);
  assert.equal(items[0].name, '駅弁屋 祭');
  assert.equal(items[0].osmId, 'node/4697659390');
  assert.equal(items[0].chain, '');
  for (let i = 1; i < items.length; i += 1) assert.ok(items[i - 1].distance <= items[i].distance);
  const names = items.map((x) => x.name);
  assert.ok(names.includes('セブン-イレブン 新丸ビル'));
  assert.ok(names.includes('トモズ 丸の内店'));
  assert.ok(names.includes('ファミリーマート 八重洲一丁目店'));
  assert.ok(names.includes('ファミリーマート'));
  const seven = items.find((x) => x.name === 'セブン-イレブン 新丸ビル');
  assert.equal(seven.chain, 'セブン-イレブン');
  assert.equal(seven.shop, 'convenience');
});

test('parseOverpass: way は center を使う。同じ名前で40m以内はまとめる。名前なしは飛ばす', () => {
  const json = {
    elements: [
      { type: 'way', id: 1, center: { lat: 35.0004, lon: 135.0 }, tags: { shop: 'supermarket', name: 'イオン', branch: 'テスト店', 'brand:ja': 'イオン' } },
      { type: 'node', id: 2, lat: 35.0006, lon: 135.0, tags: { shop: 'supermarket', name: 'イオン', branch: 'テスト店' } },
      { type: 'node', id: 3, lat: 35.0001, lon: 135.0, tags: { shop: 'convenience' } },
      { type: 'relation', id: 4, tags: { shop: 'mall', name: '位置なし' } },
    ],
  };
  const items = parseOverpass(json, { lat: 35, lng: 135 });
  assert.equal(items.length, 1);
  assert.equal(items[0].osmId, 'way/1');
  assert.equal(items[0].name, 'イオン テスト店');
  assert.ok(Math.abs(items[0].distance - 44.5) < 1);
  assert.deepEqual(parseOverpass(null, null), []);
});

test('excludeRegistered: OSM の ID・同じ名前（近い or 位置なし）は外す', () => {
  const items = parseOverpass(fixture, TOKYO_STATION);
  const left = excludeRegistered(items, [
    { name: 'セブン-イレブン 新丸ビル', lat: 35.68239, lng: 139.76398 },
    { name: 'トモズ丸の内店' }, // 空白なし・位置なし
    { name: '近所のローソン', osmId: 'node/1952141255' },
    { name: 'ファミリーマート', lat: 35.0, lng: 135.0 }, // 同じ名前でも遠くの別のお店
  ]).map((x) => x.name);
  assert.ok(!left.includes('セブン-イレブン 新丸ビル'));
  assert.ok(!left.includes('トモズ 丸の内店'));
  assert.ok(!left.includes('ローソン'));
  assert.ok(left.includes('ファミリーマート'));
  assert.ok(left.includes('駅弁屋 祭'));
});

test('nearbyStores / autoPick', () => {
  const pos = { lat: 35.0, lng: 135.0, accuracy: 20 };
  const a = { id: 'a', name: 'A', lat: 35.0004, lng: 135.0 }; // 約44m
  const b = { id: 'b', name: 'B', lat: 35.003, lng: 135.0 }; // 約333m
  const c = { id: 'c', name: '位置なし' };
  const near = nearbyStores([a, b, c], pos, 300);
  assert.deepEqual(near.map((x) => x.store.id), ['a']);
  assert.equal(autoPick(near, pos), a);
  assert.equal(autoPick(near, { ...pos, accuracy: 150 }), null); // 誤差が大きい
  const d60 = { id: 'd', name: 'D', lat: 35.00054, lng: 135.0 }; // 約60m → Aと紛らわしい
  assert.equal(autoPick(nearbyStores([a, d60], pos, 300), pos), null);
  const d100 = { id: 'd', name: 'D', lat: 35.0009, lng: 135.0 }; // 約100m → Aを選ぶ
  assert.equal(autoPick(nearbyStores([a, d100], pos, 300), pos), a);
  const far = nearbyStores([{ id: 'f', name: 'F', lat: 35.0018, lng: 135.0 }], pos, 300); // 約200m
  assert.equal(autoPick(far, pos), null);
  assert.equal(autoPick([], pos), null);
});

test('mapsUrl / hasLocation', () => {
  assert.equal(mapsUrl({ name: 'イオン テスト店', lat: 35.0004, lng: 135 }), 'https://maps.apple.com/?ll=35.0004,135&q=%E3%82%A4%E3%82%AA%E3%83%B3%20%E3%83%86%E3%82%B9%E3%83%88%E5%BA%97');
  assert.match(mapsUrl({ name: 'A店' }), /^https:\/\/maps\.apple\.com\/\?q=A/);
  assert.equal(hasLocation({ lat: 0, lng: 0 }), true);
  assert.equal(hasLocation({ lat: null, lng: null }), false);
  assert.equal(hasLocation(null), false);
});

test('サーバーは3つ（混んでいたら次へ）', () => {
  assert.equal(OVERPASS_ENDPOINTS.length, 3);
  for (const url of OVERPASS_ENDPOINTS) assert.match(url, /^https:\/\/.+\/interpreter$/);
});

test('overpassFailed: HTTP 200 でも remark のエラーは失敗あつかい', () => {
  assert.equal(overpassFailed({ elements: [] }), false); // 本当にお店がないだけ
  assert.equal(overpassFailed({ elements: [], remark: 'runtime error: Query timed out in "query" at line 1 after 10 seconds.' }), true);
  assert.equal(overpassFailed({ elements: [], remark: 'runtime error: Query run out of memory using about 64 MB of RAM.' }), true);
  assert.equal(overpassFailed({ elements: [{ type: 'node', id: 1 }], remark: 'runtime error: timeout' }), false); // 一部でも結果があれば使う
  assert.equal(overpassFailed(null), true);
  assert.equal(overpassFailed({ remark: 'x' }), true);
});

test('検索結果のキャッシュ: 150m 以内・期限内なら使い回す', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const here = { lat: 35.0, lng: 135.0 };
  const items = parseOverpass({ elements: [
    { type: 'node', id: 1, lat: 35.0004, lon: 135.0, tags: { name: 'イオン', branch: 'テスト店', shop: 'supermarket' } },
    { type: 'node', id: 2, lat: 35.003, lon: 135.0, tags: { name: '業務スーパー', branch: 'テスト店', shop: 'supermarket' } },
  ] }, here);
  let cache = addCell({}, here, 500, items, now);
  const cell = Object.values(cache)[0];
  assert.equal(cell.items[0].distance, undefined, '距離は保存しない');
  // 100m 北に動いても使える。距離は今の場所から計算し直す
  const moved = { lat: 35.0009, lng: 135.0 };
  const hit = findCachedCell(cache, moved, 500, now + 1000, OSM_CACHE_TTL);
  assert.ok(hit);
  const re = itemsFromCell(hit, moved, 500);
  assert.equal(re[0].name, 'イオン テスト店');
  assert.ok(Math.abs(re[0].distance - 55.6) < 1);
  // 200m 動いたら使わない／半径が違えば使わない／期限切れは使わない（古い結果の許容は別）
  assert.equal(findCachedCell(cache, { lat: 35.0018, lng: 135.0 }, 500, now, OSM_CACHE_TTL), null);
  assert.equal(findCachedCell(cache, here, 1000, now, OSM_CACHE_TTL), null);
  const later = now + OSM_CACHE_TTL + 1;
  assert.equal(findCachedCell(cache, here, 500, later, OSM_CACHE_TTL), null);
  assert.ok(findCachedCell(cache, here, 500, later, OSM_CACHE_STALE_MAX));
  // 古すぎるものは消え、件数も上限まで
  for (let i = 0; i < 50; i += 1) cache = addCell(cache, { lat: 36 + i * 0.01, lng: 135 }, 500, [], now + i);
  assert.equal(Object.keys(cache).length, 40);
  const pruned = addCell(cache, here, 500, [], now + OSM_CACHE_STALE_MAX + 1000);
  assert.equal(Object.keys(pruned).length, 1);
});
