/** @internal */
import * as Cause from "effect/Cause"
import * as Predicate from "effect/Predicate"
import type * as Component from "../Component.ts"
import * as child from "./child.ts"
import * as Kernel from "./kernel.ts"

/** @internal */
export const TypeId: Component.LazyTypeId = "~@effect/ui/Component/Lazy"

/** @internal */
export type State =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Loading"; readonly promise: Promise<void> }
  | { readonly _tag: "Loaded"; readonly component: Component.Any }
  | { readonly _tag: "Failed"; readonly error: unknown }

interface Lazy extends Component.Lazy.Any {
  state: State
  readonly listeners: Set<() => void>
}

/** @internal */
export const isLazy = (u: unknown): u is Component.Lazy.Any =>
  Predicate.hasProperty(u, TypeId)

/** @internal */
export const stateOf = (lazy: Component.Lazy.Any): State => (lazy as Lazy).state

/** @internal */
export const componentOf = (component: unknown): Component.Any | undefined => {
  if (isLazy(component)) {
    const state = stateOf(component)
    return state._tag === "Loaded" ? state.component : undefined
  }
  return component as Component.Any
}

/** @internal */
export const watch = (
  lazy: Component.Lazy.Any,
  listener: () => void
): () => void => {
  const listeners = (lazy as Lazy).listeners
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const ComponentTypeId: Component.TypeId = "~@effect/ui/Component"

const isRenderable = (u: unknown): u is Component.Any =>
  Predicate.hasProperty(u, ComponentTypeId)

const watched = new WeakMap<Kernel.Rec, () => void>()

function loaded(
  this: Lazy,
  owner: Kernel.Instance,
  rec: Kernel.Rec,
  at: string | undefined
): Kernel.Runnable | undefined {
  const state = this.state
  if (state._tag === "Loaded") return state.component as any
  if (watched.has(rec) || owner.tree.host.inert) return undefined
  const unwatch = watch(this, () => {
    const loaded = this.state._tag === "Loaded"
    if (rec.inst !== owner || owner.closed || loaded) {
      unwatch()
      watched.delete(rec)
    }
    if (rec.inst !== owner || owner.closed) return
    Kernel.settle(owner, rec, at)
    Kernel.wake(owner.tree)
  })
  watched.set(rec, unwatch)
  if (state._tag !== "Loading") this.preload()
  return undefined
}

/** @internal */
export const unwatch = (rec: Kernel.Rec): void => {
  watched.get(rec)?.()
  watched.delete(rec)
}

function failure(this: Lazy): Cause.Cause<unknown> | undefined {
  const state = this.state
  return state._tag === "Failed" ? Cause.die(state.error) : undefined
}

const variance = {
  _Props: (_: never) => _,
  _Events: (_: never) => _,
  _R: (_: never) => _,
  _Sl: (_: never) => _
}

/** @internal */
export const make = (
  name: string,
  load: () => Promise<Component.Any>,
  kept: Kernel.Keeper
): Component.Lazy.Any => {
  const preload = (): Promise<void> => {
    const state = self.state
    if (state._tag === "Loaded") return Promise.resolve()
    if (state._tag === "Loading") return state.promise
    const settle = (state: State) => {
      self.state = state
      for (const listener of self.listeners) listener()
    }
    const promise = new Promise<unknown>((resolve) => resolve(load())).then(
      (component) =>
        settle(
          isRenderable(component)
            ? { _tag: "Loaded", component }
            : {
              _tag: "Failed",
              error: new Error(
                `Component.lazy: "${name}" loaded no component that can be called`
              )
            }
        ),
      (error) => settle({ _tag: "Failed", error })
    )
    self.state = { _tag: "Loading", promise }
    return promise
  }
  const call = (h: any, options: child.Options) =>
    child.make(self, options, h["~alive"])
  const self: Lazy = Object.assign(call, {
    [TypeId]: { ...variance, name },
    state: { _tag: "Idle" } as State,
    listeners: new Set(),
    preload,
    "~load": loaded,
    "~cause": failure,
    "~kept": kept
  }) as any
  return self
}
