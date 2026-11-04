// グラフの画面テスト（Playwright + Chromium）。数か月分の記録を入れて、
// 価格推移・お店ランキングの棒・お店の総合ランキングを確かめる
// 使い方:
//   python3 -m http.server 8000 &
//   node tests/e2e-chart.mjs        # SCHEME=dark でダークモード
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8000/';
const SHOTS = process.env.SHOTS || join(tmpdir(), 'price-hikaku-shots-chart');
const SCHEME = process.env.SCHEME || 'light';
mkdirSync(SHOTS, { recursive: true });

// ---- テスト用のデータ（今日から何日前、で作る） ----
const pad = (n) => String(n).padStart(2, '0');
const ago = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const now = new Date().toISOString();
const store = (id, name, chain) => ({ id, name, chain, priceInput: 'incl', memo: '', lat: null, lng: null, osmId: null, createdAt: now, updatedAt: now });
const product = (id, name, category, unitType, compareAmount) => ({ id, name, category, unitType, countLabel: null, compareAmount, taxRate: 8, imageId: null, memo: '', favorite: false, createdAt: now, updatedAt: now });
let seq = 0;
const rec = (productId, storeId, daysAgo, price, amount, unit, isSale = false) => {
  seq += 1;
  return {
    id: `r${seq}`, productId, storeId, date: ago(daysAgo), price, taxIncluded: true, taxRate: 8, amount, unit, packCount: 1,
    isSale, note: '', createdAt: new Date(Date.now() - daysAgo * 86400000 + seq).toISOString(), updatedAt: now,
  };
};
const DATA = {
  stores: [store('aeon', 'イオン 〇〇店', 'イオン'), store('gyomu', '業務スーパー 〇〇店', '業務スーパー'), store('maru', 'マルエツ △△店', 'マルエツ')],
  products: [product('chicken', '鶏むね肉', '肉', 'weight', 100), product('milk', '牛乳', '卵・乳製品', 'volume', 100)],
  records: [
    // 鶏むね肉: イオン（だんだん値上がり＋特売1回）、業務スーパー（安い）、マルエツ（古い記録だけ）
    rec('chicken', 'aeon', 240, 198, 300, 'g'),
    rec('chicken', 'aeon', 180, 204, 300, 'g'),
    rec('chicken', 'aeon', 120, 249, 500, 'g', true),
    rec('chicken', 'aeon', 60, 210, 300, 'g'),
    rec('chicken', 'aeon', 5, 219, 300, 'g'),
    rec('chicken', 'gyomu', 200, 1080, 2, 'kg'),
    rec('chicken', 'gyomu', 90, 1120, 2, 'kg'),
    rec('chicken', 'gyomu', 20, 1160, 2, 'kg'),
    rec('chicken', 'maru', 150, 199, 250, 'g'),
    // 牛乳: イオンが最安
    rec('milk', 'aeon', 10, 198, 1, 'L'),
    rec('milk', 'gyomu', 12, 215, 1, 'L'),
  ],
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', colorScheme: SCHEME });
await context.addInitScript((data) => {
  if (localStorage.getItem('ph.v1.products')) return;
  localStorage.setItem('ph.v1.products', JSON.stringify(data.products));
  localStorage.setItem('ph.v1.stores', JSON.stringify(data.stores));
  localStorage.setItem('ph.v1.records', JSON.stringify(data.records));
}, DATA);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
const step = (msg) => console.log(`• ${msg}`);
let shotNo = 0;
const shot = async (name, opts = {}) => {
  shotNo += 1;
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`), ...opts });
};
const text = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ');

await page.goto(`${BASE}#/products/chicken`);
await page.waitForSelector('.chart-svg');

step('お店ランキングの棒: 最安が緑、長さは単価に比例');
const bars = await page.$$eval('.rank-bar-fill', (els) => els.map((e) => ({ w: parseFloat(e.style.width), best: e.classList.contains('is-best') })));
assert.equal(bars.length, 3);
assert.equal(bars[0].best, true);
assert.ok(!bars[1].best && !bars[2].best);
// 業務スーパー ¥58.0 ＜ イオン ¥73.0 ＜ マルエツ ¥79.6 → マルエツが 100%
assert.ok(bars[0].w < bars[1].w && bars[1].w < bars[2].w);
assert.ok(Math.abs(bars[2].w - 100) < 0.01);
assert.ok(Math.abs(bars[0].w - (58 / 79.6) * 100) < 0.2);

step('価格の推移: お店ごとの線と点、凡例');
assert.equal(await page.locator('.chart-line').count(), 2, '記録が2件以上あるお店だけ線になる（マルエツは点だけ）');
assert.equal(await page.locator('.chart-dot').count(), 9);
assert.equal(await page.locator('.chart-dot.is-sale').count(), 1, '特売は白抜きの点');
const legend = await page.locator('.chart-legend-item').allInnerTexts();
assert.deepEqual(legend, ['イオン 〇〇店', '業務スーパー 〇〇店', 'マルエツ △△店']);
const slotOf = async (name) => page.locator('.chart-legend-item', { hasText: name }).locator('.chart-key').getAttribute('class');
assert.match(await slotOf('イオン'), /s-1/);
assert.match(await slotOf('業務スーパー'), /s-2/);
assert.match(await slotOf('マルエツ'), /s-3/);
const ticks = await page.locator('.chart-tick').allTextContents(); // SVG の文字は innerText では取れない
assert.ok(ticks.some((t) => /^¥\d+$/.test(t)), `縦軸は円: ${ticks.join(',')}`);
assert.match(await text('.chart-hint'), /タップすると/);
await page.locator('.chart-card').scrollIntoViewIfNeeded();
await shot('product-chart', { fullPage: true });

step('グラフをタップ → その日の値段');
const box = await page.locator('.chart-svg').boundingBox();
// 指でタップ（右端＝いちばん新しい日のあたり）。下のタブに隠れていれば Playwright が見える位置までスクロールする
await page.locator('.chart-svg').tap({ position: { x: box.width - 14, y: box.height / 2 } });
await page.waitForSelector('.chart-readout-row');
const readout = await text('.chart-readout');
assert.match(readout, /イオン 〇〇店/);
assert.match(readout, /¥73\.0\/100g/);
assert.match(readout, /300g ¥219/);
assert.equal(await page.locator('.chart-crosshair[visibility="visible"]').count(), 1);
assert.equal(await page.locator('.chart-dot.is-active').count(), 1);
await shot('product-chart-selected', { clip: { x: 0, y: (await page.locator('.chart-card').boundingBox()).y - 60, width: 390, height: 420 } });

step('キーボードの ← でひとつ前の日へ');
await page.focus('.chart-svg');
await page.keyboard.press('ArrowLeft');
assert.match(await text('.chart-readout'), /¥58\.0\/100g 業務スーパー 〇〇店/); // 値が先、店名があと

step('期間: 3ヶ月にすると古い記録は出ない');
await page.click('[data-period="3m"]');
await page.waitForFunction(() => document.querySelectorAll('.chart-dot').length === 4);
assert.deepEqual(await page.locator('.chart-legend-item').allInnerTexts(), ['イオン 〇〇店', '業務スーパー 〇〇店']);
assert.match(await slotOf('業務スーパー'), /s-2/, '期間を変えても色は同じ');
await page.click('[data-period="all"]');
await page.waitForFunction(() => document.querySelectorAll('.chart-dot').length === 9);

step('凡例をタップで、そのお店を隠す（色は変わらない）');
await page.click('.chart-legend-item >> text=イオン 〇〇店');
await page.waitForFunction(() => document.querySelectorAll('.chart-dot').length === 4);
assert.equal(await page.locator('.chart-legend-item[aria-pressed="false"]').count(), 1);
assert.equal(await page.locator('.chart-line.s-2').count(), 1);
await page.click('.chart-legend-item >> text=イオン 〇〇店');
await page.waitForFunction(() => document.querySelectorAll('.chart-dot').length === 9);

step('表示を「100円で」にすると、グラフも量になる');
await page.click('[data-seg="mode"] [data-value="qtyPerYen"]');
await page.waitForFunction(() => [...document.querySelectorAll('.chart-tick')].some((t) => /g$/.test(t.textContent)));
const qtyBars = await page.$$eval('.rank-bar-fill', (els) => els.map((e) => parseFloat(e.style.width)));
assert.ok(qtyBars[0] > qtyBars[1] && Math.abs(qtyBars[0] - 100) < 0.01, '100円で買える量は最安がいちばん長い');
await shot('product-chart-qty', { fullPage: true });
await page.click('[data-seg="mode"] [data-value="yenPerQty"]');

step('お店一覧: どのお店が安い？');
await page.click('#tabbar [data-tab="stores"]');
await page.waitForSelector('.hbar-row');
const winners = await page.locator('.hbar-row').allInnerTexts();
assert.equal(winners.length, 2);
assert.match(winners.join('|'), /業務スーパー 〇〇店[\s\S]*1品/);
assert.match(winners.join('|'), /イオン 〇〇店[\s\S]*1品/);
await shot('stores-winners', { fullPage: true });

step('記録が1件だけの商品にはグラフを出さない');
await page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem('ph.v1.products'));
  const rs = JSON.parse(localStorage.getItem('ph.v1.records'));
  ps.push({ ...ps[1], id: 'egg', name: '卵', unitType: 'count', countLabel: '個', compareAmount: 1 });
  rs.push({ ...rs[rs.length - 1], id: 'egg1', productId: 'egg', amount: 10, unit: '個', price: 258 });
  localStorage.setItem('ph.v1.products', JSON.stringify(ps));
  localStorage.setItem('ph.v1.records', JSON.stringify(rs));
});
await page.goto(`${BASE}#/products/egg`);
await page.reload(); // localStorage を書き換えたので読み込み直す
await page.waitForSelector('.rank-row');
assert.equal(await page.locator('.chart-svg').count(), 0);
assert.equal(await page.locator('.rank-bar').count(), 0, '1店だけなら棒も出さない');

await browser.close();
if (errors.length) {
  console.error('エラーが出ました:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\nOK（スクリーンショット: ${SHOTS}）`);
