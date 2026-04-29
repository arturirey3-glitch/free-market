import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../lib/supabaseServer';

export const prerender = false;

// Google商品カテゴリマッピング
const GOOGLE_CATEGORY_MAP: Record<string, string> = {
  'スマホ・タブレット・パソコン': 'Electronics > Communications > Telephony > Mobile Phones',
  'スマホアクセサリー': 'Electronics > Electronics Accessories > Mobile Phone Accessories',
  'スマホリング': 'Electronics > Electronics Accessories > Mobile Phone Accessories',
  'インテリア': 'Home & Garden > Decor',
  'キッチンマット': 'Home & Garden > Decor > Rugs',
  'ラグ・カーペット': 'Home & Garden > Decor > Rugs',
  'マット': 'Home & Garden > Decor > Rugs',
  'クッションカバー': 'Home & Garden > Decor > Throw Pillows',
  '座布団カバー': 'Home & Garden > Decor > Throw Pillows',
  'ランチョンマット': 'Home & Garden > Kitchen & Dining > Tabletop > Placemats',
  'コースター': 'Home & Garden > Kitchen & Dining > Barware > Coasters',
  'バッグ': 'Apparel & Accessories > Handbags, Wallets & Cases > Backpacks',
};

function getGoogleCategory(category: string | null): string {
  if (!category) return 'Home & Garden';
  for (const [key, value] of Object.entries(GOOGLE_CATEGORY_MAP)) {
    if (category.includes(key)) return value;
  }
  return 'Home & Garden > Decor';
}

function getCondition(condition: string | null): string {
  if (!condition) return 'new';
  if (condition.includes('新品')) return 'new';
  if (condition.includes('未使用に近い')) return 'like_new';
  return 'used';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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
    const { data } = await supabase
      .from('products')
      .select('id,title,description,price,category,thumbnail_url,shipping_payer,condition,updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(500);
    products = data ?? [];
  } catch {
    products = [];
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
      <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
      <g:brand>felikko</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
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
