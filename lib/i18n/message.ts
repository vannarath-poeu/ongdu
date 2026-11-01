import { en, km, type MessageKey } from './messages.ts';
export type Locale = 'km' | 'en';
type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;
export type Params<K extends MessageKey> = Record<Placeholders<(typeof en)[K]>, string | number>;
export type TranslationArgs<K extends MessageKey> = [Placeholders<(typeof en)[K]>] extends [never] ? [params?: never] : [params: Params<K>];
export type Message = { [K in MessageKey]: { key: K } & ([Placeholders<(typeof en)[K]>] extends [never] ? { params?: never } : { params: Params<K> }) }[MessageKey];

export function msg<K extends MessageKey>(key: K, ...args: TranslationArgs<K>): Message {
  return { key, ...(args[0] ? { params: args[0] } : {}) } as Message;
}

export function translate<K extends MessageKey>(locale: Locale, key: K, ...args: TranslationArgs<K>): string {
  const template = locale === 'km' ? km[key] : en[key];
  const params = args[0] as Record<string, string | number> | undefined;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
}

export function formatMessage(locale: Locale, message: Message): string {
  const template = locale === 'km' ? km[message.key] : en[message.key];
  const params = message.params as Record<string, string | number> | undefined;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
}

