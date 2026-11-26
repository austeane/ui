---
"@effect/ui": patch
---

Add `toHaveAttribute(name, value?)` to `Scene.Expect` (and `HtmlScene`, `Play` and `HtmlPlay`). With no `value` it asserts that the attribute is present, with a string or `RegExp` it checks the value, and with `false` it asserts that the attribute is absent on the one matched element.
