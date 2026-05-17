-- products テーブルにいいね数カラム追加
alter table products add column if not exists likes_count int default 0;

-- セキュリティデファイナーでいいねをインクリメントするRPC関数
create or replace function increment_product_likes(pid uuid)
returns int
language sql
security definer
as $$
  update products set likes_count = likes_count + 1 where id = pid returning likes_count;
$$;
