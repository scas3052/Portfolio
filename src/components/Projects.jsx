import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FaGithub } from 'react-icons/fa6'
import { LuArrowUpRight } from 'react-icons/lu'
import { profile, projectFilters, projects } from '../data/portfolio'
import ProjectCard from './ProjectCard'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import './Projects.css'

const matches = (project, filter) => filter === 'All' || project.categories.includes(filter)

const COUNTS = Object.fromEntries(
  projectFilters.map((filter) => [filter, projects.filter((project) => matches(project, filter)).length]),
)

export default function Projects() {
  const [filter, setFilter] = useState('All')
  const visible = projects.filter((project) => matches(project, filter))

  return (
    <section id="projects" className="section projects">
      <div className="container">
        <SectionHeading
          index="03"
          eyebrow="Projects"
          title={
            <>
              Things I&apos;ve <span className="gradient-text">built</span>
            </>
          }
          subtitle="Production software I've built at Mu Sigma for the oil & gas industry — plus a couple of favourite AI / ML projects from college."
        />

        <Reveal className="projects__filters" role="group" aria-label="Filter projects by category">
          {projectFilters.map((item) => {
            const active = item === filter
            return (
              <button
                key={item}
                type="button"
                className={`projects__filter${active ? ' projects__filter--active' : ''}`}
                aria-pressed={active}
                onClick={() => setFilter(item)}
              >
                {active && (
                  <motion.span
                    layoutId="project-filter"
                    className="projects__filter-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="projects__filter-label">{item}</span>
                <span className="projects__filter-count">{COUNTS[item]}</span>
              </button>
            )
          })}
        </Reveal>

        <p className="sr-only" aria-live="polite">
          Showing {visible.length} {visible.length === 1 ? 'project' : 'projects'}
          {filter === 'All' ? '' : ` in ${filter}`}
        </p>

        <ul className="projects__grid">
          <AnimatePresence mode="popLayout">
            {visible.map((project, i) => (
              <ProjectCard key={project.title} project={project} index={i} />
            ))}
          </AnimatePresence>
        </ul>

        <Reveal className="projects__more">
          <p>Curious about what else I&apos;ve been tinkering with?</p>
          <a className="btn btn--ghost" href={profile.github} target="_blank" rel="noreferrer">
            <FaGithub /> More on GitHub <LuArrowUpRight />
          </a>
        </Reveal>
      </div>
    </section>
  )
}
