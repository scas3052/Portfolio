import { motion } from 'motion/react'
import { LuArrowRight, LuBriefcaseBusiness, LuCalendarDays, LuCircleCheck, LuRocket } from 'react-icons/lu'
import { experience } from '../data/portfolio'
import { EASE } from '../utils/motion'
import { trackSpotlight } from '../utils/spotlight'
import Magnetic from './Magnetic'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import './Experience.css'

const pointList = {
  hidden: {},
  show: { transition: { delayChildren: 0.2, staggerChildren: 0.08 } },
}

const pointItem = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } },
}

export default function Experience() {
  return (
    <section id="experience" className="section experience">
      <div className="container">
        <SectionHeading
          index="04"
          eyebrow="Experience"
          title={
            <>
              Where I&apos;ve <span className="gradient-text">worked</span>
            </>
          }
          subtitle="Building production software for the energy industry — and the internship where it all started."
        />

        <div className="experience__grid">
          <div className="experience__list">
            {experience.map(({ company, logo: Logo = LuBriefcaseBusiness, role, type, period, summary, points, tags }) => (
              <Reveal key={company}>
                <article className="card experience__card" onPointerMove={trackSpotlight}>
                  <header className="experience__head">
                    <span className="experience__logo" aria-hidden="true">
                      <Logo />
                    </span>
                    <div className="experience__heading">
                      <h3 className="experience__role">{role}</h3>
                      <p className="experience__company">{company}</p>
                      {period && (
                        <p className="experience__period">
                          <LuCalendarDays aria-hidden="true" />
                          {period}
                        </p>
                      )}
                    </div>
                    <span className="experience__type">{type}</span>
                  </header>

                  <p className="experience__summary">{summary}</p>

                  <motion.ul
                    className="experience__points"
                    variants={pointList}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, amount: 0.4 }}
                  >
                    {points.map((point) => (
                      <motion.li key={point} variants={pointItem}>
                        <LuCircleCheck aria-hidden="true" />
                        <span>{point}</span>
                      </motion.li>
                    ))}
                  </motion.ul>

                  <ul className="experience__tags" aria-label="Skills">
                    {tags.map((tag) => (
                      <li key={tag} className="tag">
                        {tag}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.12}>
            <aside className="card experience__cta" onPointerMove={trackSpotlight}>
              <span className="experience__cta-border" aria-hidden="true" />
              <span className="experience__cta-icon" aria-hidden="true">
                <LuRocket />
              </span>
              <h3>Have a problem worth solving?</h3>
              <p>
                I enjoy hard, real-world problems — full-stack Angular + .NET apps, Azure cloud solutions and GenAI
                assistants. If you&apos;d like to collaborate or just talk tech, I&apos;d love to hear from you.
              </p>
              <Magnetic>
                <a className="btn btn--primary" href="#contact">
                  Let&apos;s talk <LuArrowRight />
                </a>
              </Magnetic>
            </aside>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
