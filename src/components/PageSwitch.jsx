import { LuArrowUpRight, LuWallet } from 'react-icons/lu'
import './PageSwitch.css'

// Gullak's page colours, so the curtain matches the page it lands on.
const GULLAK_BG = { paper: '#f2eee3', ink: '#121212' }

function gullakBackground() {
  try {
    return localStorage.getItem('gullak:theme') === 'ink' ? GULLAK_BG.ink : GULLAK_BG.paper
  } catch {
    return GULLAK_BG.paper
  }
}

function plainClick(event) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/** Navbar switch to Gullak: a sheet of Gullak's paper rises over the portfolio, then the page changes. */
export default function PageSwitch() {
  const onClick = (event) => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!plainClick(event) || reduced || typeof document.body.animate !== 'function') return
    event.preventDefault()

    const href = event.currentTarget.href
    const curtain = document.createElement('div')
    curtain.className = 'page-curtain'
    curtain.setAttribute('aria-hidden', 'true')
    curtain.style.background = gullakBackground()
    document.body.append(curtain)

    const go = () => window.location.assign(href)
    curtain
      .animate([{ transform: 'translateY(101%)' }, { transform: 'translateY(0)' }], {
        duration: 520,
        easing: 'cubic-bezier(0.76, 0, 0.24, 1)',
        fill: 'forwards',
      })
      .finished.then(go, go)

    // The back button restores this page from the cache with the curtain still down.
    window.addEventListener(
      'pageshow',
      (pageEvent) => {
        if (pageEvent.persisted) curtain.remove()
      },
      { once: true },
    )
  }

  return (
    <a className="page-switch" href="finance/" onClick={onClick} aria-label="Open Gullak, my personal finance book" title="Personal finance">
      <span className="page-switch__knob" aria-hidden="true">
        <LuWallet />
      </span>
      <span className="page-switch__label" aria-hidden="true">
        Finance
      </span>
      <LuArrowUpRight className="page-switch__arrow" aria-hidden="true" />
    </a>
  )
}
