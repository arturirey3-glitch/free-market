import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabaseServer';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { product_id } = await request.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: 'product_id required' }), { status: 400 });
    }

    const supabase = createSupabaseServer();
    const { data, error } = await supabase.rpc('increment_product_likes', { pid: product_id });

    if (error) throw error;

    return new Response(JSON.stringify({ likes_count: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};
