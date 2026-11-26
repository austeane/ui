import {
  checkContent,
  checkDeclarer,
  checkFallback,
  checkKeys,
  checkPaths,
  checkPlaced,
  checkShown,
  dev
} from "#dev"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import type * as Fiber from "effect/Fiber"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { TypeId as FeatureId } from "../Feature.ts"
import * as View from "../View.ts"
import { propsEqual } from "./equal.ts"
import { segmentOf, slotSegment } from "./paths.ts"

/** @internal */
export interface Host<N = any> {
  readonly hold?:
    | ((
      owner: Instance,
      rec: Rec,
      slot: string | undefined,
      component: Runnable
    ) => boolean)
    | undefined
  readonly createElement: (tag: string) => N
  readonly createText: (text: string) => N
  readonly setText: (node: N, text: string) => void
  readonly setAttr: (
    node: N,
    name: string,
    value: string | undefined,
    previous?: string | undefined
  ) => void
  readonly normalizeAttrs?:
    | ((
      node: N,
      attrs: Readonly<Record<string, string>>
    ) => Readonly<Record<string, string>>)
    | undefined
  readonly setProp: (node: N, name: string, value: unknown) => void
  readonly made?: ((node: N, inst: Instance) => void) | undefined
  readonly form?: ((node: N) => void) | undefined
  readonly setEvents: (node: N, record: Rec, first: boolean) => void
  readonly insert: (parent: N, node: N, before: N | null) => void
  readonly remove: (parent: N, node: N) => void
  readonly clear?: ((parent: N) => void) | undefined
  readonly createContainer?: (() => N) | undefined
  readonly parentOf: (node: N) => N
  readonly nextOf: (node: N) => N | null
  readonly commit?: (() => void) | undefined
  readonly controlled?: ReadonlySet<string> | undefined
  readonly runsMounts?: boolean | undefined
  readonly head?: ((head: unknown) => void) | undefined
  readonly transitions?: ((tree: Tree) => Transitions) | undefined
  readonly server?: Server | undefined
  readonly inert?: boolean | undefined
  readonly skipped?: ((path: string) => void) | undefined
}

/** @internal */
export interface Server {
  readonly drop: (
    inst: Instance,
    name: string,
    issued: Issued | undefined
  ) => void
  readonly defer: (inst: Instance) => void
  readonly report: (problem: any) => void
}

/** @internal */
export interface Transitions {
  readonly request: (types: ReadonlyArray<string>) => void
  readonly waits: (inst: Instance) => boolean
  readonly wait: (f: () => void) => void
  readonly hold: () => boolean
  readonly settle: () => void
}

/** @internal */
export interface Attachable {
  readonly "~attach": (rec: Rec) => void
  readonly "~detach": (rec: Rec) => void
}

/** @internal */
export interface Runnable {
  readonly definition: { readonly name: string }
  readonly init: (props: any) => Next
  readonly update: (
    model: any,
    message: never,
    props: any,
    results?: unknown,
    shared?: unknown
  ) => Next | undefined
  readonly view: Function
  readonly layer?: unknown
  readonly boot?: ((inst: Instance) => void) | undefined
  readonly "~sync"?:
    | ((inst: Instance, next?: Next, seq?: number | undefined | void) => void)
    | undefined
  readonly "~content"?: Function | undefined
  readonly "~owned"?:
    | ((inst: Instance, view: View.Element<any, any>) => View.Element<any, any>)
    | undefined
  readonly "~first"?: ((inst: Instance) => void) | undefined
  readonly "~render"?: ((inst: Instance) => void) | undefined
  readonly "~kept"?: Keeper | undefined
  readonly "~load"?:
    | ((
      owner: Instance,
      rec: Rec,
      at: string | undefined
    ) => Runnable | undefined)
    | undefined
  readonly "~cause"?: (() => Cause.Cause<unknown> | undefined) | undefined
}

/** @internal */
export interface Keeper {
  readonly mount: (author: Instance, rec: Rec, slot: string | undefined) => void
  readonly patch: (
    inst: Instance,
    old: Rec,
    view: View.Child<any, any>,
    slot: string | undefined
  ) => Rec | undefined
  readonly release: (owner: Instance, rec: Rec) => boolean
  readonly shows: (
    author: Instance,
    view: View.Child<any, any>,
    fallback: View.Node<any, any>
  ) => View.Node<any, any>
}

/** @internal */
export interface Next {
  readonly model: unknown
  readonly commands: ReadonlyArray<unknown>
  readonly events: ReadonlyArray<unknown>
  readonly lists?: ReadonlyArray<unknown> | undefined
  readonly sends?: ReadonlyArray<unknown> | undefined
  readonly viewTransition?: ReadonlyArray<string> | undefined
}

/** @internal */
export type FailedIn =
  | "init"
  | "update"
  | "view"
  | "event"
  | "onEmit"
  | "onFailure"
  | "fallback"
  | "layer"
  | "command"
  | "subscription"
  | "mount"
  | "head"
  | "send"
  | "shares"
  | "shared"

/** @internal */
export interface Env {
  ctx: Context.Context<any> | undefined
  cause: Cause.Cause<unknown> | undefined
  readonly waiting: Array<() => void>
  readonly parent?: Env | undefined
}

/** @internal */
export type Recorder = (
  inst: Instance,
  draft: { readonly _tag: string; readonly [field: string]: unknown }
) => number | undefined | void

/** @internal */
export interface Issued {
  readonly seq: number
  readonly index: number
}

interface Issuable {
  readonly "~run": (
    inst: Instance,
    seq: number | undefined | void,
    index: number
  ) => void
}

/** @internal */
export interface Runs {
  readonly running: (name: string, groupKey: string | undefined) => boolean
  readonly pending: () => ReadonlyArray<
    { readonly name: string; readonly status: string }
  >
}

