import { createHash } from "crypto";
import prisma from "../config/database.config";
import { config } from "../config/env.config";
import { EmailService } from "./email.service";

// The website's Instagram feed, and the upkeep of the access token behind it.
//
// Instagram access tokens last 60 days, but one that is at least a day old and
// not yet expired can be renewed for a fresh 60 days. So the token is kept in
// the database and renewed long before it runs out:
//   • every REFRESH_AFTER_DAYS (7) — leaving ~53 days of slack for retries;
//   • checked on a timer (see server.ts) AND whenever the website asks for
//     posts, so it still happens on hosts that put an idle server to sleep.
//
// INSTAGRAM_ACCESS_TOKEN in .env is only the starting point: it is copied
// into the database the first time, and from then on the database copy is the
// live one. Pasting a different token into .env later (and restarting)
// replaces the stored one — that is the recovery path if the token is ever
// revoked, e.g. after an Instagram password change.

const API = "https://graph.instagram.com";
const API_VERSION = "v25.0";
const TOKEN_ROW_ID = 1; // the table only ever holds this one row

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_LIFETIME_DAYS = 60;
const REFRESH_AFTER_DAYS = 7;
const WARN_WHEN_DAYS_LEFT = 14; // email the team if renewal is still failing this close to expiry
const WARN_EVERY_DAYS = 3;
const POSTS_CACHE_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface InstagramPost {
  id: string;
  image: string;
  href: string; // the post on instagram.com
  caption: string;
  isVideo: boolean;
}

interface ApiMedia {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string; // left out by Instagram for posts with copyright flags
  thumbnail_url?: string; // videos only
  permalink: string;
  caption?: string;
}

const fingerprint = (token: string): string => createHash("sha256").update(token).digest("hex");

/** GET a JSON document from the Instagram API. Throws with Instagram's own message on failure. */
const apiGet = async <T>(path: string, params: Record<string, string>): Promise<T> => {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !body || body.error) {
    throw new Error(body?.error?.message || `Instagram API responded ${res.status}`);
  }
  return body;
};

/**
 * The stored token row, creating or replacing it from INSTAGRAM_ACCESS_TOKEN
 * when there isn't one yet or when .env holds a token the row didn't come from.
 * Null when Instagram isn't set up at all.
 */
const loadToken = async () => {
  const row = await prisma.instagramToken.findUnique({ where: { id: TOKEN_ROW_ID } });
  const envToken = config.instagramAccessToken;
  if (!envToken) return row;

  const seedHash = fingerprint(envToken);
  if (row && row.seedHash === seedHash) return row;

  // New (or first) token from .env. Its real expiry isn't known yet, so assume
  // a full lifetime and schedule the first renewal for about a day from now —
  // Instagram refuses to renew a token younger than 24 hours. That renewal
  // then reports the exact expiry.
  const now = Date.now();
  const data = {
    accessToken: envToken,
    seedHash,
    expiresAt: new Date(now + TOKEN_LIFETIME_DAYS * DAY_MS),
    refreshedAt: new Date(now - (REFRESH_AFTER_DAYS - 1) * DAY_MS),
    lastError: null,
    lastAlertAt: null,
  };
  console.log(`📸 Instagram: ${row ? "replacing stored token with the new one from .env" : "storing token from .env"}`);
  return prisma.instagramToken.upsert({ where: { id: TOKEN_ROW_ID }, create: { id: TOKEN_ROW_ID, ...data }, update: data });
};

type TokenRow = NonNullable<Awaited<ReturnType<typeof loadToken>>>;

/** Tell the team by email (at most every few days) that renewal keeps failing and expiry is near. */
const warnIfExpiringSoon = async (row: TokenRow, reason: string): Promise<void> => {
  const daysLeft = Math.floor((row.expiresAt.getTime() - Date.now()) / DAY_MS);
  if (daysLeft > WARN_WHEN_DAYS_LEFT) return;
  if (row.lastAlertAt && Date.now() - row.lastAlertAt.getTime() < WARN_EVERY_DAYS * DAY_MS) return;

  const when = daysLeft >= 0 ? `expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "has expired";
  const text = [
    `The Instagram access token for the website ${when}, and automatic renewal is failing.`,
    "",
    `Reason reported by Instagram: ${reason}`,
    "",
    "Until this is fixed the Instagram section will disappear from the home page once the token runs out.",
    "To fix it: generate a new token in the Meta app dashboard (Instagram → API setup with Instagram",
    "business login → Generate token), put it in INSTAGRAM_ACCESS_TOKEN on the server, and restart the API.",
  ].join("\n");
  const sent = await EmailService.send({
    to: config.contactNotifyEmail,
    subject: `Action needed: website Instagram token ${when}`,
    text,
    html: `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:15px;white-space:pre-wrap;">${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`,
  });
  if (sent) await prisma.instagramToken.update({ where: { id: TOKEN_ROW_ID }, data: { lastAlertAt: new Date() } });
};

