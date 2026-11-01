'use client';

import LanguageSwitch from '@/components/LanguageSwitch';
import { difficultyLabel } from '@/lib/i18n/core';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/lib/i18n/context';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getFeedbackList, getFeedbackStats, AIFeedbackRow } from '@/lib/feedback';
import { evaluateHand } from '@/lib/game-logic';
import { Card as CardType, PlayerArrangement } from '@/lib/types';
import Card from '@/components/Card';

export default function FeedbackDashboard() {
  const { t, handLabel, locale } = useLocale();
  const [feedbackList, setFeedbackList] = useState<AIFeedbackRow[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    byDifficulty: Record<string, number>;
    byPlayerCount: Record<string, number>;
  }>({ total: 0, byDifficulty: {}, byPlayerCount: {} });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [filterPlayerCount, setFilterPlayerCount] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [list, statsData] = await Promise.all([
        getFeedbackList(),
        getFeedbackStats(),
      ]);
      setFeedbackList(list);
      setStats(statsData);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filteredList = feedbackList.filter(item => {
    if (filterDifficulty !== 'all' && item.ai_difficulty !== filterDifficulty) return false;
    if (filterPlayerCount !== 'all' && item.player_count !== parseInt(filterPlayerCount)) return false;
    return true;
  });

  const renderArrangement = (arrangement: PlayerArrangement, label: string) => {
    const layers: Array<{ key: 'top' | 'middle' | 'bottom'; label: string }> = [
      { key: 'top', label: t("Top") },
      { key: 'middle', label: t("Mid") },
      { key: 'bottom', label: t("Bot") },
    ];

    return (
      <div className="space-y-1">
        <h5 className="text-xs font-medium text-slate-400">{label}</h5>
        {layers.map(({ key, label: layerLabel }) => {
          const cards = arrangement[key].cards.filter(c => c !== null) as CardType[];
          const evaluation = cards.length === 3 ? evaluateHand(cards) : null;

          return (
            <div key={key} className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-slate-500 min-w-12">{layerLabel}</span>
              <div className="flex gap-0.5">
                {arrangement[key].cards.map((card, idx) => (
                  <Card key={`${key}-${idx}`} card={card} size="xs" />
                ))}
              </div>
              {evaluation && (
                <span className="text-xs text-slate-500 ml-1">{handLabel(evaluation, cards)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="max-w-6xl mx-auto py-8">
        <div className="mb-4 flex justify-end"><LanguageSwitch /></div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-200">{t("AI Feedback Dashboard")}</h1>
            <p className="text-slate-400 mt-1">{t("Community-submitted AI decision feedback")}</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >{t("Back to Game")}</Link>
        </div>

        {!supabase && <p role="status" className="mb-6 rounded-xl border border-amber-400/30 p-4 text-sm text-amber-200">{t("error.unavailable")}</p>}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Stats Sidebar */}
          <div className="col-span-1 space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-sm font-medium text-slate-400 mb-3">{t("Statistics")}</h3>
              <div className="text-3xl font-bold text-amber-400">{stats.total}</div>
              <div className="text-xs text-slate-500">{t("Total submissions")}</div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-sm font-medium text-slate-400 mb-3">{t("By Difficulty")}</h3>
              <div className="space-y-2">
                {['easy', 'medium', 'hard'].map(diff => (
                  <div key={diff} className="flex justify-between text-sm">
                    <span className="text-slate-300 capitalize">{t(difficultyLabel(diff))}</span>
                    <span className="text-slate-500">{stats.byDifficulty[diff] || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-sm font-medium text-slate-400 mb-3">{t("By Players")}</h3>
              <div className="space-y-2">
                {[2, 3, 4, 5, 6].map(count => (
                  <div key={count} className="flex justify-between text-sm">
                    <span className="text-slate-300">{t('playersCount', { count })}</span>
                    <span className="text-slate-500">{stats.byPlayerCount[count] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 min-w-0">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
              <select
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm"
              >
                <option value="all">{t("All Difficulties")}</option>
                <option value="easy">{t("Easy")}</option>
                <option value="medium">{t("Medium")}</option>
                <option value="hard">{t("Hard")}</option>
              </select>

              <select
                value={filterPlayerCount}
                onChange={(e) => setFilterPlayerCount(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm"
              >
                <option value="all">{t("All Player Counts")}</option>
                {[2, 3, 4, 5, 6].map(count => (
                  <option key={count} value={count}>{t('playersCount', { count })}</option>
                ))}
              </select>
            </div>

            {/* Feedback List */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredList.length === 0 ? (
              <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700/50">
                <p className="text-slate-400">{t("No feedback submissions yet.")}</p>
                <p className="text-slate-500 text-sm mt-1">{t("Play a game and flag your hand to contribute!")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredList.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden"
                  >
                    {/* Header row */}
                    <div
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      className="p-4 cursor-pointer hover:bg-slate-700/30 transition-colors flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-slate-500">#{item.id.slice(0, 8)}</span>
                        <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
                          {t('playersCount', { count: item.player_count })}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs capitalize ${
                          item.ai_difficulty === 'hard' ? 'bg-rose-900/50 text-rose-300' :
                          item.ai_difficulty === 'medium' ? 'bg-amber-900/50 text-amber-300' :
                          'bg-emerald-900/50 text-emerald-300'
                        }`}>
                          {t(difficultyLabel(item.ai_difficulty))}
                        </span>
                        <span className="text-sm text-slate-400">{t('roundNumber', { count: item.round_number })}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-slate-500">
                          {new Date(item.created_at).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US', { numberingSystem: 'latn' })}
                        </span>
                        <svg
                          className={`w-5 h-5 text-slate-400 transition-transform ${expandedId === item.id ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {expandedId === item.id && (
                      <div className="p-4 pt-0 border-t border-slate-700/50">
                        {/* Cards */}
                        <div className="mb-4">
                          <h4 className="text-xs font-medium text-slate-400 mb-2">{t("9 Cards")}</h4>
                          <div className="flex flex-wrap gap-1">
                            {item.cards.map((card, idx) => (
                              <Card key={idx} card={card} size="xs" />
                            ))}
                          </div>
                        </div>

                        {/* Side by side */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-slate-900/50 rounded-lg p-3">
                            {renderArrangement(item.ai_suggestion, t("AI Suggestion"))}
                          </div>
                          <div className="bg-slate-900/50 rounded-lg p-3">
                            {renderArrangement(item.user_correction, t("User Correction"))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
