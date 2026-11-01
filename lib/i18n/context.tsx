'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatCard, formatHand, formatMessage, formatNumber, formatPlayer, translate, type Locale, type Message, type TranslationArgs } from './core';
import type { MessageKey } from './messages';

const STORAGE_KEY = 'ongdu.locale';
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('km');
  useEffect(() => {
    // Match server-rendered Khmer first, then restore the visitor's preference.
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be blocked. */ }
    if (saved === 'en' || saved === 'km') {
      const frame = requestAnimationFrame(() => setLocaleState(saved));
      return () => cancelAnimationFrame(frame);
    }
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({ locale, setLocale: (next: Locale) => {
    setLocaleState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the in-memory preference. */ }
  } }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale requires LocaleProvider');
  const { locale } = context;
  return {
    ...context,
    t: <K extends MessageKey>(key: K, ...args: TranslationArgs<K>) => translate(locale, key, ...args),
    message: (value: Message) => formatMessage(locale, value),
    handLabel: (...args: Parameters<typeof formatHand> extends [Locale, ...infer Rest] ? Rest : never) => formatHand(locale, ...args),
    cardLabel: (card: Parameters<typeof formatCard>[1]) => formatCard(locale, card),
    playerLabel: (player: Parameters<typeof formatPlayer>[1]) => formatPlayer(locale, player),
    number: (value: number, digits = 0) => formatNumber(locale, value, digits),
  };
}
