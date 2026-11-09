import { motion } from 'motion/react'

const TAGS = {
  div: motion.div,
  li: motion.li,
  article: motion.article,
  section: motion.section,
}

/** Fades and lifts its children into view once, when scrolled into the viewport. */
export default function Reveal({ as = 'div', children, className, delay = 0, y = 28, amount = 0.2, ...rest }) {
  const Tag = TAGS[as] ?? motion.div

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
