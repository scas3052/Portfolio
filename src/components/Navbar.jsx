import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { LuFileText, LuMenu, LuMoon, LuSun, LuX } from 'react-icons/lu'
import { FINANCE_ENABLED } from '../config'
import { navLinks, profile, resumeUrl, socials } from '../data/portfolio'
import { useActiveSection } from '../hooks/useActiveSection'
import { EASE } from '../utils/motion'
import PageSwitch from './PageSwitch'
import './Navbar.css'

const SECTION_IDS = ['home', ...navLinks.map((link) => link.id)]

export default function Navbar({ theme, onToggleTheme }) {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 12)
  const [open, setOpen] = useState(false)
  const active = useActiveSection(SECTION_IDS)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12))

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const desktop = window.matchMedia('(min-width: 960px)')
    const onBreakpoint = (event) => {
      if (event.matches) setOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    desktop.addEventListener('change', onBreakpoint)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [open])

  const close = () => setOpen(false)
  const isDark = theme === 'dark'

  return (
    <header className={`navbar${scrolled || open ? ' navbar--scrolled' : ''}`}>
      <motion.nav
        className="navbar__inner container"
        aria-label="Primary"
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
      >
        <a href="#home" className="navbar__logo" onClick={close} aria-label={`${profile.name} — back to top`}>
          <span className="navbar__monogram">{profile.initials}</span>
          <span className="navbar__brand">
            {profile.lastName}
            <span className="navbar__brand-dot">.</span>
          </span>
        </a>

        <ul className="navbar__links">
          {navLinks.map((link) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                className={`navbar__link${active === link.id ? ' navbar__link--active' : ''}`}
                aria-current={active === link.id ? 'true' : undefined}
              >
                {active === link.id && (
                  <motion.span
                    layoutId="nav-pill"
                    className="navbar__pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="navbar__link-text">{link.label}</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="navbar__actions">
          {FINANCE_ENABLED && <PageSwitch />}

          <button
            type="button"
            className="icon-btn navbar__theme"
            onClick={onToggleTheme}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                className="navbar__theme-icon"
                initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                {isDark ? <LuSun /> : <LuMoon />}
              </motion.span>
            </AnimatePresence>
          </button>

          <a className="btn btn--ghost btn--sm navbar__resume" href={resumeUrl} target="_blank" rel="noreferrer">
            <LuFileText /> Résumé
          </a>

          <button
            type="button"
            className="icon-btn navbar__toggle"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <LuX /> : <LuMenu />}
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            className="mobile-menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            <ul className="mobile-menu__links">
              {navLinks.map((link, i) => (
                <motion.li
                  key={link.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.05, duration: 0.3 }}
                >
                  <a
                    href={`#${link.id}`}
                    onClick={close}
                    className={`mobile-menu__link${active === link.id ? ' mobile-menu__link--active' : ''}`}
                  >
                    <span className="mobile-menu__index">0{i + 1}</span>
                    {link.label}
                  </a>
                </motion.li>
              ))}
            </ul>
            <div className="mobile-menu__footer">
              <a className="btn btn--primary" href={resumeUrl} target="_blank" rel="noreferrer" onClick={close}>
                <LuFileText /> View résumé
              </a>
              <div className="mobile-menu__socials">
                {socials.map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    className="icon-btn"
                    aria-label={label}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel="noreferrer"
                  >
                    <Icon />
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
