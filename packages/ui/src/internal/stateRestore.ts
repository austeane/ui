import type * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import type * as SchemaIssue from "effect/SchemaIssue"
import type * as Component from "../Component.ts"
import type * as View from "../View.ts"
import { runCodec } from "./codecRun.ts"
import type * as keptRun from "./keptRun.ts"
import * as Kernel from "./kernel.ts"
import * as lazy from "./lazy.ts"
import { segmentOf } from "./paths.ts"
import type * as componentQueries from "./queries.ts"
import * as queryCore from "./queryCore.ts"
import type * as services from "./services.ts"
import {
  type Decoded,
  encodePage,
  reportedOf,
  stateCodecOf
} from "./stateCodec.ts"

/** @internal */
export type Saved = Record<string, unknown>

interface Held {
  readonly owner: Kernel.Instance
  readonly rec: Kernel.Rec
  readonly path: string
  readonly saved: Saved
  readonly notes: Saved | undefined
}

/** @internal */
export interface Options {
  readonly rootPath: string
  readonly entry: () => Saved | undefined
  readonly restore: (path: string) => services.PageState | undefined
  readonly onEncodeFailure?:
    | ((inst: Kernel.Instance, cause: Cause.Cause<SchemaIssue.Issue>) => void)
    | undefined
  readonly onAsyncEncode?:
    | ((inst: Kernel.Instance) => boolean)
    | undefined
  readonly onRestoreThrow?:
    | ((inst: Kernel.Instance, error: unknown) => void)
    | undefined
  readonly onDecodeFailure?:
    | ((inst: Kernel.Instance, cause: Cause.Cause<SchemaIssue.Issue>) => void)
    | undefined
}

/** @internal */
export interface StateRestore {
  readonly snapshot: (inst: Kernel.Instance, out: Saved) => void
  readonly init: (
    inst: Kernel.Instance,
    first: Kernel.Next,
    adopted?: boolean
  ) => Kernel.Next
  readonly restored: (inst: Kernel.Instance) => boolean
  readonly hold: NonNullable<Kernel.Host["hold"]>
  readonly holding: () => boolean
  readonly heldFor: (
    owner: Kernel.Instance,
    rec: Kernel.Rec,
    path: string,
    found: services.PageState
  ) => () => void
  readonly pop: () => void
  readonly clear: () => void
  readonly watch: (tree: Kernel.Instance["tree"]) => void
}

/** @internal */
export const childrenOf = (
  rec: Kernel.Rec | undefined,
  out: Array<Kernel.Instance> = []
): Array<Kernel.Instance> => {
  if (rec === undefined) return out
  const kids = rec.kids
  if (kids !== undefined) { for (const kid of kids) childrenOf(kid, out) }
  else if (rec.v._tag === "Child" && !rec.inst.closed) out.push(rec.inst)
  return out
}

/** @internal */
export const pageAt = (
  from: Saved,
  path: string
): services.PageState | undefined =>
  from[path] === undefined ? undefined : {
    state: from[path],
    reported: (from["~reported"] as Saved | undefined)?.[path]
  }

/** @internal */
export const restoreQueries = (
  inst: Kernel.Instance,
  results: componentQueries.Results | undefined
): componentQueries.Results | undefined => {
  const bound = queryCore.boundOf(inst.component as unknown as Component.Any)
  if (bound === undefined || results === undefined) return results
  const loaded = queryCore.loaded!
  const cache = loaded.run.cacheOf(inst)
  const out: Record<string, unknown> = {}
  for (const entry of bound.entries) {
    const snapshot = results[entry.name]
    if (entry.keyed) {
      const map = loaded.snapshotMapData(snapshot)
      const kept: Array<unknown> = []
      for (const one of map?.entries.values() ?? []) {
        if (loaded.snapshotData(one)!.patched) continue
        cache.seed(one as never)
        kept.push(one)
      }
      out[entry.name] = map !== undefined && kept.length === map.entries.size
        ? snapshot
        : bound.snapshotMany(entry, kept as never)
      continue
    }
    const data = loaded.snapshotData(snapshot)
    if (data !== undefined && !data.patched) {
      cache.seed(snapshot as never)
      out[entry.name] = snapshot
    } else out[entry.name] = bound.empty[entry.name]
  }
  return out
}

