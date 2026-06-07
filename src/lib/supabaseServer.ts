import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
// service role key があれば RLS をバイパス（サーバーサイド専用）
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const createSupabaseServer = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env vars.');
  }
  const key = supabaseServiceKey || supabaseAnonKey;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};
