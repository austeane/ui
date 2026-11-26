// @vitest-environment happy-dom
import {
  BrowserHost,
  Html,
  HtmlHead,
  HtmlHydrate,
  HtmlServer
} from "@effect/ui/html"
import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { describe } from "vitest"

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 30))
)

const container = (html: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const element = document.body.appendChild(document.createElement("div"))
      element.innerHTML = html
      return element
    }),
    (element) => Effect.sync(() => element.remove())
  )

const unsafeUrls = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  " javascript:alert(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
  "java\rscript:alert(1)",
  "\u0000javascript:alert(1)",
  "\u0001\u001fJava\tScript:alert(1)",
  "vbscript:msgbox(1)",
  "VB\tScript:msgbox(1)"
] as const

const safeUrls = [
  "/items/1",
  "./page",
  "#section",
  "https://example.com",
  "http://example.com/path?next=javascript:alert(1)",
  "mailto:user@example.com",
  "tel:+15551234",
  "data:text/plain,hello",
  "blob:https://example.com/1",
  "myapp://open"
] as const

describe("URL scheme sanitization", { concurrent: false }, () => {
  it.effect("neutralizes unsafe schemes in URL-bearing attributes on the server", () =>
    Effect.gen(function*() {
      const Page = Html.component({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.div.children(
            h.a.attr("href", "javascript:alert(1)").children("Link"),
            h.a.attrs({ href: "JavaScript:alert(1)" }).children("Attrs"),
            h.a.attr("HREF", "java\tscript:alert(1)").children("Alias"),
            h.img.attr("src", "javascript:alert(1)"),
            h.iframe.attr("src", " javascript:alert(1)"),
            h.form.attr("action", "javascript:alert(1)").children(
              h.button.attr("formaction", "vbscript:msgbox(1)").children("Go"),
              h.input.attrs({
                type: "submit",
                formaction: "javascript:alert(1)"
              })
            ),
            h.el("svg").children(
              h.el("use").attr("href", "javascript:alert(1)"),
              h.el("use").attr("xlink:href", "java\tscript:alert(1)")
            ),
            h.el("object").attr("data", "javascript:alert(1)"),
            h.div.attrs({
              title: "javascript:alert(1)",
              "data-url": "javascript:alert(1)",
              data: "javascript:alert(1)"
            })
          )
      })

      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toBe(
        "<!--[/Page--><div>" +
          "<a href>Link</a>" +
          "<a href>Attrs</a>" +
          "<a href>Alias</a>" +
          "<img src>" +
          "<iframe src></iframe>" +
          "<form action><button formaction>Go</button><input type=\"submit\" formaction></form>" +
          "<svg><use href></use><use xlink:href></use></svg>" +
          "<object data></object>" +
          "<div title=\"javascript:alert(1)\" data-url=\"javascript:alert(1)\" data=\"javascript:alert(1)\"></div>" +
          "</div><!--]/Page-->"
      )
    }))

  it.effect("neutralizes case and control-character variants and leaves safe schemes unchanged", () =>
    Effect.gen(function*() {
      const Page = Html.component({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.div.children(
            h.section.attr("data-kind", "unsafe").children(
              ...unsafeUrls.map((url) => h.a.attr("href", url).children("x"))
            ),
            h.section.attr("data-kind", "safe").children(
              ...safeUrls.map((url) => h.a.attr("href", url).children("x"))
            )
          )
      })

      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toContain(
        `<section data-kind="unsafe">${
          "<a href>x</a>".repeat(unsafeUrls.length)
        }</section>`
      )

      for (const hydrate of [false, true]) {
        const app = yield* container(hydrate ? rendered.html : "")
        const before = [...app.querySelectorAll("a")]
        const root = yield* (hydrate
          ? HtmlHydrate.hydrateEffect(Page, {}, app, rendered.state)
          : BrowserHost.mountEffect(Page, {}, app))
        if (hydrate) {
          yield* root.adopted
          expect([...app.querySelectorAll("a")]).toEqual(before)
        }
        const unsafeLinks = [
          ...app.querySelectorAll("section[data-kind='unsafe'] a")
        ]
        expect(unsafeLinks.map((a) => a.getAttribute("href"))).toEqual(
          unsafeUrls.map(() => "")
        )
        const safeLinks = [
          ...app.querySelectorAll("section[data-kind='safe'] a")
        ]
        expect(safeLinks.map((a) => a.getAttribute("href"))).toEqual([
          ...safeUrls
        ])
      }
    }).pipe(Effect.scoped))

  it.effect("sanitizes URL attributes on create and when patching safe -> unsafe -> safe", () =>
    Effect.gen(function*() {
      const Page = Html.component({
        name: "Page",
        model: Schema.NullOr(Schema.String),
        message: Schema.NullOr(Schema.String)
      }).make({
        init: () => "https://example.com",
        update: (_, next) => next,
        view: (h, url) => {
          const value = url ?? undefined
          return h.div.children(
            h.a.attr("href", value).children("Link"),
            h.img.attr("src", value),
            h.form.attr("action", value).children(
              h.button.attr("formaction", value).children("Go")
            ),
            h.el("svg").children(
              h.el("use").attr("href", value),
              h.el("use").attr("xlink:href", value)
            ),
            h.el("object").attr("data", value)
          )
        }
      })

      const readAll = (app: Element) => {
        const uses = app.querySelectorAll("use")
        return {
          href: app.querySelector("a")!.getAttribute("href"),
          src: app.querySelector("img")!.getAttribute("src"),
          action: app.querySelector("form")!.getAttribute("action"),
          formaction: app.querySelector("button")!.getAttribute("formaction"),
          svgHref: uses[0]!.getAttribute("href"),
          xlinkHref: uses[1]!.getAttribute("xlink:href"),
          objectData: app.querySelector("object")!.getAttribute("data")
        }
      }

      const app = yield* container("")
      const root = yield* BrowserHost.mountEffect(Page, {}, app)

      expect(readAll(app)).toEqual({
        href: "https://example.com",
        src: "https://example.com",
        action: "https://example.com",
        formaction: "https://example.com",
        svgHref: "https://example.com",
        xlinkHref: "https://example.com",
        objectData: "https://example.com"
      })

      root.send("java\tscript:alert(1)")
      yield* tick
      expect(readAll(app)).toEqual({
        href: "",
        src: "",
        action: "",
        formaction: "",
        svgHref: "",
        xlinkHref: "",
        objectData: ""
      })

      root.send("mailto:user@example.com")
      yield* tick
      expect(readAll(app)).toEqual({
        href: "mailto:user@example.com",
        src: "mailto:user@example.com",
        action: "mailto:user@example.com",
        formaction: "mailto:user@example.com",
        svgHref: "mailto:user@example.com",
        xlinkHref: "mailto:user@example.com",
        objectData: "mailto:user@example.com"
      })

      root.send(null)
      yield* tick
      expect(readAll(app)).toEqual({
        href: null,
        src: null,
        action: null,
        formaction: null,
        svgHref: null,
        xlinkHref: null,
        objectData: null
      })
    }).pipe(Effect.scoped))

  it.effect("hydrates a server-rendered page with a safe URL and sanitizes later patches", () =>
    Effect.gen(function*() {
      const Page = Html.component({
        name: "Page",
        model: Schema.String,
        message: Schema.String
      }).make({
        init: () => "/items/1",
        update: (_, next) => next,
        view: (h, url) => h.a.attr("href", url).children("Item")
      })

      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toBe(
        "<!--[/Page--><a href=\"/items/1\">Item</a><!--]/Page-->"
      )
      const app = yield* container(rendered.html)
      const serverAnchor = app.querySelector("a")!
      const root = yield* HtmlHydrate.hydrateEffect(
        Page,
        {},
        app,
        rendered.state
      )
      yield* root.adopted
      expect(app.querySelector("a")).toBe(serverAnchor)
      expect(serverAnchor.getAttribute("href")).toBe("/items/1")

      root.send("javascript:alert(1)")
      yield* tick
      expect(serverAnchor.getAttribute("href")).toBe("")

      root.send("https://example.com")
      yield* tick
      expect(serverAnchor.getAttribute("href")).toBe("https://example.com")
    }).pipe(Effect.scoped))

  it.effect("sanitizes URL-bearing DOM properties set through prop", () =>
    Effect.gen(function*() {
      const Page = Html.component({
        name: "Page",
        model: Schema.String,
        message: Schema.String
      }).make({
        init: () => "javascript:alert(1)",
        update: (_, next) => next,
        view: (h, url) =>
          h.div.children(
            h.a.prop("href", url).children("Link"),
            h.img.prop("src", url),
            h.form.prop("action", url).children(
              h.button.prop("formAction", url).children("Go")
            ),
            h.el("object").prop("data", url)
          )
      })

      const readAll = (app: Element) => ({
        href: app.querySelector("a")!.getAttribute("href"),
        src: app.querySelector("img")!.getAttribute("src"),
        action: app.querySelector("form")!.getAttribute("action"),
        formaction: app.querySelector("button")!.getAttribute("formaction"),
        objectData: app.querySelector("object")!.getAttribute("data")
      })

      const app = yield* container("")
      const root = yield* BrowserHost.mountEffect(Page, {}, app)
      expect(readAll(app)).toEqual({
        href: "",
        src: "",
        action: "",
        formaction: "",
        objectData: ""
      })

      root.send("https://example.com")
      yield* tick
      expect(readAll(app)).toEqual({
        href: "https://example.com",
        src: "https://example.com",
        action: "https://example.com",
        formaction: "https://example.com",
        objectData: "https://example.com"
      })

      root.send("JavaScript:alert(1)")
      yield* tick
      expect(readAll(app)).toEqual({
        href: "",
        src: "",
        action: "",
        formaction: "",
        objectData: ""
      })
    }).pipe(Effect.scoped))

  it.effect("neutralizes unsafe href in HtmlHead.link on server and browser", () =>
    Effect.gen(function*() {
      const Page = Html.component({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        head: () => [
          HtmlHead.link({ rel: "canonical", href: "javascript:alert(1)" })
        ],
        view: (h) => h.div("Item")
      })

      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.head).toBe(
        "<link rel=\"canonical\" href=\"\" data-eui>"
      )
      const app = yield* container("")
      yield* BrowserHost.mountEffect(Page, {}, app)
      expect(
        document.head.querySelector("link[rel='canonical'][data-eui]")!
          .getAttribute("href")
      ).toBe("")
    }).pipe(Effect.scoped))

  it.effect("neutralizes unsafe URLs in SVG set and animate on the server", () =>
    Effect.gen(function*() {
      const Page = Html.component({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.div.children(
            h.el("svg").children(
              h.el("a").children(
                h.el("set").attrs({
                  attributeName: "href",
                  to: "javascript:alert(1)"
                }),
                h.el("set").attrs({
                  to: "java\tscript:alert(1)",
                  attributeName: "xlink:href"
                }),
                h.el("set").attrs({
                  attributeName: "href",
                  to: "https://example.com"
                }),
                h.el("animate").attrs({
                  attributeName: "href",
                  from: "javascript:alert(1)",
                  to: "vbscript:msgbox(1)",
                  by: " JavaScript:alert(1)",
                  values: "https://example.com; javascript:alert(1);/items/1"
                }),
                h.el("animate").attrs({
                  attributeName: "xlink:href",
                  values: "javascript:alert(1)"
                }),
                h.el("animate").attrs({
                  attributeName: "href",
                  values: "https://example.com;/items/1"
                })
              )
            ),
            h.div.attrs({
              to: "javascript:alert(1)",
              from: "javascript:alert(1)",
              by: "javascript:alert(1)",
              values: "javascript:alert(1)"
            })
          )
      })

      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      expect(rendered.html).toBe(
        "<!--[/Page--><div><svg><a>" +
          "<set attributeName=\"href\" to></set>" +
          "<set to attributeName=\"xlink:href\"></set>" +
          "<set attributeName=\"href\" to=\"https://example.com\"></set>" +
          "<animate attributeName=\"href\" from to by values=\"https://example.com;;/items/1\"></animate>" +
          "<animate attributeName=\"xlink:href\" values></animate>" +
          "<animate attributeName=\"href\" values=\"https://example.com;/items/1\"></animate>" +
          "</a></svg>" +
          "<div to=\"javascript:alert(1)\" from=\"javascript:alert(1)\" by=\"javascript:alert(1)\" values=\"javascript:alert(1)\"></div>" +
          "</div><!--]/Page-->"
      )
    }))

  it.effect("sanitizes SVG set and animate in the browser on mount and patch", () =>
    Effect.gen(function*() {
      const State = Schema.Struct({
        attr: Schema.String,
        url: Schema.NullOr(Schema.String),
        values: Schema.NullOr(Schema.String)
      })
      const Page = Html.component({
        name: "Page",
        model: State,
        message: State
      }).make({
        init: () => ({
          attr: "fill",
          url: "javascript:alert(1)",
          values: "https://example.com;javascript:alert(1);/items/1"
        }),
        update: (_, next) => next,
        view: (h, state) => {
          const url = state.url ?? undefined
          const values = state.values ?? undefined
          return h.el("svg").children(
            h.el("a").children(
              h.el("set").attrs({
                to: url,
                attributeName: state.attr
              }),
              h.el("animate").attrs({
                attributeName: state.attr,
                from: url,
                to: url,
                by: url,
                values
              })
            )
          )
        }
      })

      const readAll = (app: Element) => {
        const setEl = app.querySelector("set")!
        const animateEl = app.querySelector("animate")!
        return {
          setAttr: setEl.getAttribute("attributeName"),
          setTo: setEl.getAttribute("to"),
          animateFrom: animateEl.getAttribute("from"),
          animateTo: animateEl.getAttribute("to"),
          animateBy: animateEl.getAttribute("by"),
          animateValues: animateEl.getAttribute("values")
        }
      }

      const app = yield* container("")
      const root = yield* BrowserHost.mountEffect(Page, {}, app)

      // Blocked even while attributeName is "fill" and when `to` precedes `attributeName`.
      expect(readAll(app)).toEqual({
        setAttr: "fill",
        setTo: "",
        animateFrom: "",
        animateTo: "",
        animateBy: "",
        animateValues: "https://example.com;;/items/1"
      })

      // Changing attributeName to "href" cannot expose a previously written unsafe URL.
      root.send({
        attr: "href",
        url: "javascript:alert(1)",
        values: "https://example.com;javascript:alert(1);/items/1"
      })
      yield* tick
      expect(readAll(app)).toEqual({
        setAttr: "href",
        setTo: "",
        animateFrom: "",
        animateTo: "",
        animateBy: "",
        animateValues: "https://example.com;;/items/1"
      })

      root.send({
        attr: "xlink:href",
        url: "https://example.com",
        values: "https://example.com;/items/1"
      })
      yield* tick
      expect(readAll(app)).toEqual({
        setAttr: "xlink:href",
        setTo: "https://example.com",
        animateFrom: "https://example.com",
        animateTo: "https://example.com",
        animateBy: "https://example.com",
        animateValues: "https://example.com;/items/1"
      })

      root.send({
        attr: "href",
        url: "vbscript:msgbox(1)",
        values: " java\tscript:alert(1);vbscript:msgbox(1)"
      })
      yield* tick
      expect(readAll(app)).toEqual({
        setAttr: "href",
        setTo: "",
        animateFrom: "",
        animateTo: "",
        animateBy: "",
        animateValues: ";"
      })

      root.send({ attr: "href", url: null, values: null })
      yield* tick
      expect(readAll(app)).toEqual({
        setAttr: "href",
        setTo: null,
        animateFrom: null,
        animateTo: null,
        animateBy: null,
        animateValues: null
      })
    }).pipe(Effect.scoped))

  it.effect("hydrates SVG set and animate and sanitizes later patches", () =>
    Effect.gen(function*() {
      const State = Schema.Struct({
        to: Schema.String,
        values: Schema.String
      })
      const Page = Html.component({
        name: "Page",
        model: State,
        message: State
      }).make({
        init: () => ({
          to: "javascript:alert(1)",
          values: "https://example.com;javascript:alert(1);/items/1"
        }),
        update: (_, next) => next,
        view: (h, state) =>
          h.el("svg").children(
            h.el("a").children(
              h.el("set").attrs({
                attributeName: "href",
                to: state.to
              }),
              h.el("animate").attrs({
                attributeName: "xlink:href",
                from: state.to,
                to: state.to,
                by: state.to,
                values: state.values
              })
            )
          )
      })

      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      const app = yield* container(rendered.html)
      const serverSet = app.querySelector("set")!
      const serverAnimate = app.querySelector("animate")!
      const root = yield* HtmlHydrate.hydrateEffect(
        Page,
        {},
        app,
        rendered.state
      )
      yield* root.adopted
      expect(app.querySelector("set")).toBe(serverSet)
      expect(app.querySelector("animate")).toBe(serverAnimate)
      expect(serverSet.getAttribute("to")).toBe("")
      expect(serverAnimate.getAttribute("from")).toBe("")
      expect(serverAnimate.getAttribute("to")).toBe("")
      expect(serverAnimate.getAttribute("by")).toBe("")
      expect(serverAnimate.getAttribute("values")).toBe(
        "https://example.com;;/items/1"
      )

      root.send({
        to: "https://example.com",
        values: "https://example.com;/items/1"
      })
      yield* tick
      expect(serverSet.getAttribute("to")).toBe("https://example.com")
      expect(serverAnimate.getAttribute("from")).toBe("https://example.com")
      expect(serverAnimate.getAttribute("to")).toBe("https://example.com")
      expect(serverAnimate.getAttribute("by")).toBe("https://example.com")
      expect(serverAnimate.getAttribute("values")).toBe(
        "https://example.com;/items/1"
      )

      root.send({
        to: "JavaScript:alert(1)",
        values: "/ok;vbscript:msgbox(1)"
      })
      yield* tick
      expect(serverSet.getAttribute("to")).toBe("")
      expect(serverAnimate.getAttribute("from")).toBe("")
      expect(serverAnimate.getAttribute("to")).toBe("")
      expect(serverAnimate.getAttribute("by")).toBe("")
      expect(serverAnimate.getAttribute("values")).toBe("/ok;")
    }).pipe(Effect.scoped))
})
