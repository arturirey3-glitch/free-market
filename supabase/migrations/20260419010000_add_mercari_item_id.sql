alter table products
  add column if not exists mercari_item_id text;

create index if not exists products_mercari_item_id_idx on products(mercari_item_id);
