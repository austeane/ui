/**
 * The browser host for `@effect/ui`: mounts a component tree into an element of a
 * real document.
 *
 * Events are delegated: the host keeps one listener per event name on the
 * document, and each element stores its handlers as data, so re-rendering
 * never touches listeners. An event goes to the innermost element with a
 * handler for it, and its handler gets a plain payload built from the DOM
 * event, never the event itself. A form the app renders never submits natively
 * when it has a `submit` handler, or when its effective method (`formmethod`,
 * then `method`, defaulting to `get`) is `dialog`, or `get` to the same window
 * (`formtarget`, then `target`, empty or `_self`). Other submissions with no
 * handler, such as a POST form or one targeting another window, are left to
 * the browser.
 *
 * A `dialog` set with `modal(true)` is shown with `showModal()` at the commit
 * after it's in the document, and closed with `close()`. Dialogs shown in
 * the same commit open in document order, so one nested in another is on
 * top; one shown later is on top of those already open. The host cancels a
 * modal's `cancel` and sends it to the `cancel` handler, so the Model decides. When
 * the browser closes it anyway, as Chromium does after repeated cancelled
 * requests, the host shows it again on the next frame while the Model still
 * wants it, which moves focus to its first focusable element. Browsers
 * report each close a task later, so the host keeps one record per time it
 * showed the dialog, and each `close` event ends the oldest: it reaches
 * the `close` handler only for the latest showing, and not for a close the host made
 * itself. Before removing a dialog it showed that is still open, or an
 * element containing one, the host closes it, the latest shown first, so
 * focus goes back to where it was before each one opened, as it does when
 * the Model closes them. That close isn't the app's either.
 *
 * A popover's `popoverOpen` is shown with `showPopover()` at the commit,
 * after the modal dialogs, since a modal opening closes the auto popovers
 * already showing, and hidden with `hidePopover()`. A `"manual"` popover is
 * applied at every commit, including when its component didn't render, since
 * a move in the document closes it without a `toggle`, and put back on the
 * frame after any other change;
 * an `"auto"` one is applied only when the Model's value or the mode
 * changes, and the browser's changes are left for the Model to follow.
 * Every `toggle` is sent, including a coalesced one whose states are equal,
 * since it may be the only report of a change.
 *
 * Showing a modal dialog or a popover doesn't scroll the page. A browser
 * focuses something inside a `<dialog>` as it shows it and scrolls to it,
 * so the host puts the page's scroll position back after a `showModal()`
 * or a `showPopover()` that moved focus, which also stops a smooth scroll
 * the focus started.
 *
 * A handler set with `{ preventDefault: true }` cancels its event's default
 * when it produces a message, before the message is sent, and leaves the
 * event alone when it returns `undefined`. Nothing else is cancelled, and the
 * host never stops an event's propagation: the delegated listeners run on the
 * document in the capture phase, so stopping it there would hide the event
 * from the target and from every other listener. A cancelled click on a
 * routed link isn't followed by `BrowserRouter`. `wheel`, `touchstart` and
 * `touchmove` aren't in the vocabulary, since browsers make document listeners
 * for them passive.
 *
 * The host does the drag and drop work a handler can't. On `dragstart` it puts
 * the innermost drag source's `draggable` data on the drag. While a drag is
 * over the app it works out the active drop target, the innermost element
 * whose `dropTarget` accepts the drag's types, on every `dragenter` and
 * `dragover`, cancels those events there so the browser allows the drop, and
 * sends the target's enter and leave when it changes, never for its
 * children. A drag that leaves the window, or is cancelled, leaves the
 * target: a `dragleave` from the latest `dragenter`'s element with no enter
 * by the next task means the pointer left, whichever order the browser fires
 * them in. `dragover` is sent at most once per animation frame. A drop on a
 * target is always cancelled, and its strings and files are read then.
 *
 * `value`, `checked`, `selected` and `open` are controlled. The host sets them
 * after the element's children exist, skips a no-op so the caret doesn't jump,
 * and puts the Model's value back after the user changes it and the Model
 * didn't follow, whether `update` rejected the change or nothing handled it.
 * A focused `input` or `textarea` keeps its selection when the host writes
 * its `value`. A rejected edit, typed or composed, puts back the selection
 * from before it. A value `update` changed, such as uppercased text or
 * grouped digits, or one the Model set, keeps each end of the selection with
 * the unchanged text before it, else after it, and a caret at the end stays at
 * the end. When the text changed on both sides of the caret, as when a
 * character typed next to a separator moves it, the caret keeps its offset.
 * A field's `value` isn't written while an input method composes text in it,
 * from `compositionstart`, or an `input` that says it's composing, to
 * `compositionend`, so a patch or a rejected `input` can't replace the text
 * being composed; it's put back after `compositionend` instead.
 *
 * Under `HtmlHydrate.hydrate`, a server-rendered control the user changed
 * before its instance adopted keeps what it shows, and the host sends its state to the element's
 * `input` and `change` handlers as if the events had just fired, then puts the
 * Model's value back as above if `update` didn't take it. A control counts as
 * changed when it differs from both the server's HTML and the Model's value,
 * so a field the browser filled in, by autofill or by restoring a form, is
 * reported too, and so is one showing what the browser made of a value it
 * can't show, such as a range input clamped to its `max`. A focused text
 * field gets no `change`, as the browser sends it when focus leaves.
 *
 * **Example** (Mounting an app)
 *
 * ```ts
 * import { BrowserHost, Html } from "@effect/ui/html"
 * import { Layer, Schema } from "effect"
 * import { UiSchema } from "@effect/ui"
 *
 * const Message = UiSchema.TaggedEnum({ ClickedIncrement: {} })
 *
 * const Counter = Html.component({
 *   name: "Counter",
 *   model: Schema.Number,
 *   message: Message
 * }).make({
 *   init: () => 0,
 *   update: ($) => $.model + 1,
 *   view: (h, count) => h.button.on("click", Message.ClickedIncrement()).children(String(count))
 * })
 *
 * // The tree is mounted for as long as the Layer is built.
 * const main = Layer.launch(BrowserHost.mount(Counter, {}, document.getElementById("app")!))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as hot from "#hot"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Scheduler from "effect/Scheduler"
import type * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import * as domHost from "../internal/domHost.ts"
import type * as hydrateRun from "../internal/hydrateRun.ts"
import type * as Kernel from "../internal/kernel.ts"
import * as messageLog from "../internal/messageLog.ts"
import * as runtime from "../internal/runtime.ts"
import * as Renderer from "../Renderer.ts"
import type * as View from "../View.ts"
import * as Html from "./Html.ts"
import * as HtmlScheduler from "./HtmlScheduler.ts"
import * as documentHead from "./internal/documentHead.ts"
import * as documentServices from "./internal/documentServices.ts"
import * as dom from "./internal/dom.ts"

const open = { closed: false }

const fired = (
  handlers: Readonly<Record<string, View.Handler<unknown, any>>>,
  dispatch: Renderer.Dispatch,
  options: Readonly<Record<string, View.EventOptions>>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const name in handlers) {
    const handler = handlers[name]
    out[name] = {
      "~fire": (payload: unknown, event: string, prevent: () => void) =>
        dispatch(
          event,
          handler,
          payload,
          options[event]?.preventDefault === true ? prevent : undefined
        )
    }
  }
  return out
}

/**
 * Makes a browser host for `document`, plus `dispose`, which removes its
 * listeners.
 *
 * **Details**
 *
 * Most apps use `layer` or `mount`, which manage this for them. The host shows
 * the `html` vocabulary and host-neutral components. A component of another
 * vocabulary fails as a child when it mounts.
 *
 * The host keeps the document head in sync with the tree's folded head: the
 * `<title>`, and when `HtmlHead` is imported the rest of the `HtmlHead`.
 * It owns only tags marked `data-eui`, plus `<title>` and
 * `lang` / `dir` on `<html>`, and restores the shell's value once no entry
 * sets one. Static titles, `lang`, classes and `data-*` on `<html>` and
 * `<body>` belong in the root component's `head`, not in the shell: HTML
 * keeps the first copy of a duplicated attribute, so the shell's copy would
 * hide the framework's. `warn` reports a shell that conflicts with the head
 * on the first sync, and defaults to `console.warn`. The check runs in every
 * build, as `effect` has no development switch; it looks at the shell once,
 * and `warn: () => {}` silences it. Every host on one document shares one
 * baseline of the shell's values, captured by the first, so a second mount
 * doesn't take the first one's title for the shell's.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeHost = (
  document: Document,
  options?: { readonly warn?: ((message: string) => void) | undefined }
): Renderer.Host<globalThis.Node> & { readonly dispose: () => void } =>
  build(document, options).host

const build = (
  document: Document,
  options?: { readonly warn?: ((message: string) => void) | undefined }
) => {
  // oxlint-disable-next-line no-console
  const warn = options?.warn ?? ((message: string) => console.warn(message))
  const mounted = new Map<globalThis.Element, ReturnType<typeof dom.makeHost>>()
  let held = 0
  let sync: ReturnType<documentHead.HeadSync> | undefined
  let bare: ReturnType<typeof dom.makeHost> | undefined
  const direct = () => bare ??= dom.makeHost(document.documentElement, { warn })
  const host: Renderer.Host<globalThis.Node> & {
    readonly dispose: () => void
  } = {
    createElement: (tag) => direct().createElement(tag),
    createText: (text) => document.createTextNode(text),
    createContainer: () => document.createDocumentFragment(),
    setText: (node, text) => direct().setText(node, text),
    normalizeAttrs: (node, attrs) => direct().normalizeAttrs!(node, attrs),
    setAttr: (node, name, value, previous) =>
      direct().setAttr(node, name, value, previous),
    setProp: (node, name, value) => direct().setProp(node, name, value),
    insertBefore: (parent, node, ref) =>
      direct().insert(parent, node, ref ?? null),
    remove: (node) => {
      const parent = node.parentNode
      if (parent !== null) direct().remove(parent, node)
    },
    parentOf: (node) => node.parentNode ?? undefined,
    nextOf: (node) => node.nextSibling ?? undefined,
    setEvents: (node, handlers, dispatch, options) =>
      direct().setEvents(
        node,
        {
          v: {
            handlers: fired(handlers, dispatch, options),
            eventOptions: options
          },
          inst: open
        } as unknown as Kernel.Rec,
        true
      ),
    elements: [Html.name],
    controlled: dom.controlled,
    runsMounts: true,
    commit: () => bare?.commit?.(),
    head: (head) =>
      (sync ??= documentHead.make(document, warn)).sync(head as never),
    dispose: () => {
      sync?.release()
      sync = undefined
      bare?.dispose()
      bare = undefined
    }
  }
  const raw = (container: unknown, options: Parameters<runtime.MakeDom>[1]) =>
    dom.makeHost(container as globalThis.Element, { ...options, warn })
  const make: runtime.MakeDom = (container, options) => {
    const element = container as globalThis.Element
    const made = raw(element, options)
    mounted.set(element, made)
    return {
      ...made,
      dispose: () => {
        if (mounted.get(element) === made) mounted.delete(element)
        made.dispose()
      }
    }
  }
  domHost.doms.set(host, {
    make: (container, options) =>
      (container as globalThis.Node).nodeType === undefined
        ? undefined
        : make(container, options)
  })
  return {
    host,
    raw,
    make,
    held: () => held > 0,
    hold: (container: globalThis.Element, on: boolean) => {
      held += on ? 1 : -1
      mounted.get(container)?.pause(on)
    }
  }
}

/**
 * The element operations behind `HtmlCommand.focus`, `blur`,
 * `scrollIntoView`, `measure`, `select`, `requestSubmit` and `showPicker`,
 * on DOM elements.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const htmlHost: Context.Service.Shape<typeof Html.Host> = {
  focus: (element, options) =>
    (element as HTMLElement).focus(options as FocusOptions),
  blur: (element) => (element as HTMLElement).blur(),
  scrollIntoView: (element, options) =>
    element.scrollIntoView(options as ScrollIntoViewOptions),
  measure: (element) => {
    const box = element.getBoundingClientRect()
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      left: box.left
    }
  },
  select: (element) => {
    const field = element as HTMLInputElement
    // Written first: the host would otherwise put a value `update` rejected back a frame later, which
    // drops the selection.
    const value = dom.written.get(field)?.get("value")
    if (typeof value === "string" && field.value !== value) field.value = value
    if (typeof field.select === "function") field.select()
  },
  requestSubmit: (element) => {
    const form = element.localName === "form"
      ? element as HTMLFormElement
      : (element as HTMLInputElement).form ?? null
    if (form === null || typeof form.requestSubmit !== "function") return false
    form.requestSubmit()
    return true
  },
  showPicker: (element) => {
    const field = element as HTMLInputElement
    try {
      if (typeof field.showPicker === "function") field.showPicker()
      else if (field.type === "file" && !field.matches(":disabled")) {
        field.click()
      } else return false
      return true
    } catch {
      return false
    }
  }
}

/**
 * Provides the browser host as the `Renderer`, `Html.Host`, the document's
 * `Query.Visibility` and `Query.Connectivity`, its events as
 * `HtmlSubscription.GlobalEvents`, its window's frames as
 * `HtmlSubscription.AnimationFrames`, and an `HtmlImages.Images` and
 * `HtmlFiles.Files` over it, for the life of the Layer.
 *
 * **Details**
 *
 * `document` defaults to the global `document`. Closing the Layer removes the
 * host's listeners. The signals, `HtmlSubscription.GlobalEvents`,
 * `HtmlSubscription.AnimationFrames`, `HtmlImages.Images` and `HtmlFiles.Files`
 * use the document and its `defaultView`, never globals.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: {
  readonly document?: Document | undefined
}): Layer.Layer<Renderer.Renderer | Html.Host> =>
  Layer.effectContext(Effect.gen(function*() {
    const document = options?.document ?? globalThis.document
    const { host, held } = build(document)
    yield* Effect.addFinalizer(() => Effect.sync(host.dispose))
    return Context.add(
      yield* documentServices.make(document, htmlHost, held),
      Renderer.Renderer,
      { host }
    )
  }))

/**
 * Passes when a root shows HTML or is host-neutral, and otherwise names the
 * host its vocabulary needs.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type HtmlRoot<V> = [Renderer.HostOf<V>] extends [Html.Host] ? unknown
  : {
    readonly "BrowserHost.mount shows HTML elements. This root's vocabulary needs":
      Renderer.HostOf<V>
  }

/**
 * The options of `mount` and `mountEffect`, and of `HtmlHydrate.hydrate`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountOptions<V extends View.Elements, RF = never> {
  /** Shown in the root's place when the root itself fails. */
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: View.Helper<never, {}> & View.Tags<V, never>
    ) => View.Content<never, RF>)
    | undefined
  readonly query?: Renderer.QueryOptions | undefined
  /**
   * Whether this mount owns the document head: `true` by default. A mount
   * embedded in a page that something else owns, such as a widget, passes
   * `false`: it computes its head and never writes `document.title` or a
   * head tag.
   */
  readonly head?: boolean | undefined
}

