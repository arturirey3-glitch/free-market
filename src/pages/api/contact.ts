// src/pages/api/contact.ts
import type { APIRoute } from 'astro';

// Cloudflare Pages 環境変数から読み込む
// ダッシュボード: Settings > Environment variables で設定してください
const DISCORD_WEBHOOK_URL = import.meta.env.DISCORD_WEBHOOK_URL as string;
const RESEND_API_KEY      = import.meta.env.RESEND_API_KEY as string;
const NOTIFY_EMAIL        = (import.meta.env.NOTIFY_EMAIL as string) || 'noreply@felikko.com';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, tel, email, subject, order_id, message } = body;

    // バリデーション
    if (!name || !email || !subject || !message) {
      return new Response(JSON.stringify({ error: '必須項目が未入力です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Discord に送信 ──
    if (DISCORD_WEBHOOK_URL) {
      const discordPayload = {
        username: 'felikko お問い合わせ',
        embeds: [{
          title: `📩 新着お問い合わせ：${subject}`,
          color: 0x07b53b,
          fields: [
            { name: '👤 お名前',         value: name,               inline: true  },
            { name: '📧 メール',          value: email,              inline: true  },
            { name: '📞 電話番号',        value: tel || '未入力',    inline: true  },
            { name: '🛒 注文ID',          value: order_id || 'なし', inline: true  },
            { name: '📝 お問い合わせ内容', value: message,            inline: false },
          ],
          footer: { text: 'felikko お問い合わせフォーム' },
          timestamp: new Date().toISOString(),
        }],
      };

      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload),
      });
    }

    // ── 2. Resend でメール通知 ──
    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'felikko <noreply@felikko.com>',
          to:   [NOTIFY_EMAIL],
          subject: `【felikko お問い合わせ】${subject}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <h2 style="color:#07b53b;margin-bottom:16px;">新着お問い合わせ</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#666;width:120px;">お名前</td>
                  <td style="padding:10px 0;font-weight:bold;">${name}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#666;">メール</td>
                  <td style="padding:10px 0;">${email}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#666;">電話番号</td>
                  <td style="padding:10px 0;">${tel || '未入力'}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#666;">件名</td>
                  <td style="padding:10px 0;">${subject}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#666;">注文ID</td>
                  <td style="padding:10px 0;">${order_id || 'なし'}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#666;vertical-align:top;">内容</td>
                  <td style="padding:10px 0;white-space:pre-wrap;">${message}</td>
                </tr>
              </table>
              <p style="margin-top:24px;font-size:12px;color:#999;">
                felikko お問い合わせフォームより自動送信
              </p>
            </div>
          `,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Contact API error:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラー' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
