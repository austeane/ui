// @vitest-environment happy-dom
import { Component, Feature, UiSchema } from "@effect/ui"
import { Html, HtmlServer } from "@effect/ui/html"
import * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as HtmlHydrate from "@effect/ui/html/HtmlHydrate"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import {
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Schema,
  SchemaGetter
} from "effect"
import * as v8 from "node:v8"
import * as vm from "node:vm"

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))
)

const container = (html: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const app = document.createElement("div")
      app.innerHTML = html
      document.body.appendChild(app)
      return app
    }),
    (app) => Effect.sync(() => app.remove())
  )

const comments = (node: Node): number => {
  const walker = document.createTreeWalker(node, 128)
  let count = 0
  while (walker.nextNode() !== null) count++
  return count
}

const Bumped = UiSchema.TaggedEnum({ Bumped: {} })

const RowMessage = UiSchema.TaggedEnum({ Clicked: {} })
const Row = Html.component({
  name: "Row",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Number,
  message: RowMessage
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, clicks) =>
    h.li(
      h.button.on("click", RowMessage.Clicked()).children(h.props.label),
      h.span(`${clicks} clicked`),
      h.em(`row ${h.props.label}`)
    )
})

const List = Html.component({
  name: "List",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.div(
      h.h1("rows"),
      h.ul(...["A", "B", "C"].map((label) =>
        Row(h, { key: label, props: { label } })
      )),
      "tail ",
      "text"
    )
})

const sameElements = (app: Element, server: ReadonlyArray<Element>) => {
  const now = [...app.querySelectorAll("*")]
  assert.strictEqual(now.length, server.length)
  now.forEach((node, index) =>
    assert.strictEqual(
      node,
      server[index],
      `element ${index}, ${node.outerHTML}`
    )
  )
}

const texts = (app: Element, selector: string) =>
  [...app.querySelectorAll(selector)].map((node) => node.textContent)

let serving = false
let lateGate: Effect.Effect<void> = Effect.void
const LateLabel = Schema.String.pipe(Schema.decode({
  decode: SchemaGetter.transformEffect((label: string) =>
    Effect.andThen(Effect.suspend(() => lateGate), Effect.succeed(label))
  ),
  encode: SchemaGetter.passthrough()
}))

const Late = Html.component({
  name: "Late",
  model: LateLabel,
  message: Schema.Never
}).make({
  init: () => "late",
  update: ($) => $.model,
  view: (h) => serving ? h.p.class("server").children("extra") : h.p()
})

const LateHolder = Html.component({
  name: "LateHolder",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.div(Late(h, { key: "l" }), h.i("after"))
})

const renderLate = Effect.fnUntraced(function*<A, E>(
  render: Effect.Effect<A, E>
) {
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      serving = false
      lateGate = Effect.void
    })
  )
  serving = true
  const rendered = yield* render
  serving = false
  const latch = yield* Deferred.make<void>()
  lateGate = Deferred.await(latch)
  return [rendered, Deferred.succeed(latch, undefined)] as const
})

const submitted = (form: Element): boolean =>
  form.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true })
  )

const Search = Html.component({
  name: "Search",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.form(h.input.attr("name", "q"))
})

const LateForm = Html.component({
  name: "LateForm",
  model: LateLabel,
  message: Schema.Never
}).make({
  init: () => "late",
  update: ($) => $.model,
  view: (h) => h.form(h.input.attr("name", "q"))
})

const LateFormHolder = Html.component({
  name: "LateFormHolder",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.div(LateForm(h, { key: "f" }))
})

let layerGate: Effect.Effect<void> = Effect.void
const Gated = Component.provide(
  Html.component({
    name: "Gated",
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.form(h.input.attr("name", "q"))
  }),
  Layer.effectDiscard(Effect.suspend(() => layerGate))
)

