import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

/**
 * 返品を受け付けたお試し注文の与信を解放する（請求せずに終わらせる）。
 *
 * まだキャプチャーしていないので「返金」ではなく PaymentIntent のキャンセル。
 * 返金手数料もかからず、チャージバックの対象にもならない。
 *
 * 出品者本人（ログイン中のオーナー）だけが実行できる。
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const headers = { 'Content-Type': 'application/json' };
  const env = (locals as any).runtime?.env || {};

  try {
    const { orderId, accessToken } = await request.json() as {
      orderId?: string; accessToken?: string;
    };
    if (!orderId || !accessToken) {
      return new Response(JSON.stringify({ error: 'パラメータが不足しています' }), { status: 400, headers });
    }

    // ── 呼び出し元がログイン済みのユーザーか確認する ──
    const supabaseUrl = env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await anon.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });
    }

    const db = createSupabaseAdmin(env);
    const { data: order } = await db.from('trial_orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) {
      return new Response(JSON.stringify({ error: '注文が見つかりません' }), { status: 404, headers });
    }

    // その商品の出品者本人かどうか
    const { data: product } = await db
      .from('products').select('owner_id').eq('id', order.product_id).maybeSingle();
    if (!product || product.owner_id !== userId) {
      return new Response(JSON.stringify({ error: 'この注文を操作する権限がありません' }), { status: 403, headers });
    }

    if (order.status === 'captured') {
      return new Response(JSON.stringify({
        error: 'すでに決済が確定しています。この注文は返金処理が必要です',
      }), { status: 409, headers });
    }
    if (order.status === 'released') {
      return new Response(JSON.stringify({ ok: true, alreadyReleased: true }), { status: 200, headers });
    }

    const stripeSecretKey = env.STRIPE_SECRET_KEY || import.meta.env.STRIPE_SECRET_KEY;
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey);

    if (order.payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);
      if (pi.status === 'requires_capture') {
        await stripe.paymentIntents.cancel(order.payment_intent_id);
      } else if (pi.status === 'succeeded') {
        return new Response(JSON.stringify({
          error: 'すでに決済が確定しています。この注文は返金処理が必要です',
        }), { status: 409, headers });
      }
    }

    await db.from('trial_orders').update({
      status: 'released', released_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', orderId);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
