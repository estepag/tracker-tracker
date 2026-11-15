// src/lib/tracker-platforms/adapters/crazyspirits.ts
//
// Functions: parseCrazyspiritsCredentials, assertAuthenticated, extractOwnUserId,
//            profileRow, sidebarLink, yesNo, parseCrazyspiritsProfile,
//            bootstrapError, fetchHtml, CrazyspiritsAdapter

import { type HTMLElement as ParsedElement, parse as parseHtml } from "node-html-parser"
import { computeBufferBytes, computeRatio } from "@/lib/data-transforms"
import { validateCookieHeader } from "@/lib/tracker-credentials/cookie-header"
import type {
  CrazyspiritsPlatformMeta,
  DebugApiCall,
  FetchOptions,
  TrackerAdapter,
  TrackerStats,
} from "../contract"
import { parseCredentialJson } from "../helpers/cookie-credentials"
import { SessionExpiredError } from "../helpers/errors"
import { fetchTrackerHtml } from "../helpers/html-fetch"
import {
  datePrefix,
  isCloudflareChallenge,
  normalizeWhitespace,
  tryParseCount,
  tryParseSiteBytes,
} from "../helpers/html-parse"

// ---------------------------------------------------------------------------
// Credential handling
//
// The passkey only signs the Torznab feed (/feed.php), which returns torrents
// and no account figures, so stats exist nowhere but the logged-in HTML.
// Cookies plus the User-Agent the session was issued to, as with IPTorrents
// and RetroToon.
// ---------------------------------------------------------------------------

/** Any signed-in page works for finding the member's id. This one is the member's own. */
const BOOTSTRAP_PATH = "/account.php"
/** Intrinsic to the site, so the adapter owns it. */
const PROFILE_PATH = "/account-details.php"

export interface CrazyspiritsCredentials {
  cookies: string
  userAgent: string
}

/** @internal Used by tests. */
export function parseCrazyspiritsCredentials(apiToken: string): CrazyspiritsCredentials {
  const { cookies, userAgent } = parseCredentialJson(apiToken, "CrazySpirits", [
    "cookies",
    "userAgent",
  ] as const)

  return {
    cookies: validateCookieHeader(cookies, {
      extraCookieNames: ["uid", "pass"],
      example: "uid=12345; pass=abc123def456",
    }),
    userAgent,
  }
}

// ---------------------------------------------------------------------------
// Page-shape notes
//
// A heavily themed TorrentTrader descendant. Every signed-in page carries a
// header with the logout link and a "Mon Profil" link holding the member's id,
// and a sidebar with the bonus balance and invitation count. The profile is
// account-details.php?id=N: one <td> per row, the label as bare text ending in
// a colon and the value in <span class="detail_fix">.
// ---------------------------------------------------------------------------

/**
 * Signed-in pages carry the logout link. An anonymous request is redirected,
 * which fetchTrackerHtml already reads as an expired session, so this is for a
 * login page served with a 200.
 */
