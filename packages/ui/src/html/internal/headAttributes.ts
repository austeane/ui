/** Shared attribute rules for head tags and document ownership markers. */
import { attributeName } from "../../internal/attributeName.ts"
import { emptyHtml } from "../../internal/heads.ts"
import type * as HtmlHead from "../HtmlHead.ts"
import { attributeValue } from "./urlScheme.ts"

/** @internal */
export const marker = "data-eui"

/** @internal */
export const name = (name: string): string | undefined => {
  const normalized = attributeName(name, false)
  return normalized === marker ? undefined : normalized
}

/** Canonical names with last-write wins; the ownership marker is host-managed. @internal */
export const normalize = (
  pairs: ReadonlyArray<readonly [string, string]>
): ReadonlyArray<readonly [string, string]> => {
  const out = new Map<string, string>()
  for (const [key, value] of pairs) {
    const normalized = name(key)
    if (normalized !== undefined) {
      out.set(normalized, attributeValue("", normalized, value))
    }
  }
  return [...out]
}

/** The attributes of a meta or link tag, in a stable order, without the marker. @internal */
export const attributes = (
  entry: HtmlHead.Meta | HtmlHead.Link
): ReadonlyArray<readonly [string, string]> => {
  if (entry._tag === "Meta") {
    return [
      entry.name !== undefined
        ? ["name", entry.name] as const
        : ["property", entry.property!] as const,
      ["content", entry.content]
    ]
  }
  const out: Array<readonly [string, string]> = []
  for (const [name, value] of Object.entries(entry.attributes)) {
    if (value !== undefined) out.push([name, value])
  }
  return out
}

/** The head with no entries. @internal */
export const empty: HtmlHead.HtmlHead = emptyHtml
