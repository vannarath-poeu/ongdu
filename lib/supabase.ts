import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
