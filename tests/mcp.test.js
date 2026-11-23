import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import handler from "../api/mcp.js";
import { publicDomainUS } from "../lib/archive.js";

const realFetch = globalThis.fetch;
const sent = [];
let srv, base;

before(async () => {
  globalThis.fetch = async (url, opts) => { if (String(url).includes("posthog")) { sent.push(opts.body); return { ok: true }; } return realFetch(url, opts); };
  srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
    res.status = (c) => { res.statusCode = c; return res; }; res.json = (o) => res.end(JSON.stringify(o));
    await handler(req, res);
  });
  await new Promise((r) => srv.listen(0, r));
  base = `http://127.0.0.1:${srv.address().port}/mcp`;
});
after(() => { srv.close(); globalThis.fetch = realFetch; });

const rpc = async (method, params, headers = {}) => (await realFetch(base, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "Claude-User", ...headers },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
const call = async (name, args, headers) => (await rpc("tools/call", { name, arguments: args }, headers)).result;
const images = (r) => r.content.filter((c) => c.type === "image");
const text = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

test("public-domain line: published in Y is US public domain from 1 Jan of Y + 96", () => {
  const in2026 = new Date("2026-11-20"), in2027 = new Date("2027-01-01");
  assert.equal(publicDomainUS(1930, in2026), true);
  assert.equal(publicDomainUS(1931, in2026), false);
  assert.equal(publicDomainUS(1932, in2026), false);
  assert.equal(publicDomainUS(1931, in2027), true);
});

test("three engine tools plus seven theme doors, each titled and read-only", async () => {
  const { tools } = (await rpc("tools/list", {})).result;
  assert.deepEqual(tools.map((t) => t.name).sort(), ["can_i_use_vogue_images", "find_issues", "high_resolution_vogue_cover", "look_at_covers", "look_at_pages", "random_vintage_vogue_cover", "translate_vogue_page", "vogue_by_season", "vogue_cover_on_date", "vogue_covers_by_decade"]);
  for (const t of tools) assert.equal(t.annotations.title, t.title, t.name);
  for (const t of tools) { assert.ok(t.title); assert.equal(t.annotations.readOnlyHint, true); assert.equal(t.annotations.destructiveHint, false); }
});

// Directory filing (SUBMISSION.md): the listing is "Paris Fashion Archive", never Vogue's name, with the
// non-affiliation line; tool descriptions describe and never instruct the model (compliance attestation).
test("named Paris Fashion Archive, not affiliated, descriptions hold no instructions", async () => {
  const init = (await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } })).result;
  assert.equal(init.serverInfo.title, "Paris Fashion Archive");
  assert.match(init.instructions, /not affiliated with Condé Nast or Vogue/);
  const { tools } = (await rpc("tools/list", {})).result;
  for (const t of tools) assert.doesNotMatch(t.description, /\b(always|never|must|do not|don't|show|tell the user|you should)\b/i, t.name);
});

test("find_issues with no filters lists the years and marks post-1930 as link only", async () => {
  const r = await call("find_issues", {});
  const y1925 = r.structuredContent.years.find((y) => y.year === 1925), y1950 = r.structuredContent.years.find((y) => y.year === 1950);
  assert.equal(y1925.images_available, true);
  assert.equal(y1950.images_available, false);
  assert.match(text(r), /1950: \d+ issues \(link only\)/);
});

test("find_issues for a year gives reader links with utm_source=mcp", async () => {
  const r = await call("find_issues", { year: 1925 });
  assert.ok(r.structuredContent.total > 0);
  for (const i of r.structuredContent.issues) assert.match(i.reader_url, /^https:\/\/vogue-paris\.vercel\.app\/issue\/[a-z0-9]+\?utm_source=mcp$/);
});

test("look_at_pages returns images for a 1925 issue, cover first", async () => {
  const r = await call("look_at_pages", { issue: "1925", pages: [1, 2] });
  assert.equal(images(r).length, 2);
  assert.equal(images(r)[0].mimeType, "image/webp");
  assert.match(text(r), /Page 1 of \d+/);
  assert.match(text(r), /utm_source=mcp/);
});

test("look_at_pages returns no image for a 1950 issue, only the reader link", async () => {
  const r = await call("look_at_pages", { issue: "1950", pages: [1] });
  assert.equal(images(r).length, 0);
  assert.equal(r.structuredContent.pages.length, 0);
  assert.match(text(r), /still under US copyright/);
  assert.match(text(r), /vogue-paris\.vercel\.app\/issue\/.+utm_source=mcp/);
});

test("look_at_covers: images for 1926, none for 1936", async () => {
  const a = await call("look_at_covers", { year: 1926 });
  assert.ok(images(a).length > 0 && images(a).length <= 12);
  const b = await call("look_at_covers", { year: 1936 });
  assert.equal(images(b).length, 0);
  assert.ok(b.structuredContent.link_only.length > 0);
});

test("a page past the end is named, not invented", async () => {
  const r = await call("look_at_pages", { issue: "1920-06-15", pages: [999] });
  assert.equal(images(r).length, 0);
  assert.match(text(r), /page 999 does not exist/);
});

