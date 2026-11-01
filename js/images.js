// 商品の写真: 縮小・保存・表示
import * as db from './db.js';
import { uid, referencedImageIds } from './state.js';

const FULL_SIDE = 1024;
const THUMB_SIDE = 240;
const urlCache = new Map(); // `${id}:${variant}` → object URL

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

// 長辺 maxSide に縮小した canvas（透明部分は白で塗る）
function drawScaled(source, maxSide) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function toJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の変換に失敗しました'))), 'image/jpeg', quality);
  });
}

// 選ばれた写真を 本体（長辺1024px）＋サムネ（長辺240px）の JPEG にする
// （向きはブラウザが補正済み。再エンコードで位置情報などのメタデータは消える）
export async function processPhoto(file) {
  const img = await loadImage(file);
  const full = drawScaled(img, FULL_SIDE);
  const thumb = drawScaled(full, THUMB_SIDE);
  return { full: await toJpeg(full, 0.82), thumb: await toJpeg(thumb, 0.78) };
}

export async function savePhoto({ full, thumb }) {
  const id = uid();
  await db.putImage({ id, full, thumb, createdAt: new Date().toISOString() });
  return id;
}

function forget(id) {
  for (const variant of ['thumb', 'full']) {
    const key = `${id}:${variant}`;
    const url = urlCache.get(key);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}

export async function deletePhoto(id) {
  if (!id) return;
  forget(id);
  try {
    await db.deleteImage(id);
  } catch (err) {
    console.warn('写真の削除に失敗', err);
  }
}

export async function imageUrl(id, variant = 'thumb') {
  if (!id) return null;
  const key = `${id}:${variant}`;
  if (urlCache.has(key)) return urlCache.get(key);
  let rec = null;
  try {
    rec = await db.getImage(id);
  } catch (err) {
    console.warn('写真の読み込みに失敗', err);
  }
  const blob = rec?.[variant] || rec?.full || rec?.thumb;
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

// <img data-img="id" data-variant="thumb|full"> に写真を入れる
export function hydrate(root) {
  for (const img of root.querySelectorAll('img[data-img]')) {
    const { img: id, variant } = img.dataset;
    imageUrl(id, variant || 'thumb').then((url) => {
      if (url) {
        img.src = url;
        img.closest('.thumb')?.classList.add('has-img');
      }
    });
  }
}

// どの商品からも使われていない写真を消す
export async function gcImages() {
  try {
    const used = referencedImageIds();
    const keys = await db.imageKeys();
    await Promise.all(keys.filter((k) => !used.has(k)).map((k) => deletePhoto(k)));
  } catch (err) {
    console.warn('写真の掃除に失敗', err);
  }
}

export async function imageStats() {
  try {
    const all = await db.allImages();
    let bytes = 0;
    for (const im of all) bytes += (im.full?.size || 0) + (im.thumb?.size || 0);
    return { count: all.length, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}
