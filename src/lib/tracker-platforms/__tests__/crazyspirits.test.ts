// src/lib/tracker-platforms/__tests__/crazyspirits.test.ts

import { parse as parseHtml } from "node-html-parser"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  CrazyspiritsAdapter,
  extractOwnUserId,
  parseCrazyspiritsCredentials,
  parseCrazyspiritsProfile,
} from "../adapters/crazyspirits"
import type { CrazyspiritsPlatformMeta } from "../contract"
import { SessionExpiredError } from "../helpers/errors"

const HOST = "crazyspirits.com"
const BASE_URL = `https://${HOST}`

const VALID_TOKEN = JSON.stringify({
  cookies: "uid=4242; pass=0123456789abcdef0123456789abcdef",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestUA",
})

// ---------------------------------------------------------------------------
// Rebuilt from an account-details.php page saved by a member on 2026-11-14
// rather than pasted, since the real page lists other members and embeds
// tokens. The username and ids are invented; the markup, attribute quoting,
// stray closing tags and French labels are the site's. The fidelity tests
// below pin what the parser relies on.
// ---------------------------------------------------------------------------

const PAGE_HEAD = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>CrazySpirits : Détails du profil</title>
</head><body>
<div id="header-stats"><span>25 GiB</span> <span>50 GiB</span> <span>2.00</span></div>
`

const HEADER_LINKS = `<div id="switchs"><ul>
<li><a class="blue" href="/themes/SB_SHAMAN/php/switch.php?switch=blue" title="Style Bleu"><span></span></a></li>
<li><a class='profile' href='/account.php' title='Mon Compte'><span></span></a></li>
<li><a class='account' href='/account-details.php?id=4242' title='Mon Profil'><span></span></a></li>
<li><a class='logout' href='/account-logout.php' title='Déconnexion'><span></span></a></li>
<li><a class='mail' href='/mailbox.php' title='Mes Messages'><span></span></a></li>
</ul></div>
`

const SIDEBAR = `<div class='profile-links'><i class='fa-1x fa fa-graduation-cap'></i> <b>Mon Grade :</b>  <span style='color:#bfb697; font-weight:bold;font-size: 13px;'>Membre</span><br/><i class='fa-1x fa fa-cogs'></i> <a href='/account.php'>Mon Compte</a><br/><i class='fa-1x fa fa-connectdevelop'></i> <a href='/account-details.php?id=4242'>Mon Profil</a><br/><i class='fa-1x fa fa-shield'></i> Crazy Bonus <a href='/mybonus.php'>5000</a><br/><i class='fa-1x fa fa-bookmark-o'></i> <a href='/bookmarks.php'> Suivi Torrent</a><br/><i class='fa-1x fa fa-envira'></i> <a href='/invite.php' title='Envoyer une invitation'>Vous avez 5 invitations</a><br/><i class='fa-1x fa fa-hourglass-end'></i> <a href='/account-invites.php'> Mes Invitations</a></div>
`

/** Site totals, printed on every page. Its labels must not be taken for profile rows. */
const SITE_STATS = `<table class="site-stats"><tr><td>Torrents</td></tr>
<tr><td>Seeders : <b>6,669</b></td></tr>
<tr><td>Membres</td></tr><tr><td>Nous avons : <b>2,901 membres</b></td></tr></table>
`

const PROFILE_TABLE = `<table class="myTcell" align="center" width="100%"><tr><td valign="top">
<table align="center" border="0" cellpadding="4" cellspacing="1" width="100%">
    <tr>
        <th class="ttable_head" align="center" colspan="2"><i class="fa fa-user-circle"></i> <b>Profil</b></th>
    </tr>
<tr align="right">
<td align="left">Nom d'utilisateur:
<font color='#bfb697'>GrenierSeeder</font>
<span class="detail_fix"><a href="mailbox.php?compose&amp;id=4242" title="Envoyer un message à ce membre"> <i class="fa-1x fa fa-lg fa-comment-o"></i></a></span>
<br/>
</td>
</tr>
<tr>
		<td align="left">Grade du membre: <span class="detail_fix">Membre</span>
		<br/>
		</td>
</tr>
<tr>
		<td align="left">Titre: <span class="detail_fix"></span>
		<br/>
		</td>
