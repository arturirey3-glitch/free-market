import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../../lib/supabaseServer';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const access_token = request.headers.get('x-access-token');
  if (!access_token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const supabase = createSupabaseServer();

    // ログイン確認
    const { data: { user } } = await supabase.auth.getUser(access_token);
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    // user_id でコメントした商品を取得
    const { data: myComments } = await supabase
      .from('product_comments')
      .select('product_id, created_at')
      .eq('user_id', user.id)
      .eq('is_admin', false)
      .order('created_at', { ascending: false });

    const productIds = [...new Set((myComments ?? []).map((c: any) => c.product_id))];

    if (productIds.length === 0) {
      return new Response(JSON.stringify({ notifications: [] }), { status: 200 });
    }

    // それらの商品への管理者返信を取得
    const { data: adminReplies, error } = await supabase
      .from('product_comments')
      .select('id, message, created_at, product_id, products!inner(title)')
      .eq('is_admin', true)
      .in('product_id', productIds)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    // 自分の最終コメント時刻より後の返信のみ通知対象
    const myLastByProduct: Record<string, string> = {};
    (myComments ?? []).forEach((c: any) => {
      if (!myLastByProduct[c.product_id] || c.created_at > myLastByProduct[c.product_id]) {
        myLastByProduct[c.product_id] = c.created_at;
      }
    });

    const notifications = (adminReplies ?? [])
      .filter((r: any) => {
        const myLast = myLastByProduct[r.product_id];
        return myLast && r.created_at > myLast;
      })
      .map((r: any) => ({
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