/** @internal */
export interface Tree {
  readonly host: Host
  readonly report: (
    path: string,
    where: FailedIn,
    cause: Cause.Cause<unknown>
  ) => void
  readonly init: (inst: Instance) => Next
  readonly log?: Recorder | undefined
  readonly fallback?:
    | ((cause: Cause.Cause<unknown>) => View.Node<any, any>)
    | undefined
  readonly schedule: (task: () => void) => void
  readonly follow?: ((late?: boolean) => <A>(f: () => A) => A) | undefined
  owned?: Set<Fiber.Fiber<unknown, unknown>> | undefined
  closing?: Set<Fiber.Fiber<any, any>> | undefined
  building?: Set<{ readonly flush: number }> | undefined
  flush?: (() => number) | undefined
  builds?: number | undefined
  failedBuild?: number | undefined
  cached?: (() => void) | undefined
  watched?:
    | ((inst: Instance, query: string, argsKey: string) => void)
    | undefined
  served?: ((inst: Instance) => string | undefined) | undefined
  drawn?: ((inst: Instance, drawn: boolean) => void) | undefined
  ended?: ((author: Instance, path: string) => void) | undefined
  work?: ((idle: boolean) => boolean) | undefined
  committed?: Array<() => void> | undefined
  head?:
    | { readonly value: unknown; readonly title: string | undefined }
    | undefined
  transitions?: Transitions | undefined
  shared?: unknown
  drew?: boolean | undefined
  holds?:
    | ((child: Instance, inst: Instance, view: View.Child<any, any>) => boolean)
    | undefined
  held?: ((at: string) => boolean) | undefined
  dirty: Array<Instance>
  scheduled: boolean
  flushing: boolean
  closed: boolean
}

/** @internal */
export class Rec {
  declare v: View.Node<any, any>
  declare node: any
  declare kids: Array<Rec> | undefined
  declare inst: Instance
  /** Whether this element or an element below it sets a controlled property. */
  declare controlled: boolean
  constructor(
    v: View.Node<any, any>,
    node: unknown,
    kids: Array<Rec> | undefined,
    inst: Instance,
    controlled = false
  ) {
    this.v = v
    this.node = node
    this.kids = kids
    this.inst = inst
    this.controlled = controlled
  }
}

/** @internal */
export class Instance {
  declare readonly tree: Tree
  declare readonly component: Runnable
  declare readonly parent: Instance | undefined
  declare readonly at: Rec | undefined
  declare under: string | undefined
  declare readonly depth: number
  declare props: unknown
  declare env: Env
  model: unknown = undefined
  rendered: Rec | undefined = undefined
  dirty = false
  closed = false
  failure: Cause.Cause<unknown> | undefined = undefined
  live = 0
  lazy: unknown = undefined
  placed: Map<string, Placed> | undefined = undefined
  closers: Array<() => void> | undefined = undefined
  declare runs: Runs | undefined
  declare results: unknown
  declare hold: ((go: () => void) => boolean) | undefined
  declare swaps:
    | Array<(waits: Array<Fiber.Fiber<unknown, unknown>>) => void>
    | undefined
  declare look: ((owner: any, optional?: boolean) => unknown) | undefined
  declare owning: unknown
  declare reading: unknown
  declare kept:
    | {
      readonly done: () => void
      readonly parked: () => ReadonlyArray<Rec>
      readonly children: () => ReadonlyArray<
        { readonly inst: Instance; readonly rec: Rec | undefined }
      >
    }
    | undefined
  writing = 0
  named: string | undefined = undefined
  constructor(
    tree: Tree,
    component: Runnable,
    parent: Instance | undefined,
    at: Rec | undefined,
    props: unknown,
    env: Env
  ) {
    this.tree = tree
    this.component = component
    this.parent = parent
    this.at = at
    this.under = slot
    this.depth = parent === undefined ? 0 : parent.depth + 1
    this.props = props
    this.env = env
  }
  get path(): string {
    if (this.named !== undefined) return this.named
    const at = this.at
    if (at === undefined) {
      return this.named = "/" + this.component.definition.name
    }
    const view = at.v as View.Child<any, any>
    return this.named =
      (view.alive === undefined && this.under || this.parent!.path) + "/" +
      segmentOf(view.component, view.key)
  }
  fire(
    handler: unknown,
    payload: unknown,
    source: unknown,
    where: FailedIn = "event"
  ): boolean {
    if (this.closed) return false
    let message = handler
    if (typeof handler === "function") {
      try {
        message = handler(payload)
      } catch (error) {
        fail(this, where, Cause.die(error))
        return false
      }
    }
    if (message === undefined) return false
    send(this, message, source)
    return true
  }
}

interface Placed {
  rec: Rec
  content: unknown
}

let slot: string | undefined
let busy = 0
let receiving: Instance | undefined
let shown = 0
const born: Array<Instance | Rec> = []
let fallen: Instance | undefined

/** @internal */
export const rendering = { _tag: "Render" } as const

/** @internal */
export const rendered = { _tag: "Rendered" } as const

const emptyText: View.Text = { _tag: "Text", text: "" }

const fallbackOf = (
  owner: Instance,
  view: View.Child<any, any>,
  cause: Cause.Cause<unknown> | undefined
): View.Node<any, any> => {
  const fallback = view.fallback
  if (dev) shown++
  if (fallback === undefined) return emptyText
  try {
    return View.children([
      fallback(
        (cause === undefined
          ? AsyncResult.initial(true)
          : AsyncResult.failure(cause)) as any
      )
    ])[0] ?? emptyText
  } catch (error) {
    owner.tree.schedule(() => fail(owner, "fallback", Cause.die(error)))
    return emptyText
  }
}

const loadingIn = (
  owner: Instance,
  view: View.Child<any, any>,
  cause: Cause.Cause<unknown> | undefined,
  show: (fallback: View.Node<any, any>) => Rec
): Rec => {
  if (view.alive === undefined) {
    return inFallback(owner, () => show(fallbackOf(owner, view, cause)))
  }
  const outer = slot
  slot = undefined
  try {
    return inFallback(owner, () => {
      const fallback = fallbackOf(owner, view, cause)
      return show(dev ? keeperOf(view)!.shows(owner, view, fallback) : fallback)
    })
  } finally {
    slot = outer
  }
}

const inFallback = <A>(owner: Instance, f: () => A): A => {
  const outer = fallen
  fallen = owner
  try {
    return f()
  } finally {
    fallen = outer
  }
}

const rootFallback = (
  inst: Instance,
  cause: Cause.Cause<unknown>
): View.Node<any, any> => {
  const tree = inst.tree
  try {
    return tree.fallback?.(cause) ?? emptyText
  } catch (error) {
    const failure = Cause.die(error)
    tree.log?.(inst, {
      _tag: "Failed",
      props: inst.props,
      in: "fallback",
      cause: failure
    })
    tree.report(inst.path, "fallback", failure)
    return emptyText
  }
}

