// アイコンを作る: icons/icon.svg と PNG（ホーム画面用など）
// 使い方: node tools/make-icons.mjs   （Playwright と Chromium が必要）
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = fileURLToPath(new URL('../icons/', import.meta.url));

// rounded: 角丸（透明の余白あり）にするか ／ scale: 中の絵の大きさ
function iconSvg({ rounded = false, scale = 1 } = {}) {
  const bg = rounded ? '<rect width="512" height="512" rx="112" fill="url(#bg)"/>' : '<rect width="512" height="512" fill="url(#bg)"/>';
  const tag = 'M112 256 L184 168 H400 V344 H184 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#22a354"/>
      <stop offset="1" stop-color="#15803d"/>
    </linearGradient>
  </defs>
  ${bg}
  <g transform="translate(256 256) scale(${scale}) rotate(-18) translate(-256 -256)">
    <path d="${tag}" transform="translate(6 12)" fill="#0b4d24" opacity="0.28" stroke="#0b4d24" stroke-width="28" stroke-linejoin="round"/>
    <path d="${tag}" fill="#ffffff" stroke="#ffffff" stroke-width="28" stroke-linejoin="round"/>
    <circle cx="170" cy="256" r="17" fill="#178a43"/>
    <g fill="none" stroke="#15803d" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">
      <path d="M246 194 L294 250 L342 194"/>
      <path d="M294 250 V322"/>
      <path d="M252 262 H336"/>
      <path d="M252 296 H336"/>
    </g>
  </g>
</svg>
`;
}

const svgRounded = iconSvg({ rounded: true });
writeFileSync(join(out, 'icon.svg'), svgRounded);

const targets = [
  { file: 'apple-touch-icon.png', size: 180, svg: iconSvg() }, // iPhone は角丸を自分でつける。透明は黒になるので塗りつぶし
  { file: 'icon-192.png', size: 192, svg: svgRounded },
  { file: 'icon-512.png', size: 512, svg: svgRounded },
  { file: 'icon-maskable-512.png', size: 512, svg: iconSvg({ scale: 0.86 }) },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const svg = t.svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: join(out, t.file), omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log('wrote', t.file);
}
await browser.close();
