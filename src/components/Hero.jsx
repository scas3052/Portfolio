import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { LuArrowRight, LuDownload, LuMapPin } from 'react-icons/lu'
import { profile, resumeUrl, socials } from '../data/portfolio'
import { useTypewriter } from '../hooks/useTypewriter'
import { EASE } from '../utils/motion'
import CodeWindow from './CodeWindow'
import Magnetic from './Magnetic'
import NeuralBackground from './NeuralBackground'
import SplitText from './SplitText'
import './Hero.css'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
}

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
}

export default function Hero({ theme }) {
  const sectionRef = useRef(null)
  const reduceMotion = useReducedMotion()
  const typed = useTypewriter(profile.roles, { enabled: !reduceMotion })

  // Content drifts down and fades as the hero scrolls away; the code window lags behind for depth.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] })
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 120])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0])
  const visualY = useTransform(scrollYProgress, [0, 1], [0, 60])

  return (
    <section id="home" className="hero" ref={sectionRef}>
      <NeuralBackground theme={theme} />

      <div className="container hero__inner">
        <motion.div
          className="hero__content"
          variants={container}
          initial="hidden"
          animate="show"
          style={reduceMotion ? undefined : { y: contentY, opacity: contentOpacity }}
        >
          <motion.p className="hero__badge" variants={item}>
            <span className="hero__pulse" aria-hidden="true" />
            {profile.availability}
          </motion.p>

          <motion.p className="hero__greeting" variants={item}>
            <span className="hero__wave" aria-hidden="true">
              👋
            </span>{' '}
            Hello, I&apos;m
          </motion.p>

          <h1 className="hero__title">
            <SplitText stagger={0.12}>
              {profile.firstName} <span className="gradient-text gradient-text--animated">{profile.lastName}</span>
            </SplitText>
          </h1>

          <motion.p className="hero__role" variants={item}>
            <span className="sr-only">{profile.roles.join(' · ')}</span>
            <span aria-hidden="true">
              <span className="hero__prompt">&gt;</span>
              {typed}
              <span className="hero__caret" />
            </span>
          </motion.p>

          <motion.p className="hero__tagline" variants={item}>
            {profile.tagline}
          </motion.p>

          <motion.div className="hero__ctas" variants={item}>
            <Magnetic>
              <a className="btn btn--primary" href="#projects">
                View my work <LuArrowRight />
              </a>
            </Magnetic>
            <Magnetic>
              <a className="btn btn--ghost" href={resumeUrl} download>
                Download résumé <LuDownload />
              </a>
            </Magnetic>
          </motion.div>

          <motion.div className="hero__meta" variants={item}>
            <ul className="hero__socials">
              {socials.map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <a
                    className="icon-btn"
                    href={href}
                    aria-label={label}
                    title={label}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel="noreferrer"
                  >
                    <Icon />
                  </a>
                </li>
              ))}
            </ul>
            <span className="hero__location">
              <LuMapPin aria-hidden="true" /> {profile.location}
            </span>
          </motion.div>
        </motion.div>

        <motion.div
          className="hero__visual"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
        >
          <motion.div style={reduceMotion ? undefined : { y: visualY }}>
            <CodeWindow />
          </motion.div>
        </motion.div>
      </div>

      <a href="#about" className="hero__scroll" aria-label="Scroll to the About section">
        <span className="hero__mouse">
          <span className="hero__wheel" />
        </span>
      </a>
    </section>
  )
}