/**
 * A Layer that mounts a component tree into `container` for as long as the
 * Layer is built. It provides no service: launch it with `Layer.launch`, or
 * merge it into the app's Layer.
 *
 * **When to use**
 *
 * Use to run an app. Reach for `mountEffect` when the caller needs the root,
 * to send it messages.
 *
 * **Details**
 *
 * The root must render HTML (or be host-neutral): mounting a root of another
 * vocabulary is a type error. Nested components are checked when they mount,
 * and one of another vocabulary fails as a child. The tree's requirements
 * are the root's, minus `Html.Host`, which the host provides. When the root
 * itself fails, `fallback` is shown in its place.
 *
 * `props` may be an Effect, such as `Router.props(AppRoute)`. It runs once,
 * before `init`, and its requirements are added to the mount's, so a routed
 * app needs only this Layer and its Router's. A root's props therefore can't
 * themselves be an Effect.
 *
 * Commands and Subscriptions run on `HtmlScheduler`, unless the caller
 * provides a `Scheduler`, and the render flush on a microtask. A navigation
 * Command runs in the flush its `update` caused, which renders the new route.
 *
 * To adopt the HTML of `HtmlServer.renderToHtml` instead of building it, mount
 * with `HtmlHydrate.hydrate`.
 *
 * **The head.** The mount owns the document head: `<title>` follows the
 * tree's folded head, and when `HtmlHead` is imported so do the marked head
 * tags and the `<html>` and `<body>` attributes. A mount embedded in a page that another mount, or the
 * server, owns passes `head: false`: it still computes its head, and its
 * Router announces the title, but it leaves the document alone. With two
 * mounts on one document, only the one that owns the head writes it.
 *
 * **Example** (Launching an app)
 *
 * ```ts
 * import { BrowserHost, Html } from "@effect/ui/html"
 * import { Effect, Layer, Schema } from "effect"
 *
 * const App = Html.component({
 *   name: "App",
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   view: (h) => h.h1("Hello")
 * })
 *
 * // In the browser entry module.
 * Effect.runFork(Layer.launch(BrowserHost.mount(App, {}, document.getElementById("app")!)))
 * ```
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const mount = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & HtmlRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  container: globalThis.Element,
  options?: MountOptions<V, RF>
): Layer.Layer<never, never, Exclude<R | RF | RP, Html.Host>> =>
  Layer.effectDiscard(mountEffect(component, props, container, options)) as any

let defaultScheduler: Scheduler.Scheduler | undefined

/**
 * Mounts a component tree into `container` for the life of the current
 * Scope, and returns its root.
 *
 * **When to use**
 *
 * Use when the caller needs the root: to read its Model or send it a message.
 * `mount` is the form that runs an app.
 *
 * **Details**
 *
 * It mounts and checks the root exactly as `mount` does.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mountEffect = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & HtmlRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  container: globalThis.Element,
  options?: MountOptions<V, RF>
): Effect.Effect<
  Renderer.Root<Model, Msg>,
  never,
  Exclude<R | RF | RP, Html.Host> | Scope.Scope
> =>
  mountRoot(
    component as unknown as Component.Any,
    props,
    container,
    options,
    undefined
  ) as any

/** @internal */
export const mountRoot = (
  component: Component.Any,
  props: unknown,
  container: globalThis.Element,
  options: MountOptions<any, any> | undefined,
  hydrate: hydrateRun.Hydrating | undefined
): Effect.Effect<Renderer.Root<any, any>, never, Scope.Scope> =>
  Effect.gen(function*() {
    const { host, raw, make, held, hold } = build(container.ownerDocument)
    yield* Effect.addFinalizer(() => Effect.sync(host.dispose))
    const context = Context.add(
      yield* documentServices.make(container.ownerDocument, htmlHost, held),
      Renderer.Renderer,
      { host }
    )
    const outer = yield* Effect.context<Scope.Scope>()
    const attached = hot.devTools(container)
    const hotSession = hot.open(component, container)
    const hydrating = hotSession?.hasSnapshot === true ? undefined : hydrate
    if (hydrating !== hydrate) container.textContent = ""
    const scheduler =
      Context.getOrUndefined(outer, Scheduler.Scheduler) === undefined
        ? (defaultScheduler ??= HtmlScheduler.makeDefault())
        : undefined
    const scheduled = scheduler === undefined
      ? context
      : Context.add(context, Scheduler.Scheduler, scheduler)
    const mountContext = attached !== undefined &&
        Context.get(outer, messageLog.MessageLog) === messageLog.noop
      ? Context.add(context, messageLog.MessageLog, attached.messageLog)
      : context
    const root = yield* Effect.provideContext(
      runtime.mountDom(
        component,
        props,
        container,
        make,
        [Html.name],
        { ...options, hydrate: hydrating, hot: hotSession, scheduler }
      ),
      mountContext
    )
    const controlled = controllable(
      component,
      root,
      container,
      Context.merge(outer, scheduled),
      (target, domOptions) => painting(raw(target, domOptions)),
      () => hold(container, true),
      () => hold(container, false)
    )
    const currentControllables = Context.get(outer, Controllables)
    const activeControllables =
      attached !== undefined && currentControllables === defaultControllables
        ? attached.controllables
        : currentControllables
    const unregister = activeControllables.register(controlled)
    yield* Effect.addFinalizer(() =>
      Effect.andThen(Effect.sync(unregister), controlled.resume)
    )
    return root
  })

