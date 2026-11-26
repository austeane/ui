---
"@effect/ui": patch
---

Skip walking reused `h.lazy` (and cached) element subtrees during updates when neither the element nor any element descendant sets a controlled property. Subtrees that hold controlled fields such as `input`, `select`, `textarea` or checkbox still restore their controlled properties as before.
