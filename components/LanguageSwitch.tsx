'use client';

import { useLocale } from '@/lib/i18n/context';

export default function LanguageSwitch() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div role="group" aria-label={t('Language')} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/90 p-1">
      {([{ value: 'km', label: 'ខ្មែរ' }, { value: 'en', label: 'English' }] as const).map(option => (
        <button key={option.value} type="button" lang={option.value} aria-pressed={locale === option.value}
          onClick={() => setLocale(option.value)}
          className={`min-h-11 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${locale === option.value ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
