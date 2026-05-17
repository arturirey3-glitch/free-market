-- product_comments テーブル（商品コメント機能）
create table if not exists product_comments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  name text not null,
  message text not null,
  is_admin boolean default false,
  created_at timestamptz default now()
);

alter table product_comments enable row level security;

-- 全員が読める
create policy "anyone can read comments"
  on product_comments for select using (true);

-- 全員が投稿できる（ログイン不要）
create policy "anyone can insert comments"
  on product_comments for insert with check (true);
