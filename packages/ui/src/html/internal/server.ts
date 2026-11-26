/**
 * Server HTML: the tree, the head tags and the `<html>` / `<body>` attributes
 * as escaped strings.
 */
import type { ServerSink } from "../../internal/services.ts"
import * as View from "../../View.ts"
import * as Head from "../HtmlHead.ts"
import * as elements from "./elements.ts"
import * as headAttributes from "./headAttributes.ts"
import * as markers from "./markers.ts"
import { attributeValue } from "./urlScheme.ts"

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const voidTags: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr"
])

/**
 * Elements whose content the HTML parser reads as text: escaped text
 * (`textarea`, `title`) or raw text. Markers or tags inside them would become
 * part of the text, so the server writes only their text.
 *
 * @internal
 */
export const textOnlyTags: ReadonlySet<string> = new Set([
  "textarea",
  "title",
  "script",
  "style",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "noscript"
])

const escapedTextTags: ReadonlySet<string> = new Set(["textarea", "title"])

/** Elements whose first newline the HTML parser drops. */
const newlineTags: ReadonlySet<string> = new Set(["pre", "textarea", "listing"])

// Most text and values need no escaping, and are returned as they are without a replace.
const textSpecial = /[&<>]/
const attributeSpecial = /[&"<>]/

const escapeText = (text: string): string =>
  textSpecial.test(text)
    ? text.replace(/[&<>]/g, (char) =>
      char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;")
    : text

const escapeAttribute = (value: string): string =>
  attributeSpecial.test(value)
    ? value.replace(
      /[&"<>]/g,
      (char) =>
        char === "&"
          ? "&amp;"
          : char === "\""
          ? "&quot;"
          : char === "<"
          ? "&lt;"
          : "&gt;"
    )
    : value

/**
 * An element's attributes, with its controlled properties written as the
 * attributes that give the same initial state. Other properties are set when
 * the client adopts the element.
 */
const elementAttributes = (
  tag: string,
  attrs: Readonly<Record<string, string>>,
  props: Readonly<Record<string, unknown>>
): Map<string, string> => {
  const out = new Map<string, string>()
  const svg = elements.svgTags.has(tag)
  for (const [name, value] of Object.entries(attrs)) {
    const normalized = elements.attributeName(name, svg)
    if (normalized !== undefined) {
      out.set(normalized, attributeValue(tag, normalized, value))
    }
  }
  if (elements.isCustomTag(tag)) return out
  for (const [name, value] of Object.entries(props)) {
    switch (name) {
      case "value":
        if (tag !== "textarea" && tag !== "select" && value !== undefined) {
          out.set("value", String(value))
        }
        break
      case "checked":
      case "selected":
      case "open":
        // Only `true`: a modal dialog's `"modal"` has no attribute, so it renders closed until hydration.
        if (value === true) out.set(name, "")
        else out.delete(name)
        break
    }
  }
  return out
}

const written = (attributes: Map<string, string>): string => {
  let out = ""
  for (const [name, value] of attributes) {
    out += value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`
  }
  return out
}

/**
 * The text of a text-only element. A textarea with no children shows its
 * value. Raw text that could end the element early is left out; the client
 * builds the children anyway.
 */
const textContent = (tag: string, text: string): string => {
  if (escapedTextTags.has(tag)) return escapeText(text)
  return new RegExp(`</${tag}|<!--`, "i").test(text) ? "" : text
}

/**
 * An element's attributes as HTML, for one with no property and no alias among its attribute names, as
 * most are. `undefined` for any other: `elementAttributes` writes those.
 */
const plainAttributes = (
  tag: string,
  attrs: Readonly<Record<string, string>>,
  props: Readonly<Record<string, unknown>>
): string | undefined => {
  if (props !== View.noFields) {
    for (const _ in props) return undefined
  }
  if (tag === "option") return undefined
  if (attrs === View.noFields) return ""
  let out = ""
  for (const name in attrs) {
    if (elements.attributeName(name, false) !== name) {
      if (
        !elements.svgTags.has(tag) ||
        elements.attributeName(name, true) !== name
      ) return undefined
    }
    const value = attributeValue(tag, name, attrs[name]!)
    out += value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`
  }
  return out
}

/**
 * An open element whose end needs more than its closing tag. Most elements
 * have none.
 */
interface Frame {
  readonly parent: Frame | undefined
  readonly depth: number
  /** What was written before the element's content, which `out` holds until its end. */
  readonly before: string
  /** The enclosing element's text so far, when this one gathers its own. */
  readonly text: string | undefined
  readonly gathers: boolean
  readonly selectValue: string | undefined
  readonly kind: "void" | "text" | undefined
  readonly value: unknown
  /** An option whose value is its text: its attributes, written once the text is known. */
  readonly option: Map<string, string> | undefined
}

/** The tags whose element needs a `Frame` wherever it is. Built for the first write, so a client leaves it out. */
let framedTags: ReadonlySet<string> | undefined

// What a tape holds before the values of each call: `Open` has three, the others one.
const Text = 0
const Open = 1
const Close = 2
const Enter = 3
const Leave = 4

/**
 * Takes a server tree as it is walked, and writes it as HTML when `html` is called.
 *
 * The walk only keeps the texts, the tags and paths, and each element's `attrs` and `props` as the
 * objects they are. Nothing of those two is read before `html`, which is called once the render's Scope
 * has closed.
 *
 * @internal
 */
export const makeWriter = (): ServerSink & { readonly html: () => string } => {
  const tape: Array<unknown> = []
  return {
    html: () => write(tape),
    text(value) {
      tape.push(Text, value)
    },
    open(tag, attrs, props) {
      tape.push(Open, tag, attrs, props)
    },
    close(tag) {
      tape.push(Close, tag)
    },
    enter(path) {
      tape.push(Enter, path)
    },
    leave(path) {
      tape.push(Leave, path)
    }
  }
}

const write = (tape: ReadonlyArray<any>): string => {
  const framed = framedTags ??= new Set([
    ...voidTags,
    ...textOnlyTags,
    ...newlineTags,
    "select"
  ])
  let out = ""
  let depth = 0
  let frame: Frame | undefined
  /** The text under the nearest element that needs it: a text-only one, or an option without a value. */
  let text: string | undefined
  /** Whether the innermost open element has a `Frame` and no children yet. */
  let bare = false
  /**
   * Whether what is written is left out: inside a void or a text-only element, of which only the text
   * is kept. Nothing of an element is read there.
   */
  let skips = false
  /** The value of the select the options being written belong to. */
  let selectValue: string | undefined
  for (let at = 0; at < tape.length;) {
    switch (tape[at++]) {
      case Text: {
        const value: string = tape[at++]
        bare = false
        if (text !== undefined) text += value
        if (!skips) out += escapeText(value)
        break
      }
      case Enter: {
        const path: string = tape[at++]
        bare = false
        if (!skips) out += markers.open(path)
        break
      }
      case Leave: {
        const path: string = tape[at++]
        if (!skips) out += markers.close(path)
        break
      }
      case Open: {
        const tag: string = tape[at++]
        const attrs: Readonly<Record<string, string>> = tape[at++]
        const props: Readonly<Record<string, unknown>> = tape[at++]
        depth++
        bare = false
        if (skips) break
        const plain = plainAttributes(tag, attrs, props)
        // Most elements: outside a select, and closed by their closing tag.
        if (selectValue === undefined && !framed.has(tag)) {
          out += `<${tag}${
            plain ?? written(elementAttributes(tag, attrs, props))
          }>`
          // Read for nothing: every element's `value` is read once, whether or not its tag writes it.
          void props.value
          break
        }
        out += `<${tag}`
        let option: Map<string, string> | undefined
        if (plain !== undefined) out += `${plain}>`
        else {
          const attributes = elementAttributes(tag, attrs, props)
          if (
            tag === "option" && selectValue !== undefined &&
            !Object.hasOwn(props, "selected")
          ) {
            const value = attributes.get("value")
            if (value === undefined) option = attributes
            else if (value === selectValue) attributes.set("selected", "")
          }
          if (option === undefined) out += `${written(attributes)}>`
        }
        const kind = voidTags.has(tag)
          ? "void"
          : textOnlyTags.has(tag)
          ? "text"
          : undefined
        const value = kind === "void" ? undefined : props.value
        const inside = tag === "select" && value !== undefined
          ? String(value)
          : tag === "option" || tag === "optgroup"
          ? selectValue
          : undefined
        if (
          kind === undefined && option === undefined &&
          inside === selectValue && !newlineTags.has(tag)
        ) break
        const gathers = kind === "text" || option !== undefined
        frame = {
          parent: frame,
          depth,
          before: out,
          text,
          gathers,
          selectValue,
          kind,
          value,
          option
        }
        out = ""
        bare = true
        skips = kind !== undefined
        if (gathers) text = ""
        selectValue = inside
        break
      }
      case Close: {
        const tag: string = tape[at++]
        const open = frame
        if (open === undefined || open.depth !== depth) {
          depth--
          if (!skips) out += `</${tag}>`
          break
        }
        depth--
        // No element inside one that skips has a `Frame`, so the one around this doesn't skip.
        skips = false
        if (open.kind === "void") out = open.before
        else {
          let before = open.before
          if (open.option !== undefined) {
            if (text === open.selectValue) open.option.set("selected", "")
            before += `${written(open.option)}>`
          }
          let inner = open.kind === "text"
            ? textContent(
              tag,
              bare && tag === "textarea" && open.value !== undefined
                ? String(open.value)
                : text!
            )
            : out
          if (newlineTags.has(tag) && inner.startsWith("\n")) {
            inner = `\n${inner}`
          }
          out = `${before}${inner}</${tag}>`
        }
        frame = open.parent
        if (open.gathers) {
          text = open.text === undefined
            ? undefined
            : open.text + text
        }
        selectValue = open.selectValue
        bare = false
        break
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------

const tag = (
  name: string,
  pairs: ReadonlyArray<readonly [string, string]>
): string =>
  `<${name}${
    headAttributes.normalize(pairs).map(([key, value]) =>
      ` ${key}="${escapeAttribute(value)}"`
    ).join("")
  } ${Head.marker}>`

/**
 * The folded head of a root as an `HtmlHead`: a host-neutral root's `Head.Head` holds only the title.
 *
 * @internal
 */
export const htmlHead = (head: unknown): Head.HtmlHead => {
  const value = head as Partial<Head.HtmlHead> | undefined
  return value !== undefined && value.meta !== undefined
    ? value as Head.HtmlHead
    : { ...Head.empty, title: value?.title }
}

/** @internal */
export const headTags = (head: Head.HtmlHead): string => {
  let out = head.title === undefined
    ? ""
    : `<title ${Head.marker}>${escapeText(head.title)}</title>`
  for (const entry of head.meta) out += tag("meta", Head.attributes(entry))
  for (const entry of head.links) out += tag("link", Head.attributes(entry))
  // The JSON is canonical, with `<` escaped, so it can't end the script.
  for (const entry of head.jsonLd) {
    out += `${
      tag("script", [["type", "application/ld+json"]])
    }${entry.json}</script>`
  }
  return out
}

/** The attributes the head sets on `<html>`, in the order the browser host lists them in the marker. */
/** @internal */
export const htmlOwned = (
  head: Head.HtmlHead
): ReadonlyArray<readonly [string, string]> => [
  ...(head.html.lang === undefined ? [] : [["lang", head.html.lang] as const]),
  ...(head.html.dir === undefined ? [] : [["dir", head.html.dir] as const]),
  ...bodyOwned({ ...head, body: head.html })
]

/** @internal */
export const bodyOwned = (
  head: Head.HtmlHead
): ReadonlyArray<readonly [string, string]> => [
  ...(head.body.class.length === 0
    ? []
    : [["class", head.body.class.join(" ")] as const]),
  ...Object.entries(head.body.data)
]

/** Escaped attributes, plus the marker listing their names; empty when the head sets none. */
/** @internal */
export const attributes = (
  pairs: ReadonlyArray<readonly [string, string]>
): string => {
  const normalized = headAttributes.normalize(pairs)
  return normalized.length === 0 ? "" : [
    ...normalized.map(([name, value]) => `${name}="${escapeAttribute(value)}"`),
    `${Head.marker}="${
      escapeAttribute(normalized.map(([name]) => name).join(" "))
    }"`
  ].join(" ")
}