function assertAuthenticated(html: string): void {
  // Before the logout check: a challenge body also lacks the link, and its
  // message is the more useful error.
  if (isCloudflareChallenge(html)) {
    throw new Error("Cloudflare challenge detected. Cookies need refreshing")
  }

  if (!/href=["']\/?account-logout\.php["']/i.test(html)) {
    throw new SessionExpiredError("Session expired. Browser cookies need to be refreshed")
  }
}

/**
 * The member's own id, from the "Mon Profil" link. Keyed on that label because
 * pages list other members with the same account-details.php?id= links.
 *
 * @internal Used by tests.
 */
export function extractOwnUserId(html: string): number | undefined {
  for (const link of parseHtml(html).querySelectorAll("a")) {
    const label =
      link.getAttribute("title") === "Mon Profil" ||
      normalizeWhitespace(link.textContent ?? "") === "Mon Profil"
    if (!label) continue
    const id = link.getAttribute("href")?.match(/account-details\.php\?id=(\d+)$/)?.[1]
    if (id) return Number(id)
  }
  return undefined
}

/**
 * The value element of the profile row whose label is exactly `label`. A row
 * is a <td> reading "Label: value", so the label is the text before the first
 * colon. Layout cells that wrap a whole table are skipped.
 */
function profileRow(doc: ParsedElement, label: string, valueSelector = "span.detail_fix") {
  for (const cell of doc.querySelectorAll("td")) {
    if (cell.querySelector("table")) continue
    const text = normalizeWhitespace(cell.textContent ?? "")
    const colon = text.indexOf(":")
    if (colon === -1 || text.slice(0, colon).trim() !== label) continue
    const value = cell.querySelector(valueSelector)
    if (value) return normalizeWhitespace(value.textContent ?? "")
  }
  return undefined
}

/** Text of the sidebar link pointing at `href`, such as the bonus balance. */
function sidebarLink(doc: ParsedElement, href: string): string | undefined {
  const link = doc.querySelectorAll("a").find((a) => a.getAttribute("href") === href)
  return link ? normalizeWhitespace(link.textContent ?? "") : undefined
}

/** "Oui" and "Non" as a boolean. Anything else is unknown, not a no. */
function yesNo(value: string | undefined): boolean | null {
  if (value === "Oui") return true
  if (value === "Non") return false
  return null
}

// ---------------------------------------------------------------------------
// Profile page parser (/account-details.php?id=N)
// ---------------------------------------------------------------------------

/** @internal Used by tests. */
export function parseCrazyspiritsProfile(html: string, hostname: string): TrackerStats {
  assertAuthenticated(html)

  const doc = parseHtml(html)

  const uploadedText = profileRow(doc, "Envoyé")
  const downloadedText = profileRow(doc, "Téléchargé")

  // Neither row is on the page, so this is a signed-in page that is not a
  // profile.
  if (uploadedText === undefined && downloadedText === undefined) {
    throw new Error(
      `Unexpected response from ${hostname}: Could not find the statistics on the CrazySpirits profile page. The page structure may have changed.`
    )
  }

  // One side readable and the other not is a page-shape change, not an account
  // with nothing on that side, and both fields are non-nullable bigint, so a 0n
  // here would be stored as a measured zero (standard 2.1).
  const uploadedBytes = tryParseSiteBytes(uploadedText ?? "")
  if (uploadedBytes === undefined) {
    throw new Error(`Unexpected response from ${hostname}: unreadable uploaded byte total`)
  }
  const downloadedBytes = tryParseSiteBytes(downloadedText ?? "")
  if (downloadedBytes === undefined) {
    throw new Error(`Unexpected response from ${hostname}: unreadable downloaded byte total`)
  }

  const meta: CrazyspiritsPlatformMeta = {}
  const uploadedTorrents = tryParseCount(profileRow(doc, "Torrents partagés"))
  if (uploadedTorrents !== undefined) meta.uploadedTorrents = uploadedTorrents
  // "Vous avez 5 invitations", in the sidebar of every signed-in page.
  const invites = tryParseCount(sidebarLink(doc, "/invite.php"))
  if (invites !== undefined) meta.invites = invites

  return {
    // The one row whose value sits in a <font>, not a detail_fix span.
    username: profileRow(doc, "Nom d'utilisateur", "font") ?? "",
    group: profileRow(doc, "Grade du membre") || null,
    uploadedBytes,
    downloadedBytes,
    // Derived from byte totals, not the page's own rounded Ratio row.
    ratio: computeRatio(uploadedBytes, downloadedBytes),
    bufferBytes: computeBufferBytes(uploadedBytes, downloadedBytes),
    // The profile has an "Activité locale" box, but the only capture of it is
    // the empty state, so a count cannot be read off it yet.
    seedingCount: null,
    leechingCount: null,
    // "Crazy Bonus", the sidebar link to the bonus shop.
    seedbonus: tryParseCount(sidebarLink(doc, "/mybonus.php")) ?? null,
    hitAndRuns: null,
    requiredRatio: null,
    warned: yesNo(profileRow(doc, "Avertissements")),
    freeleechTokens: null,
    // Bare YYYY-MM-DD, cut from the site's "2026-04-26 04:14:43".
    joinedDate: datePrefix(profileRow(doc, "Inscription") ?? ""),
    lastAccessDate: datePrefix(profileRow(doc, "Dernière visite") ?? ""),
    // Returned on every successful poll so a figure that leaves the page clears.
    platformMeta: meta,
  }
}

// ---------------------------------------------------------------------------
// HTML fetcher, direct fetch or proxy
// ---------------------------------------------------------------------------

function bootstrapError(hostname: string): string {
  return `Unexpected response from ${hostname}: Could not find the "Mon Profil" link on the CrazySpirits page. The page structure may have changed`
}

function fetchHtml(
  url: string,
  creds: CrazyspiritsCredentials,
  proxyAgent?: FetchOptions["proxyAgent"]
): Promise<string> {
  // No followRedirects: both pages answer a signed-in member directly, so any
  // redirect is the bounce to the login page.
  return fetchTrackerHtml({
    url,
    cookies: creds.cookies,
    userAgent: creds.userAgent,
    proxyAgent,
    label: "CrazySpirits",
    sessionExpiredMessage: "Session expired. Browser cookies need to be refreshed",
  })
}

// ---------------------------------------------------------------------------
// Adapter class
// ---------------------------------------------------------------------------

export class CrazyspiritsAdapter implements TrackerAdapter {
  // _apiPath is ignored: both paths are intrinsic to CrazySpirits, so the
  // adapter owns them. The first poll takes two requests, to learn the
  // member's id; later polls reuse it and take one.
  async fetchStats(
    baseUrl: string,
    apiToken: string,
    _apiPath: string,
    options?: FetchOptions
  ): Promise<TrackerStats> {
    const creds = parseCrazyspiritsCredentials(apiToken)
    const hostname = new URL(baseUrl).hostname

    let uid = options?.remoteUserId
    if (uid === undefined) {
      const html = await fetchHtml(`${baseUrl}${BOOTSTRAP_PATH}`, creds, options?.proxyAgent)
      assertAuthenticated(html)
      uid = extractOwnUserId(html)
      if (uid === undefined) throw new Error(bootstrapError(hostname))
    }

    const html = await fetchHtml(`${baseUrl}${PROFILE_PATH}?id=${uid}`, creds, options?.proxyAgent)
    const stats = parseCrazyspiritsProfile(html, hostname)
    // Persisted by the scheduler so later polls skip discovery.
    stats.remoteUserId = uid
    return stats
  }

  async fetchRaw(
    baseUrl: string,
    apiToken: string,
    _apiPath: string,
    options?: FetchOptions
  ): Promise<DebugApiCall[]> {
    const calls: DebugApiCall[] = []
    // Outside any try: bad credentials are a caller error, not a call entry.
    const creds = parseCrazyspiritsCredentials(apiToken)
    const hostname = new URL(baseUrl).hostname

    let uid = options?.remoteUserId
    if (uid === undefined) {
      try {
        const html = await fetchHtml(`${baseUrl}${BOOTSTRAP_PATH}`, creds, options?.proxyAgent)
        assertAuthenticated(html)
        uid = extractOwnUserId(html)
        calls.push({
          label: "Account Page (user id lookup)",
          endpoint: BOOTSTRAP_PATH,
          data: { userId: uid ?? null },
          error: null,
        })
      } catch (err) {
        calls.push({
          label: "Account Page (user id lookup)",
          endpoint: BOOTSTRAP_PATH,
          data: null,
          error: err instanceof Error ? err.message : "Request failed",
        })
      }
    }

    if (uid === undefined) {
      calls.push({
        label: "Profile Page",
        endpoint: PROFILE_PATH,
        data: null,
        error: bootstrapError(hostname),
      })
      return calls
    }

    const endpoint = `${PROFILE_PATH}?id=${uid}`
    try {
      const html = await fetchHtml(`${baseUrl}${endpoint}`, creds, options?.proxyAgent)
      // The parsed figures stand in for the raw artifact, which is a whole
      // HTML page listing other members.
      calls.push({
        label: "Profile Page",
        endpoint,
        data: parseCrazyspiritsProfile(html, hostname),
        error: null,
      })
    } catch (err) {
      calls.push({
        label: "Profile Page",
        endpoint,
        data: null,
        error: err instanceof Error ? err.message : "Request failed",
      })
    }

    return calls
  }
}
