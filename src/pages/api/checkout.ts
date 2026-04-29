import type { APIRoute } from 'astro';

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
      phone_number_collection: { enabled: false },
      shipping_address_collection: { allowed_countries: ['JP'] },
      success_url: `${siteUrl}/products/${shortId}?checkout=success`,
      cancel_url: `${siteUrl}/products/${shortId}?checkout=cancel`,
      metadata: {
        product_id: productId,
        product_title: productTitle,
        seller_name: sellerName ?? '',
        product_url: `${siteUrl}/products/${shortId}`,
      },
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