</tr>
<tr>
		<td align="left">Inscription: <span class="detail_fix">2026-04-26 04:14:43</span><br/>
		<span style="color:#fff; font-size:12px;">
        (Inscrit depuis 202 jours)
        </span>
		<br/>
		</td>
</tr>
<tr>
		<td align="left">Dernière visite: <span class="detail_fix">2026-11-15 00:51:47</span>
		<br/>
		</td>
</tr>
<tr>
		<td align="left">Dernière page consultée: <span class="detail_fix">/var/www/vhosts/crazyspirits.com/httpdocs/account-details.php</span>
		<br/>
		</td>
</tr></table>
<br/>
<table align="center" border="0" cellpadding="4" cellspacing="1" width="100%">
<tr>
        <td align="left">Client:<span class="detail_fix"> qBittorrent</span>
        <br/>
        </td>
</tr>
<tr>
        <td align="left">Avertissements:<span class="detail_fix"> Non</span>
        <br/>
        </td>
</tr>
</table>
	<table align="center" border="0" cellpadding="4" cellspacing="1" width="100%">
	<tr>
		<th class="ttable_head" align="center" colspan="2"><i class='fa-1x fa fa-bar-chart'></i> <b>Statistiques</b></th>
	</tr>
	<tr valign="top">
		<td align="left">Envoyé: <span class="detail_fix">50 GiB</span>
		<br/>
		</td>
</tr>
<tr>
		<td align="left">Téléchargé: <span class="detail_fix">25 GiB</span>
		<br/>
		</td></tr>
</tr>
<tr>
		<td align="left">Ratio: <span class="detail_fix">2</span>
		<br/>
		</td></tr>
</tr>
<tr>
		<td align="left">Téléchargement quotidien moyen: <span class="detail_fix">126.27 MiB</span>
		<br/>
		</td></tr>
</tr>
<tr>
		<td align="left">Partage quotidien moyen: <span class="detail_fix">252.55 MiB</span>
		<br/>
		</td></tr>
</tr>
<tr>
		<td align="left">Torrents partagés: <span class="detail_fix">0</span>
		</br>
		</td></tr>
