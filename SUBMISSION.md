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
| Support | https://brickandmortar.dev/contact (changed 2026-11-22: directory listings never point at GitHub issues) |
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

## Submitted 2026-11-20

Filed by Claude in Aidan's own Chrome (JXA by process id into one background tab; his active tab was put back, no
window opened). A copied profile was not used: claude.ai signs it out on the first request. Nothing was paid, nothing
was sent to a person. Status read back off the portal after filing.

| Where | Status | UTC | Listing / ID |
|---|---|---|---|
| Claude Connectors Directory | **IN REVIEW** | 17:11 | claude.ai/directory/manage/paris-fashion-archive · slug `paris-fashion-archive` (permanent) |

**What was filed.** Custom connector "Paris Fashion Archive" added to his Claude (Settings → Connectors): connected,
3 tools, 0 resources, auth none, no tool flagged. Name, slug, one-liner and description verbatim from this kit.
Categories: Media & Entertainment, Creative, Education. Author Brick and Mortar AI LLC
(https://vogue-paris-mcp.vercel.app/). Custom icon `/icon.png` (512, previewed). Docs `/`, support the GitHub issues
URL, privacy `/privacy`. Use cases: the three in this kit. Prerequisites: none. Read only. Company Brick and Mortar AI
LLC, https://brickandmortar.dev, Aidan Jude, Founder, aidan@brickandmortar.dev (prefilled). Auth none (detected).
Data handling: "We own the API" (vogue-paris.vercel.app and its Blob store), no health data, no sponsored content.
Self-tested: every tool run through MCP Inspector CLI 0.17.2 against the live endpoint first (find_issues 1921 → 22
issues; look_at_covers 1925 → 10 images; look_at_pages 1926-03-01 → 4 images; 1950-03-01 → 0 images, copyright note).
All seven compliance boxes ticked after re-reading them and the directory policy; reviewer note as above.

**Server changes made for this filing** (all deployed): the rename and icons (064e906); find_issues and
look_at_covers name the nearest issue for a month with none, which test case 4 needed (6d87930); a troubleshooting
line and support link on the connect page, because policy §3C asks docs to say how to troubleshoot (b946c41).

**What needs Aidan.** Nothing yet. When it reads "Ready to publish", **Publish** at
claude.ai/directory/manage/paris-fashion-archive (approval does not publish it); a follow-up is in
`~/.claude/pending.json` (`paris-fashion-archive-directory`, due 2026-11-23). A domain stays his call.

**For the next filing (form traps, 2026-11-20)**
- **A background tab throttles in-page timers.** After the tab had sat hidden about ten minutes, a runner with
  several `await sleep()` calls never resolved (its key stayed `pending`), though its clicks had landed. Do one
  synchronous action per `execute` and wait in the shell between them.
- **Step 4's use-case inputs carry no `type` attribute**, so `input[type=text]` matches nothing and the fill silently
  does nothing. Filter on `el.type === "text"`, then read the values back.
- **Step 8's box says "via MCP Inspector or as a custom connector in Claude"** and the review page prints "Tested with
  MCP Inspector". Make it true first: `npx -y @modelcontextprotocol/inspector@0.17.2 --cli <url> --transport http
  --method tools/call --tool-name <t> --tool-arg k=v` (in zsh, wrap it in a function; a `$I` string is not split).
- Step 7 arrives with "We own the API" and health "No" preselected; "Sponsored content" has no default and must be set.
- The directory policy (support.claude.com article 13145358) has no rule on listing names; the nearest is §2C, "must
  not create confusion… with other Software", and §1F on IP. Naming the listing after the content's trademark is what
  would invite confusion, which is why the name is ours.
- Another session may be filing in the same Chrome at the same time: address your own tab by id and use your own
  runner key (here `window.__vpm`).

**Official MCP Registry (2026-11-22):** `io.github.2016judea/paris-fashion-archive` 1.0.0, remote `https://vogue-paris-mcp.vercel.app/mcp`; `.github/workflows/mcp-registry.yml` republishes on every `server.json` version bump. Check: `curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.2016judea/paris-fashion-archive"`.

## ChatGPT listing v1.0.0 (2026-11-22)

ZIP: `chatgpt-plugin.zip`, built by `python3 scripts/build_chatgpt_plugin.py --live` from `chatgpt/listing.json` (5 positive and 3 negative cases, checked against the live server). Demo recording: https://vogue-paris-mcp.vercel.app/demo/chatgpt. Domain check: `/.well-known/openai-apps-challenge` serves Vercel/Worker env `OPENAI_APPS_CHALLENGE` (404 until set).

<!-- chatgpt-hints (generated by scripts/build_chatgpt_plugin.py; edit chatgpt/listing.json) -->
| Tool | readOnly | destructive | openWorld | Why |
|---|---|---|---|---|
| `find_issues` | True | False | False | Looks up the bundled issue index (refreshed from our own reader's issue list); changes nothing and calls no third-party service. |
| `look_at_covers` | True | False | False | Reads issue details and returns scans hosted on our own reader for US public-domain issues; changes nothing and calls no third-party service. |
| `look_at_pages` | True | False | False | Reads issue details and returns scans hosted on our own reader for US public-domain issues; changes nothing and calls no third-party service. |
| `vogue_cover_on_date` | True | False | False | Reads issue details and returns scans hosted on our own reader for US public-domain issues; changes nothing and calls no third-party service. |
| `vogue_covers_by_decade` | True | False | False | Reads issue details and returns scans hosted on our own reader for US public-domain issues; changes nothing and calls no third-party service. |
| `vogue_by_season` | True | False | False | Reads issue details and returns scans hosted on our own reader for US public-domain issues; changes nothing and calls no third-party service. |
| `translate_vogue_page` | True | False | False | Reads issue details and returns scans hosted on our own reader for US public-domain issues; changes nothing and calls no third-party service. |
| `random_vintage_vogue_cover` | True | False | False | Reads issue details and returns scans hosted on our own reader for US public-domain issues; changes nothing and calls no third-party service. |
| `can_i_use_vogue_images` | True | False | False | Works out US copyright status from the issue year by fixed rules; changes nothing and makes no outside request. |
| `high_resolution_vogue_cover` | True | False | False | Reads issue details and returns scans hosted on our own reader for US public-domain issues; changes nothing and calls no third-party service. |
<!-- /chatgpt-hints -->

## xAI marketplace (Grok Bot, Cursor, Grok) — SUBMITTED 2026-11-23

Filed 2026-11-23T02:26:26Z at x.ai/bot/marketplace/submit-a-plugin; the page answered "Thanks for submitting your plugin!".
Status: pending review (xAI replies by email to the work address). Destinations ticked: Grok (coming soon), Grok Bot,
Cursor. Org Brick and Mortar AI LLC, handle `brickandmortar`. Name Paris Fashion Archive. Website https://vogue-paris-mcp.vercel.app/.
Logo https://vogue-paris-mcp.vercel.app/icon-solid.png (solid plate, 1:1). MCP URL https://vogue-paris-mcp.vercel.app/mcp (the URL, never a repo). Cursor's Publisher Terms §3.1
bar charging users "directly or indirectly" through the plugin; the connector itself is free.

Description (530 chars):

> Our own page-by-page reader of the 1920-1954 issues of Vogue Paris that the Bibliothèque nationale de France digitised on Gallica, with every scan credited "Source: gallica.bnf.fr / BnF". Find issues by year, month, season or date, see the covers and pages of every issue from 1930 and earlier (US public domain), and have the French read and translated. For later issues, still under US copyright, it returns the details and a reader link instead of images. Independent; not affiliated with Condé Nast or Vogue, nor with the BnF.

Testing (485 chars):

> No account or credentials needed. Add the MCP URL as a remote server, then try: 1) "Which issues of Vogue Paris came out in 1925?" -> find_issues lists the 1925 issues with dates, page counts and reader links. 2) "Show me the Vogue Paris covers from 1925." -> look_at_covers returns the 1925 cover images with the Gallica / BnF credit. 3) "Can I use 1925 Vogue Paris covers in a print?" -> 1925 issues are US public domain since 1 January 2021 (17 U.S.C. 304), with the credit to give.