/** @internal */
export const stand = (inst: Instance, cause: Cause.Cause<unknown>): Rec => {
  const parent = inst.parent
  const outer = slot
  const from = born.length
  slot = inst.under
  try {
    return parent === undefined
      ? create(inst, rootFallback(inst, cause))
      : create(
        parent,
        fallbackOf(parent, inst.at!.v as View.Child<any, any>, cause)
      )
  } catch (error) {
    orphans(from)
    inst.tree.report(inst.path, "fallback", Cause.die(error))
    return create(inst, emptyText)
  } finally {
    slot = outer
  }
}

/** @internal */
export const fail = (
  inst: Instance,
  where: FailedIn,
  cause: Cause.Cause<unknown>,
  update?: { readonly message: unknown; readonly source: unknown },
  from?: number,
  name?: string,
  issued?: Issued
): void => {
  if (inst.closed) return
  const tree = inst.tree
  const log = tree.log
  if (log !== undefined) {
    log(inst, {
      _tag: "Failed",
      props: inst.props,
      in: where,
      name,
      cause,
      update,
      issued
    })
  }
  inst.failure = cause
  const old = inst.rendered
  const path = inst.path
  close(inst)
  if (from !== undefined) orphans(from)
  const at = inst.at
  if (old !== undefined) {
    const host = tree.host
    const first = nodeOf(old)
    const parentNode = host.parentOf(first)
    const fallback = stand(inst, cause)
    if (parentNode != null) {
      place(host, parentNode, fallback, first)
      unplace(host, parentNode, old)
    }
    if (at === undefined) inst.rendered = fallback
    else {
      inst.rendered = undefined
      at.kids = [fallback]
      if (dev) tree.schedule(() => recheck(inst.parent!))
    }
  }
  const onFailure = at === undefined
    ? undefined
    : (at.v as View.Child<any, any>).onFailure
  if (onFailure !== undefined) {
    const parent = upOf(inst)
    tree.schedule(() =>
      parent.fire(onFailure, AsyncResult.failure(cause), inst, "onFailure")
    )
  }
  tree.report(path, where, cause)
}

const upOf = (inst: Instance): Instance =>
  ((inst.at!.v as View.Child<any, any>).owner as Instance | undefined) ??
    inst.parent!

const recheckPlaced = (author: Instance): void => {
  try {
    checkPlaced(author)
  } catch (error) {
    fail(author, "view", Cause.die(error))
  }
}

const recheck = (inst: Instance): void => {
  if (inst.closed || inst.rendered === undefined) return
  try {
    checkShown(inst.path, [inst.rendered])
  } catch (error) {
    fail(inst, "view", Cause.die(error))
  }
}

const orphans = (from: number): void => {
  for (let index = from; index < born.length; index += 2) {
    release(born[index] as Instance, born[index + 1] as Rec)
  }
  born.length = from
}

/** @internal */
export const send = (
  inst: Instance,
  message: unknown,
  source?: unknown
): void => {
  const transitions = inst.tree.transitions
  if (transitions?.waits(inst)) {
    return transitions.wait(() => send(inst, message, source))
  }
  renderAbove(inst)
  if (inst.closed) return
  let next: Next | undefined
  try {
    next = inst.component.update(
      inst.model,
      message as never,
      inst.props,
      inst.results,
      inst.look
    )
  } catch (error) {
    return fail(inst, "update", Cause.die(error), { message, source })
  }
  if (next === undefined) return
  const seq = inst.tree.log?.(inst, {
    _tag: "Update",
    source,
    message,
    props: inst.props,
    model: next.model,
    commands: next.commands,
    events: next.events,
    lists: next.lists,
    sends: next.sends,
    viewTransition: next.viewTransition
  })
  if (next.model !== inst.model) {
    inst.model = next.model
    markDirty(inst)
  }
  if (next.viewTransition !== undefined) {
    transitions?.request(next.viewTransition)
  }
  issueAll(inst, next, seq)
  applied(inst, next, seq)
}

const issueAll = (
  inst: Instance,
  next: Next,
  seq: number | undefined | void
): void => {
  const commands = next.commands
  for (let index = 0; index < commands.length; index++) {
    if (inst.closed) return
    ;(commands[index] as Issuable)["~run"](inst, seq, index)
  }
}

const applied = (
  inst: Instance,
  next: Next,
  seq: number | undefined | void
): void => {
  if (inst.closed) return
  inst.component["~sync"]?.(inst, next, seq)
  const events = next.events
  if (events.length === 0 || inst.at === undefined) return
  const parent = upOf(inst)
  for (let index = 0; index < events.length; index++) {
    if (inst.closed) return
    const onEmit = (inst.at!.v as View.Child<any, any>).onEmit
    if (onEmit === undefined) return
    let message: unknown
    try {
      message = onEmit(events[index])
    } catch (error) {
      fail(parent, "onEmit", Cause.die(error))
      return
    }
    if (message !== undefined) send(parent, message, inst)
  }
}

/** @internal */
export const wake = (tree: Tree): void => {
  if (tree.scheduled) return
  tree.scheduled = true
  tree.schedule(() => flush(tree))
}

/** @internal */
export const markDirty = (inst: Instance): void => {
  if (inst.dirty) return
  inst.dirty = true
  inst.tree.dirty.push(inst)
  wake(inst.tree)
}

const byDepth = (a: Instance, b: Instance): number => a.depth - b.depth

/** @internal */
export const renderAbove = (inst: Instance): void => {
  const dirty = inst.tree.dirty
  if (busy > 0 || dirty.length === 0) return
  const above: Array<Instance> = []
  let top = -1
  let drawn = inst.under !== undefined
  for (let at = inst.parent; at !== undefined; at = at.parent) {
    if (at.dirty) top = above.length
    above.push(at)
    if (at.under !== undefined) drawn = true
  }
  if (drawn) {
    const path = inst.path
    above.length = 0
    for (let index = 0; index < dirty.length; index++) {
      const at = dirty[index]!
      if (at.dirty && path.startsWith(at.path + "/")) above.push(at)
    }
    above.sort(byPathLength)
    top = above.length - 1
  }
  if (top < 0) return
  const outer = receiving
  receiving = inst
  try {
    for (let index = top; index >= 0; index--) {
      const next = above[index]!
      if (next.closed) return
      if (next.dirty) renderDirty(next)
    }
  } finally {
    receiving = outer
  }
}

