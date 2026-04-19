create extension if not exists "pgcrypto";

-- プロフィール
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  is_admin boolean not null default false,
  is_verified boolean not null default false,
  last_login_at timestamptz,
  sales_count integer not null default 0,
  rating numeric(2,1) default null,
  rating_count integer not null default 0,
  created_at timestamptz default now()
);

-- 商品
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  title text not null,
  description text not null,
  price integer not null,
  category text,
  status text not null default 'draft',
  thumbnail_url text,
  is_subscription boolean not null default false,
  delivery_time integer,
  purchase_notes text,
  condition text,
  shipping_payer text default '送料込み（出品者負担）',
  shipping_method text,
  shipping_duration text,
  shipping_from text,
  brand text,
  sku text,
  jan_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 商品画像
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  image_url text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- レビュー
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  reviewer_name text,
  reviewer_avatar_url text,
  reply text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- レビュートークン
create table if not exists review_tokens (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  token text not null unique,
  email text,
  used boolean not null default false,
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now()
);

-- updated_at トリガー
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_products_updated_at
before update on products
for each row execute function public.set_updated_at();

create trigger set_reviews_updated_at
before update on reviews
for each row execute function public.set_updated_at();

-- プロフィール評価の自動更新
create or replace function public.update_profile_rating()
returns trigger as $$
declare
  owner_uuid uuid;
  avg_rating numeric(2,1);
  total_count integer;
begin
  if TG_OP = 'DELETE' then
    select owner_id into owner_uuid from products where id = old.product_id;
  else
    select owner_id into owner_uuid from products where id = new.product_id;
  end if;

  select round(avg(r.rating)::numeric, 1), count(r.id)
  into avg_rating, total_count
  from reviews r
  inner join products p on p.id = r.product_id
  where p.owner_id = owner_uuid;

  update profiles
  set rating = avg_rating, rating_count = coalesce(total_count, 0)
  where id = owner_uuid;

  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create trigger update_profile_rating_on_insert
after insert on reviews for each row execute function public.update_profile_rating();
create trigger update_profile_rating_on_update
after update on reviews for each row execute function public.update_profile_rating();
create trigger update_profile_rating_on_delete
after delete on reviews for each row execute function public.update_profile_rating();

-- 新規ユーザー時プロフィール自動作成
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS
alter table profiles enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table reviews enable row level security;
alter table review_tokens enable row level security;

-- profiles
create policy "Profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);

-- products
create policy "Published products are viewable" on products for select
  using (status = 'published' or owner_id = auth.uid());
create policy "Users can insert their products" on products for insert
  with check (auth.uid() = owner_id);
create policy "Users can update their products" on products for update
  using (auth.uid() = owner_id);
create policy "Users can delete their products" on products for delete
  using (auth.uid() = owner_id);

-- product_images
create policy "Product images are viewable" on product_images for select
  using (exists (select 1 from products where products.id = product_images.product_id and (products.status = 'published' or products.owner_id = auth.uid())));
create policy "Users can insert product images" on product_images for insert
  with check (exists (select 1 from products where products.id = product_images.product_id and products.owner_id = auth.uid()));
create policy "Users can delete product images" on product_images for delete
  using (exists (select 1 from products where products.id = product_images.product_id and products.owner_id = auth.uid()));

-- reviews
create policy "Reviews are viewable" on reviews for select
  using (exists (select 1 from products where products.id = reviews.product_id and (products.status = 'published' or products.owner_id = auth.uid())));
create policy "Admins can insert reviews" on reviews for insert
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Admins can update reviews" on reviews for update
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Admins can delete reviews" on reviews for delete
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));

-- review_tokens
create policy "Review tokens are viewable by admins" on review_tokens for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Review tokens insertable by admins" on review_tokens for insert
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Review tokens updatable by anyone" on review_tokens for update using (true);