/** Renew the stored token for another 60 days. Returns the updated row; throws if Instagram refuses. */
const renew = async (row: TokenRow): Promise<TokenRow> => {
  try {
    const result = await apiGet<{ access_token: string; expires_in: number }>("/refresh_access_token", {
      grant_type: "ig_refresh_token",
      access_token: row.accessToken,
    });
    const updated = await prisma.instagramToken.update({
      where: { id: TOKEN_ROW_ID },
      data: {
        accessToken: result.access_token,
        expiresAt: new Date(Date.now() + result.expires_in * 1000),
        refreshedAt: new Date(),
        lastError: null,
        lastAlertAt: null,
      },
    });
    console.log(`📸 Instagram token renewed — valid until ${updated.expiresAt.toISOString().slice(0, 10)}`);
    return updated;
  } catch (error) {
    const reason = (error as Error).message;
    console.error("⚠️ Instagram token renewal failed:", reason);
    await prisma.instagramToken.update({ where: { id: TOKEN_ROW_ID }, data: { lastError: reason.slice(0, 500) } });
    await warnIfExpiringSoon(row, reason);
    throw error;
  }
};

// One upkeep run at a time, shared by the timer and by incoming requests.
let upkeep: Promise<TokenRow | null> | null = null;

/**
 * The current token row, renewing it first if it's due. Never throws: if a
 * renewal fails the existing token (still valid for weeks) is returned and
 * renewal is tried again on the next run.
 */
const currentToken = (): Promise<TokenRow | null> => {
  upkeep ??= (async () => {
    try {
      const row = await loadToken();
      if (!row) return null;
      const due = Date.now() - row.refreshedAt.getTime() >= REFRESH_AFTER_DAYS * DAY_MS;
      if (!due) return row;
      return await renew(row).catch(() => row);
    } catch (error) {
      console.error("⚠️ Instagram token upkeep failed:", (error as Error).message);
      return null;
    } finally {
      upkeep = null;
    }
  })();
  return upkeep;
};

let postsCache: { at: number; limit: number; posts: InstagramPost[] } | null = null;

export const InstagramService = {
  /** True when a token is available (in the database or in .env). */
  async isConfigured(): Promise<boolean> {
    return (await currentToken()) !== null;
  },

  /** Timer entry point: renew the token if it's due. Never throws. */
  async runUpkeep(): Promise<void> {
    await currentToken();
  },

  /**
   * The newest `limit` posts that have a picture to show, newest first. Kept in
   * memory for half an hour. If Instagram can't be reached, the last list that
   * was fetched is returned; with nothing to fall back on, it throws.
   */
  async getPosts(limit: number): Promise<InstagramPost[]> {
    if (postsCache && postsCache.limit >= limit && Date.now() - postsCache.at < POSTS_CACHE_MS) {
      return postsCache.posts.slice(0, limit);
    }
    const row = await currentToken();
    if (!row) return [];

    try {
      // Ask for a few extra in case some have no usable picture.
      const { data } = await apiGet<{ data: ApiMedia[] }>(`/${API_VERSION}/me/media`, {
        fields: "id,media_type,media_url,thumbnail_url,permalink,caption",
        limit: String(limit + 4),
        access_token: row.accessToken,
      });
      const posts = data
        .map((media) => ({
          id: media.id,
          // A video's media_url is the video file; its still picture is thumbnail_url.
          image: (media.media_type === "VIDEO" ? media.thumbnail_url : media.media_url) ?? "",
          href: media.permalink,
          caption: media.caption ?? "",
          isVideo: media.media_type === "VIDEO",
        }))
        .filter((post) => post.image)
        .slice(0, limit);
      postsCache = { at: Date.now(), limit, posts };
      return posts;
    } catch (error) {
      const reason = (error as Error).message;
      console.error("⚠️ Instagram posts could not be fetched:", reason);
      await prisma.instagramToken
        .update({ where: { id: TOKEN_ROW_ID }, data: { lastError: reason.slice(0, 500) } })
        .catch(() => undefined);
      if (postsCache) return postsCache.posts.slice(0, limit);
      throw error;
    }
  },

  /** For the admin: how the token is doing. Never includes the token itself. */
  async getStatus() {
    const row = await currentToken();
    if (!row) return { configured: false as const };
    return {
      configured: true as const,
      expiresAt: row.expiresAt,
      daysLeft: Math.floor((row.expiresAt.getTime() - Date.now()) / DAY_MS),
      lastRenewedAt: row.refreshedAt,
      nextRenewalDue: new Date(row.refreshedAt.getTime() + REFRESH_AFTER_DAYS * DAY_MS),
      lastError: row.lastError,
    };
  },

  /** For the admin: renew right now, regardless of schedule. Throws with Instagram's reason if it refuses. */
  async renewNow() {
    const row = await loadToken();
    if (!row) return null;
    await renew(row);
    return this.getStatus();
  },
};
