/**
 * Markdown documents as data, and the fold that renders them with `h`.
 *
 * A `Document` is the block tree of one Markdown source: CommonMark without
 * raw HTML, plus GFM tables and strikethrough, and island directives that
 * render your own views. `MarkdownParser.parseMarkdown` builds one, and the
 * Vite plugin in `@effect/ui/html/MarkdownVite` compiles `.md` imports
 * into its JSON form at build time, so no parser ships to the browser.
 * `decodeDocument` turns that JSON back into a `Document`, and `view`
 * renders it, with an override for any node and a view for each island.
 *
 * **Example** (Rendering a compiled post)
 *
 * ```ts
 * import { type Html, Markdown, MarkdownParser } from "@effect/ui/html"
 *
 * const post = MarkdownParser.parseMarkdown("# Hello\n\nRead the [changelog](/changelog).")
 *
 * const Post = <Msg>(h: Html.H<Msg>) =>
 *   Markdown.view(h, post, {
 *     views: {
 *       Link: (h, link, content) => h.a.attr("href", link.url).class("underline").children(content)
 *     }
 *   }).class("prose")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type * as SchemaAST from "effect/SchemaAST"
import type * as View from "../View.ts"
import type * as Html from "./Html.ts"
import { urlScheme } from "./internal/urlScheme.ts"

const allowedSchemes: ReadonlySet<string> = new Set([
  "http",
  "https",
  "mailto",
  "tel"
])

/**
 * Whether a link or image URL is allowed in a document: relative, or with the
 * `http:`, `https:`, `mailto:` or `tel:` scheme.
 *
 * **Details**
 *
 * ASCII control characters and spaces are ignored when reading the scheme,
 * as browsers ignore them, so `java\tscript:` is rejected like
 * `javascript:`.
 *
 * @stability experimental
 * @category predicates
 * @since 0.1.0
 */
export const isAllowedUrl = (url: string): boolean => {
  const scheme = urlScheme(url)
  return scheme === undefined || allowedSchemes.has(scheme)
}

/** @internal */
export const unsupportedUrl = (url: string, line?: number): string =>
  `Unsupported URL scheme in "${url}"${
    line === undefined ? "" : ` (line ${line})`
  }. Link and image URLs may be relative, or use the http:, https:, mailto:, or tel: schemes.`

