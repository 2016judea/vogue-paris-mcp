// Paris Fashion Archive: a remote MCP server (Streamable HTTP, stateless, no auth) for the 1920-1954
// issues of Vogue Paris that the BnF digitised on Gallica and vogue-paris.vercel.app mirrors.
// Independent; not affiliated with Condé Nast or Vogue, so the listing never carries their name. Free and read-only. Nothing
// is sold, nothing is stored, and the site itself is never changed by this project.
//
// Every answer carries reader links to vogue-paris.vercel.app (utm_source=mcp). Covers and
// pages come back as images only for US public-domain issues (lib/archive.js says why).
// One anonymous PostHog event per tool call (ANALYTICS.md).

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
  for (const k of ["tool", "ok", "ms", "err", "year", "n_issues", "n_images", "public_domain"]) if (props[k] !== undefined && props[k] !== null) safe[k] = props[k];
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
const READ_ONLY = { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true };

function buildServer(meta = {}) {
  const pdYear = lastPublicDomainYear();
  const server = new McpServer({
    name: "paris-fashion-archive", title: "Paris Fashion Archive", version: "1.0.0", websiteUrl: HOME,
    icons: [{ src: `${HOME}/icon.png`, mimeType: "image/png", sizes: ["512x512"] }, { src: `${HOME}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
  }, {
    instructions: `Paris Fashion Archive: the 1920-1954 issues of Vogue Paris that the Bibliothèque nationale de France digitised on Gallica, readable page by page at ${SITE}. Independent; not affiliated with Condé Nast or Vogue. find_issues lists issues by year, month or date range. look_at_covers and look_at_pages return the covers and pages as images for issues from ${pdYear} and earlier, which are in the US public domain; later issues are still under copyright, so for them the tools return the details and a reader link instead of images. Show reader links exactly as returned, in full. The magazine is in French. Source: gallica.bnf.fr / BnF.`,
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

  return server;
}

export default async function handler(req, res) {
  if (req.method === "GET" && !String(req.headers.accept || "").includes("text/event-stream")) {
    res.setHeader("content-type", "application/json");
    return res.status(200).end(JSON.stringify({ name: "paris-fashion-archive", title: "Paris Fashion Archive", transport: "streamable-http", endpoint: "/mcp", tools: ["find_issues", "look_at_covers", "look_at_pages"], site: SITE }));
  }
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  }
  const ua = String(req.headers["user-agent"] || "");
  const server = buildServer({ ua, client: clientOf(ua), test: String(req.headers["x-vpm-test"] || "") === "1" });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
