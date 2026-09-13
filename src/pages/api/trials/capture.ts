import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../../lib/supabaseServer';
import { AUTH_HOLD_DAYS, addDays } from '../../../lib/trial';

export const prerender = false;

/** 1回の実行で処理する上限。Workers の実行時間に収める。 */
const BATCH = 50;
/** 何回失敗したら諦めて手動対応に回すか。 */
const MAX_ATTEMPTS = 4;

/**
 * お試し期間が終わった注文をキャプチャーして入金を確定する。
 *
 * Cloudflare の Cron Trigger から毎日叩く。CRON_SECRET を Bearer で要求するので
 * 外部から実行されても勝手にキャプチャーされることはない。
 */
const handle = async (request: Request, locals: any) => {
  const env = (locals as any).runtime?.env || {};
  const headers = { 'Content-Type': 'application/json' };

  const secret = env.CRON_SECRET || import.meta.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
  }

  const stripeSecretKey = env.STRIPE_SECRET_KEY || import.meta.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY missing' }), { status: 500, headers });
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeSecretKey);
  const db = createSupabaseServer();
  const now = new Date();

  const { data: due, error } = await db
    .from('trial_orders')
    .select('*')
    .eq('status', 'trialing')
    .lte('capture_due_at', now.toISOString())
    .lt('capture_attempts', MAX_ATTEMPTS)
    .order('capture_due_at', { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }

  const result = { checked: due?.length ?? 0, captured: 0, released: 0, expired: 0, failed: 0 };

  for (const order of due ?? []) {
    const attempts = (order.capture_attempts ?? 0) + 1;
    try {
      if (!order.payment_intent_id) throw new Error('payment_intent_id が未記録');

      const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);

      // すでに確定済み / キャンセル済みなら Stripe 側の状態に合わせる
      if (pi.status === 'succeeded') {
        await db.from('trial_orders').update({
          status: 'captured', captured_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', order.id);
        result.captured++;
        continue;
      }
      if (pi.status === 'canceled') {
        await db.from('trial_orders').update({
          status: 'released', released_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', order.id);
        result.released++;
        continue;
      }
      if (pi.status !== 'requires_capture') {
        throw new Error(`キャプチャーできない状態: ${pi.status}`);
      }

      // オーソリ期限を過ぎていれば枠は解放済み。請求できないので expired として手動回収に回す。
      const holdExpiresAt = addDays(new Date(order.purchased_at), AUTH_HOLD_DAYS);
      if (now > holdExpiresAt) {
        await db.from('trial_orders').update({
          status: 'expired', capture_attempts: attempts,
          last_error: 'オーソリ有効期限切れ。手動での請求が必要',
          updated_at: new Date().toISOString(),
        }).eq('id', order.id);
        result.expired++;
        continue;
      }

      await stripe.paymentIntents.capture(order.payment_intent_id);
      await db.from('trial_orders').update({
        status: 'captured', captured_at: new Date().toISOString(),
        capture_attempts: attempts, last_error: null, updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      result.captured++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from('trial_orders').update({
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'trialing',
        capture_attempts: attempts, last_error: message, updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      result.failed++;
      console.error('[trials/capture]', order.checkout_session_id, message);
    }
  }

  return new Response(JSON.stringify(result), { status: 200, headers });
};

export const POST: APIRoute = ({ request, locals }) => handle(request, locals);
export const GET: APIRoute = ({ request, locals }) => handle(request, locals);
