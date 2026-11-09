import { motion } from 'motion/react'
import { FaGithub } from 'react-icons/fa6'
import { LuArrowUpRight, LuBriefcaseBusiness, LuCircleCheck, LuLockKeyhole } from 'react-icons/lu'
import { useTilt } from '../hooks/useTilt'
import { EASE } from '../utils/motion'
import { trackSpotlight } from '../utils/spotlight'

export default function ProjectCard({ project, index = 0, ref }) {
  const { title, icon: Icon, categories, colors, org, description, highlights, tech, repo } = project
  const { rotateX, rotateY, handlers } = useTilt({ max: 5 })

  return (
    <motion.li
      ref={ref}
      layout
      className="projects__item"
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      whileInView={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.55, delay: (index % 3) * 0.08, ease: EASE },
      }}
      viewport={{ once: true, amount: 0.15 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
      transition={{ duration: 0.55, ease: EASE }}
      {...handlers}
    >
      <motion.div className="projects__tilt" style={{ rotateX, rotateY }}>
        <article
          className="card card--lift project"
          onPointerMove={trackSpotlight}
          style={{ '--c1': colors[0], '--c2': colors[1] }}
        >
          <div className="project__cover" aria-hidden="true">
            <span className="project__pattern" />
            <span className="project__category">{categories.join(' · ')}</span>
            {repo ? <FaGithub className="project__corner" /> : <LuBriefcaseBusiness className="project__corner" />}
            <span className="project__icon">
              <Icon />
            </span>
          </div>

          <div className="project__body">
            <h3 className="project__title">{title}</h3>
            <p className="project__desc">{description}</p>

            {highlights?.length > 0 && (
              <ul className="project__highlights" aria-label="Highlights">
                {highlights.map((point) => (
                  <li key={point}>
                    <LuCircleCheck aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}

            <ul className="project__tech" aria-label="Tech stack">
              {tech.map((item) => (
                <li key={item} className="tag">
                  {item}
                </li>
              ))}
            </ul>

            {repo ? (
              <a className="project__link" href={repo} target="_blank" rel="noreferrer">
                <FaGithub aria-hidden="true" />
                <span>
                  Source code<span className="sr-only"> for {title} on GitHub</span>
                </span>
                <LuArrowUpRight aria-hidden="true" className="project__link-arrow" />
              </a>
            ) : (
              <p className="project__badge">
                <LuLockKeyhole aria-hidden="true" />
                <span>{org ? `Built at ${org}` : 'Private project'} · Proprietary code</span>
              </p>
            )}
          </div>
        </article>
      </motion.div>
    </motion.li>
  )
}
