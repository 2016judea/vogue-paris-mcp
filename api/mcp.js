// Paris Fashion Archive: a remote MCP server (Streamable HTTP, stateless, no auth) for the 1920-1954
// issues of Vogue Paris that the BnF digitised on Gallica and vogue-paris.vercel.app mirrors.
// Independent; not affiliated with Condé Nast or Vogue, so the listing never carries their name. Free and read-only. Nothing
// is sold, nothing is stored, and the site itself is never changed by this project.
//
// Every answer carries reader links to vogue-paris.vercel.app (utm_source=mcp). Covers and
// pages come back as images only for US public-domain issues (lib/archive.js says why).
// One anonymous PostHog event per tool call (ANALYTICS.md). Three engine tools plus seven theme doors
// (QUESTIONS.md), each a thin wrapper over lib/archive.js.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  SITE, loadIssues, publicDomainUS, lastPublicDomainYear, pageCount, readerUrl, coverThumb,
  pageImage, summary, resolveIssue, substituted, filterIssues, yearsTable, fetchImage, nearestIssue,
} from "../lib/archive.js";

const HOME = "https://vogue-paris-mcp.vercel.app";
const PH_KEY = "phc_yFgRGppL6H7DvhgZTQKbHdrY5oqnpLT482rrNYtLqnAx"; // public project key, same project as appeal-the-denial
const MAX_PAGES = 4;
const MAX_COVERS = 12;

const clientOf = (ua) => (/claude/i.test(ua) ? "claude" : /openai|chatgpt/i.test(ua) ? "chatgpt" : /cursor/i.test(ua) ? "cursor" : /node|undici|python|curl|axios|go-http/i.test(ua) ? "script" : "other");

// Calls from claude.ai arrive from Anthropic's servers, so IP + user agent would count
// Anthropic, not people (heistclips, 2026-11-19). Random id per call, no person profile.
// People are counted on the site, as visits from claude.ai / chatgpt.com or with utm_source=mcp.
export async function logCall(props, meta = {}) {
  if (process.env.VPM_NO_ANALYTICS) return;
  const safe = {};
  for (const k of ["tool", "ok", "ms", "err", "year", "n_issues", "n_images", "public_domain", "attempted"]) if (props[k] !== undefined && props[k] !== null) safe[k] = props[k];
  try {
    await fetch("https://us.i.posthog.com/capture/", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(1500),
      body: JSON.stringify({ api_key: PH_KEY, event: "mcp_tool_call", distinct_id: "mcp_" + crypto.randomUUID(),
        properties: { ...safe, client: meta.client || "other", client_ua: String(meta.ua || "").split(/[\/ ;(]/)[0].slice(0, 30), test: meta.test ? true : undefined, site: "vogue-paris-mcp", $host: "vogue-paris-mcp.vercel.app", $process_person_profile: false, $lib: "vogue-paris-mcp" } }) });
  } catch {}
}

function logged(tool, meta, fn) {
  return async (args) => {
    const t0 = Date.now();
    let out, info = {};
    try { ({ out, info = {} } = await fn(args)); }
    catch { out = { content: [{ type: "text", text: `Something went wrong reaching the archive. Try again, or browse it at ${SITE}` }], isError: true }; info = { err: "exception" }; }
    await logCall({ tool, ok: !out.isError, ms: Date.now() - t0, ...info }, meta);
    return out;
  };
}

const notShown = (it) => `${it.label} (${it.year}) is still under US copyright, so its pages and cover are not returned here. Read it on the site: ${readerUrl(it)}`;
const line = (it) => `- **${it.label}** (${it.date}) · ${pageCount(it)} pages · ${readerUrl(it)}`;
const notFound = (ref) => ({ out: { content: [{ type: "text", text: `No issue matches "${ref}". Use find_issues to list what the archive holds.` }], structuredContent: { found: false } }, info: { err: "not_found" } });

