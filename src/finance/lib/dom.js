/** "⌘" on Apple devices, "Ctrl" elsewhere, for shortcut hints. */
export const MOD_KEY =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '')
    ? '⌘'
    : 'Ctrl'

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let locks = 0
let saved = null

/** Stops the page behind overlays from scrolling. Returns the matching unlock. */
export function lockScroll() {
  const root = document.documentElement
  if (locks === 0) {
    const gap = window.innerWidth - root.clientWidth
    saved = { overflow: root.style.overflow, paddingRight: root.style.paddingRight }
    root.style.overflow = 'hidden'
    if (gap > 0) root.style.paddingRight = `${gap}px`
  }
  locks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    locks -= 1
    if (locks === 0 && saved) {
      root.style.overflow = saved.overflow
      root.style.paddingRight = saved.paddingRight
      saved = null
    }
  }
}

export function focusables(container) {
  if (!container) return []
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    (el) => !el.closest('[inert]') && el.getClientRects().length > 0,
  )
}

/** Keeps Tab / Shift+Tab cycling inside `container`. */
export function trapTab(event, container) {
  if (event.key !== 'Tab') return
  const items = focusables(container)
  if (!items.length) {
    event.preventDefault()
    container.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Scrolls the element with `id` into view, replays its highlight and moves focus to it. */
export function spotlight(id) {
  const target = document.getElementById(id)
  if (!target) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  target.classList.remove('is-spotlit')
  void target.offsetWidth
  target.classList.add('is-spotlit')
  target.focus({ preventScroll: true })
}

/** Returns focus to `element`, unless something outside `container` has already taken it. */
export function restoreFocus(element, container) {
  const current = document.activeElement
  if (container && current && current !== document.body && !container.contains(current)) return
  if (element && element.isConnected && typeof element.focus === 'function') {
    element.focus({ preventScroll: true })
  }
}
