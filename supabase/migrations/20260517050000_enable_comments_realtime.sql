-- product_comments テーブルの Realtime を有効化
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'product_comments'
  ) then
    alter publication supabase_realtime add table product_comments;
  end if;
end $$;
