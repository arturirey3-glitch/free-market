import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabaseServer';
import {
  computeCaptureDueAt, clampTrialDays, clampDeliveryDays, formatJaDate,
} from '../../lib/trial';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const runtime = (locals as any).runtime;
    const env = runtime?.env || {};
    const stripeSecretKey = env.STRIPE_SECRET_KEY || import.meta.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not configured' }), { status: 500, headers });
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey);

    const body = await request.json();
    const { productId, productTitle, price, mode, sellerName, thumbnailUrl, stock } = body;

    if (!productId || !productTitle || !price) {
      return new Response(JSON.stringify({ error: '必須パラメータが不足しています' }), { status: 400, headers });
    }

    const siteUrl = new URL(request.url).origin;
    const isSubscription = mode === 'subscription';
    const shortId = productId.slice(0, 8);
    const maxQty = stock != null ? Math.min(Number(stock), 10) : 10;

    // ── 無料お試しの可否は DB を正とする ──────────────────────────
    // クライアントから渡されたフラグは信用しない（勝手に「お試し」にされると請求できなくなる）。
    let trial: { days: number; deliveryDays: number; dueAt: Date } | null = null;
    if (!isSubscription) {
      try {
        const db = createSupabaseServer(env);
        const { data: p } = await db
          .from('products')
          .select('trial_enabled,trial_days,delivery_time')
          .eq('id', productId)
          .maybeSingle();
        if (p?.trial_enabled) {
          const days = clampTrialDays(p.trial_days);
          const deliveryDays = clampDeliveryDays(p.delivery_time);
          trial = { days, deliveryDays, dueAt: computeCaptureDueAt(new Date(), deliveryDays, days) };
        }
      } catch {
        // DB を引けないときはお試しを付けずに通常購入として通す（取りはぐれるより安全）
        trial = null;
      }
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: {
            name: productTitle,
            ...(thumbnailUrl ? { images: [thumbnailUrl] } : {}),
          },
          unit_amount: price,
          ...(isSubscription ? { recurring: { interval: 'month' } } : {})
        },
        quantity: 1,
        ...(!isSubscription ? {
          adjustable_quantity: {
            enabled: true,
            minimum: 1,
            maximum: maxQty,
          }
        } : {})
      }],
      mode: isSubscription ? 'subscription' : 'payment',
      locale: 'ja',
      phone_number_collection: { enabled: false },
      shipping_address_collection: { allowed_countries: ['JP'] },
      // ── 無料お試し: 与信だけ確保し、お届け後に cron がキャプチャーする ──
      ...(trial ? {
        // コンビニ等は与信確保ができないためカードに限定する。
        payment_method_types: ['card'] as const,
        payment_method_options: {
          card: {
            // Amex は日本の30日オーソリの対象外（7日で失効）なのでお試しでは使わせない。
            restrictions: { brands_blocked: ['american_express'] },
          },
        },
        payment_intent_data: {
          capture_method: 'manual' as const,
          description: `${productTitle}（${trial.days}日間無料お試し）`,
        },
        custom_text: {
          submit: {
            message:
              `いまは請求されません。カードの利用枠を確保するだけです。`
              + `商品到着後${trial.days}日間はお試しいただけます。`
              + `${formatJaDate(trial.dueAt)}頃に自動で決済されます。`
              + `それまでにご返品いただければ請求は発生しません。`,
          },
        },
      } : {}),
      // カゴ落ちリカバリー: 期限切れ後30日間セッションを復元可能に（入力途中から再開できる）
      ...(!isSubscription ? {
        after_expiration: { recovery: { enabled: true } },
      } : {}),
      success_url: `${siteUrl}/products/${shortId}?checkout=success`,
      cancel_url: `${siteUrl}/products/${shortId}?checkout=cancel`,
      metadata: {
        product_id: productId,
        product_title: productTitle,
        seller_name: sellerName ?? '',
        product_url: `${siteUrl}/products/${shortId}`,
        payment_method: 'card',
        ...(trial ? {
          trial: 'true',
          trial_days: String(trial.days),
          delivery_days: String(trial.deliveryDays),
          capture_due_at: trial.dueAt.toISOString(),
        } : {}),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