/**
 * A link or image URL that passes `isAllowedUrl`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Url: Schema.String = Schema.String.check(
  Schema.makeFilter((url: string) => isAllowedUrl(url) || unsupportedUrl(url))
)

const OptionalString = Schema.OptionFromNullOr(Schema.String)

/**
 * Plain text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Text {
  readonly _tag: "Text"
  readonly value: string
}

/**
 * A code span.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InlineCode {
  readonly _tag: "InlineCode"
  readonly value: string
}

/**
 * A hard line break.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface HardBreak {
  readonly _tag: "HardBreak"
}

/**
 * Emphasised content, `*like this*`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Emphasis {
  readonly _tag: "Emphasis"
  readonly content: ReadonlyArray<Inline>
}

/**
 * Strong content, `**like this**`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Strong {
  readonly _tag: "Strong"
  readonly content: ReadonlyArray<Inline>
}

/**
 * Struck-through content, `~~like this~~`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Strikethrough {
  readonly _tag: "Strikethrough"
  readonly content: ReadonlyArray<Inline>
}

/**
 * A link. Its `url` passes `isAllowedUrl`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Link {
  readonly _tag: "Link"
  readonly url: string
  readonly title: Option.Option<string>
  readonly content: ReadonlyArray<Inline>
}

/**
 * An image. Its `url` passes `isAllowedUrl`, and `alt` is the plain
 * text of its description.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Image {
  readonly _tag: "Image"
  readonly url: string
  readonly alt: string
  readonly title: Option.Option<string>
}

/**
 * Any inline node.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Inline =
  | Text
  | InlineCode
  | HardBreak
  | Emphasis
  | Strong
  | Strikethrough
  | Link
  | Image

type Encoded<A> = A extends Option.Option<infer B> ? B | null
  : A extends object ? { readonly [K in keyof A]: Encoded<A[K]> }
  : A

/**
 * The JSON form of an inline node: each `Option` is its value or `null`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type InlineEncoded = Encoded<Inline>

/**
 * Heading depth, `1` through `6`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

/**
 * A table column's alignment, from the delimiter row of the source.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Alignment = "None" | "Left" | "Center" | "Right"

/**
 * A heading.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Heading {
  readonly _tag: "Heading"
  readonly level: HeadingLevel
  readonly content: ReadonlyArray<Inline>
}

/**
 * A paragraph.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Paragraph {
  readonly _tag: "Paragraph"
  readonly content: ReadonlyArray<Inline>
}

/**
 * A fenced or indented code block. `language` is the first word of a
 * fence's info string and `meta` the rest.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface CodeBlock {
  readonly _tag: "CodeBlock"
  readonly language: Option.Option<string>
  readonly meta: Option.Option<string>
  readonly value: string
}

/**
 * One item of a list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ListItem {
  readonly _tag: "ListItem"
  readonly blocks: ReadonlyArray<Block>
}

/**
 * A bullet or ordered list. `startNumber` is an ordered list's first
 * number.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface List {
  readonly _tag: "List"
  readonly isOrdered: boolean
  readonly startNumber: Option.Option<number>
  readonly items: readonly [ListItem, ...Array<ListItem>]
}

/**
 * A block quote.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Blockquote {
  readonly _tag: "Blockquote"
  readonly blocks: ReadonlyArray<Block>
}

/**
 * A thematic break, `---`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ThematicBreak {
  readonly _tag: "ThematicBreak"
}

/**
 * One cell of a table row.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TableCell {
  readonly _tag: "TableCell"
  readonly content: ReadonlyArray<Inline>
}

/**
 * One row of a table.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TableRow {
  readonly _tag: "TableRow"
  readonly cells: ReadonlyArray<TableCell>
}

/**
 * A GFM table.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Table {
  readonly _tag: "Table"
  readonly alignments: ReadonlyArray<Alignment>
  readonly headerRow: TableRow
  readonly bodyRows: ReadonlyArray<TableRow>
}

/**
 * An island directive: `::Name{key="value"}` on its own line, or a
 * `:::Name` container around more blocks. `view` renders it with the view
 * registered for its name.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Island {
  readonly _tag: "Island"
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly blocks: ReadonlyArray<Block>
}

/**
 * Any block node.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Block =
  | Heading
  | Paragraph
  | CodeBlock
  | List
  | Blockquote
  | ThematicBreak
  | Table
  | Island

/**
 * The JSON form of a block node: each `Option` is its value or `null`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type BlockEncoded = Encoded<Block>

/**
 * A compiled Markdown document: the blocks of one source.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Document {
  readonly blocks: ReadonlyArray<Block>
}

/**
 * The JSON form of a `Document`, as the Vite plugin emits it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DocumentEncoded = Encoded<Document>

/**
 * The schema of an inline node.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Inline: Schema.Codec<Inline, InlineEncoded> = Schema.suspend(() =>
  Schema.Union([
    Schema.TaggedStruct("Text", { value: Schema.String }),
    Schema.TaggedStruct("InlineCode", { value: Schema.String }),
    Schema.TaggedStruct("HardBreak", {}),
    Schema.TaggedStruct("Emphasis", { content: Schema.Array(Inline) }),
    Schema.TaggedStruct("Strong", { content: Schema.Array(Inline) }),
    Schema.TaggedStruct("Strikethrough", { content: Schema.Array(Inline) }),
    Schema.TaggedStruct("Link", {
      url: Url,
      title: OptionalString,
      content: Schema.Array(Inline)
    }),
    Schema.TaggedStruct("Image", {
      url: Url,
      alt: Schema.String,
      title: OptionalString
    })
  ])
)

const TableRowSchema = Schema.TaggedStruct("TableRow", {
  cells: Schema.Array(
    Schema.TaggedStruct("TableCell", { content: Schema.Array(Inline) })
  )
})

/**
 * The schema of a block node.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Block: Schema.Codec<Block, BlockEncoded> = Schema.suspend(() =>
  Schema.Union([
    Schema.TaggedStruct("Heading", {
      level: Schema.Literals([1, 2, 3, 4, 5, 6]),
      content: Schema.Array(Inline)
    }),
    Schema.TaggedStruct("Paragraph", { content: Schema.Array(Inline) }),
    Schema.TaggedStruct("CodeBlock", {
      language: OptionalString,
      meta: OptionalString,
      value: Schema.String
    }),
    Schema.TaggedStruct("List", {
      isOrdered: Schema.Boolean,
      startNumber: Schema.OptionFromNullOr(Schema.Number),
      items: Schema.NonEmptyArray(
        Schema.TaggedStruct("ListItem", { blocks: Schema.Array(Block) })
      )
    }),
    Schema.TaggedStruct("Blockquote", { blocks: Schema.Array(Block) }),
    Schema.TaggedStruct("ThematicBreak", {}),
    Schema.TaggedStruct("Table", {
      alignments: Schema.Array(
        Schema.Literals(["None", "Left", "Center", "Right"])
      ),
      headerRow: TableRowSchema,
      bodyRows: Schema.Array(TableRowSchema)
    }),
    Schema.TaggedStruct("Island", {
      name: Schema.String,
      attributes: Schema.Record(Schema.String, Schema.String),
      blocks: Schema.Array(Block)
    })
  ])
)

/**
 * The schema of a `Document`, with its JSON form as the encoded side.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Document: Schema.Codec<Document, DocumentEncoded> = Schema.Struct({
  blocks: Schema.Array(Block)
})

const decodeUncached = Schema.decodeUnknownSync(Document)
const decoded = new WeakMap<object, Document>()

/**
 * Decodes the JSON form of a document, such as the default export of a
 * compiled `.md` module. Throws on anything outside the vocabulary,
 * including a URL that fails `isAllowedUrl`.
 *
 * **Details**
 *
 * The result is cached per input object, so calling it from a view decodes
 * a module once rather than on every render. Passing `options` skips the
 * cache.
 *
 * @stability experimental
 * @category decoding
 * @since 0.1.0
 */