const byPathLength = (a: Instance, b: Instance): number =>
  b.path.length - a.path.length

const renderDirty = (inst: Instance): void => {
  const log = inst.tree.log
  inst.tree.drew = true
  if (log !== undefined) log(inst, rendering)
  render(inst)
  if (log !== undefined) log(inst, rendered)
}

/** @internal */
export const flush = (tree: Tree): void => {
  tree.scheduled = true
  tree.flushing = true
  for (;;) {
    if (tree.closed) return
    if (tree.transitions?.hold()) {
      tree.flushing = false
      return
    }
    const batch = tree.dirty
    if (tree.work?.(batch.length === 0)) continue
    if (batch.length === 0) break
    tree.dirty = []
    if (batch.length > 1) batch.sort(byDepth)
    for (let index = 0; index < batch.length; index++) {
      const inst = batch[index]!
      if (inst.dirty && !inst.closed) renderDirty(inst)
    }
  }
  tree.scheduled = tree.flushing = false
  tree.host.commit?.()
  const committed = tree.committed
  if (committed !== undefined) {
    tree.committed = undefined
    for (let index = 0; index < committed.length; index++) committed[index]!()
  }
}

// A view is called through this, as it may have a `call` of its own.
const callView = Function.prototype.call

/**
 * Calls `component`'s view with the state of `inst`. `store` is where
 * `h.lazy` keeps its nodes.
 *
 * @internal
 */
export const draw = (
  inst: Instance,
  component: Runnable,
  store: Instance | undefined
): View.Node<any, any> | undefined => {
  const view = component.view ?? component["~content"]!
  return callView.call(
    view,
    component,
    inst.model,
    inst.props,
    inst.runs?.running,
    inst.results,
    View.takesPathSource(view) ? inst : inst.path,
    inst.look,
    store
  )
}

const viewOf = (inst: Instance): View.Node<any, any> | undefined => {
  try {
    const tree = draw(inst, inst.component, inst)
    if (dev && tree !== undefined) {
      const author = checkPaths(inst, tree)
      if (author !== undefined) inst.tree.schedule(() => recheckPlaced(author))
    }
    return tree
  } catch (error) {
    fail(inst, "view", Cause.die(error))
    return undefined
  }
}

/** @internal */
export const authorOf = (inst: Instance): Instance =>
  inst.at !== undefined &&
    (inst.at.v as View.Child<any, any>).view !== undefined
    ? inst.parent!
    : inst

const start = (inst: Instance): Rec | undefined => {
  let first: Next
  const component = inst.component
  const outer = slot
  const from = born.length
  const fallbacks = shown
  const by = authorOf(inst)
  slot = by === inst ? undefined : inst.path
  busy++
  try {
    try {
      inst.tree.drew = true
      first = inst.tree.init(inst)
    } catch (error) {
      fail(inst, "init", Cause.die(error))
      return undefined
    }
    inst.model = first.model
    const seq = inst.tree.log?.(inst, {
      _tag: "Mounted",
      props: inst.props,
      model: first.model,
      commands: first.commands,
      events: first.events,
      adopted: false
    })
    component.boot?.(inst)
    issueAll(inst, first, seq)
    component["~first"]?.(inst)
    if (inst.closed) return undefined
    inst.dirty = false
    const tree = viewOf(inst)
    if (tree === undefined) return undefined
    let rendered: Rec
    by.writing++
    try {
      rendered = create(by, tree)
      if (dev && shown !== fallbacks) checkShown(inst.path, [rendered])
    } catch (error) {
      fail(inst, "view", Cause.die(error), undefined, from)
      return undefined
    } finally {
      by.writing--
    }
    if (inst.closed) {
      release(inst, rendered)
      return undefined
    }
    inst.rendered = rendered
    inst.kept?.done()
    applied(inst, first, seq)
    return rendered
  } finally {
    busy--
    born.length = from
    slot = outer
  }
}

const render = (inst: Instance): void => {
  inst.dirty = false
  const outer = slot
  const from = born.length
  const fallbacks = shown
  const by = authorOf(inst)
  slot = by === inst ? undefined : inst.path
  busy++
  by.writing++
  try {
    inst.component["~render"]?.(inst)
    const tree = viewOf(inst)
    if (tree === undefined) return
    inst.rendered = patch(by, inst.rendered!, tree)
    inst.kept?.done()
    if (dev && shown !== fallbacks) checkShown(inst.path, [inst.rendered])
  } catch (error) {
    fail(inst, "view", Cause.die(error), undefined, from)
  } finally {
    busy--
    by.writing--
    born.length = from
    slot = outer
  }
}

/** @internal */
export const clear = (inst: Instance): void => {
  inst.rendered = patch(authorOf(inst), inst.rendered!, emptyText)
}

/** @internal */
export const close = (inst: Instance): void => {
  if (inst.closed) return
  inst.closed = true
  inst.tree.drew = true
  inst.lazy = undefined
  if (inst.parent !== undefined) inst.parent.live--
  const by = authorOf(inst)
  if (inst.rendered !== undefined && by.live > 0) release(by, inst.rendered)
  const log = inst.tree.log
  if (log !== undefined) log(inst, { _tag: "Unmounted" })
  const closers = inst.closers
  if (closers !== undefined) {
    for (let index = closers.length - 1; index >= 0; index--) {
      closers[index]!()
    }
  }
}

const released = undefined as unknown as Instance

/** @internal */
export const release = (owner: Instance, rec: Rec): void => {
  if (owner.live === 0) return
  const view = rec.v
  const kids = rec.kids
  if (view._tag === "Child") {
    if (keeperOf(view)?.release(owner, rec)) return
    if (kids === undefined) return close(rec.inst)
    if (rec.inst === owner) {
      owner.live--
      rec.inst = released
    }
  } else if (view._tag === "Element") {
    if (view.mount !== undefined) {
      owner.live--
      ;(view.mount as unknown as Attachable)["~detach"](rec)
    }
  } else if (view._tag === "Outlet") {
    if (rec.inst !== owner) return
    rec.inst = released
    owner.live--
    if (owner.placed!.get(view.name)?.rec === rec) {
      owner.placed!.delete(view.name)
    }
    owner = owner.parent!
  }
  if (kids !== undefined) {
    for (let index = kids.length - 1; index >= 0; index--) {
      release(owner, kids[index]!)
    }
  }
}

