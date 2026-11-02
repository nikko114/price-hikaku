// 位置情報と、OpenStreetMap（Overpass API）での周辺のお店検索
// 前半は DOM に触らない純粋関数（tests/geo.test.js でテスト）
import { normalizeText } from './search.js';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

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

export function buildOverpassQuery({ lat, lng }, radius = 500, limit = 60) {
  return `[out:json][timeout:15];nwr["shop"~"^(${SHOP_TYPES.join('|')})$"](around:${Math.round(radius)},${lat.toFixed(6)},${lng.toFixed(6)});out center ${limit};`;
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
      return '地図データのサーバーが混んでいます。少し待ってからもう一度どうぞ。';
    case 'osmTimeout':
      return '周辺のお店の検索に時間がかかっています。';
    default:
      return '周辺のお店を探せませんでした。';
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

const OSM_TTL = 10 * 60 * 1000;
const osmCache = new Map(); // 約100m四方ごと

export async function searchNearbyShops(pos, { radius = 500, timeoutMs = 15_000 } = {}) {
  const key = `${pos.lat.toFixed(3)},${pos.lng.toFixed(3)},${radius}`;
  const hit = osmCache.get(key);
  if (hit && Date.now() - hit.at < OSM_TTL) {
    return hit.items.map((c) => ({ ...c, distance: distanceM(pos, c) })).sort((a, b) => a.distance - b.distance);
  }
  if (navigator.onLine === false) throw new GeoError('offline');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildOverpassQuery(pos, radius))}`,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new GeoError(res.status === 429 || res.status === 504 ? 'busy' : 'osm');
    const items = parseOverpass(await res.json(), pos);
    osmCache.set(key, { at: Date.now(), items });
    return items;
  } catch (err) {
    if (err instanceof GeoError) throw err;
    throw new GeoError(err?.name === 'AbortError' ? 'osmTimeout' : 'osm');
  } finally {
    clearTimeout(timer);
  }
}
