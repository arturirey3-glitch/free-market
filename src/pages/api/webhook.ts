import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const env = runtime?.env || {};

  const stripeSecretKey = env.STRIPE_SECRET_KEY || import.meta.env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || import.meta.env.STRIPE_WEBHOOK_SECRET;
  const resendApiKey = env.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;
  const fromEmail = env.FROM_EMAIL || import.meta.env.FROM_EMAIL || 'noreply@felikko.com';

  if (!stripeSecretKey) {
    return new Response('STRIPE_SECRET_KEY missing', { status: 500 });
  }

  const body = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeSecretKey);

  let event: ReturnType<typeof stripe.webhooks.constructEvent> extends Promise<infer T> ? T : ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      event = JSON.parse(body);
    }
  } catch (err) {
    return new Response(`Webhook Error: ${err}`, { status: 400 });
  }

  // ─── メール送信ヘルパー ───────────────────────────────────────
  const sendEmail = async (to: string, subject: string, html: string) => {
    if (!resendApiKey) return;
    const { Resend } = await import('resend');
    await new Resend(resendApiKey).emails.send({ from: fromEmail, to, subject, html });
  };

  const emailLayout = (body: string) => `
<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Helvetica Neue',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
<tr><td style="background:#2e7d32;padding:28px 32px;text-align:center;">
  <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.05em;">felikko</p>
</td></tr>
<tr><td style="padding:32px;">${body}
<p style="margin:24px 0 0;font-size:12px;color:#999;line-height:1.8;">
  ※ このメールアドレスは送信専用です。返信はお受けできません。<br>
  ※ ご不明な点はLINEよりお問い合わせください。
</p>
</td></tr>
<tr><td style="background:#f5f5f5;padding:20px 32px;text-align:center;border-top:1px solid #eee;">
  <p style="margin:0;font-size:11px;color:#aaa;">© 2026 felikko　|　<a href="https://www.felikko.com" style="color:#aaa;text-decoration:none;">felikko.com</a></p>
</td></tr>
</table></td></tr></table></body></html>`;

  const orderBox = (productTitle: string, sellerName: string, orderDate: string, orderId: string, receiptUrl: string, amountFormatted: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:12px;margin-bottom:24px;">
<tr><td style="padding:20px;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#888;letter-spacing:0.1em;">■ 注文明細</p>
  <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1a1a1a;">${productTitle}</p>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="font-size:13px;color:#555;padding:4px 0;">出品者</td><td style="font-size:13px;color:#1a1a1a;font-weight:600;text-align:right;">${sellerName}</td></tr>
    <tr><td style="font-size:13px;color:#555;padding:4px 0;border-top:1px solid #eee;">注文日</td><td style="font-size:13px;color:#1a1a1a;text-align:right;border-top:1px solid #eee;">${orderDate}</td></tr>
    <tr><td style="font-size:13px;color:#555;padding:4px 0;border-top:1px solid #eee;">注文番号</td><td style="font-size:11px;text-align:right;border-top:1px solid #eee;"><a href="${receiptUrl}" style="color:#2e7d32;text-decoration:underline;">${orderId}</a></td></tr>
    <tr><td style="font-size:13px;color:#555;padding:4px 0;border-top:1px solid #eee;">お支払い金額</td><td style="font-size:16px;color:#2e7d32;font-weight:700;text-align:right;border-top:1px solid #eee;">${amountFormatted}</td></tr>
  </table>
</td></tr></table>`;

  const lineBlock = `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8f5e9;border-radius:12px;margin-bottom:24px;">
<tr><td style="padding:20px;">
  <p style="margin:0 0 14px;font-size:13px;color:#444;">配送状況はLINEでご確認いただけます。<br>お気軽にお問い合わせください。</p>
  <a href="https://lin.ee/t47Nzid" style="display:inline-block;background:#06c755;color:#fff;font-size:13px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:100px;">LINEで問い合わせる</a>
</td></tr></table>`;

  // ─── checkout.session.completed ───────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const buyerEmail = session.customer_details?.email;
    const buyerName = session.customer_details?.name ?? 'お客様';
    const meta = session.metadata ?? {};
    const productTitle = meta.product_title ?? '商品';
    const sellerName = meta.seller_name ?? '出品者';
    const productUrl = meta.product_url ?? 'https://felikko.com';
    const amount = session.amount_total ?? 0;
    const orderId = session.payment_intent ?? session.id ?? '';
    const siteUrl2 = env.SITE_URL || import.meta.env.SITE_URL || 'https://www.felikko.com';
    const receiptUrl = `${siteUrl2}/receipts/${orderId}`;
    const orderDate = new Date((session.created ?? Date.now() / 1000) * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    const amountFormatted = `¥${amount.toLocaleString('ja-JP')}`;

    console.log('[webhook] checkout.session.completed payment_status:', session.payment_status, 'email:', buyerEmail);

    if (buyerEmail) {
      if (session.payment_status === 'paid') {
        // ── カード決済完了 → 購入完了メール ──
        await sendEmail(buyerEmail, '【felikko】ご購入ありがとうございます', emailLayout(`
<p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1a1a1a;">ご購入ありがとうございます！</p>
<p style="margin:0 0 24px;font-size:14px;color:#555;">${buyerName} 様、felikkoをご利用いただきありがとうございます。<br>以下の商品のご購入が完了しました。</p>
${orderBox(productTitle, sellerName, orderDate, orderId, receiptUrl, amountFormatted)}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center">
  <a href="${productUrl}" style="display:inline-block;background:#2e7d32;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:100px;">商品ページを確認する</a>
</td></tr></table>
${lineBlock}`));
      } else {
        // ── コンビニ支払い番号発行 → 支払い案内メール ──
        const konbini = session.payment_method_options?.konbini ?? {};
        const expiresAt = session.expires_at
          ? new Date(session.expires_at * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '3日以内';

        await sendEmail(buyerEmail, '【felikko】コンビニ支払い番号のご案内', emailLayout(`
<p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1a1a1a;">コンビニ支払い番号が発行されました</p>
<p style="margin:0 0 24px;font-size:14px;color:#555;">${buyerName} 様、ご注文ありがとうございます。<br>以下の情報をお持ちのコンビニにてお支払いください。</p>
${orderBox(productTitle, sellerName, orderDate, orderId, receiptUrl, amountFormatted)}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff9e6;border:2px solid #f59e0b;border-radius:12px;margin-bottom:24px;">
<tr><td style="padding:20px;">
  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400e;">⚠️ お支払い期限: ${expiresAt}</p>
  <p style="margin:0;font-size:13px;color:#555;line-height:1.7;">
    ・セブン-イレブン・ファミリーマート・ローソンなどの主要コンビニでお支払いいただけます。<br>
    ・支払い番号はStripeの確認メールに記載されています。<br>
    ・期限を過ぎると注文はキャンセルになります。
  </p>
</td></tr></table>
${lineBlock}`));
      }
    }
  }

  // ─── コンビニ支払い完了 → 購入確定メール ─────────────────────
  if (event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as any;
    const buyerEmail = session.customer_details?.email;
    const buyerName = session.customer_details?.name ?? 'お客様';
    const meta = session.metadata ?? {};
    const productTitle = meta.product_title ?? '商品';
    const sellerName = meta.seller_name ?? '出品者';
    const productUrl = meta.product_url ?? 'https://felikko.com';
    const amount = session.amount_total ?? 0;
    const orderId = session.payment_intent ?? session.id ?? '';
    const siteUrl2 = env.SITE_URL || import.meta.env.SITE_URL || 'https://www.felikko.com';
    const receiptUrl = `${siteUrl2}/receipts/${orderId}`;
    const orderDate = new Date((session.created ?? Date.now() / 1000) * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    const amountFormatted = `¥${amount.toLocaleString('ja-JP')}`;

    console.log('[webhook] async_payment_succeeded email:', buyerEmail);

    if (buyerEmail) {
      await sendEmail(buyerEmail, '【felikko】お支払いが確認されました', emailLayout(`
<p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1a1a1a;">お支払いを確認しました！</p>
<p style="margin:0 0 24px;font-size:14px;color:#555;">${buyerName} 様、コンビニでのお支払いを確認しました。<br>ご購入ありがとうございます。発送準備を進めます。</p>
${orderBox(productTitle, sellerName, orderDate, orderId, receiptUrl, amountFormatted)}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center">
  <a href="${productUrl}" style="display:inline-block;background:#2e7d32;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:100px;">商品ページを確認する</a>
</td></tr></table>
${lineBlock}`));
    }
  }

  // ─── コンビニ支払い期限切れ ──────────────────────────────────
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as any;
    const buyerEmail = session.customer_details?.email;
    const buyerName = session.customer_details?.name ?? 'お客様';
    const meta = session.metadata ?? {};
    const productTitle = meta.product_title ?? '商品';

    console.log('[webhook] async_payment_failed email:', buyerEmail);

    if (buyerEmail) {
      await sendEmail(buyerEmail, '【felikko】お支払い期限が切れました', emailLayout(`
<p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1a1a1a;">お支払い期限が切れました</p>
<p style="margin:0 0 24px;font-size:14px;color:#555;">${buyerName} 様、誠に恐れ入りますが、以下の商品のコンビニ支払い期限が切れたため、注文はキャンセルになりました。</p>
<p style="margin:0 0 24px;font-size:15px;font-weight:700;color:#1a1a1a;">${productTitle}</p>
<p style="margin:0 0 24px;font-size:14px;color:#555;">再度ご購入を希望される場合は、商品ページから改めてご注文ください。</p>
${lineBlock}`));
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
