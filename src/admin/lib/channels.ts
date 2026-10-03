/**
 * Where a visit or a lead came from, as one of a fixed set of channels a
 * client can read. Page views and leads go through the same function, so the
 * admin can divide one by the other per channel.
 */
export const CHANNELS = [
  'Google pretraga',
  'Google oglasi',
  'Facebook/Instagram oglasi',
  'Facebook/Instagram',
  'Bing pretraga',
  'Drugi sajtovi',
  'Email',
  'Kampanja (ostalo)',
  'Direktno',
] as const;
export type Channel = (typeof CHANNELS)[number];

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|ecosia|brave)\./;
const SOCIAL =
  /(^|\.)(facebook|instagram|fb|messenger|threads)\.|^l\.facebook|^lm\.facebook|^t\.co$|linkedin\.|tiktok\.|pinterest\./;
const PAID = /cpc|ppc|paid|ads?$|display|cpm/;

export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

export function channelOf(input: {
  utm_source?: string | null;
  utm_medium?: string | null;
  referrerHost?: string | null;
}): Channel {
  const source = input.utm_source?.toLowerCase().trim() ?? '';
  const medium = input.utm_medium?.toLowerCase().trim() ?? '';
  const host = input.referrerHost ?? '';

  if (source) {
    if (/facebook|^fb$|instagram|^ig$|meta/.test(source)) {
      return PAID.test(medium) ? 'Facebook/Instagram oglasi' : 'Facebook/Instagram';
    }
    if (source.includes('google')) return PAID.test(medium) ? 'Google oglasi' : 'Google pretraga';
    if (source.includes('bing')) return 'Bing pretraga';
    if (medium === 'email' || source.includes('mail')) return 'Email';
    return 'Kampanja (ostalo)';
  }
  if (host) {
    if (/(^|\.)bing\./.test(host)) return 'Bing pretraga';
    if (SEARCH.test(host)) return 'Google pretraga';
    if (SOCIAL.test(host)) return 'Facebook/Instagram';
    if (/mail\./.test(host)) return 'Email';
    return 'Drugi sajtovi';
  }
  return 'Direktno';
}
