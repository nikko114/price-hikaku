import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, matches, matchScore } from '../js/search.js';

test('normalizeText: カタカナ→ひらがな、全角→半角、小文字', () => {
  assert.equal(normalizeText('ギュウニュウ'), 'ぎゅうにゅう');
  assert.equal(normalizeText('ｷﾞｭｳﾆｭｳ'), 'ぎゅうにゅう');
  assert.equal(normalizeText('ＡＢＣ　１２３'), 'abc 123');
  assert.equal(normalizeText('  鶏むね肉  '), '鶏むね肉');
  assert.equal(normalizeText(null), '');
});

test('matches: 語がすべて含まれる', () => {
  assert.ok(matches('ぎゅうにゅう', 'ギュウニュウ 1L'));
  assert.ok(matches('トリ むね', 'とりむね肉'));
  assert.ok(matches('', 'なんでも'));
  assert.ok(matches('イオン', '牛乳', '卵・乳製品', 'イオン'));
  assert.ok(!matches('豚', '鶏むね肉'));
});

test('matchScore: 完全一致 > 前方一致 > 部分一致', () => {
  assert.equal(matchScore('牛乳', '牛乳'), 3);
  assert.equal(matchScore('ぎゅう', 'ギュウニュウ'), 2);
  assert.equal(matchScore('にゅう', 'ギュウニュウ'), 1);
  assert.equal(matchScore('豚', 'ギュウニュウ'), -1);
});
