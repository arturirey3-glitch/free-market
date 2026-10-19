import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabaseServer';
import {
  TRIAL_OPEN,
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
    const { productId, sellerName } = body;

    if (!productId) {
      return new Response(JSON.stringify({ error: '必須パラメータが不足しています' }), { status: 400, headers });
    }

    // 商品名・価格・在庫・種類はブラウザから受け取らず、DBの値を使う（金額の書き換えを防ぐ）
    const { data: product } = await createSupabaseServer(env)
      .from('products')
      .select('id,title,price,product_type,is_subscription,stock,thumbnail_url')
      .eq('id', String(productId))
      .eq('status', 'published')
      .maybeSingle();
    if (!product || !(product.price > 0)) {
      return new Response(JSON.stringify({ error: 'この商品は購入できません' }), { status: 404, headers });
    }
    const productTitle: string = product.title;
    const price: number = product.price;
    const thumbnailUrl: string | null = product.thumbnail_url;
    const stock: number | null = product.stock;

    const siteUrl = new URL(request.url).origin;
    const isSubscription = product.is_subscription === true;
    const shortId = String(product.id).slice(0, 8);
    const maxQty = stock != null ? Math.min(Number(stock), 10) : 10;

    // ── 物販商品：お届け先は商品ページのフォームで入力してもらう ──
    const ownShipping = product.product_type !== 'digital' && !isSubscription;
    const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
    const rawShip = (body && typeof body.shipping === 'object' && body.shipping) || {};
    const ship = {
      name: clean(rawShip.name, 60),
      postal_code: clean(rawShip.postal_code, 8).replace(/[^0-9]/g, ''),
      prefecture: clean(rawShip.prefecture, 10),
      city: clean(rawShip.city, 80),
      line1: clean(rawShip.line1, 120),
      phone: clean(rawShip.phone, 15).replace(/[^0-9]/g, ''),
    };
    if (ownShipping && (!ship.name || ship.postal_code.length !== 7 || !ship.prefecture || !ship.city || !ship.line1 || ship.phone.length < 10)) {
      return new Response(JSON.stringify({ error: 'お届け先をすべて入力してください' }), { status: 400, headers });
    }
    const postalLabel = `${ship.postal_code.slice(0, 3)}-${ship.postal_code.slice(3)}`;
    const shipLabel = `〒${postalLabel} ${ship.prefecture}${ship.city} ${ship.line1}　${ship.name} 様　TEL ${ship.phone}`;
    const shippingData = {
      name: ship.name,
      phone: ship.phone,
      address: { country: 'JP', postal_code: postalLabel, state: ship.prefecture, city: ship.city, line1: ship.line1 },
    };

    // ── 無料お試しの可否は DB を正とする ──────────────────────────
    // クライアントから渡されたフラグは信用しない（勝手に「お試し」にされると請求できなくなる）。
    let trial: { days: number; deliveryDays: number; dueAt: Date } | null = null;
    if (!isSubscription) {
      try {
        const db = createSupabaseServer(env);
        const { data: p } = await db
          .from('products')
          .select('trial_enabled,trial_days,delivery_time')
          .eq('id', product.id)
          .maybeSingle();
        if (TRIAL_OPEN && p?.trial_enabled) {
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
            // Stripe Checkout は都度購入だと必ず金額を出し、サブスクの
            // 「今日期日の合計額 ¥0」表示は使えない（trial はサブスク専用）。
            // 商品名と説明で「いま請求されない」ことを左パネルに出す。
            name: trial ? `【本日のお支払い ¥0】${productTitle}（${trial.days}日間 無料お試し）` : productTitle,
            ...(trial ? {
              description:
                `本日のお支払いは ¥0 です。`
                + `商品到着後${trial.days}日間お試しいただけます。`
                + `${formatJaDate(trial.dueAt)}頃に ¥${Number(price).toLocaleString('ja-JP')} を決済します。`
                + `それまでにご返品いただければ請求は発生しません。`,
            } : {}),
            ...(thumbnailUrl ? { images: [thumbnailUrl] } : {}),
          },
          unit_amount: price,
          ...(isSubscription ? { recurring: { interval: 'month' } } : {})
        },
        quantity: 1,
        // お試しでは数量変更を出さない。
        // ・数量セレクタがあると Stripe が「<店名>に支払う ￥999」のレイアウトに切り替わり、
        //   商品名が見出しから降りて説明文も折りたたまれる（本番で実測）
        // ・無料期間中に複数個まとめて持って行かれるリスクも避けたい
        ...(!isSubscription && !trial ? {
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
      // 物販は入力済みのお届け先を支払いに付ける。デジタル・定期購入は従来どおり Stripe で入力
      ...(ownShipping ? {
        payment_intent_data: { shipping: shippingData },
        custom_text: { submit: { message: `お届け先：${shipLabel}` } },
      } : {
        shipping_address_collection: { allowed_countries: ['JP'] as const },
      }),
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
          ...(ownShipping ? { shipping: shippingData } : {}),
          capture_method: 'manual' as const,
          description: `${productTitle}（${trial.days}日間無料お試し）`,
        },
        custom_text: {
          submit: {
            message:
              `いまは請求されません。カードの利用枠を確保するだけです。`
              + `商品到着後${trial.days}日間はお試しいただけます。`
              + `${formatJaDate(trial.dueAt)}頃に自動で決済されます。`
              + `それまでにご返品いただければ請求は発生しません。`
              + (ownShipping ? `\nお届け先：${shipLabel}` : ''),
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
        ...(ownShipping ? { ship_to: shipLabel.slice(0, 480) } : {}),
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
