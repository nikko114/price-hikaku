// 位置情報まわりの画面テスト（Playwright + Chromium）
// 現在地は Playwright の geolocation で固定し、Overpass API への問い合わせは
// テスト用の応答（実データと同じ形のタグ。店名は架空）に差し替える。
// 使い方:
//   python3 -m http.server 8000 &
//   node tests/e2e-geo.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8000/';
const SHOTS = process.env.SHOTS || join(tmpdir(), 'price-hikaku-shots-geo');
mkdirSync(SHOTS, { recursive: true });

const HERE = { latitude: 35.0, longitude: 135.0, accuracy: 20 };
const OVERPASS_FIXTURE = {
  version: 0.6,
  elements: [
    { type: 'way', id: 1001, center: { lat: 35.0004, lon: 135.0 }, tags: { shop: 'supermarket', name: 'イオン', 'name:ja': 'イオン', branch: 'テスト店', brand: 'AEON', 'brand:ja': 'イオン' } },
    { type: 'node', id: 1002, lat: 35.0001, lon: 135.0006, tags: { shop: 'convenience', name: 'セブン-イレブン', branch: 'テスト一丁目店', brand: '7-ELEVEN', 'brand:ja': 'セブン-イレブン' } },
    { type: 'node', id: 1003, lat: 35.003, lon: 135.0, tags: { shop: 'supermarket', name: '業務スーパー', branch: 'テスト店', 'brand:ja': '業務スーパー' } },
    { type: 'node', id: 1004, lat: 35.0002, lon: 135.0, tags: { shop: 'convenience' } },
  ],
};

const browser = await chromium.launch();
const errors = [];
let overpassCalls = 0; // 結果を返した問い合わせの数
const hostCalls = {}; // サーバーごとの問い合わせ数
let busyHosts = new Set(['overpass.private.coffee']); // 最初の1回は「混んでいる（429）」と返す

async function newPage({ grant }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ja-JP',
    geolocation: HERE,
    permissions: grant ? ['geolocation'] : [],
  });
  const OVERPASS_HOSTS = /^(overpass\.private\.coffee|overpass-api\.de|maps\.mail\.ru)$/;
  await context.route((url) => OVERPASS_HOSTS.test(url.hostname), async (route) => {
    const host = new URL(route.request().url()).hostname;
    hostCalls[host] = (hostCalls[host] || 0) + 1;
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (busyHosts.has(host)) {
      busyHosts.delete(host);
      await route.fulfill({ status: 429, contentType: 'text/plain', headers: cors, body: 'Too Many Requests' });
      return;
    }
    overpassCalls += 1;
    assert.match(decodeURIComponent(route.request().postData() || ''), /around:500,35\.000000,135\.000000/);
    await route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(OVERPASS_FIXTURE) });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return { context, page };
}

const step = (msg) => console.log(`• ${msg}`);
let shotNo = 0;

