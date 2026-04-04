import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 16; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

export const POST: APIRoute = async ({ request }) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    const body = await request.json();
    const { productId, email, accessToken } = body;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: '認証エラー' }), { status: 401, headers });
    }

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: '管理者のみ実行可能です' }), { status: 403, headers });
    }

    if (!productId) {
      return new Response(JSON.stringify({ error: 'productIdが必要です' }), { status: 400, headers });
    }

    const token = generateToken();
    const { data, error } = await supabase.from('review_tokens').insert({
      product_id: productId, token, email: email || null
    }).select().single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }

    const siteUrl = import.meta.env.SITE_URL || 'https://free-market.pages.dev';
    const shortId = productId.slice(0, 8);
    const reviewUrl = `${siteUrl}/products/${shortId}/review?token=${token}`;

    return new Response(JSON.stringify({ token, url: reviewUrl, expiresAt: data.expires_at }), { status: 200, headers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
