import { sortCopy } from "./array";

// Inlined: validation.ts imports this module.
export const assertLocale = (locale: string): void => {
  if (!locale.trim()) {
    throw new RangeError("Locale must not be empty");
  }
};

const readLocale = (
  locale: string,
  read: (parsed: Intl.Locale) => string
): string => {
  // `pt_BR` is a common host spelling that every Intl constructor rejects.
  const tag = locale.replaceAll("_", "-");

  try {
    return read(new Intl.Locale(tag));
  } catch {
    return tag;
  }
};

/** The canonical tag, keeping the host's `-u-` extensions such as `-u-hc-h23` or `-u-nu-arab`. */
export const canonicalLocale = (locale: string): string =>
  readLocale(locale, (parsed) => parsed.toString());

/** The tag without extensions, as message catalogues are keyed. */
export const localeBaseName = (locale: string): string =>
  readLocale(locale, (parsed) => parsed.baseName);

const cacheKey = (locale: string, options: object | undefined): string => {
  if (options === undefined) {
    return locale;
  }

  const entries = sortCopy(Object.entries(options), ([left], [right]) =>
    left.localeCompare(right)
  );

  return `${locale}\u0000${JSON.stringify(entries)}`;
};

// Intl is read per miss so a later polyfill still applies.
const cachedByLocale = <Options extends object, Value>(
  getFormatter: () => new (locale: string, options?: Options) => Value
): ((locale: string, options?: Options) => Value) => {
  const cache = new Map<string, Value>();

  return (locale, options) => {
    assertLocale(locale);

    const key = cacheKey(locale, options);
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const Formatter = getFormatter();
    const formatter = new Formatter(canonicalLocale(locale), options);
    cache.set(key, formatter);

    return formatter;
  };
};

export const dateTimeFormatter = cachedByLocale(() => Intl.DateTimeFormat);

export const numberFormatter = cachedByLocale(() => Intl.NumberFormat);

export const relativeTimeFormatter = cachedByLocale(
  () => Intl.RelativeTimeFormat
);

export const listFormatter = cachedByLocale(() => Intl.ListFormat);

export const pluralRules = cachedByLocale(() => Intl.PluralRules);

export const segmenter = cachedByLocale(() => Intl.Segmenter);
