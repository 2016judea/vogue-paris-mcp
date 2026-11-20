// The directory test cases (SUBMISSION.md), run against the live endpoint. Calls carry
// x-vpm-test: 1, so analytics marks them as tests. Prints one line per case and exits 1 on a miss.
//   node scripts/live_cases.mjs [endpoint] [dir to save case-2 page images]
import { writeFileSync, mkdirSync } from "node:fs";

const URL_ = process.argv[2] || "https://vogue-paris-mcp.vercel.app/mcp";
const SAVE = process.argv[3];

async function call(name, args) {
  const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-vpm-test": "1", "user-agent": "vpm-live-cases" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  return (await r.json()).result;
}
const imgs = (r) => r.content.filter((c) => c.type === "image");
const txt = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

const cases = [
  ["P1 covers from 1925", "look_at_covers", { year: 1925 }, (r) => imgs(r).length >= 10 && /1925/.test(txt(r))],
  ["P2 pages 1-3 of 1 March 1926, to translate", "look_at_pages", { issue: "1926-03-01", pages: [1, 2, 3] }, (r) => imgs(r).length === 3 && /1926-03-01/.test(txt(r))],
  ["P3 which issues exist for 1921", "find_issues", { year: 1921 }, (r) => r.structuredContent.total > 0 && r.structuredContent.issues.every((i) => i.year === 1921)],
  ["P4 June 1925 (no issue): nearest named", "find_issues", { year: 1925, month: 6 }, (r) => r.structuredContent.total === 0 && !!r.structuredContent.nearest],
  ["P4b same, pages tool", "look_at_pages", { issue: "1925-06", pages: [1] }, (r) => /No issue is dated 1925-06; the nearest is/.test(txt(r)) && imgs(r).length === 1],
  ["N1 pages of a 1950 issue: link only", "look_at_pages", { issue: "1950-03-01", pages: [1, 2] }, (r) => imgs(r).length === 0 && /vogue-paris\.vercel\.app\/issue\//.test(txt(r))],
  ["N2 whole 1925 issue as PDF: no such tool, reader link", "find_issues", { year: 1925 }, (r) => r.structuredContent.issues.every((i) => /\/issue\//.test(i.reader_url))],
];

let bad = 0;
for (const [label, tool, args, ok] of cases) {
  const t0 = Date.now();
  const r = await call(tool, args);
  const pass = !r.isError && ok(r);
  if (!pass) bad++;
  const first = txt(r).split("\n").filter(Boolean).slice(0, 2).join(" | ").slice(0, 160);
  console.log(`${pass ? "PASS" : "FAIL"} ${label} · ${tool} ${JSON.stringify(args)} · ${imgs(r).length} images · ${Date.now() - t0} ms · ${first}`);
  if (SAVE && tool === "look_at_pages" && args.issue === "1926-03-01") {
    mkdirSync(SAVE, { recursive: true });
    imgs(r).forEach((im, k) => writeFileSync(`${SAVE}/p${k + 1}.webp`, Buffer.from(im.data, "base64")));
  }
}
const { result } = await (await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) })).json();
console.log(`tools/list: ${result.tools.map((t) => t.name).join(", ")} (no download or PDF tool)`);
process.exit(bad ? 1 : 0);
