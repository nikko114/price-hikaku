// 表示用の整形（DOM に触らない純粋関数）
import { compareUnitText, qtyPerYen, baseUnitLabel } from './units.js';

// 単価の小数桁: 1000以上は整数、10以上は1桁、1以上は2桁、それ未満は3桁
export function priceDecimals(v) {
  const a = Math.abs(v);
  if (a >= 1000) return 0;
  if (a >= 10) return 1;
  if (a >= 1) return 2;
  return 3;
}

// 量の小数桁: 100以上は整数、1以上は1桁、それ未満は2桁
export function qtyDecimals(v) {
  const a = Math.abs(v);
  if (a >= 100) return 0;
  if (a >= 1) return 1;
  return 2;
}

export function fmtNumber(v, decimals) {
  if (!Number.isFinite(v)) return '—';
  const d = decimals ?? priceDecimals(v);
  return v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// 単価などの金額（桁数は自動）
export function fmtYen(v, decimals) {
  if (!Number.isFinite(v)) return '—';
  return `¥${fmtNumber(v, decimals)}`;
}

// 入力された値段（整数ならそのまま、小数があれば2桁まで）
export function fmtPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `¥${n.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}`;
}

// 量（基準単位）。例: 155g, 4.6個
export function fmtQty(v, type, countLabel) {
  if (!Number.isFinite(v)) return '—';
  return `${fmtNumber(v, qtyDecimals(v))}${baseUnitLabel(type, countLabel)}`;
}

// 記録の内容量。例: 500g, 500ml×6
export function fmtAmount(record) {
  const a = Number(record.amount).toLocaleString('ja-JP', { maximumFractionDigits: 3 });
  const pack = Number(record.packCount) > 1 ? `×${Number(record.packCount)}` : '';
  return `${a}${record.unit}${pack}`;
}

// 「100gあたり」
export function perText(product) {
  return `${compareUnitText(product.unitType, product.compareAmount, product.countLabel)}あたり`;
}

// 単価の表示（mode: 'yenPerQty' | 'qtyPerYen'）
export function unitPriceText(u, product, mode) {
  if (mode === 'qtyPerYen') {
    const q = qtyPerYen(u, product.compareAmount);
    return { value: fmtQty(q, product.unitType, product.countLabel), suffix: '/100円', long: `100円で ${fmtQty(q, product.unitType, product.countLabel)}` };
  }
  const cmp = compareUnitText(product.unitType, product.compareAmount, product.countLabel);
  return { value: fmtYen(u), suffix: `/${cmp}`, long: `${cmp}あたり ${fmtYen(u)}` };
}

// u が base より高いときの差（mode に合わせた言い方）
// yenPerQty → 「¥6.4」, qtyPerYen → 「17g」（100円で買える量の差）
export function diffAmountText(u, base, product, mode) {
  if (mode === 'qtyPerYen') {
    const d = Math.abs(qtyPerYen(base, product.compareAmount) - qtyPerYen(u, product.compareAmount));
    return fmtQty(d, product.unitType, product.countLabel);
  }
  return fmtYen(Math.abs(u - base));
}

export function fmtPercent(ratio) {
  if (!Number.isFinite(ratio)) return '—';
  const p = Math.abs(ratio * 100);
  return `${p < 10 ? p.toFixed(1).replace(/\.0$/, '') : Math.round(p)}%`;
}

// ---- 日付（端末のローカル日付 YYYY-MM-DD） ----

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function daysBetween(from, to) {
  return Math.round((ymd(to) - ymd(from)) / 86400000);
}

export function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 今年なら 11/1、それ以外は 2025/11/1
export function fmtDate(dateStr, today = todayStr()) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const ty = Number(String(today).slice(0, 4));
  return y === ty ? `${m}/${d}` : `${y}/${m}/${d}`;
}

export function relativeDay(dateStr, today = todayStr()) {
  const n = daysBetween(dateStr, today);
  if (n < 0) return fmtDate(dateStr, today);
  if (n === 0) return '今日';
  if (n === 1) return '昨日';
  if (n < 7) return `${n}日前`;
  if (n < 30) return `${Math.floor(n / 7)}週間前`;
  if (n < 365) return `${Math.floor(n / 30)}ヶ月前`;
  return `${Math.floor(n / 365)}年前`;
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
