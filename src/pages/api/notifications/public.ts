import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../../lib/supabaseServer';

export const prerender = false;

// 認証不要・product_ids を受け取ってその商品への管理者コメントを返す
export const GET: APIRoute = async ({ url }) => {
  const idsParam = url.searchParams.get('product_ids');
  if (!idsParam) {
    return new Response(JSON.stringify({ notifications: [] }), { status: 200 });
  }

  const productIds = idsParam.split(',').filter(Boolean).slice(0, 20); // 最大20件
  if (productIds.length === 0) {
    return new Response(JSON.stringify({ notifications: [] }), { status: 200 });
  }

  try {
    const supabase = createSupabaseServer();

    const { data: adminReplies, error } = await supabase
      .from('product_comments')
      .select('id, message, created_at, product_id, products!inner(title)')
      .eq('is_admin', true)
      .in('product_id', productIds)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    const notifications = (adminReplies ?? []).map((r: any) => ({
      id: r.id,
      type: 'reply',
      message: r.message,
      product_id: r.product_id,
      product_title: (r.products as any)?.title ?? '',
      created_at: r.created_at,
    }));

    return new Response(JSON.stringify({ notifications }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};
