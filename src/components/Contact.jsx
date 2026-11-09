import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FaGithub, FaLinkedinIn } from 'react-icons/fa6'
import { LuArrowUpRight, LuCheck, LuCopy, LuMail, LuMapPin, LuPhone, LuSend } from 'react-icons/lu'
import { profile, socials } from '../data/portfolio'
import { trackSpotlight } from '../utils/spotlight'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import './Contact.css'

const handleFor = (label) => socials.find((social) => social.label === label)?.handle

const METHODS = [
  { label: 'Email', value: profile.email, href: `mailto:${profile.email}`, icon: LuMail, copy: true },
  { label: 'Phone', value: profile.phone, href: profile.phoneHref, icon: LuPhone },
  { label: 'LinkedIn', value: handleFor('LinkedIn'), href: profile.linkedin, icon: FaLinkedinIn, external: true },
  { label: 'GitHub', value: handleFor('GitHub'), href: profile.github, icon: FaGithub, external: true },
  { label: 'Location', value: profile.location, icon: LuMapPin },
]

export default function Contact() {
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const timer = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(profile.email)
    } catch {
      window.location.href = `mailto:${profile.email}`
      return
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2200)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = data.get('name').trim()
    const from = data.get('email').trim()
    const subject = data.get('subject').trim() || `Hello from ${name}`
    const body = `${data.get('message').trim()}\n\n— ${name} (${from})`
    window.location.href = `mailto:${profile.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  return (
    <section id="contact" className="section contact">
      <div className="container">
        <SectionHeading
          index="06"
          eyebrow="Contact"
          title={
            <>
              Let&apos;s build something <span className="gradient-text">together</span>
            </>
          }
          subtitle="Have an opportunity, a project idea or just want to say hi? My inbox is always open — I'll get back to you as soon as I can."
        />

        <div className="contact__grid">
          <ul className="contact__methods">
            {METHODS.map(({ label, value, href, icon: Icon, external, copy }, i) => {
              const content = (
                <>
                  <span className="contact__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="contact__text">
                    <span className="contact__label">{label}</span>
                    <span className="contact__value">{value}</span>
                  </span>
                </>
              )

              return (
                <Reveal as="li" key={label} delay={i * 0.06}>
                  <div className="card contact__method" onPointerMove={trackSpotlight}>
                    {href ? (
                      <a
                        className="contact__link"
                        href={href}
                        target={external ? '_blank' : undefined}
                        rel={external ? 'noreferrer' : undefined}
                      >
                        {content}
                        {!copy && <LuArrowUpRight className="contact__arrow" aria-hidden="true" />}
                      </a>
                    ) : (
                      <div className="contact__link">{content}</div>
                    )}

                    {copy && (
                      <button
                        type="button"
                        className="icon-btn contact__copy"
                        onClick={copyEmail}
                        aria-label={copied ? 'Email address copied' : 'Copy email address'}
                        title={copied ? 'Copied!' : 'Copy email address'}
                      >
                        {copied ? <LuCheck /> : <LuCopy />}
                      </button>
                    )}
                  </div>
                </Reveal>
              )
            })}
          </ul>

          <Reveal delay={0.1}>
            <form className="card contact__form" onSubmit={handleSubmit} onPointerMove={trackSpotlight}>
              <h3 className="contact__form-title">Send me a message</h3>

              <div className="contact__row">
                <label className="field">
                  <span className="field__label">Your name</span>
                  <input className="field__input" name="name" type="text" autoComplete="name" required placeholder="Jane Doe" />
                </label>
                <label className="field">
                  <span className="field__label">Your email</span>
                  <input
                    className="field__input"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="jane@company.com"
                  />
                </label>
              </div>

              <label className="field">
                <span className="field__label">
                  Subject <span className="field__optional">(optional)</span>
                </span>
                <input className="field__input" name="subject" type="text" placeholder="Job opportunity, project idea…" />
              </label>

              <label className="field">
                <span className="field__label">Message</span>
                <textarea
                  className="field__input field__input--area"
                  name="message"
                  rows={5}
                  required
                  placeholder="Tell me a little about what you have in mind…"
                />
              </label>

              <button type="submit" className="btn btn--primary contact__submit">
                Send message <LuSend />
              </button>

              <p className="contact__note" role="status">
                {sent
                  ? `Your email app should now open with the message ready to send. If it doesn't, write to me directly at ${profile.email}.`
                  : 'This opens your email app with the message pre-filled.'}
              </p>
            </form>
          </Reveal>
        </div>
      </div>

      <AnimatePresence>
        {copied && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
          >
            <LuCheck aria-hidden="true" /> Email copied to clipboard
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