export const decodeDocument = (
  input: unknown,
  options?: SchemaAST.ParseOptions
): Document => {
  if (options !== undefined || !Predicate.isObject(input)) {
    return decodeUncached(input, options)
  }
  const cached = decoded.get(input)
  if (cached !== undefined) {
    return cached
  }
  const document = decodeUncached(input)
  decoded.set(input, document)
  return document
}

/**
 * Encodes a document into its JSON form.
 *
 * @stability experimental
 * @category encoding
 * @since 0.1.0
 */
export const encodeDocument: (document: Document) => DocumentEncoded = Schema
  .encodeSync(Document)

/**
 * The attribute schema of one island: a struct over the directive's string
 * attributes. Use transforming fields, such as `Schema.NumberFromString`,
 * to decode past strings.
 *
 * @stability experimental
 * @category islands
 * @since 0.1.0
 */
export type IslandDefinition = Schema.Struct<Schema.Struct.Fields> & {
  readonly DecodingServices: never
  readonly EncodingServices: never
}

/**
 * Island attribute schemas by directive name. Pass one record to
 * `islandsFor`, and to the parser's `islands` option so that an unknown
 * island or attribute fails the build.
 *
 * @stability experimental
 * @category islands
 * @since 0.1.0
 */
export type IslandDefinitions = Readonly<Record<string, IslandDefinition>>

/**
 * Rendered inline content, to pass to `children`.
 *
 * @stability experimental
 * @category views
 * @since 0.1.0
 */
export type InlineContent<Msg, R = never> = ReadonlyArray<
  View.Content<Msg, R> | string
>

/**
 * One view per node. A container's view receives its rendered content
 * after the node. A code block's view receives its occurrence index, in
 * document order, for ids that must differ per block.
 *
 * @stability experimental
 * @category views
 * @since 0.1.0
 */
