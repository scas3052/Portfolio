import { motion } from 'motion/react'
import { LuFeather } from 'react-icons/lu'
import { cx } from '../../lib/cx'
import { MOD_KEY } from '../../lib/dom'

/** The ink pot in the corner that opens Munshi; a wax seal appears when a reply landed while it was closed. */
export default function AgentLauncher({ unread, onOpen }) {
  return (
    <motion.button
      type="button"
      className={cx('g-mk-launcher', unread && 'has-unread')}
      onClick={onOpen}
      aria-label={`Ask Munshi${unread ? ', new reply' : ''} (${MOD_KEY}+J)`}
      title={`Ask Munshi · ${MOD_KEY}+J`}
      initial={{ opacity: 0, scale: 0.4, rotate: -40, y: 24 }}
      animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, transition: { type: 'spring', stiffness: 360, damping: 18, delay: 0.15 } }}
      exit={{ opacity: 0, scale: 0.5, rotate: 25, y: 16, transition: { duration: 0.16 } }}
      whileHover={{ y: -3, rotate: -4 }}
      whileTap={{ scale: 0.9 }}
    >
      <span className="g-mk-launcher__pot" aria-hidden="true">
        <LuFeather className="g-mk-launcher__quill" />
      </span>
      <span className="g-mk-launcher__label" aria-hidden="true">
        Munshi
      </span>
      {unread && <span className="g-mk-launcher__seal" aria-hidden="true" />}
    </motion.button>
  )
}
