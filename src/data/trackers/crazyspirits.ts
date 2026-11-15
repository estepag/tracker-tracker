// src/data/trackers/crazyspirits.ts

import type { TrackerRegistryEntry } from "@/data/tracker-registry"

export const crazyspirits: TrackerRegistryEntry = {
  // ── Identity ────────────────────────────────────────────────────────
  slug: "crazyspirits",
  name: "CrazySpirits",
  abbreviation: "CS",
  url: "https://crazyspirits.com",
  description:
    "French-language general tracker covering movies, TV, music, games and applications.",

  // ── Platform & API ──────────────────────────────────────────────────
  // A themed TorrentTrader descendant. The passkey only signs the Torznab
  // feed (/feed.php), which returns no account figures, so the adapter reads
  // the logged-in profile page with browser cookies.
  platform: "crazyspirits",
  apiPath: "/account-details.php",

  // ── Content ─────────────────────────────────────────────────────────
  specialty: "General",
  // The parent categories of the site's Torznab caps: Movies, TV, Audio, PC
  // (0day and Games), Other.
  contentCategories: ["Movies", "TV", "Music", "Games", "Apps"],
  language: "French",

  // ── Visual ──────────────────────────────────────────────────────────
  color: "#bfb697",
  logo: "",

  // ── External Links ──────────────────────────────────────────────────
  trackerHubSlug: "",
  statusPageUrl: "",

  // ── Community ───────────────────────────────────────────────────────
  userClasses: [],
  releaseGroups: [],
  bannedGroups: [],
  notableMembers: [],

  // ── Rules ───────────────────────────────────────────────────────────
  // From the site's automation page: a warning below 0.95 and downloads
  // suspended below 0.85. Seed time and the inactivity window are not stated
  // there.
  rules: {
    minimumRatio: 0.95,
    seedTimeHours: 0,
    loginIntervalDays: 0,
  },

  // ── Status ──────────────────────────────────────────────────────────
  warning: true,
  warningNote:
    "Unverified. Built from one saved profile page and not yet polled against a live account.",

  // ── Flags ───────────────────────────────────────────────────────────
  draft: false,
  supportsTransitPapers: false,
  profileUrlPattern: "",
}
