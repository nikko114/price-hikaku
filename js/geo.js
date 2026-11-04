// 位置情報と、OpenStreetMap（Overpass API）での周辺のお店検索
// 前半は DOM に触らない純粋関数（tests/geo.test.js でテスト）
import { normalizeText } from './search.js';

// 公開されている Overpass API のサーバー（混んでいたら次へ。どれも無料・登録不要）
// https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
export const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// 探すお店の種類（OpenStreetMap の shop=…）
export const SHOP_LABELS = {
  supermarket: 'スーパー',
  convenience: 'コンビニ',
  chemist: 'ドラッグストア',
  wholesale: '業務用・卸売',
  department_store: '百貨店',
  mall: 'ショッピングモール',
  variety_store: '100円ショップ・雑貨',
  doityourself: 'ホームセンター',
  hardware: 'ホームセンター',
  general: '商店',
  greengrocer: '八百屋',
  butcher: '精肉店',
  seafood: '鮮魚店',
  alcohol: '酒屋',
  beverages: '飲料',
  bakery: 'パン屋',
  deli: '惣菜',
  frozen_food: '冷凍食品',
  confectionery: '菓子',
  houseware: '生活雑貨',
};
export const SHOP_TYPES = Object.keys(SHOP_LABELS);

const EARTH_R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

// 2点間の距離（m）
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// 83 → 80m、1234 → 1.2km
export function fmtDistance(m) {
  if (!Number.isFinite(m)) return '';
  if (m < 995) return `${Math.max(10, Math.round(m / 10) * 10)}m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0)}km`;
}

export function hasLocation(s) {
  return !!s && Number.isFinite(s.lat) && Number.isFinite(s.lng);
}

// timeout と maxsize を小さめに宣言すると、混んでいるサーバーでも受け付けてもらいやすい
export function buildOverpassQuery({ lat, lng }, radius = 500, limit = 60) {
  return `[out:json][timeout:10][maxsize:67108864];nwr["shop"~"^(${SHOP_TYPES.join('|')})$"](around:${Math.round(radius)},${lat.toFixed(6)},${lng.toFixed(6)});out center ${limit};`;
}

// 店名: name ＋ branch（例: セブン-イレブン 丸の内店）。branch がなければ町名で区別する
export function storeNameFromTags(tags = {}) {
  const base = String(tags['name:ja'] || tags.name || tags['brand:ja'] || tags.brand || '').trim();
  if (!base) return '';
  const suffix = String(tags.branch || tags['branch:ja'] || tags['addr:neighbourhood'] || tags['addr:quarter'] || '').trim();
  if (!suffix || base.includes(suffix)) return base;
  return `${base} ${suffix}`;
}

// チェーン名: brand:ja → brand。どちらもなく branch があれば name
export function chainFromTags(tags = {}) {
  const brand = String(tags['brand:ja'] || tags.brand || '').trim();
  if (brand) return brand;
  if (tags.branch || tags['branch:ja']) return String(tags['name:ja'] || tags.name || '').trim();
  return '';
}

// Overpass の結果 → お店の候補（近い順。同じ名前で40m以内の重複はまとめる）
export function parseOverpass(json, origin) {
  const items = [];
  for (const el of json?.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags || {};
    const name = storeNameFromTags(tags);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    items.push({
      osmId: `${el.type}/${el.id}`,
      name,
      chain: chainFromTags(tags),
      shop: tags.shop || '',
      lat,
      lng,
      distance: origin ? distanceM(origin, { lat, lng }) : NaN,
    });
  }
  items.sort((a, b) => a.distance - b.distance);
  const result = [];
  for (const c of items) {
    if (result.some((r) => normalizeText(r.name) === normalizeText(c.name) && distanceM(r, c) < 40)) continue;
    result.push(c);
  }
  return result;
}

const nameKey = (s) => normalizeText(s).replace(/\s/g, '');

// すでに登録してあるお店は候補から外す（OSM の ID が同じ・同じ名前で近い・同じ名前で位置なし）
export function excludeRegistered(candidates, stores) {
  const osmIds = new Set(stores.map((s) => s.osmId).filter(Boolean));
  return candidates.filter((c) => {
    if (osmIds.has(c.osmId)) return false;
    const key = nameKey(c.name);
    return !stores.some((s) => nameKey(s.name) === key && (!hasLocation(s) || distanceM(s, c) < 300));
  });
}

