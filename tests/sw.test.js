// Service Worker のキャッシュ一覧に、アプリのファイルが全部入っているか
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const assets = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('js / css / icons のファイルはすべてキャッシュされる', () => {
  const files = ['js', 'css', 'icons'].flatMap((d) => walk(join(root, d))).map((p) => `./${relative(root, p).split('\\').join('/')}`);
  const missing = files.filter((f) => !assets.includes(f));
  assert.deepEqual(missing, [], `sw.js の ASSETS に足りないファイル: ${missing.join(', ')}`);
});

test('キャッシュ一覧のファイルはすべて存在する', () => {
  const notFound = assets.filter((a) => a !== './' && !existsSync(join(root, a)));
  assert.deepEqual(notFound, []);
});

test('sw.js の VERSION と js/version.js がそろっている', () => {
  const m = /const VERSION = '([^']+)'/.exec(sw);
  assert.equal(m?.[1], APP_VERSION);
});
