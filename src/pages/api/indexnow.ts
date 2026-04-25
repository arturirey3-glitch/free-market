import type { APIRoute } from 'astro';

const INDEXNOW_KEY = 'e0ddcb9227cd44f1a877926bb1db4a06';
const SITE_HOST = 'www.felikko.com';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { urls } = await request.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: 'urls array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // IndexNow（Bing/Yandex + 部分的にGoogle対応）
    const indexNowRes = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });

    // Google サイトマップ ping
    await fetch(
      `https://www.google.com/ping?sitemap=https://${SITE_HOST}/sitemap.xml`
    ).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        indexnow_status: indexNowRes.status,
        submitted: urls.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
