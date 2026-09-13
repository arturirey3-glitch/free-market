// 7日間無料お試しの共通ロジック（checkout / cron / webhook から使う）

/** お試しに使えるカードブランド。Amex は日本の30日オーソリの対象外で7日で失効するため除外する。 */
export const TRIAL_CARD_NETWORKS = ['visa', 'mastercard', 'jcb', 'diners', 'discover'] as const;

/** オーソリの実効上限（日）。日本アカウントの JPY カード決済は30日保留できる。 */
export const AUTH_HOLD_DAYS = 30;

/** 失効直前の取りこぼしを防ぐための安全マージン（日）。 */
export const CAPTURE_SAFETY_DAYS = 2;

export const DEFAULT_TRIAL_DAYS = 7;
export const DEFAULT_DELIVERY_DAYS = 3;

/**
 * 課金日 = 購入日 + お届け日数 + お試し日数。
 *
 * 「届いてから7日」を追跡番号なしで実現するため、商品の delivery_time を配送日数として使う。
 * オーソリ失効（30日）に間に合わない場合は失効2日前まで前倒しする。
 */
export const computeCaptureDueAt = (
  purchasedAt: Date,
  deliveryDays: number,
  trialDays: number
): Date => {
  const days = clampDeliveryDays(deliveryDays) + clampTrialDays(trialDays);
  const due = addDays(purchasedAt, days);
  const latest = addDays(purchasedAt, AUTH_HOLD_DAYS - CAPTURE_SAFETY_DAYS);
  return due > latest ? latest : due;
};

export const clampTrialDays = (n: unknown): number => {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return DEFAULT_TRIAL_DAYS;
  return Math.min(v, 20);
};

/**
 * 配送日数を正規化する。
 *
 * delivery_time は大半の商品で未設定（null）なので、既定値へのフォールバックが要。
 * Number(null) は 0 になってしまうため、null/undefined/空文字は数値化する前に弾く。
 * ここが 0 に落ちると商品ページの表示より早く課金してしまう。
 */
export const clampDeliveryDays = (n: unknown): number => {
  if (n === null || n === undefined || n === '') return DEFAULT_DELIVERY_DAYS;
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 0) return DEFAULT_DELIVERY_DAYS;
  return Math.min(v, 14);
};

export const addDays = (d: Date, days: number): Date =>
  new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

export const formatJaDate = (d: Date): string =>
  d.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo',
  });

/** 画面用の短い日付 "9/13"（ゼロ埋めなし・年は出さない）。 */
export const formatShortDate = (d: Date): string => {
  const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return `${jst.getMonth() + 1}/${jst.getDate()}`;
};

/**
 * 商品ページの3ステップ表示に出す日付。
 * today → arrive(today+発送目安) → charge(arrive+お試し日数)
 */
export const trialTimeline = (args: {
  deliveryDays: unknown; trialDays: unknown; now?: Date;
}) => {
  const now = args.now ?? new Date();
  const deliveryDays = clampDeliveryDays(args.deliveryDays);
  const trialDays = clampTrialDays(args.trialDays);
  const arrive = addDays(now, deliveryDays);
  const charge = computeCaptureDueAt(now, deliveryDays, trialDays);
  return {
    trialDays,
    deliveryDays,
    today: formatShortDate(now),
    arrive: formatShortDate(arrive),
    charge: formatShortDate(charge),
    chargeDate: charge,
  };
};

/**
 * 購入前に必ず見せる文言。改正特商法（定期購入規制）が求める
 * 「無料期間・その後の金額・課金日・解約方法」をひとまとめにする。
 */
export const trialDisclosure = (args: {
  price: number;
  trialDays: number;
  deliveryDays: number;
  purchasedAt?: Date;
}): string => {
  const trialDays = clampTrialDays(args.trialDays);
  const due = computeCaptureDueAt(args.purchasedAt ?? new Date(), args.deliveryDays, trialDays);
  return [
    `商品到着後${trialDays}日間は代金を請求しません（お試し期間）。`,
    `ご購入時にカードの利用枠を確保しますが、この時点では引き落とされません。`,
    `お試し期間が終了する${formatJaDate(due)}頃に ¥${args.price.toLocaleString('ja-JP')} を自動で決済します。`,
    `期間内にご返品いただければ請求は発生しません（確保した利用枠を解放します）。`,
    `返品のご連絡は support@felikko.com または LINE で承ります。`,
  ].join('\n');
};
