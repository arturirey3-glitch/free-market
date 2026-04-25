# felikko.com キー・設定リファレンス

最終更新: 2026-04-25

---

## Cloudflare Pages

| 項目 | 値 |
|------|-----|
| プロジェクト名 | `free-market` |
| 本番URL | `https://www.felikko.com` |
| Pages URL | `https://free-market.pages.dev` |
| アカウントID | `024a2968eda48c6eaea6d761c59eaa72` |
| アカウント | `Arturirey3@gmail.com` |

---

## GitHub

| 項目 | 値 |
|------|-----|
| リポジトリ | `https://github.com/arturirey3-glitch/free-market` |
| デプロイブランチ | `main` |
| CI/CD | GitHub Actions（`.github/workflows/deploy.yml`） |

---

## Supabase

| 項目 | 値 |
|------|-----|
| Project URL | `https://fuqehluhomxwbgpdegex.supabase.co` |
| Anon Key | `sb_publishable_flRqeY1rOp8JOyX4YQndVg_UJgdnWlE` |

---

## Stripe

| 項目 | 値 |
|------|-----|
| Secret Key | `sk_test_51TIM67AMbW7umZKJ...`（本番前に要変更） |
| Webhook Secret | `whsec_7dc66b10ebfd33ed...` |
| モード | テストモード（`sk_test_`） |

> ⚠️ 本番公開前に `sk_live_` キーに変更すること

---

## Google Analytics 4（GA4）

| 項目 | 値 |
|------|-----|
| Measurement ID | `G-E9G8S2K27S` |
| アカウント | `Arturirey3@gmail.com` |
| 管理画面 | https://analytics.google.com |
| 設定方法 | `BaseLayout.astro` に gtag スクリプト埋め込み済み |
| 環境変数 | `GA_MEASUREMENT_ID=G-E9G8S2K27S` |

---

## Google Search Console

| 項目 | 値 |
|------|-----|
| プロパティ | `https://www.felikko.com/` |
| サイトマップ登録 | `https://www.felikko.com/sitemap.xml` ✅ |
| 管理画面 | https://search.google.com/search-console |
| アカウント | `Arturirey3@gmail.com` |

---

## SEO 設定ファイル

| ファイル | 内容 |
|----------|------|
| `public/robots.txt` | クロール許可・拒否設定 |
| `src/pages/sitemap.xml.ts` | 動的サイトマップ（公開商品を自動取得） |
| `src/layouts/BaseLayout.astro` | canonical URL・OGタグ・GA4・JSON-LD prop |
| `src/pages/products/[id].astro` | 商品ページ JSON-LD（Product・AggregateRating・BreadcrumbList） |
| `src/pages/api/indexnow.ts` | IndexNow API エンドポイント |
| `public/e0ddcb9227cd44f1a877926bb1db4a06.txt` | IndexNow 認証キー |

---

## IndexNow（Bing自動通知）

| 項目 | 値 |
|------|-----|
| APIキー | `e0ddcb9227cd44f1a877926bb1db4a06` |
| キーファイルURL | `https://www.felikko.com/e0ddcb9227cd44f1a877926bb1db4a06.txt` |
| 通知エンドポイント | `https://api.indexnow.org/indexnow` |
| 自動通知タイミング | デプロイ時・商品出品時 |

---

## メール送信（Resend）

| 項目 | 値 |
|------|-----|
| API Key | `re_Fowu7mbd_56UNLchFSXVacR4FdzJZBUy8` |
| 送信元 | `felikko <noreply@felikko.com>` |

---

## LINE

| 項目 | 値 |
|------|-----|
| LINE公式アカウントURL | `https://lin.ee/t47Nzid` |
| QRコード生成 | `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https%3A%2F%2Flin.ee%2Ft47Nzid` |

---

## GitHub Actions シークレット（要設定）

Cloudflare Pages → Settings → Environment Variables にも同じものを設定

| シークレット名 | 説明 |
|---------------|------|
| `PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `STRIPE_SECRET_KEY` | Stripe Secret Key |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `GA_MEASUREMENT_ID` | GA4 Measurement ID |

---

## SEO 対応状況（2026-04-25 完了）

- [x] `robots.txt` 設置
- [x] `sitemap.xml` 動的生成・Search Console登録
- [x] canonical URL 設定
- [x] OGタグ（og:title / og:description / og:image）
- [x] GA4 設置（`G-E9G8S2K27S`）
- [x] Google Search Console 登録
- [x] JSON-LD 構造化データ（Product / AggregateRating / BreadcrumbList）
- [x] IndexNow 自動通知（デプロイ時・出品時）
- [ ] Google Indexing API（将来対応）
- [ ] 画像 alt 属性の充実
