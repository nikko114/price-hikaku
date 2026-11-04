// Service Worker: アプリ本体をキャッシュして、電波がなくても開けるようにする
// ファイルを足したら ASSETS にも足す（tests/sw.test.js で確認）
// 中身を変えたら VERSION を上げる（js/version.js と同じ値にする）

const VERSION = '0.3.0';
const CACHE = `price-hikaku-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/backup.js',
  './js/chart.js',
  './js/compare.js',
  './js/db.js',
  './js/defaults.js',
  './js/format.js',
  './js/geo.js',
  './js/icons.js',
  './js/images.js',
  './js/router.js',
  './js/search.js',
  './js/state.js',
  './js/ui.js',
  './js/units.js',
  './js/version.js',
  './js/views/calc.js',
  './js/views/common.js',
  './js/views/location.js',
  './js/views/product.js',
  './js/views/productForm.js',
  './js/views/products.js',
  './js/views/recordForm.js',
  './js/views/settings.js',
  './js/views/store.js',
  './js/views/storeForm.js',
  './js/views/stores.js',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // HTTP キャッシュを通さずに取りに行く（更新が確実に届くように）
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('price-hikaku-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部（地図の検索など）はそのまま

  // 画面の読み込みは常に index.html を返す
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((hit) => hit || fetch(req)),
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});
