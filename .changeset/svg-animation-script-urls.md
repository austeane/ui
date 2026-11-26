---
"@effect/ui": patch
---

Plain Html now omits `from`, `to` and `values` attributes containing `javascript:` or `vbscript:` URLs (including semicolon-separated items in `values`) during server rendering, browser rendering, hydration and head sync.
