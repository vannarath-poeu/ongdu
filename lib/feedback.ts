import { Card, PlayerArrangement, Player, RoundScore, AIDifficulty } from './types';
import { supabase, getSessionId } from './supabase';

export interface AIFeedback {
  ai_difficulty: AIDifficulty;
  player_count: number;
  round_number: number;
  cards: Card[];
  ai_suggestion: PlayerArrangement;
  user_correction: PlayerArrangement;
  all_players: Pick<Player, 'id' | 'name' | 'isHuman' | 'hand' | 'arrangement'>[];
  round_scores: RoundScore[];
}

export interface AIFeedbackRow extends AIFeedback {
  id: string;
  created_at: string;
  session_id: string;
}

export async function submitFeedback(feedback: AIFeedback): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!supabase) {
    console.error('Supabase not configured');
    return { success: false, error: 'Supabase not configured' };
  }

  const sessionId = getSessionId();

  const { data, error } = await supabase
    .from('ai_feedback')
    .insert({
      ...feedback,
      session_id: sessionId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to submit feedback:', error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data.id };
}

export async function getFeedbackList(): Promise<AIFeedbackRow[]> {
  if (!supabase) {
    console.error('Supabase not configured');
    return [];
  }

  const { data, error } = await supabase
    .from('ai_feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch feedback:', error);
    return [];
  }

  return data || [];
}

export async function getFeedbackStats(): Promise<{
  total: number;
  byDifficulty: Record<string, number>;
  byPlayerCount: Record<string, number>;
}> {
  if (!supabase) {
    console.error('Supabase not configured');
    return { total: 0, byDifficulty: {}, byPlayerCount: {} };
  }

  const { data, error } = await supabase
    .from('ai_feedback')
    .select('ai_difficulty, player_count');

  if (error || !data) {
    return { total: 0, byDifficulty: {}, byPlayerCount: {} };
  }

  const byDifficulty: Record<string, number> = {};
  const byPlayerCount: Record<string, number> = {};

  data.forEach((row) => {
    byDifficulty[row.ai_difficulty] = (byDifficulty[row.ai_difficulty] || 0) + 1;
    byPlayerCount[row.player_count] = (byPlayerCount[row.player_count] || 0) + 1;
  });

  return { total: data.length, byDifficulty, byPlayerCount };
}