export interface Views<Msg, R = never> {
  readonly Text: (h: Html.H<Msg>, text: Text) => View.Content<Msg, R> | string
  readonly InlineCode: (
    h: Html.H<Msg>,
    inlineCode: InlineCode
  ) => View.Content<Msg, R>
  readonly HardBreak: (
    h: Html.H<Msg>,
    hardBreak: HardBreak
  ) => View.Content<Msg, R>
  readonly Emphasis: (
    h: Html.H<Msg>,
    emphasis: Emphasis,
    content: InlineContent<Msg, R>
  ) => View.Content<Msg, R>
  readonly Strong: (
    h: Html.H<Msg>,
    strong: Strong,
    content: InlineContent<Msg, R>
  ) => View.Content<Msg, R>
  readonly Strikethrough: (
    h: Html.H<Msg>,
    strikethrough: Strikethrough,
    content: InlineContent<Msg, R>
  ) => View.Content<Msg, R>
  readonly Link: (
    h: Html.H<Msg>,
    link: Link,
    content: InlineContent<Msg, R>
  ) => View.Content<Msg, R>
  readonly Image: (h: Html.H<Msg>, image: Image) => View.Content<Msg, R>
  readonly Heading: (
    h: Html.H<Msg>,
    heading: Heading,
    content: InlineContent<Msg, R>
  ) => View.Content<Msg, R>
  readonly Paragraph: (
    h: Html.H<Msg>,
    paragraph: Paragraph,
    content: InlineContent<Msg, R>
  ) => View.Content<Msg, R>
  readonly CodeBlock: (
    h: Html.H<Msg>,
    codeBlock: CodeBlock,
    occurrenceIndex: number
  ) => View.Content<Msg, R>
  readonly List: (
    h: Html.H<Msg>,
    list: List,
    items: ReadonlyArray<View.Content<Msg, R>>
  ) => View.Content<Msg, R>
  readonly ListItem: (
    h: Html.H<Msg>,
    listItem: ListItem,
    blocks: ReadonlyArray<View.Content<Msg, R>>
  ) => View.Content<Msg, R>
  readonly Blockquote: (
    h: Html.H<Msg>,
    blockquote: Blockquote,
    blocks: ReadonlyArray<View.Content<Msg, R>>
  ) => View.Content<Msg, R>
  readonly ThematicBreak: (
    h: Html.H<Msg>,
    thematicBreak: ThematicBreak
  ) => View.Content<Msg, R>
  readonly Table: (
    h: Html.H<Msg>,
    table: Table,
    headerRow: View.Content<Msg, R>,
    bodyRows: ReadonlyArray<View.Content<Msg, R>>
  ) => View.Content<Msg, R>
  readonly TableRow: (
    h: Html.H<Msg>,
    tableRow: TableRow,
    cells: ReadonlyArray<View.Content<Msg, R>>
  ) => View.Content<Msg, R>
  readonly TableCell: (
    h: Html.H<Msg>,
    tableCell: TableCell,
    content: InlineContent<Msg, R>,
    alignment: Alignment,
    isHeader: boolean
  ) => View.Content<Msg, R>
}

/**
 * The type of `defaultViews`: each view is generic, so an override can
 * call one at its own `Msg` and `R`.
 *
 * @stability experimental
 * @category views
 * @since 0.1.0
 */
export type DefaultViews = {
  readonly [K in keyof Views<unknown>]: <Msg, R = never>(
    ...args: Parameters<Views<Msg, R>[K]>
  ) => ReturnType<Views<Msg, R>[K]>
}

/**
 * Renders one island. It receives the directive's attributes, its rendered
 * blocks (none for `::Name`), and the occurrence index of its name in
 * document order, which makes a child component's key unique.
 * `undefined` renders nothing.
 *
 * @stability experimental
 * @category islands
 * @since 0.1.0
 */
export type IslandView<Msg, R = never> = (
  h: Html.H<Msg>,
  attributes: Readonly<Record<string, string>>,
  content: ReadonlyArray<View.Content<Msg, R>>,
  occurrenceIndex: number
) => View.Content<Msg, R> | undefined

/**
 * Island views by directive name.
 *
 * @stability experimental
 * @category islands
 * @since 0.1.0
 */
export type Islands<Msg, R = never> = Readonly<
  Record<string, IslandView<Msg, R>>
>

/**
 * Overrides for `view` and `viewBlocks`. A node without an override
 * renders with `defaultViews`, and an island without a view renders
 * nothing and warns once per name.
 *
 * @stability experimental
 * @category views
 * @since 0.1.0
 */
export interface ViewConfig<Msg, R = never> {
  readonly views?: Partial<Views<Msg, R>> | undefined
  readonly islands?: Islands<Msg, R> | undefined
}

const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const