describe("HtmlHydrate", () => {
  it.effect("adopts the fallback the server showed for a child that failed to start", () =>
    Effect.gen(function*() {
      const Boom = Html.component({
        name: "Boom",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => {
            throw new Error("boom")
          },
          update: ($) => $.model,
          view: (h) => h.p("never")
        })
      const Holder = Html.component({
        name: "Holder",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.div(
            Boom(h, { key: "b", fallback: () => h.span("boom fallback") }),
            h.i("after")
          )
      })
      const rendered = yield* HtmlServer.renderToHtml(Holder, {})
      const app = yield* container(rendered.html)
      const server = [...app.querySelectorAll("*")]
      assert.deepStrictEqual(server.map((node) => node.localName), [
        "div",
        "span",
        "i"
      ])
      yield* HtmlHydrate.hydrateEffect(Holder, {}, app, rendered.state)
      sameElements(app, server)
      assert.strictEqual(app.textContent, "boom fallbackafter")
    }).pipe(Effect.scoped))

  it.effect("shows the fallback the server shipped for a Layer-backed child until the Layer is ready here", () =>
    Effect.gen(function*() {
      class Panel extends Feature.Service<Panel>()("Panel", {
        props: Schema.Struct({}),
        events: Schema.Never
      }) {}
      const PanelLive = Html.component({
        name: "PanelLive",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.p("panel")
      })
      const gate = yield* Deferred.make<void>()
      const Shell = Component.provide(
        Html.component({
          name: "Shell",
          model: Schema.Number,
          message: Bumped
        }).make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h, count) =>
            h.div(
              h.button.on("click", Bumped.Bumped()).children(String(count)),
              Panel.render(h, {
                key: "p",
                props: {},
                fallback: () => h.p("loading")
              }),
              h.i("after")
            )
        }),
        Layer.merge(
          Panel.toLayer(PanelLive),
          Layer.effectDiscard(Deferred.await(gate))
        ),
        { server: false }
      )
      const rendered = yield* HtmlServer.renderToHtml(Shell, {})
      assert.include(rendered.html, "<p>loading</p>")
      assert.deepStrictEqual(rendered.state["~deferred"], ["/Shell"])
      const app = yield* container(rendered.html)
      const server = [...app.querySelectorAll("*")]
      yield* HtmlHydrate.hydrateEffect(Shell, {}, app, rendered.state)
      sameElements(app, server)
      assert.strictEqual(app.textContent, "0loadingafter")
      yield* Deferred.succeed(gate, undefined)
      yield* tick
      assert.strictEqual(app.textContent, "0panelafter")
      const [div, button, loading, after] = server as Array<HTMLElement>
      assert.notStrictEqual(app.querySelector("p"), loading)
      assert.deepStrictEqual(
        [...app.querySelectorAll("*")].filter((node) => node.localName !== "p"),
        [
          div,
          button,
          after
        ]
      )
      button!.click()
      yield* tick
      assert.strictEqual(app.textContent, "1panelafter")
    }).pipe(Effect.scoped))

  it.effect("decodes the shipped Model through the component's Schema", () =>
    Effect.gen(function*() {
      const Picked = Html.component({
        name: "Picked",
        model: Schema.Struct({
          pick: Schema.Option(Schema.String),
          at: Schema.Date
        }),
        message: Schema.Never
      }).make({
        init: () => ({ pick: Option.some("server"), at: new Date(0) }),
        update: ($) => $.model,
        view: (h, model) =>
          h.p(
            Option.getOrElse(model.pick, () => "none"),
            " ",
            String(model.at.getTime())
          )
      })
      const rendered = yield* HtmlServer.renderToHtml(Picked, {})
      const encoded = rendered.state["/Picked"] as {
        pick: unknown
        at: unknown
      }
      assert.strictEqual(typeof encoded.at, "string")
      const app = yield* container(rendered.html)
      const server = [...app.querySelectorAll("*")]
      const root = yield* HtmlHydrate.hydrateEffect(
        Picked,
        {},
        app,
        rendered.state
      )
      sameElements(app, server)
      const model = root.model()!
      assert.isTrue(Option.isOption(model.pick))
      assert.isTrue(model.at instanceof Date)
      assert.strictEqual(app.textContent, "server 0")
    }).pipe(Effect.scoped))

  it.effect("keeps nodes before a mismatch inside a row, rebuilds the rest of that row, and keeps sibling rows", () =>
    Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(List, {})
      const html = rendered.html.replace(
        "<span>0 clicked</span><em>row B",
        "<i>x</i><em>row B"
      )
      assert.notStrictEqual(html, rendered.html)
      const app = yield* container(html)
      const [itemA, itemB, itemC] = [...app.querySelectorAll("li")]
      const bButton = itemB!.querySelector("button")!
      const bEm = itemB!.querySelector("em")!
      yield* HtmlHydrate.hydrateEffect(List, {}, app, {
        ...rendered.state,
        "/List/Row[A]": 1,
        "/List/Row[C]": 3
      })
      assert.deepStrictEqual(texts(app, "li"), [
        "A1 clickedrow A",
        "B0 clickedrow B",
        "C3 clickedrow C"
      ])
      assert.strictEqual(comments(app), 0)
      const [a, b, c] = [...app.querySelectorAll("li")]
      assert.strictEqual(a, itemA)
      assert.strictEqual(b, itemB)
      assert.strictEqual(c, itemC)
      assert.strictEqual(b!.firstElementChild, bButton)
      const nextEm = b!.querySelector("em")
      assert.isNotNull(nextEm)
      assert.notStrictEqual(nextEm, bEm)
      assert.isFalse(bEm.isConnected)
      for (const button of app.querySelectorAll("button")) button.click()
      yield* tick
      assert.deepStrictEqual(texts(app, "span"), [
        "2 clicked",
        "1 clicked",
        "4 clicked"
      ])
    }).pipe(Effect.scoped))

  it.effect("replaces a stale element with text inside comment markers while keeping surrounding siblings", () =>
    Effect.gen(function*() {
      const Texty = Html.component({
        name: "Texty",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.text("hello")
      })
      const Holder = Html.component({
        name: "Holder",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.div(h.b("before"), Texty(h, { key: "t" }), h.i("after"))
      })
      const rendered = yield* HtmlServer.renderToHtml(Holder, {})
      assert.include(
        rendered.html,
        "<!--[/Holder/Texty[t]-->hello<!--]/Holder/Texty[t]-->"
      )
      const html = rendered.html.replace("hello", "<s>stale</s>")
      const app = yield* container(html)
      const before = app.querySelector("b")!
      const stale = app.querySelector("s")!
      const after = app.querySelector("i")!
      yield* HtmlHydrate.hydrateEffect(Holder, {}, app, rendered.state)
      assert.strictEqual(
        app.innerHTML,
        "<div><b>before</b>hello<i>after</i></div>"
      )
      assert.strictEqual(comments(app), 0)
      assert.strictEqual(app.querySelector("b"), before)
      assert.strictEqual(app.querySelector("i"), after)
      assert.isFalse(stale.isConnected)
    }).pipe(Effect.scoped))

  describe("children whose state decodes asynchronously", () => {
    it.effect("drop the server's attributes and children the view doesn't render once they adopt", () =>
      Effect.gen(function*() {
        const [rendered, open] = yield* renderLate(
          HtmlServer.renderToHtml(LateHolder, {})
        )
        assert.include(rendered.html, "<p class=\"server\">extra</p>")
        const app = yield* container(rendered.html)
        const served = app.querySelector("p")
        yield* HtmlHydrate.hydrateEffect(LateHolder, {}, app, rendered.state)
        yield* open
        yield* tick
        assert.strictEqual(app.querySelector("p"), served)
        assert.strictEqual(
          app.innerHTML,
          "<div><p></p><i>after</i></div>"
        )
      }).pipe(Effect.scoped))

    it.effect("release a root.adopted wait that is interrupted before they adopt", () =>
      Effect.gen(function*() {
        const [rendered, open] = yield* renderLate(
          HtmlServer.renderToHtml(LateHolder, {})
        )
        const app = yield* container(rendered.html)
        const root = yield* HtmlHydrate.hydrateEffect(
          LateHolder,
          {},
          app,
          rendered.state
        )
        const waiting = yield* Effect.promise(async () => {
          const fiber = Effect.runFork(root.adopted)
          const ref = new WeakRef(fiber)
          await Effect.runPromise(Fiber.interrupt(fiber))
          return ref
        })
        v8.setFlagsFromString("--expose-gc")
        const gc = vm.runInNewContext("gc") as () => void
        yield* tick
        gc()
        assert.isTrue(
          waiting.deref() === undefined,
          "the interrupted fiber is retained"
        )
        yield* open
        yield* root.adopted
      }).pipe(Effect.scoped))
  })

  describe("forms", () => {
    it.effect("own an adopted form's submissions, as a built one's", () =>
      Effect.gen(function*() {
        const rendered = yield* HtmlServer.renderToHtml(Search, {})
        const built = yield* container("")
        yield* BrowserHost.mountEffect(Search, {}, built)
        assert.isFalse(submitted(built.querySelector("form")!))
        const app = yield* container(rendered.html)
        const served = app.querySelector("form")!
        yield* HtmlHydrate.hydrateEffect(Search, {}, app, rendered.state)
        assert.strictEqual(app.querySelector("form"), served)
        assert.isFalse(submitted(served))
      }).pipe(Effect.scoped))

    it.effect("leave an instance's form to submit natively while its Layer builds", () =>
      Effect.gen(function*() {
        const rendered = yield* HtmlServer.renderToHtml(Gated, {})
        assert.notInclude(rendered.state["~deferred"] ?? [], "/Gated")
        const latch = yield* Deferred.make<void>()
        layerGate = Deferred.await(latch)
        const app = yield* container(rendered.html)
        const served = app.querySelector("form")!
        const root = yield* HtmlHydrate.hydrateEffect(
          Gated,
          {},
          app,
          rendered.state
        )
        yield* tick
        assert.isTrue(submitted(served))
        yield* Deferred.succeed(latch, undefined)
        yield* root.adopted
        assert.strictEqual(app.querySelector("form"), served)
        assert.isFalse(submitted(served))
      }).pipe(
        Effect.ensuring(Effect.sync(() => layerGate = Effect.void)),
        Effect.scoped
      ))

    it.effect("leave a rebuilt form to submit natively while its Layer builds", () =>
      Effect.gen(function*() {
        const rendered = yield* HtmlServer.renderToHtml(Gated, {})
        const latch = yield* Deferred.make<void>()
        layerGate = Deferred.await(latch)
        const app = yield* container(
          rendered.html.replaceAll("<form", "<section").replaceAll(
            "</form>",
            "</section>"
          )
        )
        const root = yield* HtmlHydrate.hydrateEffect(
          Gated,
          {},
          app,
          rendered.state
        )
        yield* tick
        const built = app.querySelector("form")!
        assert.isNull(app.querySelector("section"))
        assert.isTrue(submitted(built))
        yield* Deferred.succeed(latch, undefined)
        yield* root.adopted
        assert.strictEqual(app.querySelector("form"), built)
        assert.isFalse(submitted(built))
      }).pipe(
        Effect.ensuring(Effect.sync(() => layerGate = Effect.void)),
        Effect.scoped
      ))

    it.effect("leave a held child's form to submit natively until it adopts", () =>
      Effect.gen(function*() {
        const [rendered, open] = yield* renderLate(
          HtmlServer.renderToHtml(LateFormHolder, {})
        )
        const app = yield* container(rendered.html)
        const served = app.querySelector("form")!
        const root = yield* HtmlHydrate.hydrateEffect(
          LateFormHolder,
          {},
          app,
          rendered.state
        )
        yield* tick
        assert.isTrue(submitted(served))
        yield* open
        yield* root.adopted
        assert.strictEqual(app.querySelector("form"), served)
        assert.isFalse(submitted(served))
      }).pipe(Effect.scoped))
  })

  describe("lazy children", () => {
    it.effect("adopts a preloaded lazy child's nodes and saved Model", () =>
      Effect.gen(function*() {
        let side = "server"
        const Page = Html.component({
          name: "Page",
          model: Schema.String,
          message: Schema.Never
        }).make({
          init: () => side,
          update: ($) => $.model,
          view: (h, model) => h.label(model, h.input.attr("name", "q"))
        })
        const makeApp = () => {
          const LazyPage = Component.lazy(
            "LazyPage",
            () => Promise.resolve(Page)
          )
          const App = Html.component({
            name: "App",
            model: Schema.Null,
            message: Schema.Never
          }).make({
            init: () => null,
            update: ($) => $.model,
            view: (h) => h.div(LazyPage(h, { fallback: () => h.p("Loading") }))
          })
          return { App, LazyPage }
        }

        const rendered = yield* HtmlServer.renderToHtml(makeApp().App, {})
        assert.isTrue(Object.hasOwn(rendered.state, "/App/LazyPage[]"))
        const app = yield* container(rendered.html)
        const serverInput = app.querySelector("input")!
        assert.isNotNull(serverInput)

        side = "client"
        const client = makeApp()
        yield* Effect.promise(() => client.LazyPage.preload())
        const root = yield* HtmlHydrate.hydrateEffect(
          client.App,
          {},
          app,
          rendered.state
        )
        yield* root.adopted
        yield* tick

        assert.strictEqual(app.querySelector("input"), serverInput)
        assert.strictEqual(app.querySelector("label")?.textContent, "server")
      }).pipe(Effect.scoped))

    it.effect("keeps the fallback path when a lazy child was not preloaded", () =>
      Effect.gen(function*() {
        let side = "server"
        const Page = Html.component({
          name: "Page",
          model: Schema.String,
          message: Schema.Never
        }).make({
          init: () => side,
          update: ($) => $.model,
          view: (h, model) => h.label(model, h.input.attr("name", "q"))
        })
        const makeApp = () => {
          const LazyPage = Component.lazy(
            "LazyPage",
            () => Promise.resolve(Page)
          )
          const App = Html.component({
            name: "App",
            model: Schema.Null,
            message: Schema.Never
          }).make({
            init: () => null,
            update: ($) => $.model,
            view: (h) => h.div(LazyPage(h, { fallback: () => h.p("Loading") }))
          })
          return { App }
        }

        const rendered = yield* HtmlServer.renderToHtml(makeApp().App, {})
        const app = yield* container(rendered.html)
        const serverInput = app.querySelector("input")!

        side = "client"
        const root = yield* HtmlHydrate.hydrateEffect(
          makeApp().App,
          {},
          app,
          rendered.state
        )
        yield* root.adopted
        yield* tick

        assert.notStrictEqual(app.querySelector("input"), serverInput)
        assert.strictEqual(app.querySelector("label")?.textContent, "client")
      }).pipe(Effect.scoped))

    it.effect("adopts a preloaded lazy child whose state decodes asynchronously", () =>
      Effect.gen(function*() {
        let side = "server"
        const LatePage = Html.component({
          name: "LatePage",
          model: LateLabel,
          message: Schema.Never
        }).make({
          init: () => side,
          update: ($) => $.model,
          view: (h, model) => h.label(model, h.input.attr("name", "q"))
        })
        const makeApp = () => {
          const LazyPage = Component.lazy(
            "LazyLate",
            () => Promise.resolve(LatePage)
          )
          const App = Html.component({
            name: "App",
            model: Schema.Null,
            message: Schema.Never
          }).make({
            init: () => null,
            update: ($) => $.model,
            view: (h) => h.div(LazyPage(h, { fallback: () => h.p("Loading") }))
          })
          return { App, LazyPage }
        }

        const [rendered, open] = yield* renderLate(
          HtmlServer.renderToHtml(makeApp().App, {})
        )
        const app = yield* container(rendered.html)
        const serverInput = app.querySelector("input")!

        side = "client"
        const client = makeApp()
        yield* Effect.promise(() => client.LazyPage.preload())
        const root = yield* HtmlHydrate.hydrateEffect(
          client.App,
          {},
          app,
          rendered.state
        )
        yield* open
        yield* root.adopted
        yield* tick

        assert.strictEqual(app.querySelector("input"), serverInput)
        assert.strictEqual(app.querySelector("label")?.textContent, "server")
      }).pipe(Effect.scoped))

    it.effect("adopts a shared lazy child through ssr()", () =>
      Effect.gen(function*() {
        let calls = 0
        const Page = Html.component({
          name: "Page",
          model: Schema.String,
          message: Schema.Never
        }).make({
          init: () => calls++ === 0 ? "server" : "client",
          update: ($) => $.model,
          view: (h, model) => h.label(model, h.input.attr("name", "q"))
        })
        const LazyPage = Component.lazy(
          "LazyPage",
          () => Promise.resolve(Page)
        )
        const App = Html.component({
          name: "App",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.div(LazyPage(h, { fallback: () => h.p("Loading") }))
        })

        const result = yield* ssr(App, {})
        assert.deepStrictEqual(result.adopted, ["/App", "/App/LazyPage[]"])
        assert.deepStrictEqual(result.misses, [])
        assert.strictEqual(
          result.container.querySelector("label")?.textContent,
          "server"
        )
      }).pipe(Effect.provide(TestHost.layer()), Effect.scoped))
  })
})