// 位置が登録されているお店を、近い順に（radius m 以内）
export function nearbyStores(stores, pos, radius = 300) {
  return stores
    .filter(hasLocation)
    .map((store) => ({ store, distance: distanceM(pos, store) }))
    .filter((x) => x.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

// 自動で選んでよいお店: いちばん近い店が maxDistance 以内、GPS の誤差が maxAccuracy 以下、
// 2番目の店と margin 以上はなれている（紛らわしいときは選ばない）
export function autoPick(nearby, pos, { maxDistance = 150, maxAccuracy = 100, margin = 30 } = {}) {
  const [first, second] = nearby;
  if (!first || !pos || !(pos.accuracy <= maxAccuracy) || first.distance > maxDistance) return null;
  if (second && second.distance - first.distance < margin) return null;
  return first.store;
}

// ---- 周辺のお店の検索結果のキャッシュ（端末に保存。同じあたりでは問い合わせない） ----
export const OSM_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7日はそのまま使う
export const OSM_CACHE_STALE_MAX = 60 * 24 * 60 * 60 * 1000; // つながらないときは60日前の結果まで使う
export const OSM_CACHE_REUSE_M = 150; // 前に探した地点から150m以内なら使い回す
const OSM_CACHE_MAX = 40;

// 使える検索結果（maxAge 以内・同じ半径・いちばん近い地点）
export function findCachedCell(cache, pos, radius, now, maxAge) {
  let best = null;
  for (const cell of Object.values(cache || {})) {
    if (!cell || cell.radius !== radius || !Array.isArray(cell.items) || !(now - cell.at <= maxAge)) continue;
    const d = distanceM(pos, cell);
    if (d > OSM_CACHE_REUSE_M) continue;
    if (!best || d < best.d) best = { cell, d };
  }
  return best ? best.cell : null;
}

// キャッシュの結果を、いまの場所からの距離で並べ直す
export function itemsFromCell(cell, pos, radius) {
  return cell.items
    .map((c) => ({ ...c, distance: distanceM(pos, c) }))
    .filter((c) => c.distance <= radius + OSM_CACHE_REUSE_M)
    .sort((a, b) => a.distance - b.distance);
}

export function addCell(cache, pos, radius, items, now) {
  const key = `${pos.lat.toFixed(3)},${pos.lng.toFixed(3)},${radius}`;
  const cell = { lat: pos.lat, lng: pos.lng, radius, at: now, items: items.map(({ distance, ...rest }) => rest) };
  const entries = Object.entries({ ...cache, [key]: cell })
    .filter(([, c]) => c && now - c.at <= OSM_CACHE_STALE_MAX)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, OSM_CACHE_MAX);
  return Object.fromEntries(entries);
}

// Overpass は混んでいると、HTTP 200 のまま remark にエラーを入れて返すことがある
export function overpassFailed(json) {
  if (!json || !Array.isArray(json.elements)) return true;
  return json.elements.length === 0 && /runtime error|timed out|timeout|out of memory|rate_limited|too many/i.test(json.remark || '');
}

export function mapsUrl(store) {
  const q = encodeURIComponent(store.name);
  return hasLocation(store) ? `https://maps.apple.com/?ll=${store.lat},${store.lng}&q=${q}` : `https://maps.apple.com/?q=${q}`;
}

// ---------------- ここから下はブラウザ専用 ----------------

export class GeoError extends Error {
  constructor(kind) {
    super(kind);
    this.name = 'GeoError';
    this.kind = kind;
  }
}

export function geoErrorMessage(err) {
  switch (err?.kind) {
    case 'denied':
      return '位置情報が許可されていません。iPhone の「設定 → プライバシーとセキュリティ → 位置情報サービス → Safari Webサイト」を「使用中のみ」にしてください。';
    case 'timeout':
      return '現在地がなかなかわかりません（屋内だと時間がかかることがあります）。';
    case 'unsupported':
      return 'この端末では位置情報を使えません。';
    default:
      return '現在地がわかりませんでした。';
  }
}

export function osmErrorMessage(err) {
  switch (err?.kind) {
    case 'offline':
      return '電波がないので、周辺のお店は探せません。';
    case 'busy':
      return '地図データのサーバーが混んでいて、周辺のお店を探せませんでした。少し待ってから「もう一度」を押してください。';
    case 'osmTimeout':
      return '地図データのサーバーから返事がありませんでした（電波が弱いか、サーバーが混んでいます）。';
    default:
      return '周辺のお店を探せませんでした（通信エラー）。';
  }
}

let lastPos = null; // { lat, lng, accuracy, at }
let sessionGranted = false; // この起動中に一度でも取れたら、次からは自動で取りにいってよい

export function isSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export async function permissionState() {
  if (sessionGranted) return 'granted';
  try {
    const st = await navigator.permissions.query({ name: 'geolocation' });
    return st.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown';
  }
}

export function cachedPosition(maxAgeMs = 120_000) {
  return lastPos && Date.now() - lastPos.at <= maxAgeMs ? lastPos : null;
}

export function getPosition({ maxAgeMs = 60_000, timeout = 15_000 } = {}) {
  const cached = cachedPosition(maxAgeMs);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    if (!isSupported()) {
      reject(new GeoError('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastPos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
        sessionGranted = true;
        resolve(lastPos);
      },
      (err) => reject(new GeoError(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable')),
      { enableHighAccuracy: true, timeout, maximumAge: maxAgeMs },
    );
  });
}

// ---- 周辺のお店の検索（Overpass API） ----

const OSM_CACHE_KEY = 'ph.osmCache.v1';
const PREFERRED_KEY = 'ph.osmServer.v1';
const cooldownUntil = new Map(); // 429 などで断られたサーバーは30秒休ませる（利用ルール）
let preferred = null; // 最後に返事をくれたサーバーを、次（アプリを開き直したあとも）は最初に使う
try {
  preferred = typeof localStorage === 'undefined' ? null : localStorage.getItem(PREFERRED_KEY);
} catch {
  preferred = null;
}

function rememberServer(url) {
  if (preferred === url) return;
  preferred = url;
  try {
    localStorage.setItem(PREFERRED_KEY, url);
  } catch {
    /* 覚えられなくても困らない */
  }
}

function loadOsmCache() {
  try {
    return JSON.parse(localStorage.getItem(OSM_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveOsmCache(cache) {
  try {
    localStorage.setItem(OSM_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* 保存できなくても困らない */
  }
}

export function clearOsmCache() {
  try {
    localStorage.removeItem(OSM_CACHE_KEY);
    localStorage.removeItem(PREFERRED_KEY);
  } catch {
    /* なにもしない */
  }
}

function endpointOrder(now = Date.now()) {
  const list = [...OVERPASS_ENDPOINTS];
  if (preferred && list.includes(preferred)) {
    list.splice(list.indexOf(preferred), 1);
    list.unshift(preferred);
  }
  const ready = list.filter((url) => !(cooldownUntil.get(url) > now));
  return ready.length ? ready : list;
}

/**
 * サーバーに順番に問い合わせる。返事が遅ければ hedgeMs 後に次のサーバーにも聞き、
 * 断られたり失敗したらすぐ次へ。最初に返ってきた結果を使う。
 */
function queryOverpass(query, { hedgeMs = 4000, attemptTimeoutMs = 12_000, onSlow } = {}) {
  const endpoints = endpointOrder();
  return new Promise((resolve, reject) => {
    let next = 0;
    let running = 0;
    let finished = false;
    let lastErr = null;
    let slowNotified = false;
    const controllers = new Set();

    const finish = (fn, value) => {
      if (finished) return;
      finished = true;
      for (const c of controllers) c.abort();
      fn(value);
    };

    const launch = () => {
      if (finished) return;
      if (next >= endpoints.length) {
        if (running === 0) finish(reject, lastErr || new GeoError('osm'));
        return;
      }
      const url = endpoints[next];
      next += 1;
      running += 1;
      const ctrl = new AbortController();
      controllers.add(ctrl);
      const timer = setTimeout(() => ctrl.abort(), attemptTimeoutMs);
      const hedge = setTimeout(() => {
        if (!slowNotified) {
          slowNotified = true;
          onSlow?.();
        }
        launch();
      }, hedgeMs);
      let failed = false;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (res.status === 429 || res.status === 406) {
            cooldownUntil.set(url, Date.now() + 30_000);
            throw new GeoError('busy');
          }
          if (!res.ok) throw new GeoError(res.status >= 500 ? 'busy' : 'osm');
          const json = await res.json();
          if (overpassFailed(json)) throw new GeoError('busy');
          rememberServer(url);
          finish(resolve, json);
        })
        .catch((err) => {
          failed = true;
          if (finished) return;
          lastErr = err instanceof GeoError ? err : new GeoError(err?.name === 'AbortError' ? 'osmTimeout' : 'osm');
          console.warn(`Overpass: ${url} → ${lastErr.kind}`, err);
        })
        .finally(() => {
          clearTimeout(timer);
          clearTimeout(hedge);
          controllers.delete(ctrl);
          running -= 1;
          if (finished) return;
          if (failed && next < endpoints.length) launch(); // 失敗したらすぐ次のサーバーへ
          else if (running === 0 && next >= endpoints.length) finish(reject, lastErr || new GeoError('osm'));
        });
    };

    launch();
  });
}

/**
 * 周辺のお店を探す。
 * @returns {Promise<{items:object[], cachedAt:number|null, stale?:boolean}>}
 *   cachedAt: 端末に保存してあった結果を使ったときの、その検索の時刻
 *   stale: つながらなかったので古い結果を使った
 */
export async function searchNearbyShops(pos, { radius = 500, force = false, onSlow } = {}) {
  const cache = loadOsmCache();
  if (!force) {
    const cell = findCachedCell(cache, pos, radius, Date.now(), OSM_CACHE_TTL);
    if (cell) return { items: itemsFromCell(cell, pos, radius), cachedAt: cell.at };
  }
  const fallback = () => {
    const stale = findCachedCell(cache, pos, radius, Date.now(), OSM_CACHE_STALE_MAX);
    return stale ? { items: itemsFromCell(stale, pos, radius), cachedAt: stale.at, stale: true } : null;
  };
  if (navigator.onLine === false) {
    const stale = fallback();
    if (stale) return stale;
    throw new GeoError('offline');
  }
  try {
    const json = await queryOverpass(buildOverpassQuery(pos, radius), { onSlow });
    const items = parseOverpass(json, pos);
    saveOsmCache(addCell(loadOsmCache(), pos, radius, items, Date.now()));
    return { items, cachedAt: null };
  } catch (err) {
    const stale = fallback();
    if (stale) return stale;
    throw err;
  }
}
