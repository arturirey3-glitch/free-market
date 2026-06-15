import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../lib/supabaseServer';

export const prerender = false;

const SITE = 'https://www.felikko.com';

// XML エスケープ
const esc = (s: any) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// 商品の状態 → Google condition
const toCondition = (c: string | null): string => {
  if (!c) return 'new';
  return c.includes('新品') || c.includes('未使用') ? 'new' : 'used';
};

// 説明文を1行・適度な長さに整形（Merchant Centerは最大5000字、空不可）
const cleanDesc = (d: string | null, title: string): string => {
  const t = (d ?? '').replace(/\s+/g, ' ').trim();
  return t.length >= 10 ? t.slice(0, 4900) : `${title}｜felikkoのフリマ通販`;
};

export const GET: APIRoute = async () => {
  let items = '';

  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase
      .from('products')
      .select(
        'id,title,description,price,category,condition,brand,sku,stock,thumbnail_url,product_type,product_images(image_url,sort_order)'
      )
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(1000);

    if (data) {
      items = data
        // 画像必須 ＋ デジタル/スキルは物販フィード対象外（Merchant Center不承認回避）
        .filter((p: any) => p.thumbnail_url && p.product_type !== 'digital')
        .map((p: any) => {
          const shortId = p.id.slice(0, 8);
          const link = `${SITE}/products/${shortId}`;
          const availability =
            p.stock === null || p.stock === undefined || Number(p.stock) > 0
              ? 'in_stock'
              : 'out_of_stock';

          // 追加画像（最大10枚）
          const gallery = (p.product_images ?? [])
            .slice()
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((img: any) => img.image_url)
            .filter((u: string) => u && u !== p.thumbnail_url)
            .slice(0, 10);

          const addImgs = gallery
            .map((u: string) => `    <g:additional_image_link>${esc(u)}</g:additional_image_link>`)
            .join('\n');

          // ブランドは未設定が多いため identifier_exists=no で運用（商標問題回避のため既定はノーブランド品）
          const brand = p.brand && String(p.brand).trim() ? esc(p.brand) : 'ノーブランド品';
          const mpn = p.sku ? `    <g:mpn>${esc(p.sku)}</g:mpn>\n` : '';

          return `  <item>
    <g:id>${esc(shortId)}</g:id>
    <g:title>${esc(p.title)}</g:title>
    <g:description>${esc(cleanDesc(p.description, p.title))}</g:description>
    <g:link>${esc(link)}</g:link>
    <g:image_link>${esc(p.thumbnail_url)}</g:image_link>
${addImgs ? addImgs + '\n' : ''}    <g:availability>${availability}</g:availability>
    <g:price>${Number(p.price)} JPY</g:price>
    <g:condition>${toCondition(p.condition)}</g:condition>
    <g:brand>${brand}</g:brand>
${mpn}    <g:identifier_exists>no</g:identifier_exists>
${p.category ? `    <g:product_type>${esc(p.category)}</g:product_type>\n` : ''}    <g:shipping>
      <g:country>JP</g:country>
      <g:price>0 JPY</g:price>
    </g:shipping>
  </item>`;
        })
        .join('\n');
    }
  } catch {
    // フィードは壊さず空で返す
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>felikko 商品フィード</title>
    <link>${SITE}</link>
    <description>felikko スタバ・マリメッコ雑貨のフリマ通販 商品フィード</description>
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