/** @internal */
export const nodeOf = (rec: Rec): any => {
  while (rec.node === undefined) {
    rec = rec.kids !== undefined
      ? rec.kids[0]!
      : rec.inst.rendered!
  }
  return rec.node
}

const lastNodeOf = (rec: Rec): any => {
  while (rec.node === undefined) {
    rec = rec.kids !== undefined
      ? rec.kids[rec.kids.length - 1]!
      : rec.inst.rendered!
  }
  return rec.node
}

/** @internal */
export const place = (
  host: Host,
  parent: unknown,
  rec: Rec,
  before: unknown
): void => {
  if (rec.node !== undefined) host.insert(parent, rec.node, before)
  else if (rec.kids === undefined) {
    place(host, parent, rec.inst.rendered!, before)
  } else {for (let index = 0; index < rec.kids.length; index++) {
      place(host, parent, rec.kids[index]!, before)
    }}
}

const remove = (inst: Instance, parent: unknown, rec: Rec): void => {
  const nodes = nodesOf(rec, [])
  release(inst, rec)
  for (const node of nodes) inst.tree.host.remove(parent, node)
}

const nodesOf = (rec: Rec, out: Array<unknown>): Array<unknown> => {
  if (rec.node !== undefined) out.push(rec.node)
  else if (rec.kids === undefined) nodesOf(rec.inst.rendered!, out)
  else {for (let index = 0; index < rec.kids.length; index++) {
      nodesOf(rec.kids[index]!, out)
    }}
  return out
}

/** @internal */
export const unplace = (host: Host, parent: unknown, rec: Rec): void => {
  for (const node of nodesOf(rec, [])) host.remove(parent, node)
}

const keeperOf = (view: View.Child<any, any>): Keeper | undefined =>
  view.alive === undefined
    ? undefined
    : (view.component as Partial<Runnable>)["~kept"]

/** @internal */
export const mountChild = (
  owner: Instance,
  rec: Rec,
  fresh?: boolean
): void => {
  const view = rec.v as View.Child<any, any>
  let component = view.component as any
  if (!fresh) {
    const keeper = keeperOf(view)
    if (keeper !== undefined) return keeper.mount(owner, rec, slot)
  }
  let env = owner.env
  if (owner === fallen) {
    while (env.ctx === undefined && env.parent !== undefined) {
      env = env.parent
    }
  }
  const at = slot
  let held: Rec | undefined
  const lazy = component["~load"] !== undefined
  if (lazy) component = component["~load"](owner, rec, at) ?? component
  if (lazy && component === view.component) {
    held = loadingIn(
      owner,
      view,
      component["~cause"](),
      (fallback) => create(owner, fallback)
    )
  } else if (FeatureId in component) {
    const ctx = env.ctx
    if (ctx === undefined) {
      if (dev) checkFallback(owner.path, view)
      held = inFallback(
        owner,
        () => create(owner, fallbackOf(owner, view, env.cause))
      )
      if (env.cause === undefined) {
        env.waiting.push(() => settle(owner, rec, at))
      }
    } else {
      const found = Context.getOrUndefined(ctx, component) as any
      if (found === undefined) {
        throw new Error(owner.path + ": nothing provides " + component.key)
      }
      component = found.component
      env = {
        ctx: Context.merge(ctx, found.context),
        cause: undefined,
        waiting: []
      }
    }
  } else if (owner.tree.host.hold?.(owner, rec, at, component)) {
    held = create(owner, emptyText)
  }
  const child = rec.inst = held === undefined
    ? new Instance(owner.tree, component, owner, rec, view.props, env)
    : owner
  owner.live++
  born.push(owner, rec)
  if (held !== undefined) rec.kids = [held]
  else if (start(child) === undefined) rec.kids = [stand(child, child.failure!)]
  else if (owner.closed) close(child)
}

/** @internal */
export const settle = (
  owner: Instance,
  rec: Rec,
  at: string | undefined
): void => {
  if (rec.inst !== owner || owner.closed) return
  const host = owner.tree.host
  const old = rec.kids![0]!
  const outer = slot
  slot = at
  try {
    if (
      owner.env.ctx === undefined &&
      FeatureId in (rec.v as View.Child<any, any>).component
    ) {
      rec.kids![0] = inFallback(
        owner,
        () =>
          patch(
            owner,
            old,
            fallbackOf(owner, rec.v as View.Child<any, any>, owner.env.cause)
          )
      )
      return
    }
    const first = nodeOf(old)
    const parentNode = host.parentOf(first)
    rec.kids = undefined
    owner.live--
    try {
      mountChild(owner, rec)
    } catch (error) {
      rec.kids = [old]
      owner.live++
      throw error
    }
    place(host, parentNode, rec, first)
    unplace(host, parentNode, old)
    release(owner, old)
  } catch (error) {
    fail(owner, "view", Cause.die(error))
  } finally {
    slot = outer
  }
}

const noContent: ReadonlyArray<View.Node<any, any>> = [emptyText]

const contentOf = (
  view: View.Outlet,
  content: unknown
): ReadonlyArray<View.Node<any, any>> => {
  if (content === undefined) return noContent
  let views = View.children([content as View.Input<any, any>])
  if (views.length === 0) return noContent
  const noText = view.noText
  if (noText !== undefined) {
    views = views.map((node) => {
      if (node._tag === "Text") throw new Error(slot + ": " + noText)
      return node._tag === "Outlet" && node.noText !== noText
        ? { _tag: "Outlet", name: node.name, noText }
        : node
    })
  }
  if (dev) checkContent(slot!, views)
  return views
}

/** @internal */
export const failLater = (inst: Instance, error: unknown): void =>
  inst.tree.schedule(() => fail(inst, "view", Cause.die(error)))

const slotOf = (receiver: Instance, name: string): unknown =>
  receiver.at === undefined
    ? undefined
    : (receiver.at.v as View.Child<any, any>).slots?.[name]

