---
"@effect/ui": patch
---

`BrowserHost` now leaves an unhandled `<form>` submission to the browser when `BrowserRouter` won't follow it: when its effective method (`formmethod`, then `method`) is neither `get` nor `dialog`, or its effective target (`formtarget`, then `target`) names another window. Forms with a `submit` handler, `method="dialog"` forms, and unhandled same-window GET forms keep their existing behaviour. Before, every submission of a form the app rendered was cancelled, so a POST form with no handler did nothing once the app had mounted.
