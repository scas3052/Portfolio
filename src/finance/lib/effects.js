// Imperative full-screen transitions built on the Web Animations API, so they
// can outlive React renders (theme swap) and page unloads (leaving Gullak).

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const canAnimate = () => typeof document.body.animate === 'function' && !prefersReducedMotion()

let blindsRunning = false

/** Venetian blinds close in `color`, `onCovered` swaps the theme, then they open again. */
export function runBlinds(color, onCovered) {
  if (blindsRunning) return Promise.resolve(false)
  if (!canAnimate()) {
    onCovered()
    return Promise.resolve(true)
  }
  blindsRunning = true
  const host = document.createElement('div')
  host.className = 'g-blinds'
  host.setAttribute('aria-hidden', 'true')
  const slats = Array.from({ length: 7 }, () => {
    const slat = document.createElement('span')
    slat.style.background = color
    host.append(slat)
    return slat
  })
  document.body.append(host)

  const easing = 'cubic-bezier(0.7, 0, 0.3, 1)'
  const closing = slats.map((slat, i) => {
    slat.style.transformOrigin = 'top'
    return slat.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.02)' }], {
      duration: 300,
      delay: i * 35,
      easing,
      fill: 'both',
    })
  })

  return Promise.allSettled(closing.map((a) => a.finished))
    .then(() => {
      onCovered()
      const opening = slats.map((slat, i) => {
        slat.style.transformOrigin = 'bottom'
        return slat.animate([{ transform: 'scaleY(1.02)' }, { transform: 'scaleY(0)' }], {
          duration: 320,
          delay: 70 + i * 35,
          easing,
          fill: 'both',
        })
      })
      return Promise.allSettled(opening.map((a) => a.finished))
    })
    .then(() => true)
    .finally(() => {
      host.remove()
      blindsRunning = false
    })
}

/** Drops a curtain from the top in the destination's colour, then navigates. */
export function curtainNavigate(href, color) {
  if (!canAnimate()) {
    window.location.href = href
    return
  }
  const curtain = document.createElement('div')
  curtain.className = 'g-curtain'
  curtain.setAttribute('aria-hidden', 'true')
  curtain.style.background = color
  document.body.append(curtain)
  const go = () => {
    window.location.href = href
  }
  curtain
    .animate([{ transform: 'translateY(-101%)' }, { transform: 'translateY(0)' }], {
      duration: 520,
      easing: 'cubic-bezier(0.76, 0, 0.24, 1)',
      fill: 'forwards',
    })
    .finished.then(go, go)
  // Coming back with the browser's back button restores this page from cache.
  window.addEventListener(
    'pageshow',
    (event) => {
      if (event.persisted) curtain.remove()
    },
    { once: true },
  )
}
