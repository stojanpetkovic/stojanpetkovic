/**
 * Where a visit or a lead came from, as one of a fixed set of channels a
 * client can read. Page views and leads go through the same function, so the
 * admin can divide one by the other per channel.
 */
export const CHANNELS = [
  "Google pretraga",
  "Google oglasi",
  "Facebook/Instagram oglasi",
  "Facebook/Instagram",
  "Druge društvene mreže",
  "Google Business profil",
  "Bing pretraga",
  "Drugi sajtovi",
  "Email",
  "Kampanja (ostalo)",
  "Direktno",
] as const;
export type Channel = (typeof CHANNELS)[number];

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|ecosia|brave)\./;
const META =
  /(^|\.)(facebook|instagram|fb|messenger|threads)\.|^l\.facebook|^lm\.facebook/;
const OTHER_SOCIAL =
  /(^|\.)(tiktok|youtube|youtu|linkedin|lnkd|pinterest|x|twitter|reddit|snapchat|nextdoor)\.|^t\.co$/;
const PAID = /cpc|ppc|paid|ads?$|display|cpm/;

export function referrerHost(
  referrer: string | null | undefined,
): string | null {
  if (!referrer) return null;
  try {
    return (
      new URL(referrer).hostname.replace(/^www\./, "").toLowerCase() || null
    );
  } catch {
    return null;
  }
}

/**
 * The social app whose built-in browser opened the page, read from the user
 * agent. These browsers often send no referrer, so without this check a click
 * from an Instagram bio or a TikTok profile counts as a direct visit.
 */
export function inAppBrowser(
  ua: string | null | undefined,
): "facebook" | "instagram" | "tiktok" | null {
  if (!ua) return null;
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(ua)) return "facebook";
  if (/musical_ly|Bytedance|TikTok|trill_/i.test(ua)) return "tiktok";
  return null;
}

export function channelOf(input: {
  utm_source?: string | null;
  utm_medium?: string | null;
  referrerHost?: string | null;
  /** User agent of the visit, to recognise social apps' built-in browsers. */
  userAgent?: string | null;
}): Channel {
  const source = input.utm_source?.toLowerCase().trim() ?? "";
  const medium = input.utm_medium?.toLowerCase().trim() ?? "";
  const host = input.referrerHost ?? "";

  if (source) {
    // Google Business Profile links are tagged by many agencies as
    // utm_source=…gbp / gmb, or utm_medium=organic with source=google-business.
    if (
      /gbp|gmb|google.?business|google.?maps|googlemaps/.test(source) ||
      /gbp|gmb/.test(medium)
    ) {
      return "Google Business profil";
    }
    if (/facebook|^fb$|instagram|^ig$|meta/.test(source)) {
      return PAID.test(medium)
        ? "Facebook/Instagram oglasi"
        : "Facebook/Instagram";
    }
    if (
      /tiktok|youtube|^yt$|linkedin|pinterest|twitter|^x$|reddit|snapchat|nextdoor/.test(
        source,
      )
    ) {
      return "Druge društvene mreže";
    }
    if (source.includes("google"))
      return PAID.test(medium) ? "Google oglasi" : "Google pretraga";
    if (source.includes("bing")) return "Bing pretraga";
    if (medium === "email" || source.includes("mail")) return "Email";
    return "Kampanja (ostalo)";
  }
  if (host) {
    if (/(^|\.)bing\./.test(host)) return "Bing pretraga";
    if (SEARCH.test(host)) return "Google pretraga";
    if (META.test(host)) return "Facebook/Instagram";
    if (OTHER_SOCIAL.test(host)) return "Druge društvene mreže";
    if (/mail\./.test(host)) return "Email";
    return "Drugi sajtovi";
  }
  const app = inAppBrowser(input.userAgent);
  if (app === "facebook" || app === "instagram") return "Facebook/Instagram";
  if (app === "tiktok") return "Druge društvene mreže";
  return "Direktno";
}