/** @internal */
export const make = (options: Options): StateRestore => {
  const {
    entry,
    onAsyncEncode,
    onDecodeFailure,
    onEncodeFailure,
    onRestoreThrow,
    restore: restoreAt,
    rootPath
  } = options
  const restored = new WeakSet<Kernel.Instance>()
  const write = (
    inst: Kernel.Instance,
    out: Saved,
    exit: Exit.Exit<services.PageState, SchemaIssue.Issue>
  ) => {
    if (Exit.isSuccess(exit)) {
      out[inst.path] = exit.value.state
      if (exit.value.reported !== undefined) {
        ;((out["~reported"] ??= {}) as Saved)[inst.path] = exit.value.reported
      }
      return
    }
    onEncodeFailure?.(inst, exit.cause)
  }
  const settle = (
    inst: Kernel.Instance,
    out: Saved,
    encoded:
      | Exit.Exit<services.PageState, SchemaIssue.Issue>
      | Fiber.Fiber<services.PageState, SchemaIssue.Issue>
  ) => {
    if (Exit.isExit(encoded)) return write(inst, out, encoded)
    if (onAsyncEncode?.(inst) !== false) {
      encoded.addObserver((exit) => write(inst, out, exit))
    }
  }
  const save = (inst: Kernel.Instance, out: Saved) => {
    const component = inst.component as unknown as Component.Any
    const restore = component.definition.restore
    if (restore === false) return
    let model = inst.model
    if (restore !== undefined) {
      try {
        model = restore(inst.model, inst.props)
      } catch (error) {
        onRestoreThrow?.(inst, error)
        return
      }
    }
    settle(
      inst,
      out,
      runCodec(encodePage(component, model, inst.results, inst.owning))
    )
  }
  const keptIn = (out: Saved, top: Saved, author: string): Saved =>
    (((out[out === top ? "~kept" + rootPath : "~kept"] ??= {}) as Saved)[
      author
    ] ??= {}) as Saved
  const visit = (inst: Kernel.Instance, out: Saved, top: Saved) => {
    queryCore.loaded?.run.drain(inst)
    if (inst.closed || inst.failure !== undefined) return
    save(inst, out)
    if (inst.env.ctx === undefined && inst.env.cause === undefined) return
    for (const held of waitingFor.values()) {
      if (held.owner === inst) keepHeld(held, out, top)
    }
    for (const child of childrenOf(inst.rendered)) {
      if ((child.at!.v as View.Child<any, any>).alive === undefined) {
        visit(child, out, top)
      }
    }
    const table = inst.kept as keptRun.Table | undefined
    const unclaimed = waits.get(inst)
    if (table === undefined && unclaimed === undefined) return
    const notes = keptIn(out, top, inst.path)
    for (const path in unclaimed) notes[path] = unclaimed[path]
    if (table === undefined) return
    for (const entry of table.children()) {
      visit(entry.inst, notes[entry.inst.path] = {}, top)
    }
  }
  let popped: Saved | undefined
  const pop = () => {
    taken.clear()
    const left = entry()
    popped = left && { ...left["~kept" + rootPath] as Saved | undefined }
  }
  const waits = new WeakMap<Kernel.Instance, Saved>()
  const supplies = new WeakMap<Kernel.Instance, Saved>()
  const claim = (inst: Kernel.Instance, from: Saved | undefined) => {
    const notes = from?.[inst.path] as Saved | undefined
    if (notes === undefined) return
    delete from![inst.path]
    waits.set(inst, { ...notes })
  }
  const supplyOf = (inst: Kernel.Instance): Saved | undefined => {
    if ((inst.at?.v as View.Child<any, any> | undefined)?.alive !== undefined) {
      const author = waits.get(inst.parent!)
      const own = author?.[inst.path] as Saved | undefined
      if (own !== undefined) {
        delete author![inst.path]
        supplies.set(inst, own)
        return own
      }
    }
    for (let at = inst.parent; at !== undefined; at = at.parent) {
      const own = supplies.get(at)
      if (own !== undefined) return own
    }
    return undefined
  }
  const waitingFor = new Map<Kernel.Rec, Held>()
  const keepHeld = (held: Held, out: Saved, top: Saved) => {
    const { path, saved } = held
    const view = held.rec.v as View.Child<any, any>
    const to = view.alive === undefined
      ? out
      : (keptIn(out, top, held.owner.path)[path] = {}) as Saved
    const reported = saved["~reported"] as Saved | undefined
    for (const key in saved) {
      if (key === path || key[0] === "~") continue
      to[key] = saved[key]
      if (reported?.[key] !== undefined) {
        ;((to["~reported"] ??= {}) as Saved)[key] = reported[key]
      }
    }
    for (const author in held.notes) {
      Object.assign(keptIn(to, top, author), held.notes[author])
    }
    const component = lazy.componentOf(view.component)
    if (component === undefined) return
    const restore = component.definition.restore
    const state = saved[path]
    if (state === undefined || restore === false) return
    const found = { state, reported: reported?.[path] }
    const inst = { path, component } as unknown as Kernel.Instance
    if (restore === undefined) return write(inst, to, Exit.succeed(found))
    const codec = stateCodecOf(component)
    settle(
      inst,
      to,
      runCodec(
        Effect.flatMapEager(codec.decode(state), (decoded) =>
          Effect.mapEager(
            codec.encode(restore(decoded.model, view.props), decoded.results),
            (state) => ({ state, reported: found.reported })
          ))
      ) as never
    )
  }
  const heldFor: StateRestore["heldFor"] = (owner, rec, path, found) => {
    waitingFor.set(rec, {
      owner,
      rec,
      path,
      saved: { [path]: found.state, "~reported": { [path]: found.reported } },
      notes: undefined
    })
    return () => waitingFor.delete(rec)
  }
  const taken = new Map<
    string,
    readonly [services.PageState, Exit.Exit<Decoded, SchemaIssue.Issue>]
  >()
  const hold: StateRestore["hold"] = (owner, rec, at) => {
    const view = rec.v as View.Child<any, any>
    const component = lazy.componentOf(view.component)
    if (component === undefined || component.definition?.restore === false) {
      return false
    }
    const path = (view.alive === undefined && at || owner.path) + "/" +
      segmentOf(view.component, view.key)
    let own: Saved | undefined
    if (view.alive !== undefined) own = waits.get(owner)?.[path] as Saved
    for (
      let up: Kernel.Instance | undefined = owner;
      !own && up;
      up = up.parent
    ) {
      own = supplies.get(up)
    }
    const found = own === undefined ? restoreAt(path) : pageAt(own, path)
    if (found === undefined) return false
    const decoded = runCodec(stateCodecOf(component).decode(found.state))
    if (Exit.isExit(decoded)) {
      taken.set(path, [found, decoded])
      return false
    }
    const current = own ?? entry()
    const saved: Saved = { [path]: found.state }
    for (const key in current) {
      if (key.startsWith(path + "/")) saved[key] = current[key]
    }
    saved["~reported"] = {
      ...current?.["~reported"] as Saved | undefined,
      [path]: found.reported
    }
    const kept = own === undefined ? popped : own["~kept"] as Saved | undefined
    const notes: Saved = {}
    for (const author in kept) {
      if (author === path || author.startsWith(path + "/")) {
        notes[author] = kept[author]
      }
    }
    waitingFor.set(rec, { owner, rec, path, saved, notes })
    decoded.addObserver((exit) => {
      const tree = owner.tree
      tree.schedule(() => {
        waitingFor.delete(rec)
        taken.set(path, [found, exit])
        Kernel.settle(owner, rec, at)
        taken.delete(path)
        Kernel.flush(tree)
      })
    })
    return true
  }
  pop()
  return {
    snapshot: (inst, out) => visit(inst, out, out),
    init: (inst, first, adopted) => {
      const component = inst.component as unknown as Component.Any
      const own = supplyOf(inst)
      claim(inst, own === undefined ? popped : own["~kept"] as Saved)
      const held = taken.get(inst.path)
      taken.delete(inst.path)
      if (adopted === true || component.definition.restore === false) {
        return first
      }
      const found = held !== undefined
        ? held[0]
        : own === undefined
        ? restoreAt(inst.path)
        : pageAt(own, inst.path)
      if (found === undefined) return first
      const exit = held?.[1] ?? Effect.runSyncExit(
        stateCodecOf(component).decode(found.state)
      )
      if (Exit.isFailure(exit)) {
        onDecodeFailure?.(inst, exit.cause)
        return first
      }
      restored.add(inst)
      inst.results = restoreQueries(inst, exit.value.results)
      inst.owning = reportedOf(component, found.reported, false)
      return {
        model: exit.value.model,
        commands: first.commands,
        events: [],
        lists: first.lists,
        sends: first.sends
      }
    },
    restored: (inst) => restored.has(inst),
    hold,
    holding: () => waitingFor.size > 0,
    heldFor,
    pop,
    clear: () => {
      popped = undefined
      taken.clear()
    },
    watch: (tree) => {
      const ended = tree.ended
      tree.ended = (author, path) => {
        ended?.(author, path)
        delete waits.get(author)?.[path]
      }
    }
  }
}
