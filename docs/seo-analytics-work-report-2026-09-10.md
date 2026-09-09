# felikko SEO・Google Analytics 対応記録

作成日：2026年9月10日（日本時間）

## 対象

- サイト：https://www.felikko.com/
- GitHub：`arturirey3-glitch/free-market`（main）
- 作業リポジトリ：`C:\tiket_pia\free-market-seo-watch`
- Search Console：`sc-domain:felikko.com`。集計は `www.felikko.com` に限定。
- Google Analytics 4：プロパティ `534557326`、既存のWebストリーム「felikko」
- 測定ID：`G-E9G8S2K27S`（公開情報。認証キーではありません）

## 実施した内容

### 1. Search Consoleへの接続とSEO Rank Watchの設定

共有フォルダーにある既存サービスアカウントの認証ファイルを使い、Search Console APIの実データ取得を確認しました。秘密鍵やトークンはリポジトリに保存していません。

以下の流れを実装しました。

1. 原則28日間の検索実績を取得し、履歴に追記する。
2. 改善の効果判定には7日間の実績を使用する。
3. 検索順位・表示回数などから改善候補を1キーワード選ぶ。
4. 検索意図と検索結果の情報を調べ、必要な改善を行う。
5. 公開を確認してから `observing` として記録し、7日間は再改善しない。
6. 観察期間と改善後の測定期間がそろってから、実測で効果を判断する。

候補がない場合は測定だけで終了します。順位履歴は追記専用です。順位1位を保証する仕組みではありません。`noindex`・URL構成・大きなページ構造の変更は自動適用の対象外です。

### 2. Google Analyticsへのサービスアカウント接続

- Google Analytics Data APIとAdmin APIを有効化しました。
- 同じサービスアカウントで対象プロパティのレポートを取得できることを確認しました。
- Admin APIで既存WebストリームのURLと測定IDを照合しました。
- 新しいAnalyticsプロパティやWebストリームは作成していません。
- 日次処理に閲覧数・流入元などのAnalytics集計を追加しました。

Analyticsはサイト内の利用状況を分析する補助データです。検索順位の判断はSearch Consoleを基準にします。購入イベント数はStripeで確認した実注文数とは区別します。

### 3. 本番サイトの計測タグ修正

修正前の本番HTMLにはGoogle Analyticsの計測タグが出力されていませんでした。

`src/layouts/BaseLayout.astro` を変更し、Cloudflareの実行時設定・ビルド時設定・確認済みの公開測定IDからタグを出力するようにしました。静的生成されるページでも、ビルド時の環境変数がないためにタグが欠落しないようにしています。Cloudflare本番の測定ID設定も確認済みの値に合わせました。

GitHub経由で本番へ公開しました。認証キーにワークフロー編集権限がなかったため、最終的な変更では既存のデプロイ用ワークフローを変更していません。

### 4. 自動処理のGit認証を調整

日次処理の確認中にGitのアカウント選択画面で待機する問題があったため、このリポジトリで使うアカウントを指定し、既存の認証情報を資格情報管理へ保存しました。自動実行では対話画面を出さない設定にしています。

また、Gitへの送信に失敗しても測定結果を確認できるよう、送信前にローカルレポートを保存するようにしました。修正後は、測定・Analytics取得・GitHubへの履歴反映まで正常終了しました。

## 確認結果

| 確認項目 | 結果 |
| --- | --- |
| Search Console API | 実データ取得成功 |
| Analytics Data API | 対象プロパティのレポート取得成功 |
| 自動処理のテスト | 11件成功 |
| サイトのビルド | 成功 |
| GitHub Actionsによる本番公開 | 成功 |
| 本番 `/`・`/products`・`/about` | HTTP 200、正しい測定IDのタグが各1つ |
| ブラウザでのイベント生成 | 正しい測定IDの `page_view` と `scroll` を確認 |
| 日次処理の手動検証 | 2026年9月10日 02:00:40 JSTに正常終了 |

ブラウザテストでは集計への混入を避けるため、Googleへのイベント送信を直前で遮断しました。イベント生成までの確認であり、そのテストイベントがGoogle側で受信・集計されたことを確認したものではありません。

### 初回の測定内容

対象期間：2026年8月10日〜9月6日。

- Search Console：表示25回、クリック3回、平均掲載順位6.36。
- この順位は対象サイトの集計値であり、特定キーワードの順位ではありません。
- 選定可能なキーワード候補がなかったため、SEO目的の文章変更は行っていません。
- `observing` 中のキーワード、今回の効果判定、次回レビュー対象はいずれもありません。
- Analyticsは正常応答でしたが、期間内のデータ行は返りませんでした。訪問・売上がゼロだったとは断定していません。
- 計測タグ修正は検索順位の改善実績とは分けて記録しました。未計測だった過去のアクセスを今回の修正で復元することはできません。

## 自動実行と稼働条件

- Windowsタスク名：`Felikko-SEO-Rank-Watch`
- 実行予定：毎日09:10（日本時間）
- Windowsタスクからの初回実行：2026年9月10日01:43:26、終了コード0。
- Analytics追加後の全体確認：同日02:00:40に手動実行で成功。
- PCが起動し、対象ユーザーがログインしている必要があります。
- 認証ファイルの共有フォルダー、Google API、GitHubへの接続が必要です。
- AIによる改善にはCodexのログイン状態と利用枠も必要です。

候補を選んでAIが文章を変更・公開する分岐は、今回は候補がなかったため実運用では未検証です。

## 保存先

リポジトリ内のパスは次のとおりです。

| パス | 内容 |
| --- | --- |
| `.claude/skills/seo-rank-watch/SKILL.md` | 運用ルール |
| `.claude/skills/seo-rank-watch/scripts/` | GSC・GA取得、候補選定、日次処理、テスト |
| `data/seo/config.json` | 対象サイト・集計設定 |
| `data/seo/watchwords.json` | 監視キーワード |
| `data/seo/rank-history.json` | 検索順位の履歴（追記専用） |
| `data/seo/improvement-log.json` | キーワード改善・レビュー履歴 |
| `data/seo/analytics-history.json` | Analytics集計履歴 |
| `data/seo/technical-improvements.json` | 計測タグ修正などの技術対応履歴 |
| `.seo-runtime/` | 実行レポート・ログ（Git対象外） |

PC側の実行設定：`C:\Users\rpa_admin\.codex\seo-rank-watch\runner.json`。認証ファイルの参照先はこの外部設定で管理しています。本書には秘密鍵・トークン・認証ファイル本文を記載していません。

## 公開・変更の証跡

- 計測タグ・GA接続の変更：`644ce0fbe4901dd96cb1dcb48ed66f29c32693ab`
- [成功したGitHub Actions](https://github.com/arturirey3-glitch/free-market/actions/runs/34379883772)
- Cloudflare本番デプロイID：`6267678d-c3f5-4f77-b155-ba18cc1eb2ad`
- 公開確認と自動Git処理の調整：`5ed1e43`
- 最終確認時の測定履歴コミット：`5129eb0`

## 費用

[Google Analytics標準版](https://marketingplatform.google.com/about/analytics/)と[Search Console](https://support.google.com/webmasters/answer/9128668?hl=ja)は無料です。今回、新しい有料契約は追加していません。

自動改善で使うCodexの契約・利用枠、既存のCloudflareやドメイン等の運営費、PCの稼働費用は別です。今回の接続作業をもって、運用全体の費用がゼロになるという意味ではありません。
