import enMessages from '../_locales/en/messages.json';

// Single localization entry point for every extension context (side panel,
// content script, service worker). Chrome resolves the active locale from the
// browser UI language and reads `_locales/<locale>/messages.json` automatically,
// so `chrome.i18n.getMessage` already follows the browser language. The bundled
// English catalog is a safety net: it fills any key a locale omits (Chrome
// returns "" for a missing key) and keeps unit tests — which run without the
// chrome.i18n runtime — asserting against the real English strings.
type MessageEntry = { message: string; placeholders?: Record<string, { content: string }> };
const CATALOG = enMessages as unknown as Record<string, MessageEntry>;

export type Substitutions = string | Array<string | number> | undefined;

function toArray(substitutions: Substitutions): string[] {
  if (substitutions === undefined) return [];
  return (Array.isArray(substitutions) ? substitutions : [substitutions]).map(value => String(value));
}

// Mirror chrome.i18n placeholder substitution for the fallback catalog: each
// declared placeholder's content is `$N`, resolved positionally from the args.
// Token matching is case-insensitive, exactly like chrome.i18n.
function applyPlaceholders(entry: MessageEntry, args: string[]): string {
  if (!entry.placeholders || !args.length) return entry.message;
  const byName = new Map(Object.entries(entry.placeholders).map(([name, definition]) => [name.toLowerCase(), definition]));
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (token, name: string) => {
    const definition = byName.get(name.toLowerCase());
    if (!definition) return token;
    const match = /\$(\d+)/.exec(definition.content);
    const index = match ? Number(match[1]) - 1 : 0;
    return args[index] ?? '';
  });
}

export function t(key: string, substitutions?: Substitutions): string {
  const args = toArray(substitutions);
  if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
    const message = args.length ? chrome.i18n.getMessage(key, args) : chrome.i18n.getMessage(key);
    if (message) return message;
  }
  const entry = CATALOG[key];
  if (!entry) return key;
  return applyPlaceholders(entry, args);
}

// The browser UI language drives locale selection; expose it so the panel can
// set <html lang>/<html dir> (Arabic is right-to-left) and its title.
export function uiLanguage(): string {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) return chrome.i18n.getUILanguage();
  return 'en';
}

export function isRtl(language: string = uiLanguage()): boolean {
  return /^(ar|he|fa|ur)\b/i.test(language);
}