const textAlign = {
  None: undefined,
  Left: "left",
  Center: "center",
  Right: "right"
} as const

/**
 * Unstyled semantic elements for every node. Call one from an override to
 * keep its element and change something around it.
 *
 * @stability experimental
 * @category views
 * @since 0.1.0
 */
export const defaultViews: DefaultViews = {
  Text: (_h, { value }) => value,
  InlineCode: (h, { value }) => h.code.children(value),
  HardBreak: (h) => h.br,
  Emphasis: (h, _emphasis, content) => h.em.children(content),
  Strong: (h, _strong, content) => h.strong.children(content),
  Strikethrough: (h, _strikethrough, content) => h.del.children(content),
  Link: (h, { title, url }, content) =>
    h.a.attr("href", url).attr("title", Option.getOrUndefined(title)).children(
      content
    ),
  Image: (h, { alt, title, url }) =>
    h.img.attr("src", url).attr("alt", alt).attr(
      "title",
      Option.getOrUndefined(title)
    ),
  Heading: (h, { level }, content) =>
    h[headingTags[level - 1]].children(content),
  Paragraph: (h, _paragraph, content) => h.p.children(content),
  CodeBlock: (h, { value }) => h.pre.children(h.code.children(value)),
  List: (h, { isOrdered, startNumber }, items) =>
    isOrdered
      ? h.ol.attr(
        "start",
        Option.getOrUndefined(Option.map(startNumber, String))
      ).children(items)
      : h.ul.children(items),
  ListItem: (h, _listItem, blocks) => h.li.children(blocks),
  Blockquote: (h, _blockquote, blocks) => h.blockquote.children(blocks),
  ThematicBreak: (h) => h.hr,
  Table: (h, _table, headerRow, bodyRows) =>
    h.table.children(h.thead.children(headerRow), h.tbody.children(bodyRows)),
  TableRow: (h, _tableRow, cells) => h.tr.children(cells),
  TableCell: (h, _tableCell, content, alignment, isHeader) =>
    (isHeader ? h.th : h.td).style({ textAlign: textAlign[alignment] })
      .children(content)
}

const warned = new Set<string>()

const warnOnce = (key: string, message: () => string): void => {
  if (!warned.has(key)) {
    warned.add(key)
    // oxlint-disable-next-line no-console
    console.warn(message())
  }
}

/**
 * The services the island views need, collected from what each one returns.
 *
 * @stability experimental
 * @category islands
 * @since 0.1.0
 */
export type IslandRequirements<ViewsByName> = {
  readonly [Name in keyof ViewsByName]: ViewsByName[Name] extends
    (...args: ReadonlyArray<any>) => infer Content
    ? Content extends View.Content<any, infer R> ? R : never
    : never
}[keyof ViewsByName]

/**
 * Pairs island attribute schemas with typed island views. Each view
 * receives its attributes decoded through its schema. Attributes that fail
 * the schema render nothing and warn once per name.
 *
 * **Details**
 *
 * Pass the same definitions to the parser's `islands` option, so that bad
 * attributes fail the build before they reach this decode.
 *
 * @stability experimental
 * @category islands
 * @since 0.1.0
 */
export const islandsFor = <
  const Definitions extends IslandDefinitions,
  Msg,
  const ViewsByName extends {
    readonly [Name in keyof Definitions]: (
      h: Html.H<Msg>,
      attributes: Definitions[Name]["Type"],
      content: ReadonlyArray<View.Content<Msg>>,
      occurrenceIndex: number
    ) => View.Content<Msg, any>
  }
>(
  definitions: Definitions,
  views: ViewsByName
): Islands<Msg, IslandRequirements<ViewsByName>> => {
  type R = IslandRequirements<ViewsByName>
  const islands: Record<string, IslandView<Msg, R>> = {}
  for (const name of Object.keys(definitions)) {
    const decode = Schema.decodeUnknownExit(definitions[name])
    const render = views[name] as unknown as (
      h: Html.H<Msg>,
      attributes: unknown,
      content: ReadonlyArray<View.Content<Msg, R>>,
      occurrenceIndex: number
    ) => View.Content<Msg, R>
    islands[name] = (h, attributes, content, occurrenceIndex) => {
      const exit = decode(attributes)
      if (exit._tag === "Success") {
        return render(h, exit.value, content, occurrenceIndex)
      }
      warnOnce(
        `attributes:${name}`,
        () =>
          `[@effect/ui/html/Markdown] Invalid attributes for island "${name}", so it renders nothing. Pass the island definitions to the parser's islands option to catch this at build time. ${exit.cause}`
      )
      return undefined
    }
  }
  return islands
}

