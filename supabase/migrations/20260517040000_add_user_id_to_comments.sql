-- product_comments に user_id カラムを追加（ログイン済みユーザーのコメント紐付け用）
alter table product_comments
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- user_id へのインデックス（通知取得クエリ高速化）
create index if not exists product_comments_user_id_idx on product_comments(user_id);
