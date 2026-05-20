-- デジタルコンテンツ対応カラム追加
alter table products
  add column if not exists product_type text default 'physical',
  add column if not exists catch_copy text,
  add column if not exists faq text;
