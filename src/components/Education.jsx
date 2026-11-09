import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { LuAward, LuCalendar, LuGraduationCap, LuMapPin } from 'react-icons/lu'
import { certifications, education } from '../data/portfolio'
import { trackSpotlight } from '../utils/spotlight'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import './Education.css'

export default function Education() {
  const timelineRef = useRef(null)
  const reduceMotion = useReducedMotion()
  // The timeline line fills in as you scroll through it
  const { scrollYProgress } = useScroll({ target: timelineRef, offset: ['start 75%', 'end 60%'] })
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.001 })

  return (
    <section id="education" className="section education">
      <div className="container">
        <SectionHeading
          index="05"
          eyebrow="Education"
          title={
            <>
              Learning &amp; <span className="gradient-text">certifications</span>
            </>
          }
          subtitle="A strong academic foundation in computer science, backed by industry-recognised certifications."
        />

        <div className="education__grid">
          <div>
            <Reveal>
              <h3 className="education__subheading">
                <LuGraduationCap aria-hidden="true" /> Education
              </h3>
            </Reveal>
            <div className="timeline-wrap" ref={timelineRef}>
              <motion.span
                className="timeline__progress"
                style={reduceMotion ? undefined : { scaleY: progress }}
                aria-hidden="true"
              />
              <ol className="timeline">
                {education.map(({ institution, degree, period, location, score }, i) => (
                  <Reveal as="li" key={institution} delay={i * 0.1} className="timeline__item">
                    <motion.span
                      className="timeline__dot"
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ type: 'spring', stiffness: 320, damping: 16, delay: 0.25 + i * 0.1 }}
                      aria-hidden="true"
                    />
                    <div className="card timeline__card" onPointerMove={trackSpotlight}>
                      <div className="timeline__top">
                        <span className="timeline__period">
                          <LuCalendar aria-hidden="true" /> {period}
                        </span>
                        <span className="timeline__score">{score}</span>
                      </div>
                      <h4 className="timeline__degree">{degree}</h4>
                      <p className="timeline__institution">{institution}</p>
                      <p className="timeline__location">
                        <LuMapPin aria-hidden="true" /> {location}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>

          <div>
            <Reveal>
              <h3 className="education__subheading">
                <LuAward aria-hidden="true" /> Certifications
              </h3>
            </Reveal>
            <ul className="certs">
              {certifications.map(({ title, issuer, date, icon: Icon = LuAward }, i) => (
                <Reveal as="li" key={title} delay={i * 0.08}>
                  <div className="card card--lift cert" onPointerMove={trackSpotlight}>
                    <span className="cert__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <div className="cert__body">
                      <h4 className="cert__title">{title}</h4>
                      <p className="cert__meta">
                        <span className="cert__issuer">{issuer}</span>
                        <span className="cert__date">{date}</span>
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
