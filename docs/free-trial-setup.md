# 無料お試し（与信確保 → 自動決済）セットアップ

商品ごとに「無料お試し」を有効にすると、購入時は請求せずカードの利用枠だけを確保し、
お届け後の一定期間が過ぎたら自動で決済する。期間内に返品されたら請求せずに枠を解放する。

## 仕組み

```
購入 ──お届け日数──→ 到着 ──お試し期間──→ 自動キャプチャー（入金確定）
 │                                         ▲
 └ 与信確保（請求なし）                     └ 返品時はここまでに解放 = 請求ゼロ
```

- 課金日 = `購入日 + products.delivery_time + products.trial_days`
- 日本の Stripe アカウントは JPY のカード決済を**最長30日**保留できるため、
  「配送3〜4日 + お試し7日 ≒ 11日」でも余裕がある（`src/lib/trial.ts` の `AUTH_HOLD_DAYS`）
- **American Express は30日の対象外**（7日で失効）なので、お試し購入では
  `payment_method_options[card][restrictions][brands_blocked]` でブロックしている
- **コンビニ払いは使えない**。与信確保の仕組みがなく、後から自動で引き落とせないため
  お試し時は `payment_method_types: ['card']` に限定している

## 運用側の操作

| 画面 | できること |
|---|---|
| `/dashboard/products/` | 商品を複数選択して「お試しを有効化 / 無効化」。日数も指定できる |
| `/dashboard/products/[id]` | 商品ごとに「無料お試しを有効にする」＋お試し日数 |

サブスク商品とデジタル商品は対象外（チェックボックスが無効になる）。

## 必要な環境変数

Cloudflare Pages の設定に **`CRON_SECRET`** を追加する（推測されない十分長い文字列）。
既存の `STRIPE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `PUBLIC_SUPABASE_URL` /
`PUBLIC_SUPABASE_ANON_KEY` も必要。

```sh
openssl rand -hex 32   # CRON_SECRET の生成例
```

## 自動キャプチャーの定期実行

**Cloudflare Pages は Cron Triggers に対応していない**ため、既に SEO Rank Watch を
毎日09:10に動かしている RPA サーバー（AWS EC2 / `rpa_admin`）のタスクスケジューラから叩く。

エンドポイント: `POST https://www.felikko.com/api/trials/capture`

**`Content-Type: application/json` を必ず付ける。** 付けないと Astro の CSRF 保護
（`security.checkOrigin`）がフォーム送信とみなして 403 `Cross-site POST form submissions
are forbidden` を返す。本番で実測済み。

```bat
schtasks /create /tn "felikko-trial-capture" /sc daily /st 09:20 /ru rpa_admin ^
  /tr "curl -s -X POST https://www.felikko.com/api/trials/capture -H \"Content-Type: application/json\" -H \"Authorization: Bearer <CRON_SECRET>\" -d \"{}\""
```

疎通確認だけなら GET でもよい（同じ処理が動くので、本番では空振り時のみに使うこと）。

```sh
curl -s https://www.felikko.com/api/trials/capture -H "Authorization: Bearer <CRON_SECRET>"
```

- 1回の実行で最大50件処理する（`BATCH`）
- 失敗した注文は翌日リトライし、4回失敗したら `failed` にして手動対応に回す
- 応答例: `{"checked":3,"captured":2,"released":0,"expired":0,"failed":1}`

実行が数日止まってもオーソリは30日持つので即座に取りはぐれることはないが、
`expired` が出たら請求できていないので Stripe ダッシュボードで確認すること。

## 返品を受けたとき

`POST /api/trials/release` に `{ orderId, accessToken }` を渡すと与信を解放する。
**まだキャプチャーしていないので「返金」ではなく PaymentIntent のキャンセル**になり、
返金手数料もチャージバックのリスクもない。出品者本人のみ実行できる。

すでに `captured` の注文は 409 を返す（通常の返金処理が必要）。

## trial_orders のステータス

| status | 意味 |
|---|---|
| `trialing` | お試し中。キャプチャー待ち |
| `captured` | 決済確定。入金済み |
| `released` | 返品を受けて与信を解放。請求なし |
| `failed` | キャプチャーに4回失敗。手動対応が必要 |
| `expired` | オーソリ失効。**請求できていない**ので要確認 |

## 法令対応（必須・未完了）

改正特商法の定期購入規制により、**購入前の最終確認画面で「無料期間・その後の金額・
課金日・解約（返品）方法」を明示する義務**がある。Checkout の `custom_text.submit` に
入れてあるが、**商品ページ側の表示と特商法ページの返品特約の書き換えが未対応**。

現在の特商法表記は「使用済み・開封済みの商品の返品・交換はお受けできません」となっており、
**お試し（＝使用してから返品）と矛盾する**。運用開始前に必ず改訂すること。
