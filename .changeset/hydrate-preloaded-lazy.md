---
"@effect/ui": patch
---

Hydrating a preloaded `Component.lazy` child now resolves the loaded component before decoding its saved state, adopting the server's nodes and Model instead of failing the root.