// ---------------- 位置情報を許可している場合 ----------------
const { context, page } = await newPage({ grant: true });
const text = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ');
const shot = async (name) => {
  shotNo += 1;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`), fullPage: true });
};
const storesInStorage = () => page.evaluate(() => JSON.parse(localStorage.getItem('ph.v1.stores') || '[]'));

await page.goto(BASE);
await page.waitForSelector('.view');

step('記録: 周辺のお店（地図データ）から選んで、新しいお店として登録');
await page.click('#tabbar [data-tab="record"]');
await page.fill('[data-ref="productQuery"]', '牛乳');
await page.click('[data-act="new-product"]');
await page.click('[data-new-cat="卵・乳製品"]');
await page.waitForSelector('.osm-row');
assert.match(await text('.loc-line'), /現在地の近く（誤差 ±20m）/);
const osmRows = await page.locator('.osm-row').allInnerTexts();
assert.equal(osmRows.length, 3);
assert.match(osmRows[0], /イオン テスト店[\s\S]*スーパー[\s\S]*40m/);
assert.match(osmRows[1], /セブン-イレブン テスト一丁目店[\s\S]*60m/);
assert.match(osmRows[2], /業務スーパー テスト店[\s\S]*330m/);
assert.match(await text('[data-ref="store"]'), /© OpenStreetMap contributors/);
await shot('record-osm-list');
await page.click('.osm-row >> text=イオン テスト店');
assert.match(await text('[data-ref="store"]'), /イオン テスト店 新しいお店として登録します ・ ここから40m/);
await page.fill('[data-ref="price"]', '198');
await page.fill('[data-ref="amount"]', '1');
await page.selectOption('[data-ref="unit"]', 'L');
await page.click('form [type="submit"]');
await page.waitForSelector('.view .list a.row');
assert.equal(overpassCalls, 1);
// 1つ目のサーバーが混んでいた（429）ので、2つ目のサーバーが答えた
assert.deepEqual(hostCalls, { 'overpass.private.coffee': 1, 'overpass-api.de': 1 });
let stores = await storesInStorage();
const aeon = stores.find((s) => s.name === 'イオン テスト店');
assert.ok(aeon, 'イオン テスト店が登録されている');
assert.equal(aeon.lat, 35.0004);
assert.equal(aeon.lng, 135);
assert.equal(aeon.osmId, 'way/1001');
assert.equal(aeon.chain, 'イオン');

step('ホーム: 「近くにいます」バナー');
await page.waitForSelector('.here-banner');
assert.match(await text('.here-banner'), /イオン テスト店 の近くにいます/);
await shot('home-here-banner');

step('記録: 近くの登録済みのお店が自動で選ばれる');
await page.click('#tabbar [data-tab="record"]');
await page.waitForSelector('.row-meta.is-accent');
assert.match(await text('[data-ref="store"]'), /イオン テスト店.*ここから40m.*近くのお店を自動で選びました/);
await shot('record-auto-selected');

step('記録: お店を変える → 近くの登録済み＋まだ登録していないお店（地図データは使い回し）');
await page.click('[data-act="change-store"]');
await page.waitForSelector('.osm-row');
assert.match(await text('[data-pick-store]'), /イオン テスト店\s*40m/);
const rows2 = await page.locator('.osm-row').allInnerTexts();
assert.equal(rows2.length, 2, '登録済みのイオンは候補から消える');
assert.equal(overpassCalls, 1, '同じ場所ではキャッシュを使う');
assert.match(await text('.osm-credit'), /今日探した結果/);

step('アプリを開き直しても、前に探した結果を使う（問い合わせない）');
await page.goto(BASE); // ホームから開き直す
await page.waitForSelector('.view');
await page.click('#tabbar [data-tab="record"]');
await page.click('[data-act="change-store"]');
await page.waitForSelector('.osm-row');
assert.equal(overpassCalls, 1);
step('「探し直す」で問い合わせ直す（さっき答えたサーバーから）');
await page.click('[data-act="search-osm-force"]');
await page.waitForFunction(() => document.querySelectorAll('.osm-row').length === 2 && !/探した結果/.test(document.querySelector('.osm-credit').innerText));
assert.equal(overpassCalls, 2);
assert.equal(hostCalls['overpass-api.de'], 2);
assert.equal(hostCalls['overpass.private.coffee'], 1);
await page.click('.osm-row >> text=業務スーパー テスト店');
await page.fill('[data-ref="productQuery"]', '牛乳');
await page.click('[data-pick-product]');
await page.fill('[data-ref="price"]', '178');
await page.fill('[data-ref="amount"]', '1');
assert.match(await text('[data-ref="verdict"]'), /過去最安/);
await page.click('[data-act="save"]');
await page.waitForSelector('.view .list a.row');

step('お店一覧: 近い順と距離');
await page.click('#tabbar [data-tab="stores"]');
await page.waitForSelector('.view .list a.row .distance');
await page.click('[data-seg="sort"] [data-value="near"]');
await page.waitForFunction(() => /現在地から近い順/.test(document.querySelector('.view').innerText));
const names = await page.locator('.view .list .row-title').allInnerTexts();
assert.deepEqual(names, ['イオン テスト店', '業務スーパー テスト店']);
const dists = await page.locator('.view .list .distance').allInnerTexts();
assert.deepEqual(dists, ['40m', '330m']);
await shot('stores-near');

step('お店ページ: 地図リンクと距離');
await page.click('.view .list a.row >> text=業務スーパー テスト店');
await page.waitForSelector('[data-ref="distance"]:not([hidden])');
assert.match(await text('[data-ref="distance"]'), /ここから 330m/);
const mapHref = await page.getAttribute('a[href^="https://maps.apple.com/"]', 'href');
assert.match(mapHref, /^https:\/\/maps\.apple\.com\/\?ll=35\.003,135&q=/);
await shot('store-detail');

step('お店を追加: 近くのお店から選ぶ');
await page.click('#tabbar [data-tab="stores"]');
await page.click('a[href="#/stores/new"]');
await page.waitForSelector('.osm-row');
const rows3 = await page.locator('.osm-row').allInnerTexts();
assert.equal(rows3.length, 1);
await shot('store-new-osm');
await page.click('.osm-row');
assert.equal(await page.inputValue('[data-ref="name"]'), 'セブン-イレブン テスト一丁目店');
assert.equal(await page.inputValue('[data-ref="chain"]'), 'セブン-イレブン');
assert.match(await text('[data-ref="locBox"]'), /登録済み/);
await page.click('[data-act="save"]');
await page.waitForSelector('.product-tags');
assert.match(await text('.product-tags'), /位置あり/);

step('お店を追加: 自分で入力して「いまの場所にする」');
await page.click('#tabbar [data-tab="stores"]');
await page.click('a[href="#/stores/new"]');
await page.fill('[data-ref="name"]', 'テスト八百屋');
await page.click('[data-act="set-here"]');
await page.waitForFunction(() => /登録済み（誤差 ±20m）/.test(document.querySelector('[data-ref="locBox"]').innerText));
await page.click('[data-act="save"]');
await page.waitForSelector('.product-tags');
stores = await storesInStorage();
const yaoya = stores.find((s) => s.name === 'テスト八百屋');
assert.equal(yaoya.lat, 35);
assert.equal(yaoya.lng, 135);
assert.equal(yaoya.osmId, null);

step('記録: 手入力の新しいお店に、いまの場所を付ける');
await page.click('#tabbar [data-tab="record"]');
await page.fill('[data-ref="productQuery"]', '牛乳');
await page.click('[data-pick-product]');
await page.click('[data-act="change-store"]');
await page.click('[data-act="new-store"]');
await page.fill('[data-ref="newStoreName"]', 'テスト商店');
assert.equal(await page.isChecked('[data-ref="newStoreUseLoc"]'), true);
await page.fill('[data-ref="price"]', '210');
await page.fill('[data-ref="amount"]', '1');
await page.click('[data-act="save"]');
// 保存すると前の画面（ここではお店ページ）に戻る
await page.waitForFunction(() => !location.hash.startsWith('#/record'));
stores = await storesInStorage();
assert.equal(stores.find((s) => s.name === 'テスト商店').lat, 35);

step('設定: 地図データ検索をオフにすると問い合わせない');
const callsBefore = overpassCalls;
await page.click('#tabbar [data-tab="settings"]');
await page.click('label[for="st-osm"]');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('ph.v1.settings')).onlineStoreSearch === false);
await shot('settings-location');
await page.click('#tabbar [data-tab="record"]');
await page.click('[data-act="change-store"]');
await page.waitForSelector('.loc-line');
await page.waitForTimeout(300);
assert.equal(await page.locator('.osm-row, [data-act="search-osm"]').count(), 0);
assert.equal(overpassCalls, callsBefore);
await page.click('[data-act="cancel"]');

step('設定: 位置情報をオフにすると現在地の表示も出ない');
await page.click('#tabbar [data-tab="settings"]');
await page.click('label[for="st-loc"]');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('ph.v1.settings')).autoSuggestStore === false);
await page.click('#tabbar [data-tab="record"]');
await page.click('[data-act="change-store"]');
await page.waitForTimeout(300);
assert.equal(await page.locator('.loc-line, [data-act="locate"]').count(), 0);
await context.close();

// ---------------- 位置情報を許可していない場合 ----------------
step('許可なし: 勝手に聞かず、ボタンを押すとわかりやすいエラー');
const b = await newPage({ grant: false });
await b.page.goto(BASE);
await b.page.waitForSelector('.view');
await b.page.click('#tabbar [data-tab="record"]');
await b.page.waitForSelector('[data-act="locate"]');
await b.page.click('[data-act="locate"]');
await b.page.waitForSelector('.loc-line.is-error');
assert.match(await b.page.locator('.loc-line.is-error').innerText(), /位置情報が許可されていません/);
await b.context.close();

await browser.close();
// 許可なしの位置情報エラーと、わざと返した 429 をブラウザが出すログは想定どおり
const unexpected = errors.filter((e) => !/User denied Geolocation/i.test(e) && !/status of 429 \(Too Many Requests\)/.test(e));
if (unexpected.length) {
  console.error('エラーが出ました:\n' + unexpected.join('\n'));
  process.exit(1);
}
console.log(`\nOK（Overpass への問い合わせ ${overpassCalls}回、スクリーンショット: ${SHOTS}）`);