</tr>
</table>
</td></tr></table>
<div id='k2' style='display:none;'><br/><b><i>Ce membre n’a actuellement aucun transfert actif.</i></b><br/></div>
`

/** Other members, linked the same way as the member's own profile. */
const ONLINE_MEMBERS = `<div class="online">Visite du jour (172)
<a href='/account-details.php?id=273'>MembreUn</a>, <a href='/account-details.php?id=6263'>MembreDeux</a>
</div>
`

const PAGE_FOOT = `</body></html>`

const PROFILE_PAGE =
  PAGE_HEAD + HEADER_LINKS + SIDEBAR + SITE_STATS + PROFILE_TABLE + ONLINE_MEMBERS + PAGE_FOOT

/** account.php: signed in, the member's links in place, but no profile table. */
const ACCOUNT_PAGE = PAGE_HEAD + HEADER_LINKS + SIDEBAR + SITE_STATS + ONLINE_MEMBERS + PAGE_FOOT

/**
 * Same shape with real traffic on it, to exercise the paths a fresh account
 * cannot reach: terabyte and megabyte totals, a finite non-round ratio, a
 * promoted grade, a warning, and counts with grouping commas. Distinct values,
 * so swapping two field assignments in the parser would not go unnoticed.
 */
const ACTIVE_PROFILE_PAGE = PROFILE_PAGE.replace(
  'Envoyé: <span class="detail_fix">50 GiB<',
  'Envoyé: <span class="detail_fix">1.25 TiB<'
)
  .replace(
    'Téléchargé: <span class="detail_fix">25 GiB<',
    'Téléchargé: <span class="detail_fix">512.50 GiB<'
  )
  .replace(
    'Grade du membre: <span class="detail_fix">Membre<',
    'Grade du membre: <span class="detail_fix">Super Membre<'
  )
  .replace(
    'Avertissements:<span class="detail_fix"> Non<',
    'Avertissements:<span class="detail_fix"> Oui<'
  )
  .replace(
    'Torrents partagés: <span class="detail_fix">0<',
    'Torrents partagés: <span class="detail_fix">37<'
  )
  .replace("<a href='/mybonus.php'>5000</a>", "<a href='/mybonus.php'>12,450.5</a>")
  .replace(">Vous avez 5 invitations<", ">Vous avez 2 invitations<")

const LOGIN_PAGE = `<!DOCTYPE html><html lang="fr"><head><title>CrazySpirits : Connexion</title></head>
<body><form action="/account-login.php" method="post"><input name="username"><input name="password" type="password"></form></body></html>`

const CLOUDFLARE_PAGE = `<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body><div id="challenge-running"></div></body></html>`

const GIB = 1024n ** 3n

function okPage(html: string): Response {
  return { ok: true, status: 200, text: async () => html } as Response
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

describe("parseCrazyspiritsCredentials", () => {
  it("accepts a well-formed blob and returns the cookies verbatim", () => {
    expect(parseCrazyspiritsCredentials(VALID_TOKEN)).toEqual({
      cookies: "uid=4242; pass=0123456789abcdef0123456789abcdef",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestUA",
    })
  })

  it("keeps every cookie of a full header, whatever the site names them", () => {
    const token = JSON.stringify({
      cookies: "PHPSESSID=abc123; uid=4242; pass=def456; cf_clearance=ghi789",
      userAgent: "TestUA",
    })
    expect(parseCrazyspiritsCredentials(token).cookies).toBe(
      "PHPSESSID=abc123; uid=4242; pass=def456; cf_clearance=ghi789"
    )
  })

  it("strips a copied 'Cookie: ' prefix", () => {
    const token = JSON.stringify({ cookies: "Cookie: uid=4242; pass=abc", userAgent: "TestUA" })
    expect(parseCrazyspiritsCredentials(token).cookies).toBe("uid=4242; pass=abc")
  })

  it("rejects a bare cookie name pasted instead of the header value", () => {
    const token = JSON.stringify({ cookies: "pass", userAgent: "TestUA" })
    expect(() => parseCrazyspiritsCredentials(token)).toThrow(/pasted a cookie name/)
  })

  it("rejects a DevTools-truncated value containing an ellipsis", () => {
    const token = JSON.stringify({ cookies: "uid=4242; pass=abc…def", userAgent: "TestUA" })
    expect(() => parseCrazyspiritsCredentials(token)).toThrow(/truncated/)
  })

  it("rejects a non-JSON token and names both required fields", () => {
    expect(() => parseCrazyspiritsCredentials("uid=4242")).toThrow(
      /CrazySpirits credentials must be a JSON object/
    )
    expect(() => parseCrazyspiritsCredentials("uid=4242")).toThrow(/cookies.*userAgent/)
  })

  it("rejects a blob missing userAgent", () => {
    expect(() => parseCrazyspiritsCredentials(JSON.stringify({ cookies: "uid=4242" }))).toThrow(
      /userAgent/
    )
  })
})

// ---------------------------------------------------------------------------
// Fixture fidelity
// ---------------------------------------------------------------------------

describe("fixture fidelity against the saved page", () => {
  const doc = parseHtml(PROFILE_PAGE)

  it("reproduces the profile rows as a label, a colon and a detail_fix span", () => {
    const rows = doc
      .querySelectorAll("td")
      .filter((td) => !td.querySelector("table") && td.querySelector("span.detail_fix"))
      .map((td) => td.textContent.replace(/\s+/g, " ").trim().split(":")[0])
    expect(rows).toEqual([
      "Nom d'utilisateur",
      "Grade du membre",
      "Titre",
      "Inscription",
      "Dernière visite",
      "Dernière page consultée",
      "Client",
      "Avertissements",
      "Envoyé",
      "Téléchargé",
      "Ratio",
      "Téléchargement quotidien moyen",
      "Partage quotidien moyen",
      "Torrents partagés",
    ])
  })

  it("keeps the username in a <font>, with a detail_fix span that holds only the mail icon", () => {
    expect(PROFILE_PAGE).toContain("<font color='#bfb697'>GrenierSeeder</font>")
  })

  it("keeps both quoting styles and the stray closing tags the site sends", () => {
    expect(PROFILE_PAGE).toContain(`href='/account-logout.php'`)
    expect(PROFILE_PAGE).toContain(`class="detail_fix"`)
    expect(PROFILE_PAGE).toContain("</td></tr>\n</tr>")
    expect(PROFILE_PAGE).toContain("</br>")
  })

  it("keeps the rounded Ratio row, which the parser must not trust", () => {
    expect(PROFILE_PAGE).toContain('Ratio: <span class="detail_fix">2</span>')
  })

  it("lists other members with the same link shape as the member's own", () => {
    expect(PROFILE_PAGE).toContain("/account-details.php?id=273")
  })
})

// ---------------------------------------------------------------------------
// User id lookup
// ---------------------------------------------------------------------------

describe("extractOwnUserId", () => {
  it("reads the id out of the Mon Profil link", () => {
    expect(extractOwnUserId(ACCOUNT_PAGE)).toBe(4242)
  })

  it("ignores other members' profile links", () => {
    const html = PAGE_HEAD + ONLINE_MEMBERS + HEADER_LINKS + PAGE_FOOT
    expect(extractOwnUserId(html)).toBe(4242)
    expect(extractOwnUserId(PAGE_HEAD + ONLINE_MEMBERS + PAGE_FOOT)).toBeUndefined()
  })

  it("finds the sidebar link, labelled by its text, when the header one is gone", () => {
    expect(extractOwnUserId(PAGE_HEAD + SIDEBAR + PAGE_FOOT)).toBe(4242)
  })

  it("returns undefined on a login page", () => {
    expect(extractOwnUserId(LOGIN_PAGE)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Profile page parser
// ---------------------------------------------------------------------------

describe("parseCrazyspiritsProfile", () => {
  it("parses every field off a fresh account's profile", () => {
    const stats = parseCrazyspiritsProfile(PROFILE_PAGE, HOST)

    expect(stats.username).toBe("GrenierSeeder")
    expect(stats.group).toBe("Membre")
    expect(stats.uploadedBytes).toBe(50n * GIB)
    expect(stats.downloadedBytes).toBe(25n * GIB)
    expect(stats.ratio).toBe(2)
    expect(stats.bufferBytes).toBe(25n * GIB)
    expect(stats.seedbonus).toBe(5000)
    expect(stats.warned).toBe(false)
    expect(stats.joinedDate).toBe("2026-04-26")
    expect(stats.lastAccessDate).toBe("2026-11-15")
  })

  it("reports every unpublished figure as null, never as a measured zero", () => {
    const stats = parseCrazyspiritsProfile(PROFILE_PAGE, HOST)
    expect(stats.seedingCount).toBeNull()
    expect(stats.leechingCount).toBeNull()
    expect(stats.hitAndRuns).toBeNull()
    expect(stats.requiredRatio).toBeNull()
    expect(stats.freeleechTokens).toBeNull()
  })

  it("collects the upload count and invitations into platformMeta", () => {
    expect(
      parseCrazyspiritsProfile(PROFILE_PAGE, HOST).platformMeta as CrazyspiritsPlatformMeta
    ).toEqual({ uploadedTorrents: 0, invites: 5 })
  })

  it("handles an active account: larger units, a warning, a promoted grade", () => {
    const stats = parseCrazyspiritsProfile(ACTIVE_PROFILE_PAGE, HOST)

    expect(stats.group).toBe("Super Membre")
    expect(stats.uploadedBytes).toBe(1_374_389_534_720n) // 1.25 * 1024^4
    expect(stats.downloadedBytes).toBe(550_292_684_800n) // 512.50 * 1024^3
    // From the byte totals, not the page's rounded "2".
    expect(stats.ratio).toBeCloseTo(1280 / 512.5, 6)
    expect(stats.seedbonus).toBe(12450.5)
    expect(stats.warned).toBe(true)
    expect(stats.platformMeta as CrazyspiritsPlatformMeta).toEqual({
      uploadedTorrents: 37,
      invites: 2,
    })
  })

  it("does not take the daily averages or the header figures for the totals", () => {
    // "Téléchargé" must not match "Téléchargement quotidien moyen".
    const stats = parseCrazyspiritsProfile(PROFILE_PAGE, HOST)
    expect(stats.downloadedBytes).not.toBe(132_403_691n)
    expect(stats.downloadedBytes).toBe(25n * GIB)
  })

  it("reports the group, warning and bonus as unknown when their markup is missing", () => {
    const html = PROFILE_PAGE.replace(
      'Grade du membre: <span class="detail_fix">Membre</span>',
      'Grade du membre: <span class="detail_fix"></span>'
    )
      .replace(
        'Avertissements:<span class="detail_fix"> Non<',
        'Avertissements:<span class="detail_fix"> 2<'
      )
      .replace("<a href='/mybonus.php'>5000</a>", "")
    const stats = parseCrazyspiritsProfile(html, HOST)
    expect(stats.group).toBeNull()
    expect(stats.warned).toBeNull()
    expect(stats.seedbonus).toBeNull()
  })

  it("leaves the dates undefined when their rows are reshaped", () => {
    const html = PROFILE_PAGE.replace(">2026-04-26 04:14:43<", ">il y a 6 mois<").replace(
      ">2026-11-15 00:51:47<",
      "><"
    )
    const stats = parseCrazyspiritsProfile(html, HOST)
    expect(stats.joinedDate).toBeUndefined()
    expect(stats.lastAccessDate).toBeUndefined()
  })

  it("throws session-expired on a login page served with a 200", () => {
    expect(() => parseCrazyspiritsProfile(LOGIN_PAGE, HOST)).toThrow(SessionExpiredError)
  })

  it("prefers the Cloudflare message over the generic session one", () => {
    expect(() => parseCrazyspiritsProfile(CLOUDFLARE_PAGE, HOST)).toThrow(
      "Cloudflare challenge detected. Cookies need refreshing"
    )
  })

  it("throws when a signed-in page carries no profile statistics", () => {
    expect(() => parseCrazyspiritsProfile(ACCOUNT_PAGE, HOST)).toThrow(
      "Unexpected response from crazyspirits.com: Could not find the statistics on the CrazySpirits profile page. The page structure may have changed."
    )
  })

  it("throws naming the uploaded total when only Téléchargé can be read", () => {
    expect(() =>
      parseCrazyspiritsProfile(PROFILE_PAGE.replace('fix">50 GiB</span>', 'fix">?</span>'), HOST)
    ).toThrow("Unexpected response from crazyspirits.com: unreadable uploaded byte total")
  })

  it("throws naming the downloaded total when only Envoyé can be read", () => {
    expect(() =>
      parseCrazyspiritsProfile(PROFILE_PAGE.replace('fix">25 GiB</span>', 'fix">?</span>'), HOST)
    ).toThrow("Unexpected response from crazyspirits.com: unreadable downloaded byte total")
  })
})

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

describe("CrazyspiritsAdapter.fetchStats", () => {
  const adapter = new CrazyspiritsAdapter()

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mockBothPages() {
    return vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(okPage(ACCOUNT_PAGE))
      .mockResolvedValueOnce(okPage(PROFILE_PAGE))
  }

  it("looks up the member's id, then reads the profile", async () => {
    const fetchSpy = mockBothPages()

    const stats = await adapter.fetchStats(BASE_URL, VALID_TOKEN, "")

    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([
      "https://crazyspirits.com/account.php",
      "https://crazyspirits.com/account-details.php?id=4242",
    ])
    expect(stats.username).toBe("GrenierSeeder")
    expect(stats.uploadedBytes).toBe(50n * GIB)
    expect(stats.remoteUserId).toBe(4242)
  })

  it("uses a cached remoteUserId and skips the lookup", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(okPage(PROFILE_PAGE))

    const stats = await adapter.fetchStats(BASE_URL, VALID_TOKEN, "", { remoteUserId: 9001 })

    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([
      "https://crazyspirits.com/account-details.php?id=9001",
    ])
    expect(stats.remoteUserId).toBe(9001)
  })

  it("sends the pasted cookies and the copied User-Agent on both requests", async () => {
    const fetchSpy = mockBothPages()

    await adapter.fetchStats(BASE_URL, VALID_TOKEN, "")

    for (const call of fetchSpy.mock.calls) {
      const headers = call[1]?.headers as Record<string, string>
      expect(headers.Cookie).toBe("uid=4242; pass=0123456789abcdef0123456789abcdef")
      expect(headers["User-Agent"]).toBe("Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestUA")
    }
  })

  it("ignores the apiPath it is given", async () => {
    const fetchSpy = mockBothPages()

    await adapter.fetchStats(BASE_URL, VALID_TOKEN, "/feed.php")

    expect(fetchSpy.mock.calls[0][0]).toBe("https://crazyspirits.com/account.php")
  })

  it("throws without fetching the profile when the Mon Profil link is missing", async () => {
    const noLink = `${PAGE_HEAD}<a class='logout' href='/account-logout.php'>x</a>${PAGE_FOOT}`
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(okPage(noLink))

    await expect(adapter.fetchStats(BASE_URL, VALID_TOKEN, "")).rejects.toThrow(
      'Unexpected response from crazyspirits.com: Could not find the "Mon Profil" link on the CrazySpirits page. The page structure may have changed'
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("throws session-expired when the site redirects to its login page", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "/account-login.php" } })
      )

    await expect(adapter.fetchStats(BASE_URL, VALID_TOKEN, "")).rejects.toThrow(
      "Session expired. Browser cookies need to be refreshed"
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("throws session-expired on a login page served with a 200", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(okPage(LOGIN_PAGE))

    await expect(adapter.fetchStats(BASE_URL, VALID_TOKEN, "")).rejects.toBeInstanceOf(
      SessionExpiredError
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("names the host when the request times out", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(
      new DOMException("The operation was aborted due to timeout", "TimeoutError")
    )

    await expect(adapter.fetchStats(BASE_URL, VALID_TOKEN, "")).rejects.toThrow(
      "Request to crazyspirits.com timed out"
    )
  })

  it("throws on a malformed credential blob before any request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")

    await expect(adapter.fetchStats(BASE_URL, "not-json", "")).rejects.toThrow(
      /must be a JSON object/
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("CrazyspiritsAdapter.fetchRaw", () => {
  const adapter = new CrazyspiritsAdapter()

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns one entry per page holding the parsed figures, not the pages", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(okPage(ACCOUNT_PAGE))
      .mockResolvedValueOnce(okPage(PROFILE_PAGE))

    const calls = await adapter.fetchRaw(BASE_URL, VALID_TOKEN, "")

    expect(calls.map((c) => [c.label, c.endpoint])).toEqual([
      ["Account Page (user id lookup)", "/account.php"],
      ["Profile Page", "/account-details.php?id=4242"],
    ])
    expect(calls.every((c) => c.error === null)).toBe(true)
    expect(calls[0].data).toEqual({ userId: 4242 })
    expect(calls[1].data).toMatchObject({ username: "GrenierSeeder", group: "Membre" })
    // Nothing off the pages beyond the parsed figures, so no other member.
    const dump = JSON.stringify(calls, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
    expect(dump).not.toMatch(/MembreUn|mailbox/)
  })

  it("skips the lookup entry when the id is cached", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(okPage(PROFILE_PAGE))

    const calls = await adapter.fetchRaw(BASE_URL, VALID_TOKEN, "", { remoteUserId: 9001 })

    expect(calls.map((c) => c.endpoint)).toEqual(["/account-details.php?id=9001"])
  })

  it("records a per-page error instead of throwing, and sanitizes it", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(okPage(ACCOUNT_PAGE))
      .mockRejectedValueOnce(new Error("exploded at https://crazyspirits.com/x?tok=SECRET"))

    const calls = await adapter.fetchRaw(BASE_URL, VALID_TOKEN, "")

    expect(calls).toHaveLength(2)
    expect(calls[0].error).toBeNull()
    expect(calls[1].data).toBeNull()
    expect(calls[1].error).toBe("Failed to connect to crazyspirits.com: Error")
    expect(calls[1].error).not.toMatch(/SECRET/)
  })

  it("records why the profile was not fetched when the lookup fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(okPage(LOGIN_PAGE))

    const calls = await adapter.fetchRaw(BASE_URL, VALID_TOKEN, "")

    expect(calls).toHaveLength(2)
    expect(calls[0].error).toBe("Session expired. Browser cookies need to be refreshed")
    expect(calls[1].data).toBeNull()
    expect(calls[1].error).toMatch(/^Unexpected response from crazyspirits\.com: /)
  })

  it("throws on a malformed credential blob rather than recording a call", async () => {
    await expect(adapter.fetchRaw(BASE_URL, "not-json", "")).rejects.toThrow(
      /must be a JSON object/
    )
  })
})
