import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../lib/supabaseServer';
import { getGoogleCategory, getCondition, escapeXml, identifierXml } from '../lib/shoppingFeed.mjs';

export const prerender = false;

function cleanTitle(title: string): string {
  // 絵文字・記号を除去してGoogleポリシーに準拠
  return title
    .replace(/[✨★☆♪♡♥🔥💨🛍️📱☕🍀🌺🌿💜🔴🖤🩷💙💚🤍🤎💛🌸🌺🌼🎨🎁🎉🙌👇]/g, '')
    .replace(/[！!？?【】◆◎★☝︎]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

export const GET: APIRoute = async () => {
  const siteUrl = 'https://www.felikko.com';

  let products: any[] = [];
  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase
      .from('products')
      .select('id,title,description,price,category,thumbnail_url,shipping_payer,condition,updated_at,product_type,brand,jan_code')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    // Google ショッピングは物販専用のため、デジタル/サービス商品(役務)は除外する
    // (merchant-feed.xml と同じ方針。混入すると「不実表示」判定の要因になる)
    products = (data ?? []).filter((p: any) => p.product_type !== 'digital');
  } catch {
    return new Response('Product feed temporarily unavailable', {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }

  const items = products.map((p) => {
    const shortId = p.id.slice(0, 8);
    const productUrl = `${siteUrl}/products/${shortId}`;
    const title = cleanTitle(p.title || '');
    const desc = escapeXml(
      (p.description || p.title || '')
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/#\S+/g, '')
        .trim()
        .slice(0, 5000)
    );
    const price = `${p.price} JPY`;
    const imageUrl = p.thumbnail_url || '';
    const googleCategory = getGoogleCategory(p.category);
    const condition = getCondition(p.condition);
    const shipping = (p.shipping_payer || '').includes('出品者') ? '送料込み' : '着払い';

    return `    <item>
      <g:id>${escapeXml(shortId)}</g:id>
      <g:title>${escapeXml(title)}</g:title>
      <g:description>${desc}</g:description>
      <g:link>${escapeXml(productUrl)}</g:link>
      <g:image_link>${escapeXml(imageUrl)}</g:image_link>
      <g:price>${price}</g:price>
      <g:availability>in_stock</g:availability>
      <g:condition>${condition}</g:condition>
      ${googleCategory ? `<g:google_product_category>${googleCategory}</g:google_product_category>` : ''}
      ${identifierXml(p)}
      <g:shipping>
        <g:country>JP</g:country>
        <g:service>${escapeXml(shipping)}</g:service>
        <g:price>${(p.shipping_payer || '').includes('出品者') ? '0 JPY' : ''}</g:price>
      </g:shipping>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>felikko | スタバ・マリメッコ雑貨のフリマ通販</title>
    <link>${siteUrl}</link>
    <description>felikkoの全商品フィード - スタバグッズ・マリメッコ・北欧インテリア雑貨</description>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
