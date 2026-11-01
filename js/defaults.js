// 初期設定と定数

// カテゴリ（税率は 食品 8% ／ お酒・日用品 10%。商品ごとに変更できる）
export const DEFAULT_CATEGORIES = [
  { name: '肉', taxRate: 8, emoji: '🍖' },
  { name: '魚', taxRate: 8, emoji: '🐟' },
  { name: '野菜・果物', taxRate: 8, emoji: '🥬' },
  { name: '卵・乳製品', taxRate: 8, emoji: '🥚' },
  { name: '米・パン・麺', taxRate: 8, emoji: '🍚' },
  { name: '調味料', taxRate: 8, emoji: '🧂' },
  { name: '飲み物', taxRate: 8, emoji: '🧃' },
  { name: 'お菓子', taxRate: 8, emoji: '🍪' },
  { name: '冷凍食品', taxRate: 8, emoji: '🧊' },
  { name: 'お酒', taxRate: 10, emoji: '🍺' },
  { name: '日用品', taxRate: 10, emoji: '🧻' },
  { name: 'その他', taxRate: 10, emoji: '📦' },
];

export const DEFAULT_SETTINGS = {
  priceDisplay: 'yenPerQty', // 'yenPerQty' = 100gあたり◯円 ／ 'qtyPerYen' = 100円で◯g
  staleDays: 60, // これより前の記録は「古い」
  lastTaxMode: 'incl', // 前回の値段の入力方法（'incl' 税込 ／ 'excl' 税抜）
  categories: DEFAULT_CATEGORIES,
  // ↓ Phase 2（位置情報）で使う
  autoSuggestStore: true,
  onlineStoreSearch: true,
  suggestRadius: 300,
};

export const DEFAULT_META = {
  schemaVersion: 1,
  lastBackupAt: null,
  persistRequested: false,
  installHintDismissed: false,
  backupHintSnoozedAt: null,
};

export const DEFAULT_TAX_RATE = 8;

export function categoryInfo(name, settings) {
  const list = settings?.categories || DEFAULT_CATEGORIES;
  return list.find((c) => c.name === name) || null;
}

export function categoryEmoji(name, settings) {
  return categoryInfo(name, settings)?.emoji || null;
}