/**
 * An instance's state as a tool recorded it from the `MessageLog`: the
 * Model of a `Mounted` or `Update` entry, for a component with queries
 * its query results, and the props of its `Mounted` or latest
 * `PropsChanged` entry.
 *
 * **Details**
 *
 * Without `props`, the instance takes the props its parent's view passes it,
 * and the root the props it was mounted with. With them, it takes those, so
 * a child shows the props it had at that entry, even when its parent's
 * Model at that entry would pass it newer ones or its parent wasn't
 * recorded.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Recorded {
  readonly model: unknown
  readonly queries?: Component.Results | undefined
  readonly props?: unknown
}

/**
 * A root mounted with `mount`, `mountEffect` or `HtmlHydrate.hydrate`, offered to `Controllables`
 * so a tool such as DevTools can show the page as it was at an earlier state,
 * and send a message to any of its instances.
 *
 * **Details**
 *
 * `instance` finds an instance of the root by the `instance` number its
 * `MessageLog` entries carry, while it is mounted. See `ControlledInstance`.
 *
 * `pause` hides the root's container and paints a frozen copy of the tree
 * next to it, in a copy of the container without its children and with the
 * HTML `inert` attribute. Each instance of the copy adopts the state that
 * `state` returns for its path, and one it returns nothing for starts from
 * `init`. See `Painted` for what it returns.
 *
 * The frozen copy runs nothing: no Command, `init`'s included, no
 * Subscription, query watch or fetch, element mount or provided Layer, and
 * loads no lazy component, so a feature slot whose service comes from a
 * provided Layer, and a lazy component that hasn't loaded, show their
 * `fallback`. It logs no entries, leaves the document head alone, isn't seen
 * by the Router and takes no events. A modal dialog in the copy is shown as
 * a manual popover, and an auto popover as a manual one, so the copy never
 * makes the rest of the page inert, a tool's own UI included, and never
 * closes the live tree's popovers.
 *
 * The live root keeps running while it's hidden: its Commands,
 * Subscriptions and updates go on, and it renders into its hidden
 * container. While it's paused, its modal dialogs and auto popovers are
 * closed, without a `toggle` or `close` reaching the Model, and its document
 * and window listeners don't hear the user's mouse, pointer, touch and key
 * input. So a click on the copy, which `inert` passes to the element under
 * it, doesn't reach the live tree or light-dismiss its popovers, and nothing
 * it shows blocks the rest of the page. Events that aren't the user's input,
 * and ones code dispatches, still reach it. Pausing again replaces the
 * painted copy. `resume` removes the copy, shows the container again, with
 * whatever happened meanwhile, and shows the modal dialogs and popovers its
 * Model has open. When
 * a paint fails, `pause` removes its copy and leaves the page as it was.
 *
 * **Gotchas**
 *
 * DOM state that isn't in a Model, such as what was typed into an
 * uncontrolled input, scroll positions, focus and media, isn't painted. An
 * element mount of the live root that measures reads zero while it's
 * hidden. Elements of the copy have the same ids as the live ones.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Controllable {
  /** The session the root's `MessageLog` entries carry. */
  readonly session: string
  /** The root instance's path, `/<name>`. */
  readonly path: string
  readonly pause: (
    state: (path: string) => Recorded | undefined
  ) => Effect.Effect<Painted>
  readonly resume: Effect.Effect<void>
  /**
   * The instance of this root with this `instance` number (the number its
   * `MessageLog` entries carry), while it is mounted.
   */
  readonly instance: (instance: number) => ControlledInstance | undefined
}