const refresh = (receiver: Instance, placed: Placed): void => {
  const rec = placed.rec
  const view = rec.v as View.Outlet
  const content = slotOf(receiver, view.name)
  if (content === placed.content) return
  placed.content = content
  const declarer = receiver.parent!
  const host = receiver.tree.host
  const olds = rec.kids!
  const after = host.nextOf(lastNodeOf(olds[olds.length - 1]!))
  const outer = slot
  const fallbacks = shown
  slot = receiver.path + "/" + slotSegment(view.name)
  try {
    let views = noContent
    try {
      views = contentOf(view, content)
    } catch (error) {
      failLater(declarer, error)
    }
    const kids = rec.kids = patchList(
      declarer,
      host.parentOf(nodeOf(olds[0]!)),
      olds,
      views,
      after
    )
    if (dev && shown !== fallbacks) {
      try {
        checkShown(slot, kids, true)
      } catch (error) {
        failLater(declarer, error)
      }
    }
  } finally {
    slot = outer
  }
}

const setAttrs = (
  host: Host,
  node: unknown,
  attrs: Readonly<Record<string, string>>
): void => {
  if (host.normalizeAttrs !== undefined) {
    attrs = host.normalizeAttrs(node, attrs)
  }
  for (const name in attrs) host.setAttr(node, name, attrs[name])
}

const setProps = (
  host: Host,
  node: unknown,
  props: Readonly<Record<string, unknown>>
): void => {
  for (const name in props) host.setProp(node, name, props[name])
}

/** @internal */
export const create = (inst: Instance, view: View.Node<any, any>): Rec => {
  const host = inst.tree.host
  switch (view._tag) {
    case "Text":
      return new Rec(view, host.createText(view.text), undefined, inst)
    case "Element": {
      if (view.owned?.length) view = owned(inst, view, view.owned)
      const node = host.createElement(view.tag)
      if (view.attrs !== View.noFields) setAttrs(host, node, view.attrs)
      const views = view.children
      let kids: Array<Rec> | undefined
      if (dev && views.length > 1) checkKeys(inst.path, views)
      if (views.length > 0) {
        kids = new Array(views.length)
        for (let index = 0; index < views.length; index++) {
          place(host, node, kids[index] = create(inst, views[index]!), null)
        }
      }
      if (view.props !== View.noFields) setProps(host, node, view.props)
      host.made?.(node, inst)
      const rec = new Rec(
        view,
        node,
        kids,
        inst,
        host.controlled !== undefined &&
          isControlled(host.controlled, view.props, kids)
      )
      if (
        view.handlers !== View.noFields || view.eventOptions !== View.noFields
      ) host.setEvents(node, rec, true)
      if (view.mount !== undefined) {
        inst.live++
        ;(view.mount as unknown as Attachable)["~attach"](rec)
      }
      return rec
    }
    case "Child": {
      const rec = new Rec(view, undefined, undefined, inst)
      mountChild(inst, rec)
      return rec
    }
    case "Outlet":
      return createOutlet(inst, view)
  }
}

const createOutlet = (inst: Instance, view: View.Outlet): Rec => {
  if (dev) checkDeclarer(inst, view)
  const declarer = inst.parent!
  const content = slotOf(inst, view.name)
  const rec = new Rec(view, undefined, undefined, inst)
  inst.live++
  ;(inst.placed ??= new Map()).set(view.name, { rec, content })
  const outer = slot
  const from = born.length
  const fallbacks = shown
  slot = inst.path + "/" + slotSegment(view.name)
  try {
    const views = contentOf(view, content)
    const kids: Array<Rec> = rec.kids = new Array(views.length)
    for (let index = 0; index < views.length; index++) {
      kids[index] = create(declarer, views[index]!)
    }
    if (dev && shown !== fallbacks) checkShown(slot, kids, true)
  } catch (error) {
    orphans(from)
    rec.kids = [create(declarer, emptyText)]
    failLater(declarer, error)
  } finally {
    slot = outer
  }
  return rec
}

/** @internal */
export const pairs = (
  old: View.Node<any, any>,
  view: View.Node<any, any>
): boolean => {
  if (old === view) return true
  switch (old._tag) {
    case "Element":
      return view._tag === "Element" && old.tag === view.tag &&
        old.elementKey === view.elementKey
    case "Text":
      return view._tag === "Text"
    case "Child":
      return view._tag === "Child" && old.component === view.component &&
        old.key === view.key
    case "Outlet":
      return view._tag === "Outlet" && old.name === view.name
  }
}

const patch = (inst: Instance, old: Rec, view: View.Node<any, any>): Rec => {
  const prev = old.v
  if (prev === view) {
    if (old.controlled) restore(inst.tree.host, old)
    return old
  }
  if (!pairs(prev, view)) return replace(inst, old, view)
  switch (view._tag) {
    case "Text":
      if ((prev as View.Text).text !== view.text) {
        inst.tree.host.setText(old.node, view.text)
      }
      old.v = view
      return old
    case "Element":
      patchElement(inst, old, prev as View.Element<any, any>, view)
      return old
    case "Child":
      return (keeperOf(view) ?? keeperOf(prev as View.Child<any, any>))
        ?.patch(inst, old, view, slot) ??
        patchChild(inst, old, view)
    case "Outlet": {
      const placed = inst.placed!.get(view.name)
      if (placed?.rec !== old) return old
      if ((prev as View.Outlet).noText !== view.noText) {
        placed.content = refreshed
      }
      old.v = view
      refresh(inst, placed)
      return old
    }
  }
}

/** @internal */
export const patchChild = (
  inst: Instance,
  old: Rec,
  view: View.Child<any, any>
): Rec => {
  const child = old.inst
  const shown = old.kids
  if (shown === undefined && inst.tree.holds?.(child, inst, view) === true) {
    return old
  }
  old.v = view
  if (shown !== undefined) {
    shown[0] = child === inst
      ? (view.component as Runnable)["~load"] === undefined
        ? inFallback(
          inst,
          () =>
            patch(
              inst,
              shown[0]!,
              fallbackOf(inst, view, inst.env.cause)
            )
        )
        : loadingIn(
          inst,
          view,
          (view.component as Runnable)["~cause"]!() ?? inst.env.cause,
          (fallback) => patch(inst, shown[0]!, fallback)
        )
      : patch(inst, shown[0]!, fallbackOf(inst, view, child.failure))
    return old
  }
  if (child.closed) return old
  const changed = !propsEqual(child.props, view.props)
  if (changed) {
    child.props = view.props
    const log = inst.tree.log
    if (log !== undefined) {
      log(child, { _tag: "PropsChanged", props: view.props })
    }
    child.component["~sync"]?.(child)
    if (child.closed) return old
  }
  if (changed || view.view !== undefined) {
    if (child === receiving) markDirty(child)
    else render(child)
  }
  const placed = child.placed
  if (placed !== undefined && !child.closed) {
    for (const entry of placed.values()) {
      refresh(child, entry)
    }
  }
  return old
}

