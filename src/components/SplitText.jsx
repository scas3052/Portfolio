import { Children, Fragment, isValidElement } from 'react'
import { motion } from 'motion/react'
import { EASE } from '../utils/motion'

const wordVariants = {
  hidden: { y: '115%', rotate: 4 },
  show: { y: '0%', rotate: 0, transition: { duration: 0.9, ease: EASE } },
}

/** Flattens text and inline elements into words made of (optionally styled) segments. */
function collectWords(node, className, words) {
  Children.forEach(node, (child) => {
    if (child == null || typeof child === 'boolean') return
    if (isValidElement(child)) {
      collectWords(child.props.children, child.props.className ?? className, words)
      return
    }
    String(child)
      .split(/(\s+)/)
      .forEach((part) => {
        if (!part) return
        if (/^\s+$/.test(part)) {
          if (words.at(-1).length) words.push([])
          return
        }
        words.at(-1).push({ text: part, className })
      })
  })
  return words
}

/**
 * Reveals text word by word from behind a mask. Plays with its parent's
 * variants ("hidden" → "show") or, with `inView`, when scrolled into view.
 */
export default function SplitText({ children, delay = 0, stagger = 0.06, inView = false }) {
  const words = collectWords(children, undefined, [[]]).filter((segments) => segments.length)
  const label = words.map((segments) => segments.map(({ text }) => text).join('')).join(' ')

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  }
  const trigger = inView ? { initial: 'hidden', whileInView: 'show', viewport: { once: true, amount: 0.6 } } : {}

  return (
    <>
      <span className="sr-only">{label}</span>
      <motion.span className="split" aria-hidden="true" variants={container} {...trigger}>
        {words.map((segments, i) => (
          <Fragment key={i}>
            {i > 0 && ' '}
            <span className="split__mask">
              <motion.span className="split__word" variants={wordVariants}>
                {segments.map(({ text, className }, j) =>
                  className ? (
                    <span key={j} className={className}>
                      {text}
                    </span>
                  ) : (
                    <Fragment key={j}>{text}</Fragment>
                  ),
                )}
              </motion.span>
            </span>
          </Fragment>
        ))}
      </motion.span>
    </>
  )
}
