// 単位換算・税・単価の計算（DOM に触らない純粋関数）

// 個数系の単位（すべて 1 個 = 1 として扱う）
export const COUNT_LABELS = ['個', '枚', '本', '袋', 'ロール', '組', '食', '回分', '缶', 'パック', '箱', '錠'];

export const UNIT_TYPES = {
  weight: { label: '重さ', base: 'g', units: [['g', 1], ['kg', 1000]], compareOptions: [1, 100, 1000], defaultCompare: 100 },
  volume: { label: '容量', base: 'ml', units: [['ml', 1], ['L', 1000]], compareOptions: [1, 100, 1000], defaultCompare: 100 },
  length: { label: '長さ', base: 'm', units: [['m', 1]], compareOptions: [1, 10, 100], defaultCompare: 1 },
  count: { label: '個数', base: '個', units: COUNT_LABELS.map((l) => [l, 1]), compareOptions: [1, 10, 100], defaultCompare: 1 },
};

export const UNIT_TYPE_KEYS = Object.keys(UNIT_TYPES);

const UNIT_INFO = new Map();
for (const [type, def] of Object.entries(UNIT_TYPES)) {
  for (const [unit, factor] of def.units) UNIT_INFO.set(unit, { type, factor });
}

export function unitTypeOf(unit) {
  return UNIT_INFO.get(unit)?.type ?? null;
}

export function unitFactor(unit) {
  return UNIT_INFO.get(unit)?.factor ?? null;
}

export function unitsOf(type) {
  return UNIT_TYPES[type]?.units.map(([u]) => u) ?? [];
}

// 量の種類ごとの最初の単位（count は商品の個数ラベル）
export function defaultUnitOf(type, countLabel) {
  if (type === 'count') return countLabel || '個';
  return UNIT_TYPES[type]?.units[0][0] ?? 'g';
}

export function defaultCompareAmount(type) {
  return UNIT_TYPES[type]?.defaultCompare ?? 1;
}

// 全角数字・カンマ・円記号まじりの入力を数値に（だめなら NaN）
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  if (input == null) return NaN;
  const s = String(input).normalize('NFKC').replace(/[,\s円¥]/g, '');
  if (!/^\+?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

// 総量（基準単位 g / ml / m / 個）。例: 500ml × 6本 = 3000
export function totalBase({ amount, unit, packCount = 1 }) {
  const factor = unitFactor(unit);
  const a = Number(amount);
  const p = packCount == null || packCount === '' ? 1 : Number(packCount);
  if (!factor || !(a > 0) || !(p > 0)) return NaN;
  return a * factor * p;
}

// 税込価格（税抜で入力されたときは税率をかける）
export function priceWithTax({ price, taxIncluded, taxRate }) {
  const p = Number(price);
  if (!(p >= 0)) return NaN;
  if (taxIncluded) return p;
  const rate = Number(taxRate);
  return p * (1 + (Number.isFinite(rate) ? rate : 0) / 100);
}

// 比べる単位あたりの税込価格（例: compareAmount=100 → 100gあたり◯円）
export function unitPrice(record, compareAmount) {
  const total = totalBase(record);
  const price = priceWithTax(record);
  if (!(total > 0) || !(price > 0) || !(compareAmount > 0)) return NaN;
  return (price / total) * compareAmount;
}

// 単価から「yen 円で買える量（基準単位）」を出す
export function qtyPerYen(unitPriceValue, compareAmount, yen = 100) {
  if (!(unitPriceValue > 0) || !(compareAmount > 0)) return NaN;
  return (yen * compareAmount) / unitPriceValue;
}

// 基準単位の表示名（count は商品の個数ラベル）
export function baseUnitLabel(type, countLabel) {
  if (type === 'count') return countLabel || '個';
  return UNIT_TYPES[type]?.base ?? '';
}

// 比べる単位の表示（例: 100g, 1kg, 1L, 1個）
export function compareUnitText(type, compareAmount, countLabel) {
  const n = Number(compareAmount) || 1;
  if (type === 'weight' && n >= 1000 && n % 1000 === 0) return `${n / 1000}kg`;
  if (type === 'volume' && n >= 1000 && n % 1000 === 0) return `${n / 1000}L`;
  return `${n}${baseUnitLabel(type, countLabel)}`;
}
