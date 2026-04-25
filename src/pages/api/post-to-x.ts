import type { APIRoute } from 'astro';
import { postTweet, buildProductTweetText } from '../../lib/xApiClient';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const creds = {
    apiKey:            import.meta.env.X_API_KEY            ?? '',
    apiSecret:         import.meta.env.X_API_SECRET         ?? '',
    accessToken:       import.meta.env.X_ACCESS_TOKEN       ?? '',
    accessTokenSecret: import.meta.env.X_ACCESS_TOKEN_SECRET ?? '',
  };

  if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessTokenSecret) {
    return new Response(JSON.stringify({ error: 'X API credentials not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { product, imageUrls } = await request.json();

    if (!product?.title || !product?.price || !product?.id) {
      return new Response(JSON.stringify({ error: 'product.title, price, id are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const text = buildProductTweetText(product);
    const result = await postTweet({
      text,
      imageUrls: (imageUrls ?? []).slice(0, 4),
      creds,
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
