import { MotionConfig } from 'motion/react'
import About from './components/About'
import BackToTop from './components/BackToTop'
import Contact from './components/Contact'
import CursorGlow from './components/CursorGlow'
import Education from './components/Education'
import Experience from './components/Experience'
import Footer from './components/Footer'
import Hero from './components/Hero'
import Navbar from './components/Navbar'
import Projects from './components/Projects'
import ScrollProgress from './components/ScrollProgress'
import Skills from './components/Skills'
import TechMarquee from './components/TechMarquee'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const { theme, toggleTheme } = useTheme()

  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="backdrop" aria-hidden="true">
        <div className="backdrop__grid" />
        <div className="backdrop__glow backdrop__glow--1" />
        <div className="backdrop__glow backdrop__glow--2" />
        <div className="backdrop__glow backdrop__glow--3" />
        <div className="backdrop__grain" />
      </div>
      <CursorGlow />

      <ScrollProgress />
      <Navbar theme={theme} onToggleTheme={toggleTheme} />

      <main id="main" tabIndex={-1}>
        <Hero theme={theme} />
        <TechMarquee />
        <About />
        <Skills />
        <Projects />
        <Experience />
        <Education />
        <Contact />
      </main>

      <Footer />
      <BackToTop />
    </MotionConfig>
  )
}
