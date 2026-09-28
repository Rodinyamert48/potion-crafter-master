// Minimal localization layer. Every player-facing string goes through `t()`
// (UI keys) or `tr()` (localized values embedded in data files).

import { STRINGS, type StringKey } from '../data/strings';

export type Lang = 'en' | 'tr';

export interface LocalizedText {
  en: string;
  tr: string;
}

export type Text = LocalizedText | string;

const LANG_KEY = 'witchs-brew:lang';

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'tr') return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return nav.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

let current: Lang = detectLang();
const listeners = new Set<(lang: Lang) => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Resolve a localized data value. */
export function tr(text: Text | undefined, params?: Record<string, string | number>): string {
  if (text === undefined) return '';
  if (typeof text === 'string') return interpolate(text, params);
  return interpolate(text[current] ?? text.en, params);
}

/** Resolve a UI string by key. Unknown keys are returned verbatim (helps spotting gaps). */
export function t(key: StringKey | (string & {}), params?: Record<string, string | number>): string {
  const entry = (STRINGS as Record<string, LocalizedText>)[key];
  if (!entry) return interpolate(key, params);
  return interpolate(entry[current] ?? entry.en, params);
}

/** Pick a random localized line from a list. */
export function pickLine(lines: readonly Text[] | undefined, params?: Record<string, string | number>): string {
  if (!lines || lines.length === 0) return '';
  return tr(lines[Math.floor(Math.random() * lines.length)], params);
}
