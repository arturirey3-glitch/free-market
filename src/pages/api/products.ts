import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabaseServer';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = parseInt(url.searchParams.get('limit') ?? '24', 10);

  try {
    const supabase = createSupabaseServer();

    const { data, error } = await supabase
      .from('products')
      .select('id,title,price,thumbnail_url,is_pickup')
      .eq('status', 'published')
      .eq('is_pickup', false)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // レビュー集計
    const ids = (data ?? []).map((p) => p.id);
    let ratingMap: Record<string, { count: number; sum: number }> = {};
    if (ids.length > 0) {
      const { data: revRows } = await supabase
        .from('reviews')
        .select('product_id,rating')
        .in('product_id', ids);
      (revRows ?? []).forEach((r) => {
        if (!r.product_id || r.rating == null) return;
        const c = ratingMap[r.product_id] ?? { count: 0, sum: 0 };
        c.count += 1;
        c.sum += r.rating;
        ratingMap[r.product_id] = c;
      });
    }

    const products = (data ?? []).map((p) => {
      const s = ratingMap[p.id];
      return {
        ...p,
        review_count: s?.count ?? 0,
        review_average: s && s.count > 0 ? s.sum / s.count : 0,
      };
    });

    // 次ページがあるか確認
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('is_pickup', false);

    const hasMore = offset + limit < (count ?? 0);

    return new Response(JSON.stringify({ products, hasMore, total: count }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};