/** @internal */
export const replace = (
  inst: Instance,
  old: Rec,
  view: View.Node<any, any>
): Rec => {
  const host = inst.tree.host
  const at = nodeOf(old)
  const parent = host.parentOf(at)
  const next = create(inst, view)
  place(host, parent, next, at)
  remove(inst, parent, old)
  return next
}

const refreshed = {}

const isControlled = (
  controlled: ReadonlySet<string>,
  props: Readonly<Record<string, unknown>>,
  kids: ReadonlyArray<Rec> | undefined
): boolean => {
  if (props !== View.noFields) {
    for (const name in props) {
      if (controlled.has(name)) return true
    }
  }
  if (kids !== undefined) {
    for (let index = 0; index < kids.length; index++) {
      if (kids[index]!.controlled) return true
    }
  }
  return false
}

const restore = (host: Host, rec: Rec): void => {
  const kids = rec.kids
  if (kids !== undefined) {
    for (let index = 0; index < kids.length; index++) {
      const kid = kids[index]!
      if (kid.controlled) restore(host, kid)
    }
  }
  const props = (rec.v as View.Element<any, any>).props
  if (props !== View.noFields) patchProps(host, rec.node, props, props)
}

const sameAttrs = (
  before: Readonly<Record<string, string>>,
  attrs: Readonly<Record<string, string>>
): boolean => {
  let count = 0
  for (const name in before) {
    if (before[name] !== attrs[name]) return false
    count++
  }
  for (const _ in attrs) count--
  return count === 0
}

const patchAttrs = (
  host: Host,
  node: unknown,
  before: Readonly<Record<string, string>>,
  attrs: Readonly<Record<string, string>>
): void => {
  if (sameAttrs(before, attrs)) return
  if (host.normalizeAttrs !== undefined) {
    before = host.normalizeAttrs(node, before)
    attrs = host.normalizeAttrs(node, attrs)
  }
  for (const name in before) {
    if (typeof attrs[name] !== "string") {
      host.setAttr(node, name, undefined, before[name])
    }
  }
  for (const name in attrs) {
    const value = attrs[name]
    const previous = before[name]
    if (previous !== value) host.setAttr(node, name, value, previous)
  }
}

const patchProps = (
  host: Host,
  node: unknown,
  was: Readonly<Record<string, unknown>>,
  props: Readonly<Record<string, unknown>>
): void => {
  const controlled = host.controlled
  for (const name in was) {
    if (!(name in props)) host.setProp(node, name, undefined)
  }
  for (const name in props) {
    if (was[name] !== props[name] || controlled?.has(name) === true) {
      host.setProp(node, name, props[name])
    }
  }
}

const patchElement = (
  inst: Instance,
  rec: Rec,
  prev: View.Element<any, any>,
  view: View.Element<any, any>
): void => {
  const host = inst.tree.host
  const node = rec.node
  const layers = view.owned?.length ? view.owned : prev.owned
  if (layers?.length) view = owned(inst, view, layers)
  rec.v = view
  if (prev.attrs !== view.attrs) patchAttrs(host, node, prev.attrs, view.attrs)
  if (
    view.handlers !== prev.handlers || view.eventOptions !== prev.eventOptions
  ) {
    host.setEvents(
      node,
      rec,
      prev.handlers === View.noFields && prev.eventOptions === View.noFields
    )
  }
  const views = view.children
  const olds = rec.kids
  if (dev && views.length > 1) checkKeys(inst.path, views)
  if (olds === undefined) {
    if (views.length > 0) {
      const kids: Array<Rec> = new Array(views.length)
      for (let index = 0; index < views.length; index++) {
        place(host, node, kids[index] = create(inst, views[index]!), null)
      }
      rec.kids = kids
    }
  } else if (views.length === 0) {
    for (let index = 0; index < olds.length; index++) {
      release(inst, olds[index]!)
    }
    if (host.clear !== undefined) host.clear(node)
    else {for (let index = 0; index < olds.length; index++) {
        unplace(host, node, olds[index]!)
      }}
    rec.kids = undefined
  } else if (views.length === 1 && olds.length === 1) {
    const old = olds[0]!
    const next = views[0]!
    if (next._tag === "Text" && old.v._tag === "Text") {
      if (old.v.text !== next.text) host.setText(old.node, next.text)
      old.v = next
    } else if (
      next._tag === "Element" && old.v !== next && pairs(old.v, next)
    ) {
      patchElement(inst, old, old.v as View.Element<any, any>, next)
    } else olds[0] = patch(inst, old, next)
  } else rec.kids = patchList(inst, node, olds, views, null, true)
  // After the children, so a select's value wins over its options'.
  if (
    prev.props !== view.props ||
    (host.controlled !== undefined && view.props !== View.noFields)
  ) {
    patchProps(host, node, prev.props, view.props)
  }
  if (host.controlled !== undefined) {
    rec.controlled = isControlled(host.controlled, view.props, rec.kids)
  }
  const mount = view.mount as unknown as Attachable | undefined
  const was = prev.mount as unknown as Attachable | undefined
  if (mount !== was) {
    if (mount === undefined) {
      inst.live--
      was!["~detach"](rec)
    } else {
      if (was === undefined) inst.live++
      mount["~attach"](rec)
    }
  }
}

const owned = (
  inst: Instance,
  view: View.Element<any, any>,
  layers: ReadonlyArray<View.Owned>
): View.Element<any, any> =>
  (layers[0]!.owner as Instance).component["~owned"]!(inst, view)

const keyOf = (view: View.Node<any, any>): unknown =>
  view._tag === "Element"
    ? view.elementKey
    : view._tag === "Child"
    ? (view.key === "" ? view.component : view.key)
    : undefined

