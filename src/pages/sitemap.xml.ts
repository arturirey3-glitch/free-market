import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../lib/supabaseServer';

export const prerender = false;

export const GET: APIRoute = async () => {
  const siteUrl = 'https://www.felikko.com';

  // 静的ページ
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/products', priority: '0.9', changefreq: 'daily' },
    { url: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { url: '/law', priority: '0.3', changefreq: 'yearly' },
  ];

  // 公開中の商品を取得
  let productUrls: { url: string; lastmod: string; priority: string; changefreq: string }[] = [];
  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase
      .from('products')
      .select('id, updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(1000);

    if (data) {
      productUrls = data.map((p: any) => ({
        url: `/products/${p.id.slice(0, 8)}`,
        lastmod: (p.updated_at ?? '').slice(0, 10),
        priority: '0.8',
        changefreq: 'weekly',
      }));
    }
  } catch {}

  const today = new Date().toISOString().slice(0, 10);

  const entries = [
    ...staticPages.map(p => `
  <url>
    <loc>${siteUrl}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
    ...productUrls.map(p => `
  <url>
    <loc>${siteUrl}${p.url}</loc>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
  ].join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
