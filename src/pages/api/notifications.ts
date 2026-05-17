import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabaseServer';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const access_token = request.headers.get('x-access-token');
  if (!access_token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const supabase = createSupabaseServer();

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser(access_token);
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    // Get recent comments on admin's products
    const { data: comments, error } = await supabase
      .from('product_comments')
      .select('id, message, created_at, is_admin, product_id, products!inner(title, owner_id)')
      .eq('products.owner_id', user.id)
      .eq('is_admin', false)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    const notifications = (comments ?? []).map((c: any) => ({
      id: c.id,
      type: 'comment',
      message: c.message,
      product_id: c.product_id,
      product_title: c.products?.title ?? '',
      created_at: c.created_at,
    }));

    return new Response(JSON.stringify({ notifications }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};
