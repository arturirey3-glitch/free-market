# Merchant Center 商品情報・配送設定の修正

対象: felikko / Merchant Center 5777687759。2026-09-12に利用者の許可を受けて修正。

## 問題と変更

- フィードの商品カテゴリが親カテゴリ「インテリア」等に先に一致し、具体的な商品分類が失われていた。具体的なカテゴリを優先し、Googleの有効な数値IDを送る。リュック100、スマホケース2353、座布団・クッションカバー2927など。不明な分類を勝手に室内装飾品とせず省略する。
- 全商品にブランドfelikko、identifier_exists=noを固定送信していた。商品に登録されたブランド・有効なJAN/GTINを使う。未入力を識別コード不存在とみなさず、ブランドを商品名から推測しない。現時点の登録データはブランド・JANとも未入力のため、実物情報の確認・入力は引き続き必要。
- 商品ページの構造化データも、ブランド未入力時の「ノーブランド品」補完を取り除き、未確認情報の断定を避ける。
- Googleが受け付けない状態値like_newをusedへ修正。
- 商品DB取得に失敗したとき、空の正常フィードとして公開せずHTTP 503を返す。
- 座布団カバー7bdafb21の説明「商品の説明はありません」を、既存の商品名・サイズ55×59cm・新品未使用・発送2〜3日に基づく説明へ更新。素材等は追加していない。

## 配送

利用者回答: 発送後の到着3日、注文締め切りは特になし。

- Asia/Tokyo、23:59（当日の注文を終日受け付ける）
- 発送まで1〜3営業日（サイトの特商法ページに合わせる）
- 配送3営業日（既存の営業日設定は月〜土を維持）
- 送料・配送先は既存設定を維持

Merchant APIによる更新後、GETで上記値を確認。更新直後のGETは旧値だったため、時間を置いて再取得して確認した。

## 検証・運用

- node --test tests/shopping-feed.test.mjs: 3テスト成功（カテゴリ優先順、ブランド・GTIN、状態値）。
- npm run build: 成功。
- ソース公開後、公開フィードを確認し、Merchant Centerのデータソースを再取得する。
- Google側の警告解消・承認・表示実績は再処理後に確認する。順位や売上の改善は未判定。
- 変更前後のAPI結果・対象商品の変更前データはローカル C:/tiket_pia/merchant_analysis_20260912 に保存。認証情報はGitに含めない。

## 参照

- https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
- https://support.google.com/merchants/answer/6324351
- https://support.google.com/merchants/answer/6324478
- https://support.google.com/merchants/answer/6324469
- https://developers.google.com/merchant/api/reference/rest/accounts_v1/accounts.shippingSettings/insert
