import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampDeliveryDays, clampTrialDays, computeCaptureDueAt,
  AUTH_HOLD_DAYS, CAPTURE_SAFETY_DAYS, DEFAULT_DELIVERY_DAYS,
} from '../src/lib/trial.ts';

const BASE = new Date('2026-09-13T10:00:00+09:00');
const daysBetween = (a, b) => Math.round((b - a) / 86400000);

test('未設定の配送日数は既定値に落ちる（Number(null) の 0 で早く課金しない）', () => {
  // 商品の大半は delivery_time が null。ここが 0 になると
  // 商品ページの表示より早く課金してしまう。
  for (const v of [null, undefined, '', 'abc', NaN]) {
    assert.equal(clampDeliveryDays(v), DEFAULT_DELIVERY_DAYS);
  }
  assert.equal(clampDeliveryDays(0), 0, '明示的な0は当日発送として尊重する');
  assert.equal(clampDeliveryDays(99), 14, '長すぎる値は頭打ちにする');
});

test('お試し日数は 1〜20 に収まる', () => {
  assert.equal(clampTrialDays(null), 7);
  assert.equal(clampTrialDays(0), 7);
  assert.equal(clampTrialDays(-5), 7);
  assert.equal(clampTrialDays(999), 20);
  assert.equal(clampTrialDays(10), 10);
});

test('課金日は 購入日 + 配送日数 + お試し日数', () => {
  assert.equal(daysBetween(BASE, computeCaptureDueAt(BASE, 3, 7)), 10);
  assert.equal(daysBetween(BASE, computeCaptureDueAt(BASE, 1, 7)), 8);
  assert.equal(daysBetween(BASE, computeCaptureDueAt(BASE, 0, 7)), 7);
});

test('商品ページの表示とサーバーの課金日が一致する', () => {
  // 表示側も同じ関数を使うことが前提。別実装に戻すとここが落ちる。
  for (const deliveryTime of [null, undefined, 0, 1, 3, 14, 99]) {
    const d = clampDeliveryDays(deliveryTime);
    const t = clampTrialDays(null);
    const server = daysBetween(BASE, computeCaptureDueAt(BASE, d, t));
    assert.equal(server, d + t, `delivery_time=${deliveryTime} で表示とズレた`);
  }
});

test('オーソリ有効期限（30日）を超えない', () => {
  // 超えるとキャプチャーできず請求権が消える。安全マージンの手前で打ち切る。
  const due = computeCaptureDueAt(BASE, 14, 20);
  assert.equal(daysBetween(BASE, due), AUTH_HOLD_DAYS - CAPTURE_SAFETY_DAYS);
  assert.ok(daysBetween(BASE, due) < AUTH_HOLD_DAYS);
});
