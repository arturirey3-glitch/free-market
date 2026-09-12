import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGoogleCategory, getCondition, identifierXml, validGtin } from '../src/lib/shoppingFeed.mjs';

test('nested categories retain the specific product type', () => {
  assert.equal(getGoogleCategory('家具・インテリア > インテリア小物 > クッション・座布団 > 座布団カバー'), '2927');
  assert.equal(getGoogleCategory('ファッション > メンズ > バッグ > リュック・バックパック'), '100');
  assert.equal(getGoogleCategory('スマホ、タブレット、パソコン > スマホケース、カバー > iPhone用ケース'), '2353');
  assert.equal(getGoogleCategory('家具・インテリア > ラグ・カーペット・マット > キッチンマット'), '598');
  assert.equal(getGoogleCategory('未分類'), '');
});

test('missing identifiers do not become an invented store brand or no-identifiers assertion', () => {
  assert.equal(identifierXml({ title: 'marimekko', brand: null, jan_code: null }), '');
  assert.equal(identifierXml({ brand: 'ノーブランド' }), '');
  assert.equal(identifierXml({ brand: 'A&B', jan_code: '4006381333931' }), '<g:brand>A&amp;B</g:brand>\n      <g:gtin>4006381333931</g:gtin>');
});

test('invalid GTINs and like-new values are not submitted', () => {
  assert.equal(validGtin('4006381333932'), '');
  assert.equal(validGtin('0000000000000'), '');
  assert.equal(validGtin('SKU-1234'), '');
  assert.equal(getCondition('未使用に近い'), 'used');
  assert.equal(getCondition('新品、未使用'), 'new');
});
