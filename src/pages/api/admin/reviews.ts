import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    const body = await request.json();
    const { accessToken, reviews } = body;

    // 認証確認
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: '認証エラー' }), { status: 401, headers });
    }

    // 管理者確認
    const { data: profile } = await anonClient.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: '管理者のみ実行可能です' }), { status: 403, headers });
    }

    if (!Array.isArray(reviews) || reviews.length === 0) {
      return new Response(JSON.stringify({ error: 'reviewsは配列で指定してください' }), { status: 400, headers });
    }

    // サービスロールキーで挿入（created_at を任意日時で設定可能）
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const rows = reviews.map((r: any) => ({
      product_id: r.product_id,
      rating: Number(r.rating),
      reviewer_name: r.reviewer_name || null,
      title: r.title || null,
      body: r.body || null,
      reply: r.reply || null,
      reviewer_avatar_url: r.reviewer_avatar_url || null,
      ...(r.created_at ? { created_at: r.created_at } : {}),
    }));

    const { data, error } = await adminClient.from('reviews').insert(rows).select('id, product_id, reviewer_name, created_at');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true, inserted: data?.length ?? 0, data }), { status: 200, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
