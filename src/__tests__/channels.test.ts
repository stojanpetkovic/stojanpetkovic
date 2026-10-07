/**
 * Where a visit came from. Social apps' built-in browsers often send no
 * referrer, Google Business Profile links arrive tagged by agencies in
 * several spellings, and TikTok or YouTube must not be counted as
 * Facebook/Instagram.
 */
import { describe, expect, it } from "vitest";
import { channelOf, inAppBrowser } from "../admin/lib/channels";

const IG_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0";
const FB_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0]";
const TT_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/118 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview";
const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

describe("channelOf()", () => {
  it("counts Google Business Profile links on their own", () => {
    expect(channelOf({ utm_source: "omg-gbp", utm_medium: "webclick" })).toBe(
      "Google Business profil",
    );
    expect(channelOf({ utm_source: "google", utm_medium: "gmb" })).toBe(
      "Google Business profil",
    );
    expect(channelOf({ utm_source: "google_business" })).toBe(
      "Google Business profil",
    );
  });

  it("keeps TikTok and YouTube apart from Facebook/Instagram", () => {
    expect(channelOf({ referrerHost: "tiktok.com" })).toBe(
      "Druge društvene mreže",
    );
    expect(channelOf({ referrerHost: "youtube.com" })).toBe(
      "Druge društvene mreže",
    );
    expect(channelOf({ referrerHost: "l.instagram.com" })).toBe(
      "Facebook/Instagram",
    );
    expect(channelOf({ referrerHost: "m.facebook.com" })).toBe(
      "Facebook/Instagram",
    );
    expect(channelOf({ utm_source: "tiktok", utm_medium: "social" })).toBe(
      "Druge društvene mreže",
    );
    expect(channelOf({ utm_source: "instagram", utm_medium: "social" })).toBe(
      "Facebook/Instagram",
    );
  });

  it("recognises in-app browsers that send no referrer", () => {
    expect(channelOf({ userAgent: IG_UA })).toBe("Facebook/Instagram");
    expect(channelOf({ userAgent: FB_UA })).toBe("Facebook/Instagram");
    expect(channelOf({ userAgent: TT_UA })).toBe("Druge društvene mreže");
    expect(channelOf({ userAgent: CHROME_UA })).toBe("Direktno");
  });

  it("still lets paid campaigns and search win", () => {
    expect(
      channelOf({
        utm_source: "facebook",
        utm_medium: "cpc",
        userAgent: IG_UA,
      }),
    ).toBe("Facebook/Instagram oglasi");
    expect(channelOf({ referrerHost: "google.com", userAgent: IG_UA })).toBe(
      "Google pretraga",
    );
    expect(inAppBrowser(CHROME_UA)).toBeNull();
  });
});
