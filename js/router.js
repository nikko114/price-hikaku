// ハッシュ（#/products/xxx）での画面切り替え
// アプリ内の履歴の深さ（idx）を history.state に持たせて、「戻る」で戻れるかを判断する

let idx = 0;
let handler = null;
let pendingReplace = null;
const scrollPos = new Map();

export function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = (q >= 0 ? raw.slice(0, q) : raw) || '/';
  const query = Object.fromEntries(new URLSearchParams(q >= 0 ? raw.slice(q + 1) : ''));
  return { path, query };
}

function emit(scrollY) {
  const { path, query } = parse();
  handler({ path, query, scrollY });
}

export function start(fn) {
  handler = fn;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!history.state || typeof history.state.idx !== 'number') history.replaceState({ idx: 0 }, '');
  idx = history.state.idx;

  window.addEventListener('popstate', (e) => {
    scrollPos.set(idx, window.scrollY);
    idx = e.state && typeof e.state.idx === 'number' ? e.state.idx : idx + 1;
    if (!e.state) history.replaceState({ idx }, '');
    if (pendingReplace != null) {
      const path = pendingReplace;
      pendingReplace = null;
      history.replaceState({ idx }, '', `#${path}`);
      emit(0);
      return;
    }
    emit(scrollPos.get(idx) ?? 0);
  });

  // アプリ内リンク（href="#/..."）はここで処理する
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(a.getAttribute('href').slice(1), { replace: a.dataset.replace === 'true' });
  });

  emit(0);
}

export function navigate(path, { replace = false } = {}) {
  scrollPos.set(idx, window.scrollY);
  if (replace) {
    history.replaceState({ idx }, '', `#${path}`);
  } else {
    idx += 1;
    history.pushState({ idx }, '', `#${path}`);
  }
  emit(0);
}

// 前の画面へ。アプリ内の履歴がなければ fallback へ
export function back(fallback = '/') {
  if (idx > 0) history.back();
  else navigate(fallback, { replace: true });
}

// 履歴を最初まで戻してから path を表示（削除したものの画面に戻らないように）
export function resetTo(path) {
  if (idx > 0) {
    pendingReplace = path;
    history.go(-idx);
  } else {
    navigate(path, { replace: true });
  }
}

export function canGoBack() {
  return idx > 0;
}
