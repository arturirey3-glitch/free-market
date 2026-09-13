-- 7日間無料お試し（与信確保 → お届け後7日で自動キャプチャー）
--
-- 仕組み:
--   購入時は Stripe の manual capture でカード枠を押さえるだけで請求しない。
--   お届け予定日 + trial_days を過ぎたら cron がキャプチャーして入金確定。
--   期間中に返品されたらキャプチャーせず PaymentIntent をキャンセル（＝返金ではなく保留の解放）。
--
-- 日本の Stripe アカウントは JPY のカード決済を最長30日保留できるため、
-- 「配送3〜4日 + お試し7日 ≒ 11日」でも余裕を持って間に合う。
-- ただし American Express は30日の対象外（7日で失効）なので checkout 側で除外する。

alter table products
  add column if not exists trial_enabled boolean not null default false,
  add column if not exists trial_days integer not null default 7;

alter table products
  add constraint products_trial_days_range
  check (trial_days between 1 and 20) not valid;

-- お試し注文。Stripe を正とし、こちらは進行状況の台帳として持つ。
create table if not exists trial_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  product_title text not null,
  -- Stripe 側の識別子
  checkout_session_id text not null unique,
  payment_intent_id text,
  customer_email text,
  customer_name text,
  amount integer not null,
  quantity integer not null default 1,
  -- 期間
  purchased_at timestamptz not null default now(),
  delivery_days integer not null default 3,
  trial_days integer not null default 7,
  capture_due_at timestamptz not null,
  -- trialing: お試し中 / captured: 課金済み / released: 返品で解放 / failed: キャプチャー失敗 / expired: オーソリ失効
  status text not null default 'trialing',
  capture_attempts integer not null default 0,
  last_error text,
  captured_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trial_orders_due_idx
  on trial_orders (capture_due_at) where status = 'trialing';
create index if not exists trial_orders_email_idx on trial_orders (customer_email);
create index if not exists trial_orders_product_idx on trial_orders (product_id);

alter table trial_orders enable row level security;

-- 購入者の氏名・メールを含むため、参照は service role のみに限定する。
-- （anon キーからは一切読めない。API 経由でのみ扱う）
drop policy if exists "service_role_all_trial_orders" on trial_orders;
create policy "service_role_all_trial_orders" on trial_orders
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