test("one anonymous mcp_tool_call per call", async () => {
  sent.length = 0;
  await call("find_issues", { year: 1921 }, { "x-vpm-test": "1" });
  assert.equal(sent.length, 1);
  const e = JSON.parse(sent[0]);
  assert.equal(e.event, "mcp_tool_call");
  assert.match(e.distinct_id, /^mcp_[0-9a-f-]{36}$/);
  assert.equal(e.properties.$process_person_profile, false);
  assert.deepEqual([e.properties.tool, e.properties.ok, e.properties.year, e.properties.client, e.properties.test], ["find_issues", true, 1921, "claude", true]);
});

test("a month with no issue gets the nearest issue, and says so", async () => {
  const r = await call("look_at_pages", { issue: "1925-06", pages: [1] });
  assert.equal(images(r).length, 1);
  assert.match(text(r), /No issue is dated 1925-06; the nearest is .+ \(1925-0[57]-\d\d\)/);
  const far = await call("look_at_pages", { issue: "1923-06", pages: [1] });
  assert.equal(far.structuredContent.found, false);
});

test("find_issues and look_at_covers name the nearest issue for a month with none", async () => {
  const f = await call("find_issues", { year: 1925, month: 6 });
  assert.equal(f.structuredContent.total, 0);
  assert.match(f.structuredContent.nearest.date, /^1925-0[57]-\d\d$/);
  assert.match(text(f), /No issue falls in June 1925\. The nearest is:/);
  const c = await call("look_at_covers", { issues: ["1925-06"] });
  assert.match(text(c), /No issue is dated 1925-06; the nearest is/);
  assert.equal(images(c).length, 1);
});

// Theme doors (QUESTIONS.md, 2026-11-22).
test("vogue_cover_on_date: a date, a month with none, and a day across every year", async () => {
  const a = await call("vogue_cover_on_date", { date: "1925-06" });
  assert.equal(images(a).length, 1);
  assert.match(text(a), /the nearest is/);
  const b = await call("vogue_cover_on_date", { date: "06-15" });
  assert.ok(b.structuredContent.issues.length > 5);
  assert.ok(images(b).length > 0 && images(b).length <= 12);
  const late = await call("vogue_cover_on_date", { date: "1950-03" });
  assert.equal(images(late).length, 0);
});

test("vogue_covers_by_decade: 1920s spread with images, 1940s links only", async () => {
  const a = await call("vogue_covers_by_decade", { decade: 1920 });
  assert.equal(images(a).length, 12);
  const ys = a.structuredContent.covers.map((c) => c.year);
  assert.ok(Math.min(...ys) <= 1921 && Math.max(...ys) === 1927);
  const b = await call("vogue_covers_by_decade", { decade: 1940 });
  assert.equal(images(b).length, 0);
  assert.ok(b.structuredContent.link_only.length > 0);
});

test("vogue_by_season: spring 1925 and winter spanning the new year", async () => {
  const a = await call("vogue_by_season", { season: "spring", year: 1925 });
  for (const i of a.structuredContent.issues) assert.match(i.date, /^1925-0[345]-/);
  const w = await call("vogue_by_season", { season: "winter", year: 1925 });
  for (const i of w.structuredContent.issues) assert.match(i.date, /^(1925-12|1926-0[12])-/);
});

test("translate_vogue_page carries the site's French and English where it has them", async () => {
  const r = await call("translate_vogue_page", { issue: "1920-07-01", pages: [1] });
  assert.equal(images(r).length, 1);
  assert.equal(r.structuredContent.transcribed, true);
  assert.match(r.structuredContent.pages[0].english, /VOGUE/);
  const plain = await call("translate_vogue_page", { issue: "1925", pages: [2] });
  assert.equal(plain.structuredContent.pages[0].french, null);
  assert.equal(images(plain).length, 1);
});

test("random_vintage_vogue_cover stays inside the public-domain years asked for", async () => {
  const r = await call("random_vintage_vogue_cover", { from_year: 1926, to_year: 1927 });
  assert.ok([1926, 1927].includes(r.structuredContent.issue.year));
  assert.equal(images(r).length, 1);
  const none = await call("random_vintage_vogue_cover", { from_year: 1940 });
  assert.equal(none.structuredContent.found, false);
});

test("can_i_use_vogue_images: 1928 public domain, 1947 restored until 2043", async () => {
  const a = await call("can_i_use_vogue_images", { year: 1928 });
  assert.equal(a.structuredContent.public_domain_us, true);
  const b = await call("can_i_use_vogue_images", { year: 1947 });
  assert.equal(b.structuredContent.public_domain_us, false);
  assert.equal(b.structuredContent.public_domain_from, "2043-01-01");
  assert.match(text(b), /104A/);
});

test("high_resolution_vogue_cover gives the 2400-pixel scan, none for 1950", async () => {
  const r = await call("high_resolution_vogue_cover", { issue: "1925" });
  assert.match(r.structuredContent.full_scan_url, /\/w2400\/p\d{3}\.webp/);
  const late = await call("high_resolution_vogue_cover", { issue: "1950" });
  assert.equal(late.structuredContent.full_scan_url, null);
});

test("an unknown tool name is logged as attempted", async () => {
  sent.length = 0;
  await rpc("tools/call", { name: "search_vogue_text!", arguments: {} }, { "x-vpm-test": "1" });
  const e = sent.map((b) => JSON.parse(b)).find((x) => x.properties.tool === "unknown");
  assert.equal(e.properties.attempted, "search_vogue_text");
});
