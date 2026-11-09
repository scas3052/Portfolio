import { navLinks, profile, socials } from '../data/portfolio'
import Reveal from './Reveal'
import './Footer.css'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <Reveal className="footer__top" y={20}>
          <div className="footer__brand">
            <a href="#home" className="footer__logo" aria-label={`${profile.name} — back to top`}>
              <span className="footer__monogram" aria-hidden="true">
                {profile.initials}
              </span>
              <span aria-hidden="true">
                {profile.lastName}
                <span className="footer__dot">.</span>
              </span>
            </a>
            <p className="footer__tagline">
              Software engineer building full-stack Angular + .NET apps on Azure — and GenAI assistants that make
              complex work simple.
            </p>
          </div>

          <nav className="footer__nav" aria-label="Footer">
            <ul>
              {navLinks.map(({ id, label }) => (
                <li key={id}>
                  <a href={`#${id}`}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <ul className="footer__socials">
            {socials.map(({ label, href, icon: Icon }) => (
              <li key={label}>
                <a
                  className="icon-btn"
                  href={href}
                  aria-label={label}
                  title={label}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noreferrer' : undefined}
                >
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
        </Reveal>

        <div className="footer__bottom">
          <p>
            © {YEAR} {profile.name}. All rights reserved.
          </p>
          <p className="mono">
            Built with <span className="footer__heart">React</span> &amp; Vite
          </p>
        </div>
      </div>
    </footer>
  )
}
