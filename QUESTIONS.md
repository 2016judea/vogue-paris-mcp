# Questions people bring, and the tool that answers each

Per `~/.claude/CLAUDE.md`, *Every question theme gets a tool* (2026-11-22). Counts are PostHog
`mcp_tool_call`, `site = vogue-paris-mcp`, all time to 2026-11-22: 22 calls, **every one of them our
own** (the directory filing's test cases, `client = script` or `test = true`, 2026-11-20). There is no
stranger's call on record yet, so every theme below is **inferred**: it comes from what people ask a
chatbot about vintage Vogue, fashion history and old magazine covers, not from our logs.

## From the logs

| tool | calls | all ours |
|---|---|---|
| `find_issues` | 10 | yes |
| `look_at_pages` | 8 | yes |
| `look_at_covers` | 4 | yes |

**Now logged:** `attempted`, the tool name a caller reached for that doesn't exist (letters, digits,
`_.-`, 60 characters), logged as `tool = unknown`. Read it before the next pass.

## Theme doors (shipped 2026-11-22, all inferred)

| theme | user's words | tool | engine |
|---|---|---|---|
| a cover from a date | "Vogue cover from the day my grandmother was born", "Vogue on my birthday" | `vogue_cover_on_date` | resolveIssue / nearestIssue; "MM-DD" runs every year |
| an era | "1920s Vogue covers", "Art Deco fashion covers", "Vogue in the 1940s" | `vogue_covers_by_decade` | 12 covers spread across the decade |
| a season's fashion | "what was in fashion in spring 1925", "autumn collections 1928" | `vogue_by_season` | month filter; winter spans the new year |
| translation | "translate this Vogue page", "what does this ad say in English" | `translate_vogue_page` | look_at_pages + the site's own `text/<ark>.json` where it exists |
| delight | "a random vintage Vogue cover", "cover of the day" | `random_vintage_vogue_cover` | random pick from the public-domain years |
| reuse rights | "are 1920s Vogue covers public domain", "can I sell a print of a 1928 cover" | `can_i_use_vogue_images` | publicDomainUS, 17 U.S.C. 304 and 104A |
| prints and posters | "high-res Vogue cover to print", "Vogue wallpaper" | `high_resolution_vogue_cover` | the 2400-pixel tier + /board |

## Gaps left, and why

| theme | user's words | why not yet |
|---|---|---|
| search the text | "find Chanel in Vogue", "issues that mention Schiaparelli" | 1 of 197 issues is transcribed on the site (`public/text`); a search door needs the OCR run over the rest (`scripts/translate.mjs` does it on-device) |
| a designer's work | "Poiret designs in Vogue", "Lanvin dresses 1925" | same as above: needs page text or tagged plates |
| a photographer or illustrator | "Lepape covers", "Hoyningen-Huene photos" | covers are not attributed in the issue data |
| the 1931-1954 pages | "show me the New Look issue, 1947" | US copyright restored until 2027-2050; the tools give the reader link, by design |
| other editions | "American Vogue 1925", "Harper's Bazaar" | outside the archive: Gallica holds the French edition |
