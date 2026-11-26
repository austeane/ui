/**
 * Unhandled same-window GET submissions the host prevented only because it
 * owns the form, so the browser Router can still route them, plus the
 * effective method and target checks the host and Router share.
 *
 * @internal
 */

/** @internal */
export const ownedUnhandled = new WeakSet<Event>()

/** @internal */
export const methodOf = (
  form: HTMLFormElement,
  submitter: Element | null | undefined
): string =>
  (
    submitter?.getAttribute("formmethod") ??
      form.getAttribute("method") ??
      "get"
  ).toLowerCase()

/** @internal */
export const isSameWindow = (
  form: HTMLFormElement,
  submitter: Element | null | undefined
): boolean => {
  const target = submitter?.getAttribute("formtarget") ??
    form.getAttribute("target")
  return target === null || target === "" || target.toLowerCase() === "_self"
}
