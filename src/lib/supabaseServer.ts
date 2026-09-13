import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
// service role key があれば RLS をバイパス（サーバーサイド専用）
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * サーバー側の Supabase クライアント。
 *
 * Cloudflare Pages では import.meta.env はビルド時に固定されるため、
 * Pages のシークレットは実行時の `locals.runtime.env` からしか読めない。
 * service role が要るルート（RLS を service_role のみに絞った trial_orders など）は
 * その env を渡すこと。渡さないと匿名キーに落ちて読み書きが静かに失敗する。
 */
export const createSupabaseServer = (runtimeEnv?: Record<string, any>) => {
  const url = runtimeEnv?.PUBLIC_SUPABASE_URL || supabaseUrl;
  const anonKey = runtimeEnv?.PUBLIC_SUPABASE_ANON_KEY || supabaseAnonKey;
  const serviceKey = runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY || supabaseServiceKey;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase env vars.');
  }
  const key = serviceKey || anonKey;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

/** service role が必須のルート用。匿名キーに落ちたら黙って進まず落とす。 */
export const createSupabaseAdmin = (runtimeEnv?: Record<string, any>) => {
  const url = runtimeEnv?.PUBLIC_SUPABASE_URL || supabaseUrl;
  const serviceKey = runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY || supabaseServiceKey;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};
