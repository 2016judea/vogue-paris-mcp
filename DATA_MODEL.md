# Data model

**Issue:** `ark` (Gallica id), `date`, `label` (French date as printed), `year`, `pages` (cover = 1),
`reader_url`, `images_available` (US public domain). It answers which issue, from when, how long it is,
where to read it, and whether Claude may look at it.

**Page:** `issue`, `page`, `image_url` (1200 px), `full_scan_url` (2400 px). It answers what is on this page.

**Year:** `year`, `issues`, `images_available`. It answers what the archive holds.

Reality check: every field is filled from the site's `issues.json` and its Blob paths. There is no text
layer yet: `public/text/` on the site holds one translated issue (1920), so search inside the magazine is
not a tool. Claude reads the page images instead.
