// 画面づくりの小さな道具: 安全な HTML テンプレート、ヘッダー、トースト、ダイアログ

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (s) => new SafeHtml(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

function toHtml(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  return esc(v);
}

// 埋め込んだ値は自動でエスケープされる（raw() / html`` で作ったものはそのまま）
// null / undefined / true / false は空文字になる。属性に真偽値を入れるときは String(…) で文字にすること
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export function mount(el, content) {
  el.innerHTML = toHtml(content);
}

/** 上のバー。large=true はタブ画面用（左寄せの大きいタイトル） */
export function appBar({ title, large = false, left = null, right = null }) {
  return html`<header class="appbar${large ? ' is-large' : ''}">
    <div class="appbar-row">
      <div class="appbar-side">${left}</div>
      <h1 class="appbar-title">${title}</h1>
      <div class="appbar-side is-right">${right}</div>
    </div>
  </header>`;
}

export function backButton(fallback = '/', label = '戻る') {
  return html`<button type="button" class="appbar-btn" data-action="back" data-fallback="${fallback}"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>${label}</span></button>`;
}

export function emptyState({ emoji = '🛒', title, text = '', action = null }) {
  return html`<div class="empty">
    <div class="empty-emoji" aria-hidden="true">${emoji}</div>
    <p class="empty-title">${title}</p>
    ${text ? html`<p class="empty-text">${text}</p>` : ''}
    ${action}
  </div>`;
}

// ---- トースト ----
let toastTimer = null;
export function toast(message, { actionLabel = null, onAction = null, duration = 3200 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  clearTimeout(toastTimer);
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'toast';
  box.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  box.appendChild(text);
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(toastTimer);
      box.remove();
      onAction();
    });
    box.appendChild(btn);
  }
  root.appendChild(box);
  toastTimer = setTimeout(() => {
    box.classList.add('is-leaving');
    setTimeout(() => box.remove(), 200);
  }, actionLabel ? Math.max(duration, 6000) : duration);
}

// ---- ダイアログ ----
/**
 * ボタンを選んでもらう。選んだボタンの value を返す（閉じたら null）
 * @param {{title:string, message?:string, buttons:{label:string, value:any, style?:'primary'|'danger'|'cancel'}[]}} opts
 */
export function ask({ title, message = '', buttons }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = toHtml(html`
      <form method="dialog" class="dialog-body">
        <p class="dialog-title">${title}</p>
        ${message ? html`<p class="dialog-message">${message}</p>` : ''}
        <div class="dialog-buttons${buttons.length > 2 ? ' is-stacked' : ''}">
          ${buttons.map((b, i) => html`<button type="submit" value="${i}" class="dialog-btn ${b.style ? `is-${b.style}` : ''}">${b.label}</button>`)}
        </div>
      </form>`);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      const idx = Number(dlg.returnValue);
      dlg.remove();
      resolve(Number.isInteger(idx) && buttons[idx] ? buttons[idx].value : null);
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close('');
    });
    dlg.showModal();
  });
}

export async function confirmDanger({ title, message = '', ok = '削除' }) {
  const v = await ask({
    title,
    message,
    buttons: [
      { label: 'キャンセル', value: false, style: 'cancel' },
      { label: ok, value: true, style: 'danger' },
    ],
  });
  return v === true;
}

// ---- 端末の判定 ----
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isMobile() {
  return isIOS() || /Android/.test(navigator.userAgent);
}

// 保存の失敗をわかる言葉にする
export function saveErrorMessage(err) {
  if (err && err.name === 'StorageFullError') return '保存できませんでした。端末の保存容量がいっぱいです（設定 → バックアップをしてから古い記録を消してください）';
  return '保存できませんでした';
}
