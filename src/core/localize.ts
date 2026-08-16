/**
 * Two languages, one declaration.
 *
 * A field is either a plain string — meaning it reads the same in both, which is
 * true of a repo name or a URL — or an object with both languages. That keeps
 * translation opt-in per field rather than forcing a mechanical duplication of
 * every value that was never language-specific.
 *
 * Portuguese is primary: it is the language the declaration was written in and
 * the one it is edited in. English falls back to it rather than to empty, on the
 * principle that a reader would rather meet a sentence in the wrong language
 * than a blank where a commitment should be.
 */

export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-BR";

export type LocalizedText = string | Partial<Record<Locale, string>>;

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** Read one language out of a field, falling back rather than blanking. */
export function t(value: LocalizedText | undefined, locale: Locale): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return value[locale] ?? value[DEFAULT_LOCALE] ?? value.en ?? "";
}

export function tAll(
  values: LocalizedText[] | undefined,
  locale: Locale,
): string[] {
  return (values ?? []).map((value) => t(value, locale));
}

/** Which languages a field actually carries. A plain string carries both. */
export function missingLocales(value: LocalizedText | undefined): Locale[] {
  if (typeof value === "string") return value.trim() ? [] : [...LOCALES];
  if (!value) return [...LOCALES];
  return LOCALES.filter((locale) => !value[locale]?.trim());
}
