/** Shared HTML element rules for the browser host and server serializer. */

/** @internal */
export const svgTags: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "text",
  "tspan",
  "textPath",
  "defs",
  "use",
  "symbol",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "image",
  "foreignObject",
  "animate",
  "set"
])

/** @internal */
export const isCustomTag = (tag: string): boolean => tag.includes("-")

export { attributeName } from "../../internal/attributeName.ts"