const patchList = (
  inst: Instance,
  parent: unknown,
  olds: Array<Rec>,
  views: ReadonlyArray<View.Node<any, any>>,
  after: unknown,
  whole?: boolean
): Array<Rec> => {
  const host = inst.tree.host
  let start = 0
  let oldEnd = olds.length - 1
  let end = views.length - 1
  let out: Array<Rec> = oldEnd === end ? olds : new Array(views.length)
  while (
    start <= oldEnd && start <= end && pairs(olds[start]!.v, views[start]!)
  ) {
    out[start] = patch(inst, olds[start]!, views[start]!)
    start++
  }
  if (out === olds) {
    if (start > end) return out
    out = new Array(views.length)
    for (let index = 0; index < start; index++) out[index] = olds[index]!
  }
  while (
    start <= oldEnd && start <= end &&
    (olds.length === views.length || keyOf(views[end]!) !== undefined) &&
    pairs(olds[oldEnd]!.v, views[end]!)
  ) {
    oldEnd--
    end--
  }
  const count = end - start + 1
  const sources = count > 0 && start <= oldEnd
    ? new Int32Array(count)
    : undefined
  let byKey: Map<unknown, number> | undefined
  let same: Int32Array | undefined
  for (let index = sources === undefined ? -1 : end; index >= start; index--) {
    const key = keyOf(views[index]!)
    if (key === undefined) continue
    const next = (byKey ??= new Map()).get(key)
    if (next !== undefined) {
      ;(same ??= new Int32Array(count))[index - start] = next + 1
    }
    byKey.set(key, index)
  }
  let moved = false
  let last = 0
  let gone: Array<Rec> | undefined
  for (let index = start; index <= oldEnd; index++) {
    const old = olds[index]!
    const key = keyOf(old.v)
    let to = key !== undefined
      ? byKey?.get(key)
      : index <= end
      ? index
      : undefined
    while (
      to !== undefined &&
      (sources![to - start] !== 0 || !pairs(old.v, views[to]!))
    ) {
      const next = key === undefined || same === undefined
        ? 0
        : same[to - start]!
      to = next === 0 ? undefined : next - 1
    }
    if (to !== undefined) {
      sources![to - start] = index + 1
      if (to < last) moved = true
      else last = to
    } else (gone ??= []).push(old)
  }
  for (let index = start; index <= end; index++) {
    const source = sources === undefined ? 0 : sources[index - start]!
    out[index] = source === 0
      ? create(inst, views[index]!)
      : patch(inst, olds[source - 1]!, views[index]!)
  }
  if (gone !== undefined) {
    if (whole && gone.length === olds.length && host.clear !== undefined) {
      for (let index = 0; index < olds.length; index++) {
        release(inst, olds[index]!)
      }
      host.clear(parent)
    } else for (const old of gone) remove(inst, parent, old)
  }
  for (let index = end + 1; index < views.length; index++) {
    out[index] = patch(
      inst,
      olds[index + olds.length - views.length]!,
      views[index]!
    )
  }
  if (!moved) {
    for (let index = start, from = start; index <= end + 1; index++) {
      if (
        index > end || (sources !== undefined && sources[index - start] !== 0)
      ) {
        const ref = index < views.length ? nodeOf(out[index]!) : after
        while (from < index) place(host, parent, out[from++]!, ref)
        from = index + 1
      }
    }
    return out
  }
  const stay = increasing(sources!)
  let at = stay.length - 1
  let ref = end + 1 < views.length ? nodeOf(out[end + 1]!) : after
  for (let offset = count - 1; offset >= 0; offset--) {
    const index = start + offset
    if (sources![offset] !== 0 && at >= 0 && stay[at] === offset) at--
    else place(host, parent, out[index]!, ref)
    ref = nodeOf(out[index]!)
  }
  return out
}

const increasing = (sources: Int32Array): Array<number> => {
  const before = new Int32Array(sources.length)
  const run: Array<number> = []
  for (let index = 0; index < sources.length; index++) {
    const value = sources[index]!
    if (value === 0) continue
    let low = 0
    let high = run.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (sources[run[mid]!]! < value) low = mid + 1
      else high = mid
    }
    before[index] = low > 0 ? run[low - 1]! : -1
    run[low] = index
  }
  for (let index = run.length - 1, at = run[index]; index >= 0; index--) {
    run[index] = at!
    at = before[at!]
  }
  return run
}

/** @internal */
export interface Root {
  readonly instance: Instance
  readonly send: (message: unknown, source?: unknown) => void
  readonly close: () => void
}

/** @internal */
export interface Options {
  readonly report: Tree["report"]
  readonly context?: Context.Context<any> | undefined
  readonly log?: Recorder | undefined
  readonly fallback?: Tree["fallback"]
  readonly init?: Tree["init"] | undefined
  readonly schedule?: Tree["schedule"] | undefined
  readonly follow?: Tree["follow"] | undefined
}

const initOf = (inst: Instance): Next => inst.component.init(inst.props)

/** @internal */
export const mount = (
  component: Runnable,
  props: unknown,
  container: unknown,
  host: Host,
  options: Options
): Root => {
  const tree: Tree = {
    ...options,
    host,
    init: options.init ?? initOf,
    // Wrapped: called as the tree's method, the browser's `queueMicrotask` throws "Illegal invocation".
    schedule: options.schedule ?? ((task) => queueMicrotask(task)),
    dirty: [],
    scheduled: true,
    flushing: true,
    closed: false
  }
  tree.transitions = host.transitions?.(tree)
  const ctx: Context.Context<any> = options.context ??
    (Context.empty() as Context.Context<any>)
  const env: Env = { ctx, cause: undefined, waiting: [] }
  const instance = new Instance(
    tree,
    component,
    undefined,
    undefined,
    props,
    env
  )
  if (start(instance) === undefined) {
    instance.rendered = stand(instance, instance.failure!)
  }
  place(host, container, instance.rendered!, null)
  flush(tree)
  return {
    instance,
    send: (message, source) => send(instance, message, source),
    close: () => {
      if (tree.closed) return
      tree.closed = true
      close(instance)
      unplace(host, container, instance.rendered!)
      host.commit?.()
    }
  }
}
