create or replace function decrement_product_likes(pid uuid)
returns int language sql security definer as $$
  update products
  set likes_count = greatest(0, likes_count - 1)
  where id = pid
  returning likes_count;
$$;
