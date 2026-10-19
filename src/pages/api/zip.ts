import type { APIRoute } from 'astro';

export const prerender = false;

// 郵便番号から住所を調べる（お届け先フォームの自動入力用・zipcloud）
export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' };
  const code = (url.searchParams.get('code') ?? '').replace(/[^0-9]/g, '');
  if (code.length !== 7) {
    return new Response(JSON.stringify({ found: false }), { status: 400, headers });
  }
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${code}`);
    const data: any = await res.json();
    const hit = data?.results?.[0];
    if (!hit) return new Response(JSON.stringify({ found: false }), { status: 200, headers });
    return new Response(
      JSON.stringify({ found: true, pref: hit.address1, city: `${hit.address2}${hit.address3}` }),
      { status: 200, headers }
    );
  } catch {
    return new Response(JSON.stringify({ found: false }), { status: 200, headers });
  }
};
