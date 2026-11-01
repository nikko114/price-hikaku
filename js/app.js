// 起動・画面の切り替え・Service Worker
import * as state from './state.js';
import * as router from './router.js';
import * as images from './images.js';
import { toast } from './ui.js';
import ProductsView from './views/products.js';
import ProductView from './views/product.js';
import ProductFormView from './views/productForm.js';
import RecordFormView from './views/recordForm.js';
import StoresView from './views/stores.js';
import StoreView from './views/store.js';
import StoreFormView from './views/storeForm.js';
import CalcView from './views/calc.js';
import SettingsView from './views/settings.js';
import { notFound } from './views/common.js';

// modal: true の画面（入力フォーム）は下のタブを隠す
const ROUTES = [
  { pattern: /^\/$/, view: ProductsView, tab: 'products' },
  { pattern: /^\/products\/new$/, view: ProductFormView, modal: true },
  { pattern: /^\/products\/([^/]+)\/edit$/, view: ProductFormView, modal: true, keys: ['id'] },
  { pattern: /^\/products\/([^/]+)$/, view: ProductView, tab: 'products', keys: ['id'] },
  { pattern: /^\/stores$/, view: StoresView, tab: 'stores' },
  { pattern: /^\/stores\/new$/, view: StoreFormView, modal: true },
  { pattern: /^\/stores\/([^/]+)\/edit$/, view: StoreFormView, modal: true, keys: ['id'] },
  { pattern: /^\/stores\/([^/]+)$/, view: StoreView, tab: 'stores', keys: ['id'] },
  { pattern: /^\/record$/, view: RecordFormView, modal: true },
  { pattern: /^\/records\/([^/]+)\/edit$/, view: RecordFormView, modal: true, keys: ['id'] },
  { pattern: /^\/calc$/, view: CalcView, tab: 'calc' },
  { pattern: /^\/settings$/, view: SettingsView, tab: 'settings' },
];

const viewRoot = document.getElementById('view');
let current = null; // { def, params, query, cleanup }

function match(path) {
  for (const def of ROUTES) {
    const m = def.pattern.exec(path);
    if (m) {
      const params = {};
      (def.keys || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { def, params };
    }
  }
  return null;
}

function updateChrome(def) {
  document.body.classList.toggle('no-tabbar', !!def?.modal);
  for (const tab of document.querySelectorAll('#tabbar [data-tab]')) {
    if (def && tab.dataset.tab === def.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function renderInto(def, params, query) {
  const el = document.createElement('div');
  el.className = 'view';
  viewRoot.replaceChildren(el);
  let cleanup = null;
  try {
    cleanup = def ? def.view.render(el, { params, query }) : notFound(el, 'ページが見つかりません');
  } catch (err) {
    console.error(err);
    el.innerHTML = '<div class="page"><p class="empty-title">画面を表示できませんでした</p></div>';
  }
  return typeof cleanup === 'function' ? cleanup : null;
}

function show({ path, query, scrollY }) {
  current?.cleanup?.();
  const m = match(path);
  const def = m?.def || null;
  updateChrome(def);
  const cleanup = renderInto(def, m?.params || {}, query);
  current = { def, params: m?.params || {}, query, cleanup };
  window.scrollTo(0, scrollY || 0);
}

// データが変わったら、一覧や詳細の画面は描き直す（入力フォームはそのまま）
function rerender() {
  if (!current?.def?.view.live) return;
  const y = window.scrollY;
  current.cleanup?.();
  current.cleanup = renderInto(current.def, current.params, current.query);
  window.scrollTo(0, y);
}

function setupGlobalActions() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="back"]');
    if (btn) {
      e.preventDefault();
      router.back(btn.dataset.fallback || '/');
    }
  });
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  const offerUpdate = (worker) => {
    toast('新しいバージョンがあります', { actionLabel: '更新', onAction: () => worker.postMessage('skipWaiting'), duration: 15000 });
  };
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // ホーム画面のアプリは開きっぱなしになりがちなので、戻ってきたときに更新を確認
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((err) => console.warn('Service Worker を登録できませんでした', err));
}

function main() {
  state.init();
  state.subscribe(rerender);
  setupGlobalActions();
  router.start(show);
  setupServiceWorker();
  // どの商品にも使われていない写真を掃除（起動を邪魔しないよう少し後で）
  setTimeout(() => images.gcImages(), 3000);
}

main();
