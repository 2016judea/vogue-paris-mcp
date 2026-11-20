# Analytics

Started 2026-11-20.

- **Calls:** one PostHog `mcp_tool_call` per tool call, in project 521313, filtered by `properties.site = 'vogue-paris-mcp'`.
  Properties: `tool`, `ok`, `ms`, `err` (`not_found`, `page_out_of_range`, `exception`), `year`, `n_issues`,
  `n_images`, `public_domain`, `client`, `client_ua`, `test` (set by `x-vpm-test: 1`). Every event gets a random
  id and no person profile, because claude.ai calls arrive from Anthropic's servers (heistclips, 2026-11-19).
- **People:** count them on the site, never here. Use Vercel Web Analytics for vogue-paris.vercel.app, looking at
  visits to `/issue/*` with referrer claude.ai or chatgpt.com, or with `utm_source=mcp`.
- **Connect page:** Vercel Web Analytics on this project.

```sql
select properties.tool, count() from events
where event = 'mcp_tool_call' and properties.site = 'vogue-paris-mcp' and properties.test is null
group by 1
```
