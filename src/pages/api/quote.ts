// src/pages/api/quote.ts — オーダーメイド見積もり依頼
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const env = runtime?.env || {};

  const DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL || import.meta.env.DISCORD_WEBHOOK_URL;
  const RESEND_API_KEY      = env.RESEND_API_KEY      || import.meta.env.RESEND_API_KEY;
  const NOTIFY_EMAIL        = env.NOTIFY_EMAIL        || import.meta.env.NOTIFY_EMAIL || 'support@felikko.com';

  try {
    const body = await request.json();
    const { item, wish, qty, due, budget, name, email } = body;
    // images: [{ name, content(base64・data URLのbase64部分), type }]
    const images: Array<{ name: string; content: string; type?: string }> =
      Array.isArray(body.images) ? body.images.slice(0, 8) : [];

    if (!item || !wish || !name || !email) {
      return new Response(JSON.stringify({ error: '必須項目が未入力です' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const esc = (s: string) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows: [string, string][] = [
      ['作りたいもの', item],
      ['ご希望', wish],
      ['希望数量', String(qty ?? 1)],
      ['希望納期', due || '未定'],
      ['ご予算', budget || '未定'],
      ['お名前', name],
      ['メール', email],
      ['添付画像', images.length ? `${images.length}枚` : 'なし'],
    ];

    // ── 1. Discord 通知 ──
    if (DISCORD_WEBHOOK_URL) {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'felikko オーダーメイド見積もり',
          embeds: [{
            title: `🎨 見積もり依頼：${item}`,
            color: 0x07b53b,
            fields: rows.map(([n, v]) => ({ name: n, value: (v || 'なし').slice(0, 1000), inline: n.length < 6 })),
            footer: { text: 'felikko オーダーメイド見積もりフォーム' },
            timestamp: new Date().toISOString(),
          }],
        }),
      });
    }

    // ── 2. Resend メール（画像は添付） ──
    if (RESEND_API_KEY) {
      const attachments = images
        .filter((im) => im && im.content)
        .map((im, i) => ({ filename: im.name || `design_${i + 1}.jpg`, content: im.content }));

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#07b53b;margin-bottom:16px;">オーダーメイド 見積もり依頼</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${rows.map(([n, v]) => `<tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;width:120px;vertical-align:top;">${n}</td><td style="padding:10px 0;white-space:pre-wrap;">${esc(v)}</td></tr>`).join('')}
          </table>
          <p style="margin-top:24px;font-size:12px;color:#999;">felikko オーダーメイド見積もりフォームより自動送信</p>
        </div>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'felikko <noreply@felikko.com>',
          to: [NOTIFY_EMAIL],
          reply_to: email,
          subject: `【felikko 見積もり依頼】${item} / ${name}様`,
          html,
          attachments,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '送信に失敗しました' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
