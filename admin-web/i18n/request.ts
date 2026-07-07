import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl request config. English only for Month 7 (extraction finalized
 * Month 12) but ALL copy is routed through the catalog from day one, so there is
 * no hardcoded-string retrofit later.
 */
export const locales = ['en'] as const;
export const defaultLocale = 'en' satisfies (typeof locales)[number];

export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