const ISSUE = z.string().min(4).describe('An issue date ("1925-06-15"), a month ("1925-06", nearest issue that month) or a Gallica ark ("bpt6k9604118j")');
export const TOOL_NAMES = ["find_issues", "look_at_covers", "look_at_pages", "vogue_cover_on_date", "vogue_covers_by_decade", "vogue_by_season", "translate_vogue_page", "random_vintage_vogue_cover", "can_i_use_vogue_images", "high_resolution_vogue_cover"];
const READ_ONLY = { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true };

function buildServer(meta = {}) {
  const pdYear = lastPublicDomainYear();
  const server = new McpServer({
    name: "paris-fashion-archive", title: "Paris Fashion Archive", version: "1.0.0", websiteUrl: HOME,
    icons: [{ src: `${HOME}/icon.png`, mimeType: "image/png", sizes: ["512x512"] }, { src: `${HOME}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
  }, {
    instructions: `Paris Fashion Archive: the 1920-1954 issues of Vogue Paris that the Bibliothèque nationale de France digitised on Gallica, readable page by page at ${SITE}. Independent; not affiliated with Condé Nast or Vogue. find_issues lists issues by year, month or date range. look_at_covers and look_at_pages return the covers and pages as images for issues from ${pdYear} and earlier, which are in the US public domain; later issues are still under copyright, so for them the tools return the details and a reader link instead of images. Show reader links exactly as returned, in full. The magazine is in French. Shortcuts for common questions: vogue_cover_on_date (a birthday or a date in history), vogue_covers_by_decade, vogue_by_season, translate_vogue_page, random_vintage_vogue_cover, can_i_use_vogue_images (US copyright status), high_resolution_vogue_cover (scans for prints). Source: gallica.bnf.fr / BnF.`,
  });

  server.registerTool("find_issues", {
    title: "Find issues",
    description: `Lists Vogue Paris issues (1920-1954) by year, month or date range, each with its date, page count and a link to read it on ${SITE}. With no filters it returns how many issues each year holds. images_available is true for issues from ${pdYear} and earlier (US public domain). Examples: {"year": 1925}; {"from": "1926-03-01", "to": "1926-06-30"}; {"month": 12}.`,
    inputSchema: {
      year: z.number().int().min(1900).max(2000).optional().describe("Publication year"),
      month: z.number().int().min(1).max(12).optional().describe("Month of the year, 1-12, across all years"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest date, YYYY-MM-DD"),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest date, YYYY-MM-DD"),
      limit: z.number().int().min(1).max(250).optional().describe("Most issues to list (default 40)"),
    },
    annotations: { title: "Find issues", ...READ_ONLY },
  }, logged("find_issues", meta, async ({ year, month, from, to, limit = 40 }) => {
    const all = await loadIssues();
    if (year == null && month == null && from == null && to == null) {
      const years = yearsTable(all);
      const text = [`**${all.length} issues, ${years[0].year}-${years.at(-1).year}.** Covers and pages can be viewed for ${years[0].year}-${pdYear}; later years link to the reader.`, "",
        ...years.map((y) => `- ${y.year}: ${y.issues} issue${y.issues > 1 ? "s" : ""}${y.images_available ? "" : " (link only)"}`), "", `Browse every cover: ${SITE}/?utm_source=mcp`].join("\n");
      return { out: { content: [{ type: "text", text }], structuredContent: { total: all.length, years, site_url: SITE } }, info: { n_issues: all.length } };
    }
    const hits = filterIssues(all, { year, month, from, to });
    const shown = hits.slice(0, limit);
    // Nothing in a given month or date range (June 1925 has no issue): name the nearest issue instead.
    const target = from || to ? (Date.parse(from || to) + Date.parse(to || from)) / 2 : year != null && month != null ? Date.UTC(year, month - 1, 15) : null;
    const nearest = !hits.length && target != null ? nearestIssue(all, target) : null;
    const asked = year != null && month != null && !from && !to ? new Date(target).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : `${from || "…"} to ${to || "…"}`;
    const text = hits.length
      ? [`**${hits.length} issue${hits.length > 1 ? "s" : ""}**${hits.length > shown.length ? ` (first ${shown.length} shown)` : ""}:`, ...shown.map(line),
        ...(shown.some((i) => !publicDomainUS(i.year)) ? ["", `Issues after ${pdYear} are still under US copyright: read them on the site through the links above.`] : [])].join("\n")
      : nearest ? `No issue falls in ${asked}. The nearest is:\n${line(nearest)}`
      : `No issues match. The archive covers ${all[0].year}-${all.at(-1).year} with gaps; call find_issues with no filters to see which years it holds.`;
    return { out: { content: [{ type: "text", text }], structuredContent: { total: hits.length, issues: shown.map(summary), ...(nearest ? { nearest: summary(nearest) } : {}) } }, info: { year, n_issues: hits.length } };
  }));

  server.registerTool("look_at_covers", {
    title: "Look at covers",
    description: `Returns the covers of Vogue Paris issues as images, with each issue's date and reader link, up to ${MAX_COVERS} at a time. Covers are returned for issues from ${pdYear} and earlier (US public domain); a later year returns its issue list and links only. Examples: {"year": 1925}; {"from": "1927-01-01", "to": "1927-06-30"}; {"issues": ["1920-06-15", "1926-03"]}.`,
    inputSchema: {
      year: z.number().int().min(1900).max(2000).optional().describe("Publication year"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest date, YYYY-MM-DD"),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest date, YYYY-MM-DD"),
      issues: z.array(ISSUE).max(MAX_COVERS).optional().describe("Specific issues instead of a year or range"),
    },
    annotations: { title: "Look at covers", ...READ_ONLY },
  }, logged("look_at_covers", meta, async ({ year, from, to, issues: refs }) => {
    const all = await loadIssues();
    let picked = refs?.length ? refs.map((r) => resolveIssue(all, r)).filter(Boolean) : filterIssues(all, { year, from, to });
    const notes = refs?.length ? refs.map((r) => substituted(r, resolveIssue(all, r))).filter(Boolean) : [];
    if (!refs?.length && year == null && from == null && to == null) picked = all.filter((i) => publicDomainUS(i.year));
    if (!picked.length) return notFound(refs?.join(", ") || year || `${from || ""}..${to || ""}`);
    const open = picked.filter((i) => publicDomainUS(i.year)).slice(0, MAX_COVERS);
    const closed = picked.filter((i) => !publicDomainUS(i.year));
    const images = await Promise.all(open.map((i) => fetchImage(coverThumb(i)).catch(() => null)));
    const content = notes.length ? [{ type: "text", text: notes.join("\n") }] : [];
    open.forEach((it, k) => {
      content.push({ type: "text", text: `**${it.label}** (${it.date}) · read: ${readerUrl(it)}` });
      if (images[k]) content.push(images[k]);
    });
    const more = picked.filter((i) => publicDomainUS(i.year)).length - open.length;
    if (more > 0) content.push({ type: "text", text: `${more} more cover${more > 1 ? "s" : ""} in this range: narrow the dates to see them, or browse ${SITE}/?utm_source=mcp` });
    if (closed.length) content.push({ type: "text", text: [`Still under US copyright, covers not returned:`, ...closed.slice(0, 40).map(line)].join("\n") });
    return {
      out: { content, structuredContent: { covers: open.map((i) => ({ ...summary(i), cover_url: coverThumb(i) })), link_only: closed.map(summary) } },
      info: { year, n_issues: picked.length, n_images: images.filter(Boolean).length, public_domain: closed.length === 0 },
    };
  }));

  server.registerTool("look_at_pages", {
    title: "Look at pages",
    description: `Returns pages of one Vogue Paris issue as images, up to ${MAX_PAGES} at a time, so they can be read, described or translated from the French. Page 1 is the cover, counted the way the site's reader counts. Each page also gets a link to a 2400-pixel scan. Pages are returned for issues from ${pdYear} and earlier (US public domain); a later issue returns its details and reader link only. Examples: {"issue": "1925-06-15", "pages": [1, 2, 3]}; {"issue": "1922-03", "pages": [10, 11]}.`,
    inputSchema: {
      issue: ISSUE,
      pages: z.array(z.number().int().min(1)).min(1).max(MAX_PAGES).optional().describe(`Page numbers, cover = 1 (default: the first ${MAX_PAGES})`),
    },
    annotations: { title: "Look at pages", ...READ_ONLY },
  }, logged("look_at_pages", meta, async ({ issue, pages }) => {
    const all = await loadIssues();
    const it = resolveIssue(all, issue);
    if (!it) return notFound(issue);
    const total = pageCount(it);
    const note = substituted(issue, it);
    if (!publicDomainUS(it.year)) {
      return { out: { content: [{ type: "text", text: [note, notShown(it)].filter(Boolean).join(" ") }], structuredContent: { issue: summary(it), pages: [] } }, info: { year: it.year, n_issues: 1, n_images: 0, public_domain: false } };
    }
    const want = [...new Set(pages?.length ? pages : Array.from({ length: Math.min(MAX_PAGES, total) }, (_, k) => k + 1))];
    const bad = want.filter((n) => n > total);
    const ok = want.filter((n) => n <= total);
    const images = await Promise.all(ok.map((n) => fetchImage(pageImage(it, n)).catch(() => null)));
    const content = [{ type: "text", text: `${note ? note + "\n" : ""}**${it.label}** (${it.date}) · ${total} pages · read it whole: ${readerUrl(it)}` }];
    ok.forEach((n, k) => {
      content.push({ type: "text", text: `Page ${n} of ${total} · full scan: ${pageImage(it, n, "w2400")}` });
      if (images[k]) content.push(images[k]);
    });
    if (bad.length) content.push({ type: "text", text: `This issue has ${total} pages; page ${bad.join(", ")} does not exist.` });
    content.push({ type: "text", text: "Source: gallica.bnf.fr / Bibliothèque nationale de France." });
    return {
      out: { content, structuredContent: { issue: summary(it), pages: ok.map((n) => ({ page: n, image_url: pageImage(it, n), full_scan_url: pageImage(it, n, "w2400") })) } },
      info: { year: it.year, n_issues: 1, n_images: images.filter(Boolean).length, public_domain: true, err: bad.length ? "page_out_of_range" : undefined },
    };
  }));

  // Theme doors (QUESTIONS.md, 2026-11-22): one named tool per kind of question, each a thin wrapper over
  // the same archive helpers, so Claude finds a tool in the words people use.
  const DOOR = (title, extra = {}) => ({ title, ...READ_ONLY, ...extra });
  const cards = async (list, max = MAX_COVERS) => {
    const open = list.filter((i) => publicDomainUS(i.year)).slice(0, max);
    const closed = list.filter((i) => !publicDomainUS(i.year));
    const imgs = await Promise.all(open.map((i) => fetchImage(coverThumb(i)).catch(() => null)));
    const content = [];
    open.forEach((it, k) => { content.push({ type: "text", text: `**${it.label}** (${it.date}) · read: ${readerUrl(it)}` }); if (imgs[k]) content.push(imgs[k]); });
    if (closed.length) content.push({ type: "text", text: [`Still under US copyright, covers not returned:`, ...closed.slice(0, 40).map(line)].join("\n") });
    return { content, open, closed, n_images: imgs.filter(Boolean).length };
  };
  const spread = (list, n) => list.length <= n ? list : Array.from({ length: n }, (_, k) => list[Math.round(k * (list.length - 1) / (n - 1))]);
  const SEASONS = { spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11], fall: [9, 10, 11], winter: [12, 1, 2] };

  server.registerTool("vogue_cover_on_date", {
    title: "Vogue cover on a date",
    description: `The Vogue Paris cover from a given date: a birthday, an anniversary, a month in history. A full date or a month returns the issue on or nearest that date (within two months). A month and day with no year ("06-15") returns the issue nearest that day in every year the archive holds. Covers come back as images for ${pdYear} and earlier; later issues get their date and reader link. Example questions: "Vogue cover from the day my grandmother was born, 1927-04-02"; "what was on Vogue in March 1925"; "Vogue covers on my birthday, 15 June".`,
    inputSchema: { date: z.string().regex(/^(\d{4}-\d{2}(-\d{2})?|\d{2}-\d{2})$/).describe('"1927-04-02", "1925-03", or "06-15" for that day in every year') },
    annotations: DOOR("Vogue cover on a date"),
  }, logged("vogue_cover_on_date", meta, async ({ date }) => {
    const all = await loadIssues();
    if (/^\d{2}-\d{2}$/.test(date)) {
      const years = [...new Set(all.map((i) => i.year))];
      const picks = years.map((y) => nearestIssue(all.filter((i) => i.year === y), Date.parse(`${y}-${date}T00:00:00Z`), 31)).filter(Boolean);
      if (!picks.length) return notFound(date);
      const c = await cards(picks);
      return { out: { content: [{ type: "text", text: `The issue nearest ${date} in each of ${picks.length} years:` }, ...c.content], structuredContent: { date, issues: picks.map(summary) } }, info: { n_issues: picks.length, n_images: c.n_images } };
    }
    const it = resolveIssue(all, date);
    if (!it) return notFound(date);
    const note = substituted(date, it);
    const c = await cards([it]);
    return { out: { content: [...(note ? [{ type: "text", text: note }] : []), ...c.content], structuredContent: { date, issue: summary(it), cover_url: publicDomainUS(it.year) ? coverThumb(it) : null } }, info: { year: it.year, n_issues: 1, n_images: c.n_images, public_domain: publicDomainUS(it.year) } };
  }));

  server.registerTool("vogue_covers_by_decade", {
    title: "Vogue covers by decade",
    description: `Vogue Paris covers from one decade: the 1920s (flappers, Art Deco), the 1930s, the 1940s (wartime and the New Look) or the early 1950s. Returns up to ${MAX_COVERS} covers spread evenly across the decade as images, with the decade's issue count. Covers are images for ${pdYear} and earlier; later decades return the issue list with reader links. Example questions: "1920s Vogue covers"; "Art Deco fashion magazine covers"; "Vogue in the 1940s".`,
    inputSchema: { decade: z.number().int().refine((d) => [1920, 1930, 1940, 1950].includes(d), "1920, 1930, 1940 or 1950").describe("1920, 1930, 1940 or 1950") },
    annotations: DOOR("Vogue covers by decade"),
  }, logged("vogue_covers_by_decade", meta, async ({ decade }) => {
    const all = await loadIssues();
    const hits = all.filter((i) => i.year >= decade && i.year < decade + 10);
    if (!hits.length) return notFound(`${decade}s`);
    const pd = hits.filter((i) => publicDomainUS(i.year));
    const c = await cards(pd.length ? spread(pd, MAX_COVERS) : hits.slice(0, 40));
    const head = `**The ${decade}s: ${hits.length} issues** (${hits[0].year}-${hits.at(-1).year}).${pd.length && pd.length < hits.length ? ` Covers shown for ${pd[0].year}-${pd.at(-1).year}; the rest of the decade is still under US copyright.` : ""} Every cover: ${SITE}/board?utm_source=mcp`;
    return { out: { content: [{ type: "text", text: head }, ...c.content], structuredContent: { decade, total: hits.length, covers: c.open.map(summary), link_only: c.closed.map(summary) } }, info: { year: decade, n_issues: hits.length, n_images: c.n_images, public_domain: c.closed.length === 0 } };
  }));

  server.registerTool("vogue_by_season", {
    title: "Vogue by season",
    description: `Vogue Paris issues from one season of one year (spring = March-May, summer = June-August, autumn = September-November, winter = December and the January-February after it), with covers as images for ${pdYear} and earlier. The Paris collections were shown in spring and autumn, so those issues carry the new season's fashions. Example questions: "what was in fashion in spring 1925"; "Vogue's autumn 1928 collections"; "winter 1922 Vogue".`,
    inputSchema: {
      season: z.enum(["spring", "summer", "autumn", "fall", "winter"]).describe("spring, summer, autumn (or fall), winter"),
      year: z.number().int().min(1900).max(2000).describe("The year (for winter, the year its December falls in)"),
    },
    annotations: DOOR("Vogue by season"),
  }, logged("vogue_by_season", meta, async ({ season, year }) => {
    const all = await loadIssues();
    const months = SEASONS[season];
    const hits = all.filter((i) => { const m = Number(i.date.slice(5, 7)); return months.includes(m) && i.year === (season === "winter" && m < 3 ? year + 1 : year); });
    if (!hits.length) {
      const near = nearestIssue(all, Date.UTC(year, months[1] - 1, 15), 120);
      return { out: { content: [{ type: "text", text: `No issue falls in ${season} ${year}.${near ? ` The nearest is:\n${line(near)}` : " Call find_issues with no filters to see which years the archive holds."}` }], structuredContent: { season, year, total: 0, ...(near ? { nearest: summary(near) } : {}) } }, info: { year, n_issues: 0, err: "not_found" } };
    }
    const c = await cards(hits);
    return { out: { content: [{ type: "text", text: `**${season[0].toUpperCase() + season.slice(1)} ${year}: ${hits.length} issue${hits.length > 1 ? "s" : ""}.**` }, ...c.content], structuredContent: { season, year, total: hits.length, issues: hits.map(summary) } }, info: { year, n_issues: hits.length, n_images: c.n_images, public_domain: c.closed.length === 0 } };
  }));

  server.registerTool("translate_vogue_page", {
    title: "Translate a Vogue page",
    description: `Returns pages of a Vogue Paris issue as images in the original French, up to ${MAX_PAGES} at a time, for reading and translation into English or any language. Where the site has already transcribed a page, its French text and an English translation come back with it (marked machine-made). Page 1 is the cover. Pages are returned for issues from ${pdYear} and earlier; later issues get the reader link. Example questions: "translate page 3 of the 1 July 1920 Vogue"; "what does this 1925 Vogue ad say in English"; "read me the French on the cover of June 1922".`,
    inputSchema: { issue: ISSUE, pages: z.array(z.number().int().min(1)).min(1).max(MAX_PAGES).optional().describe(`Page numbers, cover = 1 (default: the first ${MAX_PAGES})`) },
    annotations: DOOR("Translate a Vogue page"),
  }, logged("translate_vogue_page", meta, async ({ issue, pages }) => {
    const all = await loadIssues();
    const it = resolveIssue(all, issue);
    if (!it) return notFound(issue);
    const note = substituted(issue, it);
    if (!publicDomainUS(it.year)) return { out: { content: [{ type: "text", text: [note, notShown(it)].filter(Boolean).join(" ") }], structuredContent: { issue: summary(it), pages: [] } }, info: { year: it.year, n_issues: 1, n_images: 0, public_domain: false } };
    const total = pageCount(it);
    const want = [...new Set(pages?.length ? pages : Array.from({ length: Math.min(MAX_PAGES, total) }, (_, k) => k + 1))].filter((n) => n <= total);
    let text = {};
    if (it.en) { try { const r = await fetch(`${SITE}/text/${it.ark}.json`, { signal: AbortSignal.timeout(2500) }); if (r.ok) text = await r.json(); } catch {} }
    const imgs = await Promise.all(want.map((n) => fetchImage(pageImage(it, n)).catch(() => null)));
    const content = [{ type: "text", text: `${note ? note + "\n" : ""}**${it.label}** (${it.date}) · ${total} pages, in French · read it whole: ${readerUrl(it)}` }];
    const out = [];
    want.forEach((n, k) => {
      const t = text[String(n)];
      content.push({ type: "text", text: `Page ${n} of ${total} · full scan: ${pageImage(it, n, "w2400")}${t ? `\n\nFrench text (machine-read from the scan):\n${t.fr}\n\nEnglish (machine translation):\n${t.en}` : ""}` });
      if (imgs[k]) content.push(imgs[k]);
      out.push({ page: n, image_url: pageImage(it, n), full_scan_url: pageImage(it, n, "w2400"), french: t?.fr ?? null, english: t?.en ?? null });
    });
    content.push({ type: "text", text: "Source: gallica.bnf.fr / Bibliothèque nationale de France." });
    return { out: { content, structuredContent: { issue: summary(it), pages: out, transcribed: out.some((p) => p.french) } }, info: { year: it.year, n_issues: 1, n_images: imgs.filter(Boolean).length, public_domain: true } };
  }));

  server.registerTool("random_vintage_vogue_cover", {
    title: "Random vintage Vogue cover",
    description: `One Vogue Paris cover picked at random from the public-domain years (1920-${pdYear}), or from a narrower span of years, returned as an image with its date and reader link. Example questions: "a random vintage Vogue cover"; "surprise me with a 1920s fashion cover"; "a Vogue cover of the day".`,
    inputSchema: {
      from_year: z.number().int().min(1900).max(2000).optional().describe("Earliest year"),
      to_year: z.number().int().min(1900).max(2000).optional().describe(`Latest year (images only through ${pdYear})`),
    },
    annotations: DOOR("Random vintage Vogue cover", { idempotentHint: false }),
  }, logged("random_vintage_vogue_cover", meta, async ({ from_year, to_year }) => {
    const all = await loadIssues();
    const pool = all.filter((i) => publicDomainUS(i.year) && (from_year == null || i.year >= from_year) && (to_year == null || i.year <= to_year));
    if (!pool.length) return { out: { content: [{ type: "text", text: `No public-domain cover in those years: covers are returned for ${all[0].year}-${pdYear}.` }], structuredContent: { found: false } }, info: { err: "not_found" } };
    const it = pool[Math.floor(Math.random() * pool.length)];
    const c = await cards([it]);
    return { out: { content: c.content, structuredContent: { issue: summary(it), cover_url: coverThumb(it), full_scan_url: pageImage(it, 1, "w2400"), pool: pool.length } }, info: { year: it.year, n_issues: 1, n_images: c.n_images, public_domain: true } };
  }));

  server.registerTool("can_i_use_vogue_images", {
    title: "Can I use these Vogue images",
    description: `US copyright status of a Vogue Paris issue or year: whether it is in the US public domain, the statute behind it, and the year a later issue enters it. A work published in year Y enters the US public domain on 1 January of Y + 96 (17 U.S.C. 304); the 1931-1954 French issues had US copyright restored (17 U.S.C. 104A). Covers US law only; other countries' terms are not worked out here. Not legal advice. Example questions: "are 1920s Vogue covers public domain"; "can I print and sell a 1928 Vogue cover"; "when does the 1947 Vogue enter the public domain".`,
    inputSchema: { year: z.number().int().min(1900).max(2000).optional().describe("Publication year"), issue: ISSUE.optional() },
    annotations: DOOR("Can I use these Vogue images"),
  }, logged("can_i_use_vogue_images", meta, async ({ year, issue }) => {
    const all = await loadIssues();
    const it = issue ? resolveIssue(all, issue) : null;
    if (issue && !it) return notFound(issue);
    const y = it ? it.year : year ?? null;
    if (y == null) return { out: { content: [{ type: "text", text: `In ${new Date().getUTCFullYear()}, every issue from ${pdYear} and earlier is in the US public domain (published in year Y, public domain from 1 January of Y + 96, 17 U.S.C. 304). Issues from ${pdYear + 1} on are still under US copyright; the French issues of 1931-1954 had it restored by 17 U.S.C. 104A. Give a year or an issue for its date. US law only; not legal advice.` }], structuredContent: { last_public_domain_year: pdYear } }, info: {} };
    const pd = publicDomainUS(y);
    const text = pd
      ? `${it ? `${it.label} (${it.date})` : `Issues from ${y}`}: **in the US public domain** since 1 January ${y + 96} (published ${y}; 95-year term, 17 U.S.C. 304). The scans come from the BnF's Gallica, whose own terms ask for the credit "Source: gallica.bnf.fr / BnF". US law only; other countries' terms are not worked out here. Not legal advice.${it ? ` Full scan of the cover: ${pageImage(it, 1, "w2400")}` : ""}`
      : `${it ? `${it.label} (${it.date})` : `Issues from ${y}`}: **still under US copyright**, until 1 January ${y + 96}${y > 1930 ? " (French work, US copyright restored by 17 U.S.C. 104A, 95 years from publication)" : ""}. Read it on the site${it ? `: ${readerUrl(it)}` : ""}. US law only; not legal advice.`;
    return { out: { content: [{ type: "text", text }], structuredContent: { year: y, public_domain_us: pd, public_domain_from: `${y + 96}-01-01`, statute: pd || y <= 1930 ? "17 U.S.C. 304" : "17 U.S.C. 104A, 304", credit: "Source: gallica.bnf.fr / BnF", ...(it ? { issue: summary(it) } : {}) } }, info: { year: y, public_domain: pd } };
  }));

  server.registerTool("high_resolution_vogue_cover", {
    title: "High-resolution Vogue cover",
    description: `Links to the 2400-pixel scan of a Vogue Paris cover (or any page), for a print, a poster, a wallpaper or a mood board, plus a preview image and the credit line. Scans are given for issues from ${pdYear} and earlier (US public domain); later issues get the reader link. Example questions: "high-res 1925 Vogue cover to print"; "download a vintage Vogue cover for a poster"; "Vogue cover wallpaper".`,
    inputSchema: { issue: ISSUE, page: z.number().int().min(1).optional().describe("Page number, cover = 1 (default 1)") },
    annotations: DOOR("High-resolution Vogue cover"),
  }, logged("high_resolution_vogue_cover", meta, async ({ issue, page = 1 }) => {
    const all = await loadIssues();
    const it = resolveIssue(all, issue);
    if (!it) return notFound(issue);
    const note = substituted(issue, it);
    if (!publicDomainUS(it.year)) return { out: { content: [{ type: "text", text: [note, notShown(it)].filter(Boolean).join(" ") }], structuredContent: { issue: summary(it), full_scan_url: null } }, info: { year: it.year, n_issues: 1, public_domain: false } };
    const total = pageCount(it);
    if (page > total) return { out: { content: [{ type: "text", text: `${it.label} has ${total} pages; page ${page} does not exist.` }], structuredContent: { issue: summary(it), full_scan_url: null } }, info: { year: it.year, err: "page_out_of_range" } };
    const hi = pageImage(it, page, "w2400");
    const img = await fetchImage(page === 1 ? coverThumb(it) : pageImage(it, page)).catch(() => null);
    const content = [{ type: "text", text: `${note ? note + "\n" : ""}**${it.label}** (${it.date}), ${page === 1 ? "cover" : `page ${page}`} · 2400-pixel scan: ${hi}\nEvery cover on one board, each with a full-resolution download: ${SITE}/board?utm_source=mcp\nCredit: Source: gallica.bnf.fr / BnF. US public domain (published ${it.year}).` }];
    if (img) content.push(img);
    return { out: { content, structuredContent: { issue: summary(it), page, full_scan_url: hi, board_url: `${SITE}/board?utm_source=mcp`, credit: "Source: gallica.bnf.fr / BnF" } }, info: { year: it.year, n_issues: 1, n_images: img ? 1 : 0, public_domain: true } };
  }));

  return server;
}

export default async function handler(req, res) {
  if (req.method === "GET" && !String(req.headers.accept || "").includes("text/event-stream")) {
    res.setHeader("content-type", "application/json");
    return res.status(200).end(JSON.stringify({ name: "paris-fashion-archive", title: "Paris Fashion Archive", transport: "streamable-http", endpoint: "/mcp", tools: TOOL_NAMES, site: SITE }));
  }
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  }
  const ua = String(req.headers["user-agent"] || "");
  const meta = ({ ua, client: clientOf(ua), test: String(req.headers["x-vpm-test"] || "") === "1" });
  // The SDK answers an unknown tool name itself, so log the name a caller reached for here (QUESTIONS.md).
  for (const m of [].concat(req.body || [])) {
    const name = m?.method === "tools/call" ? String(m.params?.name || "") : "";
    if (name && !TOOL_NAMES.includes(name)) await logCall({ tool: "unknown", ok: false, err: "unknown_tool", attempted: name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) }, meta);
  }
  const server = buildServer(meta);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
