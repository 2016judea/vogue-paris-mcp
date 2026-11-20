# Connector listing kit: Paris Fashion Archive

Copy from here. Format: `~/Desktop/workspace/breach-to-claim/SUBMISSION.md`; rejection history and policy
traps: `~/Desktop/workspace/small-business-intelligence-mcp/SUBMISSION-KIT.md`; browser mechanics:
`~/Desktop/workspace/appeal-draft/SUBMISSION.md` and the `browser-as-aidan` skill.

| Field | Value |
|---|---|
| Name | Paris Fashion Archive (21 chars) |
| Endpoint | `https://vogue-paris-mcp.vercel.app/mcp` · Streamable HTTP · stateless · auth none · no UI/CSP |
| Publisher | Brick and Mortar AI LLC, 1651 Eleanor Ave, Saint Paul, MN 55116 |
| Website / docs | https://vogue-paris-mcp.vercel.app/ |
| Privacy | https://vogue-paris-mcp.vercel.app/privacy |
| Support | https://github.com/2016judea/vogue-paris-mcp/issues (issues enabled) |
| Source | https://github.com/2016judea/vogue-paris-mcp |
| Icon 512×512 | https://vogue-paris-mcp.vercel.app/icon.png (original dress-form mark, rose #b42f57 on #e4e5e8) |
| Composer icon (stroke-only, currentColor) | https://vogue-paris-mcp.vercel.app/icon-composer.svg |
| Favicon | `/favicon.svg`, `/favicon.ico` (the directory shows the server URL's favicon unless a custom icon is set) |
| Availability | United States |

**Why not "Vogue Paris".** Vogue is Condé Nast's trademark. A listing under that name reads as their official
connector and invites a rejection. The name is ours; the description names the content factually, and the listing,
connect page (h1, footer), privacy page, README and the server's `title`/instructions all carry **"Independent; not
affiliated with Condé Nast or Vogue."** Tool names are unchanged. The icon is original: no wordmark, no cover art, no
scan. `tests/mcp.test.js` holds the name and the line.

**The domain is a `.vercel.app` alias**, not one the LLC owns, as with Breach to Claim. Reviewers have checked that
policy URLs belong to the publisher (SBI kit §1). A domain costs money, so it stays Aidan's call.

## One-liner (≤100; the Claude form allows 200)
Find any 1920–1954 issue of Vogue Paris digitised by the BnF; see covers and pages up to 1930

## Description
Paris Fashion Archive brings the 1920–1954 issues of Vogue Paris that the Bibliothèque nationale de France
digitised on Gallica into Claude. Ask which issues exist for a year, a month or a date range, look at the covers,
or open up to four pages of one issue at a time so Claude can read, describe or translate the French. Covers and
pages are returned as images only for US public-domain issues (1930 and earlier). The 1932–1954 issues get their
details plus a reader link to vogue-paris.vercel.app, where every issue reads free, page by page. A month with no
issue names the nearest one. No account, nothing stored. Source: gallica.bnf.fr / Bibliothèque nationale de France.
Independent; not affiliated with Condé Nast or Vogue.

## Connection requirements
None. No account, key or OAuth. Three read-only tools; the server stores nothing about the person.

## Annotations (explicit booleans; `tests/mcp.test.js` holds them)
| Tool | readOnly | destructive | openWorld | idempotent |
|---|---|---|---|---|
| find_issues, look_at_covers, look_at_pages | true | false | false | true |

openWorld is false: the only calls go to vogue-paris.vercel.app and its Vercel Blob store, both ours. If ChatGPT
is ever filed, its rubric wants `true` for any outside endpoint (SBI kit §7); ours are first-party, but check.

## The copyright line (reviewers will ask)
A work published in year Y enters the US public domain on 1 January of Y + 96 (17 U.S.C. 304). In 2026 that is
every issue from 1930 and earlier: 104 issues. The 1932–1954 issues are French works whose US copyright was
restored (URAA, 17 U.S.C. 104A) and runs to 2028–2050. For them the tools return the details and a reader link,
never a page or a cover. `publicDomainUS()` in `lib/archive.js` computes the line from today's date, so each
January another year opens on its own. The archive holds no 1931 issue.

## Test setup / reviewer access
No test account, no credentials. Reproduce from a terminal:

```
curl -s https://vogue-paris-mcp.vercel.app/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"look_at_pages","arguments":{"issue":"1926-03-01","pages":[1,2,3]}}}'
node scripts/live_cases.mjs     # every case below, against the live endpoint
```

## Test cases
Run against the live endpoint on 2026-11-20 with `node scripts/live_cases.mjs`: **7/7 PASS**.

| # | Prompt | Tool call | Live result |
|---|---|---|---|
| P1 | "Show me the Vogue Paris covers from 1925." | look_at_covers `{year:1925}` | 10 covers as images, each with date and reader link (489 ms) |
| P2 | "Translate pages 1–3 of the 1 March 1926 issue." | look_at_pages `{issue:"1926-03-01", pages:[1,2,3]}` | 3 page images (1200 px), a 2400 px scan link per page, 78 pages in all. Legible at that size: page 3 opens "Saint-Moritz : le costume de sport se renouvelle…", which Claude translates (333 ms) |
| P3 | "Which issues exist for 1921?" | find_issues `{year:1921}` | 22 issues, 1 Jan to 15 Dec 1921, each with page count and reader link |
| P4 | "Show me the June 1925 issue." | find_issues `{year:1925, month:6}` · look_at_pages `{issue:"1925-06"}` | No June 1925 issue; both name the nearest, 1 July 1925 (70 pages), and look_at_pages shows its cover |

Negative:

| # | Prompt | Expected | Live result |
|---|---|---|---|
| N1 | "Show me pages of the March 1950 issue." | look_at_pages `{issue:"1950-03-01"}`: no images, a reader link | 0 images. "01 mars 1950 (1950) is still under US copyright, so its pages and cover are not returned here. Read it on the site: https://vogue-paris.vercel.app/issue/…" |
| N2 | "Download the whole 1925 issue as a PDF." | No tool downloads or exports. Claude gives the reader link | tools/list is find_issues, look_at_covers, look_at_pages only; find_issues `{year:1925}` returns each issue's reader link |

## Starter prompts
- Show me the covers from 1925.
- Translate the first pages of the 1 March 1926 issue.
- What were the hats like in spring 1926?

## Use cases (form step 4; shown to reviewers only)
1. Look at the covers of a year. "Show me the Vogue Paris covers from 1925."
2. Read and translate pages of one issue. "Translate pages 1–3 of the 1 March 1926 issue of Vogue Paris."
3. Find which issues exist. "Which issues of Vogue Paris exist for 1921?"

Prerequisites: none. Read only.

## Reviewer note (form step 9, "Additional notes")
Images are returned only for issues in the US public domain: a work published in year Y enters it on 1 January of
Y + 96, so in 2026 that means 1930 and earlier. The 1932–1954 issues are French works whose US copyright was restored
under the URAA; for them the tools return the issue details and a link to the free reader, never pages or covers. The
scans are the Bibliothèque nationale de France's Gallica digitisations, mirrored at vogue-paris.vercel.app (ours), and
are credited "Source: gallica.bnf.fr / BnF" in every page answer. The listing is named Paris Fashion Archive, not
after the magazine, because Vogue is Condé Nast's trademark; we are independent and not affiliated. No account, no
stored data; one anonymous analytics event per tool call (privacy page). Test from a terminal with the curl in the
repo's SUBMISSION.md, or `node scripts/live_cases.mjs`.
