-- review_tokens テーブルの RLS ポリシー設定
alter table review_tokens enable row level security;

-- サーバーサイド（anon）でのトークン検証を許可
drop policy if exists "public_read_review_tokens" on review_tokens;
create policy "public_read_review_tokens" on review_tokens
  for select using (true);

-- 管理者のみトークン発行を許可
drop policy if exists "admin_insert_review_tokens" on review_tokens;
create policy "admin_insert_review_tokens" on review_tokens
  for insert
  with check (
    exists (
      select 1 from profiles where id = auth.uid() and is_admin = true
    )
  );

-- レビュー投稿時に使用済みマークを許可（クライアントサイド）
drop policy if exists "public_update_review_tokens" on review_tokens;
create policy "public_update_review_tokens" on review_tokens
  for update using (true);
