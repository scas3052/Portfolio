import { motion } from 'motion/react'
import { concepts, skillGroups } from '../data/portfolio'
import { trackSpotlight } from '../utils/spotlight'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import './Skills.css'

const chipList = {
  hidden: {},
  show: { transition: { delayChildren: 0.15, staggerChildren: 0.035 } },
}

const chip = {
  hidden: { opacity: 0, y: 10, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 26 } },
}

export default function Skills() {
  return (
    <section id="skills" className="section skills">
      <div className="container">
        <SectionHeading
          index="02"
          eyebrow="Skills"
          title={
            <>
              My <span className="gradient-text">tech stack</span>
            </>
          }
          subtitle="The languages, frameworks and cloud services I use to ship production software — from Angular front-ends to Azure and GenAI."
        />

        <ul className="skills__grid">
          {skillGroups.map(({ title, icon: GroupIcon, description, skills }, i) => (
            <Reveal as="li" key={title} delay={(i % 2) * 0.1}>
              <div className="card card--lift skills__card" onPointerMove={trackSpotlight}>
                <div className="skills__head">
                  <span className="skills__icon" aria-hidden="true">
                    <GroupIcon />
                  </span>
                  <div className="skills__heading">
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                  <span className="skills__count" aria-hidden="true">
                    {String(skills.length).padStart(2, '0')}
                  </span>
                </div>

                <motion.ul
                  className="skills__chips"
                  variants={chipList}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.3 }}
                >
                  {skills.map(({ name, icon: Icon, color }) => (
                    <motion.li
                      key={name}
                      className="chip skills__chip"
                      style={color ? { '--chip-color': color } : undefined}
                      variants={chip}
                      whileHover={{ y: -3 }}
                    >
                      <Icon className="skills__chip-icon" aria-hidden="true" />
                      {name}
                    </motion.li>
                  ))}
                </motion.ul>
              </div>
            </Reveal>
          ))}
        </ul>

        <Reveal className="skills__concepts">
          <h3 className="skills__concepts-label">Core concepts</h3>
          <ul className="skills__concepts-list">
            {concepts.map((concept) => (
              <li key={concept}>
                <span aria-hidden="true">#</span>
                {concept}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
