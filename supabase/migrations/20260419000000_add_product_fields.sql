alter table products
  add column if not exists condition text,
  add column if not exists shipping_payer text default '送料込み（出品者負担）',
  add column if not exists shipping_method text,
  add column if not exists shipping_duration text,
  add column if not exists shipping_from text,
  add column if not exists brand text,
  add column if not exists sku text,
  add column if not exists jan_code text;
