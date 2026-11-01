// 画面の通しテスト（Playwright + Chromium、iPhone くらいの画面サイズ）
// 使い方:
//   python3 -m http.server 8000 &
//   node tests/e2e.mjs                      # BASE=http://127.0.0.1:8000/ SHOTS=スクショの保存先
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8000/';
const SHOTS = process.env.SHOTS || join(tmpdir(), 'price-hikaku-shots');
const SCHEME = process.env.SCHEME || 'light';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  colorScheme: SCHEME,
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

let shotNo = 0;
const shot = async (name) => {
  shotNo += 1;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`), fullPage: true });
};
const step = (msg) => console.log(`• ${msg}`);
const text = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ');

await page.goto(BASE);
await page.waitForSelector('.view');
step('ホーム（空）');
assert.match(await text('.view'), /まだ商品がありません/);
await shot('home-empty');

// ---- 1件目: 新しい商品・新しいお店 ----
step('1件目を記録（新しい商品＋新しいお店）');
await page.click('#tabbar [data-tab="record"]');
await page.fill('[data-ref="productQuery"]', '鶏むね肉');
await page.click('[data-act="new-product"]');
await page.click('[data-new-cat="肉"]');
assert.equal(await page.getAttribute('[data-seg="taxMode"] [data-value="incl"]', 'aria-pressed'), 'true');
assert.equal(await page.getAttribute('[data-new-cat="肉"]', 'aria-pressed'), 'true');
await page.click('[data-act="new-store"]');
await page.fill('[data-ref="newStoreName"]', '業務スーパー 〇〇店');
await page.fill('[data-ref="price"]', '1160');
await page.fill('[data-ref="amount"]', '2');
await page.selectOption('[data-ref="unit"]', 'kg');
assert.match(await text('[data-ref="verdict"]'), /100gあたり ¥58\.0/);
assert.match(await text('[data-ref="verdict"]'), /はじめての記録/);
await shot('record-first');
await page.click('form [type="submit"]');
await page.waitForSelector('.view .list a.row');
assert.match(await text('.view .list'), /鶏むね肉/);
assert.match(await text('.view .list'), /業務スーパー 〇〇店/);

// ---- 2件目: 既存の商品・新しいお店 ----
step('2件目を記録（既存の商品＋新しいお店）');
await page.click('#tabbar [data-tab="record"]');
await page.fill('[data-ref="productQuery"]', 'とりむね'); // ひらがなでは「鶏」に当たらないことの確認
assert.match(await text('[data-ref="suggest"]'), /新しい商品として追加/);
await page.fill('[data-ref="productQuery"]', '鶏');
await page.click('[data-pick-product]');
// 2時間以内に記録したお店が最初から選ばれている
assert.match(await text('[data-ref="store"]'), /業務スーパー/);
// 前回の内容量が入っている
assert.equal(await page.inputValue('[data-ref="amount"]'), '2');
await page.click('[data-act="change-store"]');
await page.click('[data-act="new-store"]');
await page.fill('[data-ref="newStoreName"]', 'イオン 〇〇店');
await page.fill('[data-ref="price"]', '204');
await page.fill('[data-ref="amount"]', '300');
await page.selectOption('[data-ref="unit"]', 'g');
assert.match(await text('[data-ref="verdict"]'), /割高/);
await page.click('[data-act="save"]');
await page.waitForSelector('.view .list a.row');

// ---- 商品ページ → 3件目（税抜） ----
step('商品ページから3件目（税抜）');
await page.click('.view .list a.row');
await page.waitForSelector('.rank-row');
await page.click('a[href^="#/record?product="]');
await page.click('[data-act="change-store"]');
await page.click('[data-pick-store] >> text=イオン 〇〇店');
await page.click('[data-seg="taxMode"] [data-value="excl"]');
await page.fill('[data-ref="price"]', '298');
await page.fill('[data-ref="amount"]', '500');
const v = await text('[data-ref="verdict"]');
assert.match(v, /100gあたり ¥64\.4/);
assert.match(v, /割高/);
assert.match(v, /業務スーパー 〇〇店のほうが 100gあたり ¥6\.37 安い/);
assert.match(await text('[data-ref="taxHint"]'), /税込 ¥321\.84/);
await shot('record-verdict');
await page.click('form [type="submit"]');
await page.waitForSelector('.rank-row');

step('お店ランキング');
// 切り替えボタンは最初から選ばれた状態で表示される
assert.equal(await page.getAttribute('[data-seg="mode"] [data-value="yenPerQty"]', 'aria-pressed'), 'true');
assert.equal(await page.getAttribute('[data-seg="mode"] [data-value="qtyPerYen"]', 'aria-pressed'), 'false');
const ranks = await page.locator('.rank-row .row-title').allInnerTexts();
assert.deepEqual(ranks, ['業務スーパー 〇〇店', 'イオン 〇〇店']);
assert.match(await text('.rank-row >> nth=1'), /¥64\.4/);
assert.equal(await page.locator('.record-row').count(), 3);
await shot('product-detail');
await page.click('[data-seg="mode"] [data-value="qtyPerYen"]');
await page.waitForFunction(() => /\/100円/.test(document.querySelector('.rank-row')?.innerText || ''));
await shot('product-detail-qty');
await page.click('[data-seg="mode"] [data-value="yenPerQty"]');

// ---- 削除と元に戻す ----
step('記録を削除して元に戻す');
await page.click('.record-row >> nth=0');
await page.click('[data-act="delete"]');
await page.click('dialog .dialog-btn.is-danger');
await page.waitForFunction(() => document.querySelectorAll('.record-row').length === 2);
await page.click('.toast button');
await page.waitForFunction(() => document.querySelectorAll('.record-row').length === 3);

// ---- 写真 ----
step('商品に写真をつける');
await page.click('a[href$="/edit"]');
await page.setInputFiles('[data-ref="photo"]', join(process.cwd(), 'icons/icon-512.png'));
await page.waitForSelector('.photo-field .thumb img[src^="blob:"]');
await shot('product-edit-photo');
await page.click('[data-act="save"]');
await page.waitForSelector('.thumb.is-hero img[src^="blob:"]');
await shot('product-detail-photo');

// ---- お店 ----
step('お店一覧・お店ページ');
await page.click('#tabbar [data-tab="stores"]');
await page.waitForSelector('.view .list a.row');
assert.match(await text('.view .list'), /最安 1品/);
await shot('stores');
await page.click('.view .list a.row >> text=業務スーパー 〇〇店');
await page.waitForSelector('.record-row');
assert.match(await text('.view'), /このお店がいちばん安い商品（1品）/);
await shot('store-detail');

// ---- 電卓 ----
step('単価電卓');
await page.click('#tabbar [data-tab="calc"]');
await page.fill('[data-k="price"][data-i="0"]', '298');
await page.fill('[data-k="amount"][data-i="0"]', '500');
await page.fill('[data-k="price"][data-i="1"]', '548');
await page.fill('[data-k="amount"][data-i="1"]', '1');
await page.selectOption('[data-k="unit"][data-i="1"]', 'kg');
assert.match(await text('[data-result="1"]'), /最安/);
assert.match(await text('[data-result="0"]'), /8\.8%高い/);
await shot('calc');

// ---- ホーム ----
step('ホーム（一覧）');
await page.click('#tabbar [data-tab="products"]');
await page.waitForSelector('.view .list a.row');
await shot('home');

// ---- バックアップ → 全削除 → 復元 ----
step('バックアップを書き出す');
await page.click('#tabbar [data-tab="settings"]');
await page.click('[data-act="prepare"]');
await page.waitForSelector('[data-act="download"]');
await shot('settings-backup-ready');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="download"]')]);
const backupPath = join(SHOTS, 'backup.json');
await download.saveAs(backupPath);
const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
assert.equal(backup.app, 'price-hikaku');
assert.equal(backup.data.products.length, 1);
assert.equal(backup.data.stores.length, 2);
assert.equal(backup.data.records.length, 3);
assert.equal(backup.images.length, 1);
assert.match(await text('.view'), /最後のバックアップ: .*今日/);

step('すべて削除');
await page.click('[data-act="clear"]');
await page.click('dialog .dialog-btn.is-danger');
await page.waitForFunction(() => /商品 0件 ・ お店 0件 ・ 記録 0件/.test(document.querySelector('.view').innerText));

step('バックアップから復元（置き換え）');
await page.setInputFiles('[data-ref="importFile"]', backupPath);
await page.waitForSelector('dialog');
assert.match(await text('dialog'), /商品 1件・お店 2件・記録 3件・写真 1枚/);
await page.click('dialog .dialog-btn.is-danger');
await page.waitForFunction(() => /商品 1件 ・ お店 2件 ・ 記録 3件/.test(document.querySelector('.view').innerText));
await page.click('#tabbar [data-tab="products"]');
await page.waitForSelector('.view .list .thumb img[src^="blob:"]');

// ---- オフライン ----
step('オフラインでも開ける');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForSelector('.view .list');
await context.setOffline(true);
await page.reload();
await page.waitForSelector('.view .list a.row');
assert.match(await text('.view .list'), /鶏むね肉/);
await context.setOffline(false);

await browser.close();
if (errors.length) {
  console.error('エラーが出ました:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\nOK（スクリーンショット: ${SHOTS}）`);
