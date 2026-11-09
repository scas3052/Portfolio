import { motion } from 'motion/react'
import { EASE } from '../utils/motion'
import SplitText from './SplitText'
import './SectionHeading.css'

// Eyebrow fades in, its accent line draws out, the title rises word by word, then the subtitle follows.
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const fadeUp = (delay = 0) => ({
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, delay, ease: EASE } },
})

const eyebrowVariants = fadeUp()
const subtitleVariants = fadeUp(0.35)

const lineVariants = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.9, delay: 0.15, ease: EASE } },
}

export default function SectionHeading({ index, eyebrow, title, subtitle, align = 'left' }) {
  return (
    <motion.div
      className={`section-heading section-heading--${align}`}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
    >
      <motion.p className="section-heading__eyebrow" variants={eyebrowVariants}>
        <span className="section-heading__index">{index}</span>
        <motion.span className="section-heading__line" variants={lineVariants} aria-hidden="true" />
        {eyebrow}
      </motion.p>
      <h2 className="section-heading__title">
        <SplitText>{title}</SplitText>
      </h2>
      {subtitle && (
        <motion.p className="section-heading__subtitle" variants={subtitleVariants}>
          {subtitle}
        </motion.p>
      )}
    </motion.div>
  )
}
