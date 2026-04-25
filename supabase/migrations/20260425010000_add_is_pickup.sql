alter table products add column if not exists is_pickup boolean not null default false;

create index if not exists idx_products_is_pickup on products(is_pickup) where is_pickup = true;
