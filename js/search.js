// 検索用の文字正規化（DOM に触らない純粋関数）
// 全角/半角・カタカナ/ひらがな・大文字/小文字を区別しない

export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, ' ')
    .trim();
}

// 空白で区切った語がすべて含まれていれば true
export function matches(query, ...fields) {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = normalizeText(fields.filter(Boolean).join(' '));
  return q.split(' ').every((t) => hay.includes(t));
}

// 候補の並べ替え用スコア（一致しなければ -1）
export function matchScore(query, text) {
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (!q) return 0;
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  if (q.split(' ').every((w) => t.includes(w))) return 1;
  return -1;
}
