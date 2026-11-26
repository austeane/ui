---
"@effect/ui": patch
---

Replace `javascript:` and `vbscript:` URLs with `""` on URL-bearing HTML and SVG attributes and matching DOM properties across server rendering, the browser host, hydration, and head sync. Relative URLs and other schemes are left unchanged.
