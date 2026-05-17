import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabaseServer';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const productId = url.searchParams.get('product_id');
  if (!productId) {
    return new Response(JSON.stringify({ error: 'product_id required' }), { status: 400 });
  }

  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase
      .from('product_comments')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return new Response(JSON.stringify({ comments: data ?? [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { product_id, product_title, product_url, name, message, access_token } = body;
    const displayName = name?.trim() || '匿名';

    if (!product_id || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'product_id and message are required' }), { status: 400 });
    }

    const supabase = createSupabaseServer();

    // ログイン済みユーザーの場合、管理者判定と user_id 取得
    let isAdmin = false;
    let userId: string | null = null;
    if (access_token) {
      const { data: { user } } = await supabase.auth.getUser(access_token);
      if (user) {
        userId = user.id;
        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
        isAdmin = profile?.is_admin ?? false;
      }
    }

    // Save comment to Supabase
    const { data, error } = await supabase
      .from('product_comments')
      .insert({
        product_id,
        name: displayName.slice(0, 50),
        message: message.trim().slice(0, 500),
        is_admin: isAdmin,
        ...(userId ? { user_id: userId } : {}),
      })
      .select()
      .single();

    if (error) throw error;

    // Send Discord notification
    const webhookUrl = import.meta.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const discordPayload = {
        embeds: [
          {
            title: '💬 商品へのコメントが届きました',
            color: 0x07b53b,
            fields: [
              { name: '商品名', value: product_title ?? '不明', inline: false },
              { name: '投稿者', value: displayName, inline: true },
              { name: 'コメント', value: message.trim().slice(0, 500), inline: false },
            ],
            footer: { text: 'felikko コメント通知' },
            timestamp: new Date().toISOString(),
            ...(product_url ? { url: product_url } : {}),
          },
        ],
        ...(product_url ? { content: `🔗 ${product_url}` } : {}),
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload),
      }).catch(() => {}); // Discord失敗しても続行
    }

    return new Response(JSON.stringify({ comment: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { comment_id, access_token } = await request.json();
    if (!comment_id || !access_token) {
      return new Response(JSON.stringify({ error: 'comment_id and access_token required' }), { status: 400 });
    }

    const supabase = createSupabaseServer();

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser(access_token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const { error } = await supabase.from('product_comments').delete().eq('id', comment_id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};
