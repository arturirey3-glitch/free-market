import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../lib/supabaseServer';

export const prerender = false;

const SITE = 'https://www.felikko.com';

const esc = (s: any) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const cleanDesc = (d: string | null, title: string): string => {
  const t = (d ?? '').replace(/\s+/g, ' ').trim();
  return t.length >= 5 ? t.slice(0, 500) : title;
};

const mimeOf = (url: string): string => {
  const u = url.toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
};

// note ストア機能向け 商品RSS 2.0 フィード
export const GET: APIRoute = async () => {
  let items = '';

  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase
      .from('products')
      .select('id,title,description,price,thumbnail_url,product_type,updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(1000);

    if (data) {
      items = data
        .filter((p: any) => p.thumbnail_url && p.product_type !== 'digital')
        .map((p: any) => {
          const shortId = p.id.slice(0, 8);
          const link = `${SITE}/products/${shortId}`;
          const img = p.thumbnail_url;
          const price = Number(p.price);
          return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <description>${esc(cleanDesc(p.description, p.title))}</description>
      <enclosure url="${esc(img)}" type="${mimeOf(img)}" length="0" />
      <media:content url="${esc(img)}" medium="image" type="${mimeOf(img)}" />
      <media:thumbnail url="${esc(img)}" />
      <g:image_link>${esc(img)}</g:image_link>
      <g:price>${price} JPY</g:price>
    </item>`;
        })
        .join('\n');
    }
  } catch {
    // フィードは壊さず空で返す
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>felikko</title>
    <link>${SITE}</link>
    <description>felikko スタバ・マリメッコ雑貨のフリマ通販</description>
    <language>ja</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
