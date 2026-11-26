/**
 * URL scheme helpers shared by `Markdown`, the HTML server serializer, the
 * browser host, hydration and head sync.
 *
 * @internal
 */

// ASCII controls and spaces are ignored when reading the scheme, as browsers ignore them.
// oxlint-disable-next-line no-control-regex
const ignoredSchemeChars = /[\u0000-\u0020]/g
const schemePattern = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

/**
 * The lowercase scheme of `url`, ignoring ASCII control characters and spaces,
 * or `undefined` when `url` has no scheme (such as a relative URL).
 *
 * @internal
 */
export const urlScheme = (url: string): string | undefined => {
  if (!url.includes(":")) return undefined
  const match = schemePattern.exec(url.replace(ignoredSchemeChars, ""))
  return match === null ? undefined : match[1]!.toLowerCase()
}

const blockedSchemes: ReadonlySet<string> = new Set([
  "javascript",
  "vbscript"
])

const urlAttributes: ReadonlySet<string> = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href"
])

const urlProperties: ReadonlySet<string> = new Set([
  "href",
  "src",
  "action",
  "formAction"
])

const isUnsafeUrl = (url: string): boolean => {
  const scheme = urlScheme(url)
  return scheme !== undefined && blockedSchemes.has(scheme)
}

const isAnimationTag = (tag: string): boolean => {
  const lower = tag.toLowerCase()
  return lower === "set" || lower === "animate"
}

const sanitizeValues = (value: string): string => {
  if (!value.includes(":")) return value
  const items = value.split(";")
  let changed = false
  for (let index = 0; index < items.length; index++) {
    if (isUnsafeUrl(items[index]!)) {
      items[index] = ""
      changed = true
    }
  }
  return changed ? items.join(";") : value
}

/**
 * The attribute value to write for normalized `name` on `tag`: `""` when `name`
 * is a URL-bearing attribute whose value uses a blocked scheme, otherwise
 * `value`. On SVG `<set>` and `<animate>` elements, applies the same rule to
 * `to`, `from`, `by` and each `;`-separated item of `values` regardless of
 * `attributeName`.
 *
 * @internal
 */
export const attributeValue = (
  tag: string,
  name: string,
  value: string
): string => {
  if (urlAttributes.has(name)) return isUnsafeUrl(value) ? "" : value
  if (name === "data") {
    return tag.toLowerCase() === "object" && isUnsafeUrl(value) ? "" : value
  }
  if (name === "to" || name === "from" || name === "by") {
    return isAnimationTag(tag) && isUnsafeUrl(value) ? "" : value
  }
  if (name === "values") {
    return isAnimationTag(tag) ? sanitizeValues(value) : value
  }
  return value
}

/**
 * The DOM property value to write for `name` on a built-in element `tag`: `""`
 * when `name` is a URL-bearing property whose string value uses a blocked
 * scheme, otherwise `value`.
 *
 * @internal
 */
export const propertyValue = (
  tag: string,
  name: string,
  value: unknown
): unknown =>
  value != null &&
    (urlProperties.has(name) ||
      (name === "data" && tag.toLowerCase() === "object")) &&
    isUnsafeUrl(String(value))
    ? ""
    : value