/**
 * Renders a document's blocks, one node per top-level block, to place in
 * your own container.
 *
 * @stability experimental
 * @category views
 * @since 0.1.0
 */
export const viewBlocks = <Msg, R = never>(
  h: Html.H<Msg>,
  document: Document,
  config: ViewConfig<Msg, R> = {}
): Array<View.Content<Msg, R>> => {
  const views: Views<Msg, R> = { ...defaultViews, ...config.views }
  const islands = config.islands ?? {}
  const occurrences = new Map<string, number>()
  const nextOccurrence = (key: string): number => {
    const index = occurrences.get(key) ?? 0
    occurrences.set(key, index + 1)
    return index
  }
  const inlines = (nodes: ReadonlyArray<Inline>): InlineContent<Msg, R> =>
    nodes.map(inline)
  const inline = (node: Inline): View.Content<Msg, R> | string => {
    switch (node._tag) {
      case "Text":
        return views.Text(h, node)
      case "InlineCode":
        return views.InlineCode(h, node)
      case "HardBreak":
        return views.HardBreak(h, node)
      case "Emphasis":
        return views.Emphasis(h, node, inlines(node.content))
      case "Strong":
        return views.Strong(h, node, inlines(node.content))
      case "Strikethrough":
        return views.Strikethrough(h, node, inlines(node.content))
      case "Link":
        return views.Link(h, node, inlines(node.content))
      case "Image":
        return views.Image(h, node)
    }
  }
  const row = (table: Table, tableRow: TableRow, isHeader: boolean) =>
    views.TableRow(
      h,
      tableRow,
      tableRow.cells.map((cell, column) =>
        views.TableCell(
          h,
          cell,
          inlines(cell.content),
          table.alignments[column] ?? "None",
          isHeader
        )
      )
    )
  const blocks = (nodes: ReadonlyArray<Block>): Array<View.Content<Msg, R>> =>
    nodes.flatMap((node) => block(node) ?? [])
  const block = (node: Block): View.Content<Msg, R> | undefined => {
    switch (node._tag) {
      case "Heading":
        return views.Heading(h, node, inlines(node.content))
      case "Paragraph":
        return views.Paragraph(h, node, inlines(node.content))
      case "CodeBlock":
        return views.CodeBlock(h, node, nextOccurrence("CodeBlock"))
      case "List":
        return views.List(
          h,
          node,
          node.items.map((item) => views.ListItem(h, item, blocks(item.blocks)))
        )
      case "Blockquote":
        return views.Blockquote(h, node, blocks(node.blocks))
      case "ThematicBreak":
        return views.ThematicBreak(h, node)
      case "Table":
        return views.Table(
          h,
          node,
          row(node, node.headerRow, true),
          node.bodyRows.map((body) => row(node, body, false))
        )
      case "Island": {
        const occurrenceIndex = nextOccurrence(`Island:${node.name}`)
        const island = Object.hasOwn(islands, node.name)
          ? islands[node.name]
          : undefined
        if (island === undefined) {
          warnOnce(
            `missing:${node.name}`,
            () =>
              `[@effect/ui/html/Markdown] No island view registered for "${node.name}", so it renders nothing. Add it to the islands passed to Markdown.view.`
          )
          return undefined
        }
        return island(h, node.attributes, blocks(node.blocks), occurrenceIndex)
      }
    }
  }
  return blocks(document.blocks)
}

/**
 * Renders a document in a `div`. Every node renders with `defaultViews`
 * unless `config.views` overrides it, and every island with its view in
 * `config.islands`.
 *
 * @stability experimental
 * @category views
 * @since 0.1.0
 */
export const view = <Msg, R = never>(
  h: Html.H<Msg>,
  document: Document,
  config?: ViewConfig<Msg, R>
): Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div"> =>
  h.div.children(viewBlocks(h, document, config))
