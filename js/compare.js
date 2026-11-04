// お店ランキング・最安・判定（DOM に触らない純粋関数）
import { unitPrice, unitTypeOf } from './units.js';
import { daysBetween } from './format.js';

export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

// 新しい順（日付 → 作成日時）
export function byNewest(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ca = a.createdAt || '';
  const cb = b.createdAt || '';
  return ca < cb ? 1 : ca > cb ? -1 : 0;
}

/**
 * 1つの商品について、お店ごとの状況をまとめる。
 * - お店の比較には「各お店の最新の通常価格（特売を除く）」を使う。特売しかないお店は最新の特売価格
 * - stores は安い順
 */
export function summarize(product, records, { today, staleDays = 60 } = {}) {
  const priced = records
    .filter((r) => r.productId === product.id && unitTypeOf(r.unit) === product.unitType)
    .map((record) => ({ record, unitPrice: unitPrice(record, product.compareAmount) }))
    .filter((x) => Number.isFinite(x.unitPrice))
    .sort((a, b) => byNewest(a.record, b.record));

  const byStore = new Map();
  for (const x of priced) {
    let s = byStore.get(x.record.storeId);
    if (!s) {
      s = { storeId: x.record.storeId, latest: x, latestRegular: null, min: x, count: 0 };
      byStore.set(x.record.storeId, s);
    }
    s.count += 1;
    if (!s.latestRegular && !x.record.isSale) s.latestRegular = x;
    if (x.unitPrice < s.min.unitPrice) s.min = x;
  }

  const stores = [...byStore.values()]
    .map((s) => {
      const ref = s.latestRegular || s.latest;
      const daysAgo = today ? daysBetween(ref.record.date, today) : 0;
      return {
        ...s,
        ref, // 比較に使う記録
        rankPrice: ref.unitPrice,
        saleOnly: !s.latestRegular,
        // 通常価格より新しい特売があれば併記する
        recentSale: s.latest !== ref && s.latest.record.isSale ? s.latest : null,
        daysAgo,
        stale: daysAgo > staleDays,
      };
    })
    .sort((a, b) => a.rankPrice - b.rankPrice || a.daysAgo - b.daysAgo);

  let allTimeMin = null;
  for (const x of priced) if (!allTimeMin || x.unitPrice < allTimeMin.unitPrice) allTimeMin = x;

  return {
    product,
    priced, // 新しい順
    stores, // 安い順
    best: stores[0] || null,
    allTimeMin,
    latest: priced[0] || null,
    count: priced.length,
  };
}

/**
 * 入力中の単価を、これまでの記録と比べて判定する。
 * level:
 *  none       … 単価がまだ出ない
 *  first      … この商品の記録がまだない
 *  record     … 過去のどの記録よりも安い
 *  best       … 他のお店の最安以下
 *  near       … 他のお店の最安 + threshold 以内
 *  expensive  … それより高い
 *  onlyStore  … このお店の記録しかない（前回と比べる）
 */
export function judge({ unitPrice: u, storeId = null, summary, threshold = 0.05 }) {
  if (!Number.isFinite(u) || u <= 0) return { level: 'none' };
  if (!summary || summary.count === 0) return { level: 'first' };
  const EPS = 1e-9;
  const others = summary.stores.filter((s) => s.storeId !== storeId);
  const bestOther = others[0] || null;
  const own = summary.stores.find((s) => s.storeId === storeId) || null;

  if (u < summary.allTimeMin.unitPrice - EPS) {
    return { level: 'record', prevMin: summary.allTimeMin, bestOther };
  }
  if (!bestOther) {
    const ref = own ? own.ref : null;
    return { level: 'onlyStore', ref, diff: ref ? u - ref.unitPrice : 0 };
  }
  const diff = u - bestOther.rankPrice;
  const ratio = u / bestOther.rankPrice - 1;
  if (diff <= EPS) return { level: 'best', bestOther, diff, ratio };
  if (ratio <= threshold + EPS) return { level: 'near', bestOther, diff, ratio };
  return { level: 'expensive', bestOther, diff, ratio };
}

// お店ごとの「最安になっている商品数」（minStores: 何店以上で比べた商品だけ数えるか）
export function bestStoreCounts(summaries, { minStores = 1 } = {}) {
  const counts = new Map();
  for (const s of summaries) {
    if (s.best && s.stores.length >= minStores) counts.set(s.best.storeId, (counts.get(s.best.storeId) || 0) + 1);
  }
  return counts;
}
