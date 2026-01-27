import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create client only if env vars are available (allows build without them)
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Generate or retrieve session ID for rate limiting
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';

  let sessionId = localStorage.getItem('feedback_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('feedback_session_id', sessionId);
  }
  return sessionId;
}
