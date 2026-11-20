// The archive: the issue list, how to find an issue, and which issues may be shown as images.
//
// Images only for US public-domain issues. A work published in year Y enters the US public
// domain on 1 January of Y + 96 (95-year term, 17 U.S.C. 304), so in 2026 that is every issue
// from 1930 or earlier. The 1932-1954 issues are French works whose US copyright was restored
// (URAA, 17 U.S.C. 104A) and runs to 2028-2050. For those the connector returns the details
// and a link to the reader on vogue-paris.vercel.app, never the pages or the cover.
import snapshot from "./snapshot.js";

export const SITE = "https://vogue-paris.vercel.app";
const LIVE_LIST = SITE + "/data/issues.json";
const TTL = 10 * 60 * 1000;

let cache = { at: 0, issues: null };

// The live list first (so issues the site adds show up), the bundled copy if that fails.
export async function loadIssues() {
  if (cache.issues && Date.now() - cache.at < TTL) return cache.issues;
  let issues = snapshot;
  try {
    const r = await fetch(LIVE_LIST, { signal: AbortSignal.timeout(2500) });
    if (r.ok) { const live = await r.json(); if (Array.isArray(live) && live.length) issues = live; }
  } catch {}
  issues = issues.filter((i) => i.ready !== false).sort((a, b) => a.date.localeCompare(b.date));
  cache = { at: Date.now(), issues };
  return issues;
}

export const publicDomainUS = (year, now = new Date()) => year + 96 <= now.getUTCFullYear();
export const lastPublicDomainYear = (now = new Date()) => now.getUTCFullYear() - 96;

export const pageCount = (it) => it.last - it.first + 1;
export const readerUrl = (it) => `${SITE}/issue/${it.ark}?utm_source=mcp`;
export const coverThumb = (it) => `${SITE}/covers/${it.ark}.webp`;

// Page n counts from the cover as 1, the way the site's reader numbers them.
export function pageImage(it, n, tier = "w1200") {
  const file = String(it.first + n - 1).padStart(3, "0");
  return `${it.base}/vogue/${it.ark}/${tier}/p${file}.webp${it.v ? "?v=" + it.v : ""}`;
}

export function summary(it) {
  return {
    ark: it.ark, date: it.date, label: it.label, year: it.year, pages: pageCount(it),
    reader_url: readerUrl(it), images_available: publicDomainUS(it.year),
  };
}

// "1925-06-15", "1925-06", "1925", or a Gallica ark. A date that matches no issue resolves to
// the nearest issue in the same month, else nothing.
export function resolveIssue(issues, ref) {
  const s = String(ref || "").trim().toLowerCase();
  if (!s) return null;
  const byArk = issues.find((i) => i.ark === s);
  if (byArk) return byArk;
  const exact = issues.find((i) => i.date === s);
  if (exact) return exact;
  const m = s.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  const prefix = m[2] ? `${m[1]}-${m[2]}` : m[1];
  const inMonth = issues.find((i) => i.date.startsWith(prefix));
  if (inMonth || !m[2]) return inMonth || null;
  // No issue that month: the nearest within two months either side, flagged by the caller.
  return nearestIssue(issues, Date.parse(`${prefix}-15`));
}

// The issue closest to a moment (ms), if one falls within maxDays of it.
export function nearestIssue(issues, t, maxDays = 62) {
  const d = (i) => Math.abs(Date.parse(i.date) - t);
  const near = [...issues].sort((a, b) => d(a) - d(b))[0];
  return near && d(near) <= maxDays * 864e5 ? near : null;
}

// What to say when the issue found is not the one asked for (a month with no issue).
export function substituted(ref, it) {
  const s = String(ref || "").trim().toLowerCase();
  if (!it || s === it.ark || it.date.startsWith(s.slice(0, 7))) return "";
  return `No issue is dated ${ref}; the nearest is ${it.label} (${it.date}).`;
}

export function filterIssues(issues, { year, from, to, month } = {}) {
  return issues.filter((i) =>
    (year == null || i.year === year) &&
    (from == null || i.date >= from) &&
    (to == null || i.date <= to) &&
    (month == null || Number(i.date.slice(5, 7)) === month));
}

export function yearsTable(issues) {
  const t = {};
  for (const i of issues) t[i.year] = (t[i.year] || 0) + 1;
  return Object.entries(t).map(([y, n]) => ({ year: Number(y), issues: n, images_available: publicDomainUS(Number(y)) }));
}

export async function fetchImage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`image ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { type: "image", data: buf.toString("base64"), mimeType: r.headers.get("content-type") || "image/webp" };
}
