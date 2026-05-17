-- 管理者がコメントを削除できるポリシー（API側でadmin検証を行う）
create policy "anyone can delete comments"
  on product_comments for delete using (true);
