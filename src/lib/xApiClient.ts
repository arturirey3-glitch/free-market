/**
 * X (Twitter) API v2 client for Cloudflare Workers
 * OAuth 1.0a signing + media upload + tweet creation
 */

// ── OAuth 1.0a 署名生成 ──────────────────────────────────────────────────────
async function buildOAuthHeader(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  creds: { apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string }
): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  // 署名ベース文字列
  const allParams = { ...bodyParams, ...oauthParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map(k => `${pct(k)}=${pct(allParams[k])}`)
    .join('&');

  const baseStr = [method.toUpperCase(), pct(url), pct(sortedParams)].join('&');
  const signingKey = `${pct(creds.apiSecret)}&${pct(creds.accessTokenSecret)}`;

  // HMAC-SHA1
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(baseStr));
  oauthParams['oauth_signature'] = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return 'OAuth ' + Object.keys(oauthParams)
    .map(k => `${pct(k)}="${pct(oauthParams[k])}"`)
    .join(', ');
}

function pct(s: string): string {
  return encodeURIComponent(s);
}

// ── 画像アップロード（v1.1）────────────────────────────────────────────────────
async function uploadMedia(
  imageUrl: string,
  creds: Parameters<typeof buildOAuthHeader>[3]
): Promise<string | null> {
  try {
    // 画像を取得してbase64化
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const mediaData = `media_data=${encodeURIComponent(base64)}`;

    const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    const auth = await buildOAuthHeader('POST', uploadUrl, { media_data: base64 }, creds);

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: mediaData,
    });

    if (!uploadRes.ok) {
      console.error('Media upload failed:', await uploadRes.text());
      return null;
    }
    const data = await uploadRes.json() as { media_id_string: string };
    return data.media_id_string;
  } catch (e) {
    console.error('uploadMedia error:', e);
    return null;
  }
}

// ── ツイート投稿（v2）────────────────────────────────────────────────────────
export async function postTweet(opts: {
  text: string;
  imageUrls?: string[];
  creds: { apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string };
}): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const { text, imageUrls = [], creds } = opts;

  // 画像アップロード（最大4枚）
  const mediaIds: string[] = [];
  for (const url of imageUrls.slice(0, 4)) {
    const id = await uploadMedia(url, creds);
    if (id) mediaIds.push(id);
  }

  // ツイート作成
  const tweetUrl = 'https://api.twitter.com/2/tweets';
  const body: Record<string, any> = { text };
  if (mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }

  const auth = await buildOAuthHeader('POST', tweetUrl, {}, creds);
  const res = await fetch(tweetUrl, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: err };
  }
  const data = await res.json() as { data: { id: string } };
  return { success: true, tweetId: data.data?.id };
}

// ── 商品投稿テキスト生成 ────────────────────────────────────────────────────
export function buildProductTweetText(product: {
  title: string;
  price: number;
  shipping_payer?: string;
  id: string;
}): string {
  const shipping = product.shipping_payer?.includes('出品者') ? '送料込み' : '着払い';
  const shortId = product.id.slice(0, 8);
  const url = `https://www.felikko.com/products/${shortId}`;

  return [
    `📦 ${product.title}`,
    ``,
    `💴 ${product.price.toLocaleString()}円(税込) ${shipping}`,
    `🛒 ${url}`,
    ``,
    `#felikko #フリマ #ハンドメイド`,
  ].join('\n');
}
