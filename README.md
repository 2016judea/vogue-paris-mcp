# Vogue Paris MCP

**Live:** https://vogue-paris-mcp.vercel.app

A free remote MCP server (Claude connector) for Vogue Paris, 1920–1954: the issues the BnF digitised on
Gallica and [vogue-paris.vercel.app](https://vogue-paris.vercel.app) mirrors. Endpoint:
`https://vogue-paris-mcp.vercel.app/mcp` (Streamable HTTP, stateless, no auth).

| Tool | Does |
|---|---|
| `find_issues` | Issues by year, month or date range, each with its reader link. No filters: issues per year. |
| `look_at_covers` | Covers as images, up to 12, with reader links. |
| `look_at_pages` | Up to 4 pages of one issue as images, plus a 2400 px scan link per page. |

## The copyright line

Images only for issues in the US public domain. A work published in year Y enters it on 1 January of Y + 96,
so in 2026 that means 1930 and earlier (104 issues). The 1932–1954 issues are French works whose US copyright
was restored (URAA) and runs to 2028–2050. For them the tools return the details and a reader link, never
pages or covers. `publicDomainUS()` in `lib/archive.js` works out the line from the date, so the 1931 issues
(there are none in the archive) and later years open on their own each January. Tested in `tests/mcp.test.js`.

## How it works

- `api/mcp.js`: the server (`@modelcontextprotocol/sdk` 1.32.1, the appeal-the-denial pattern).
- `lib/archive.js`: reads the site's live `issues.json`, falling back to `lib/snapshot.js`
  (`npm run snapshot` refreshes it). Images are fetched from the site's Vercel Blob and returned as
  base64 WebP.
- This project never writes to the site. Reader links carry `utm_source=mcp`.
- `public/`: the connect page and privacy policy.

    npm install && npm test

Deploys from git on push to master (Vercel project `vogue-paris-mcp`). Analytics: `ANALYTICS.md`.

Source: gallica.bnf.fr / Bibliothèque nationale de France.