/**
 * An instance of a `Controllable` root, which a tool can send a message to.
 *
 * **Details**
 *
 * `dispatch` sends the message as the root's `send` does: the `Update` it
 * logs has the source `{ _tag: "Dispatch" }`. It runs in a step of its
 * own, after a pending view transition when there is one, and completes
 * with what happened once it ran. See `Dispatched`. The message isn't
 * decoded: a tool that takes it as JSON decodes it with `message` first.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ControlledInstance {
  /** The number the instance's `MessageLog` entries carry. */
  readonly instance: number
  readonly path: string
  /** The component's name. */
  readonly component: string
  /** The component's `message` Schema. */
  readonly message: Schema.Top
  /** Sends a message to the instance as a dispatch, and tells what happened. */
  readonly dispatch: (message: unknown) => Effect.Effect<Dispatched>
}

/**
 * What `ControlledInstance.dispatch` did.
 *
 * **Details**
 *
 * `Updated` has the seq of the `Update` entry it logged, and `Failed` the
 * seq of the `Failed` entry, when `update` threw. `Ignored` ran no
 * `update`, because the instance had closed, was waiting to adopt the
 * server's nodes or the root was frozen, or it ran one that returned
 * nothing, which is `unchanged`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Dispatched =
  | { readonly _tag: "Updated"; readonly seq: number }
  | { readonly _tag: "Failed"; readonly seq: number }
  | {
    readonly _tag: "Ignored"
    readonly reason: "closed" | "waiting" | "frozen" | "unchanged"
  }

/**
 * What `Controllable.pause` painted that differs from the page at that state.
 *
 * **Details**
 *
 * `fellBack` has the paths of the instances `state` returned nothing for,
 * which started from `init`. `fallbacks` has the path of each instance
 * whose view shows a feature slot's `fallback`, because the copy doesn't
 * build the provided Layer the feature's service comes from. Both may show
 * something the page never showed at that state.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Painted {
  readonly fellBack: ReadonlyArray<string>
  readonly fallbacks: ReadonlyArray<string>
}

/**
 * Where `mount`, `mountEffect` and `HtmlHydrate.hydrate` offer their roots to be paused and sent
 * messages.
 *
 * **Details**
 *
 * `register` is called with each root as it mounts, and the function it
 * returns when the root unmounts. The default ignores every root, so a tool
 * that controls roots provides its own.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface Controllables {
  readonly register: (root: Controllable) => () => void
}

const unregistered = () => {}

const defaultControllables: Controllables = { register: () => unregistered }

/**
 * The `Controllables` service, read by `mount`, `mountEffect` and
 * `HtmlHydrate.hydrate`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const Controllables: Context.Reference<Controllables> = Context
  .Reference<Controllables>(
    "@effect/ui/html/BrowserHost/Controllables",
    { defaultValue: () => defaultControllables }
  )

// `showModal()` makes everything outside the dialog inert, DevTools included, while the copy's own `inert`
// leaves the dialog unusable, and an auto popover shown in the copy would close the live page's. Both are
// shown as manual popovers: in the top layer, with no effect on the rest of the page.
const painting = <
  H extends Pick<Renderer.Host<globalThis.Node>, "setAttr" | "setProp">
>(host: H): H => ({
  ...host,
  runsMounts: false,
  setAttr: (node, name, value, previous) =>
    host.setAttr(
      node,
      name,
      name === "popover" && value !== undefined ? "manual" : value,
      previous
    ),
  setProp: (node, name, value) => {
    if (name !== "open" || value !== "modal") {
      return host.setProp(node, name, value)
    }
    host.setAttr(node, "popover", "manual")
    host.setProp(node, "popoverOpen", true)
  }
})

const controllable = (
  component: Component.Any,
  root: runtime.Root,
  container: globalThis.Element,
  context: Context.Context<Scope.Scope>,
  makePaintDom: runtime.MakeDom,
  hold: () => void,
  release: () => void
): Controllable => {
  const owner = Context.get(context, Scope.Scope)
  const style = (container as HTMLElement).style
  let painted:
    | { readonly scope: Scope.Closeable; readonly copy: HTMLElement }
    | undefined
  let shown: readonly [value: string, priority: string] | undefined
  const unpaint = (was: typeof painted): Effect.Effect<void> =>
    was === undefined
      ? Effect.void
      : Effect.andThen(
        Scope.close(was.scope, Exit.void),
        Effect.sync(() => was.copy.remove())
      )
  const show = (
    target: CSSStyleDeclaration,
    [value, priority]: readonly [string, string]
  ) => {
    if (value === "") target.removeProperty("display")
    else target.setProperty("display", value, priority)
  }
  const hide = (): readonly [string, string] => {
    if (shown !== undefined) return shown
    shown = [
      style.getPropertyValue("display"),
      style.getPropertyPriority("display")
    ]
    hold()
    style.setProperty("display", "none", "important")
    return shown
  }
  const reveal = Effect.sync(() => {
    if (shown === undefined) return
    show(style, shown)
    shown = undefined
    release()
  })
  const resume = Effect.suspend(() => {
    const was = painted
    painted = undefined
    return Effect.andThen(unpaint(was), reveal)
  })
  return {
    session: root.session,
    path: root.path,
    pause: (state) =>
      Effect.uninterruptible(Effect.gen(function*() {
        const scope = yield* Scope.fork(owner, "sequential")
        const copy = container.cloneNode(false) as HTMLElement
        show(copy.style, hide())
        copy.setAttribute("inert", "")
        ;(painted?.copy ?? container).after(copy)
        const result = yield* runtime.paintDom(
          component,
          root.instance.props,
          copy,
          state,
          makePaintDom,
          [Html.name]
        ).pipe(
          Effect.provideContext(Context.add(context, Scope.Scope, scope)),
          Effect.onError(() =>
            Effect.andThen(
              unpaint({ scope, copy }),
              painted === undefined ? reveal : Effect.void
            )
          )
        )
        const was = painted
        painted = { scope, copy }
        yield* unpaint(was)
        return result
      })),
    resume,
    instance: (born) => {
      const inst = root.find(born)
      return inst === undefined ? undefined : {
        instance: born,
        path: inst.path,
        component: inst.component.definition.name,
        message: inst.component.definition.message,
        dispatch: (message) => root.dispatch(inst, message)
      }
    }
  }
}
