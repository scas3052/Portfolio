import { AnimatePresence, motion, useDragControls, useIsPresent } from 'motion/react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LuArrowDown, LuEraser, LuPaperclip, LuSettings, LuX } from 'react-icons/lu'
import { useAgentConfig } from '../../agent/agentConfig'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { cx } from '../../lib/cx'
import { lockScroll, restoreFocus, trapTab } from '../../lib/dom'
import { navigate } from '../../lib/router'
import { useUi } from '../../store/contexts'
import Composer from './Composer'
import Message from './Message'
import PassCard from './PassCard'
import Suggestions from './Suggestions'

const PASS_ERRORS = new Set(['no_pass', 'unauthorized'])

const cover = {
  initial: { rotateY: -82, opacity: 0, x: 24 },
  animate: { rotateY: 0, opacity: 1, x: 0, transition: { type: 'spring', stiffness: 150, damping: 21 } },
  exit: { rotateY: -76, opacity: 0, x: 18, transition: { duration: 0.3, ease: [0.5, 0, 0.75, 0] } },
}

const flap = {
  initial: { rotateX: 64, opacity: 0, y: 80 },
  animate: { rotateX: 0, opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 26 } },
  exit: { rotateX: 40, opacity: 0, y: '60%', transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } },
}

function headerMeta(messages, hasPass, busy) {
  if (busy) return 'writing in the ledger…'
  if (!hasPass) return 'quick add only · AI locked'
  const meta = messages.findLast((m) => m.meta?.model)?.meta
  return meta ? `${meta.provider} · ${meta.model}` : 'AI ready'
}

/** The red cloth ledger: a docked side book on wide screens, a modal drawer or bottom sheet elsewhere. */
export default function AgentPanel({ agent, finance, actions, onClose }) {
  const { messages, busy, send, stop, retry, clear } = agent
  const ui = useUi()
  const config = useAgentConfig()
  const docked = useMediaQuery('(min-width: 1280px)')
  const compact = useMediaQuery('(max-width: 719px)')
  const present = useIsPresent()
  const drag = useDragControls()
  const titleId = useId()
  const panel = useRef(null)
  const page = useRef(null)
  const field = useRef(null)
  const stick = useRef(true)
  const [opener] = useState(() => document.activeElement)
  const [away, setAway] = useState(false)
  const [passOpen, setPassOpen] = useState(false)
  const [seed, setSeed] = useState(null)

  useEffect(() => {
    const target = field.current || panel.current
    target?.focus({ preventScroll: true })
  }, [])

  useEffect(() => (docked ? undefined : lockScroll()), [docked])

  useEffect(() => {
    if (!present) restoreFocus(opener, panel.current)
  }, [present, opener])

  useEffect(() => {
    if (!present) return undefined
    const root = document.documentElement
    root.dataset.munshi = docked ? 'docked' : compact ? 'sheet' : 'drawer'
    return () => {
      delete root.dataset.munshi
    }
  }, [docked, compact, present])

  useLayoutEffect(() => {
    const node = page.current
    if (node && stick.current) node.scrollTop = node.scrollHeight
  }, [messages, passOpen])

  const jump = () => {
    stick.current = true
    page.current?.scrollTo({ top: page.current.scrollHeight, behavior: 'smooth' })
  }

  // A captured payment attached from its card (Android app) rides along with the next message.
  const focus = ui.agentFocus
  const ask = (text) => {
    stick.current = true
    const sent = send(text, focus ? { context: focus.context, chip: focus.label } : undefined)
    if (sent && focus) ui.clearAgentFocus()
    return sent
  }

  const askPass = useCallback(() => {
    stick.current = true
    setPassOpen(true)
  }, [])

  const messageActions = useMemo(() => ({ ...actions, askPass }), [actions, askPass])

  const unlocked = () => {
    setPassOpen(false)
    ui.toast('Munshi is unlocked', { tone: 'mint' })
    const last = messages.at(-1)
    if (last?.error && PASS_ERRORS.has(last.error.code)) retry(last.id)
  }

  const confirmClear = () =>
    ui.openSheet('confirm', {
      title: 'Clear this chat?',
      body: 'Entries you confirmed stay saved. Drafts you haven’t confirmed will be gone.',
      confirmLabel: 'Clear chat',
      tone: 'rose',
      onConfirm: clear,
    })

  const openSettings = () => {
    navigate('settings', { focus: 'assistant' })
    if (!docked) onClose()
  }

  return (
    <div className={cx('g-mk-layer', docked ? 'is-docked' : 'is-modal')} inert={!present}>
      {!docked && (
        <motion.div
          className="g-scrim g-mk-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <motion.section
        ref={panel}
        role="dialog"
        aria-modal={!docked}
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('g-mk-panel', compact ? 'g-mk-panel--bottom' : 'g-mk-panel--side')}
        style={compact ? { transformPerspective: 1100, originY: 1 } : { transformPerspective: 1600, originX: 1 }}
        {...(compact ? flap : cover)}
        drag={compact ? 'y' : false}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.85 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 650) onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          } else if (!docked) {
            trapTab(event, panel.current)
          }
        }}
      >
        {compact && (
          <div className="g-mk-grab" onPointerDown={(event) => drag.start(event)} aria-hidden="true">
            <span />
          </div>
        )}
        <header className="g-mk-head">
          <span className="g-mk-head__mark" aria-hidden="true">
            M
          </span>
          <div className="g-mk-head__text">
            <h2 id={titleId} className="g-mk-head__title">
              Munshi
            </h2>
            <p className="g-mk-head__meta">{headerMeta(messages, config.hasPass, busy)}</p>
          </div>
          <div className="g-mk-head__tools">
            <button type="button" className="g-mk-tool g-press" onClick={confirmClear} disabled={!messages.length} aria-label="Clear chat">
              <LuEraser aria-hidden="true" />
            </button>
            <button type="button" className="g-mk-tool g-press" onClick={openSettings} aria-label="Assistant settings">
              <LuSettings aria-hidden="true" />
            </button>
            <button type="button" className="g-mk-tool g-press" onClick={onClose} aria-label="Close Munshi">
              <LuX aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          ref={page}
          className="g-mk-page g-scroll"
          role="log"
          aria-label="Conversation with Munshi"
          aria-busy={busy}
          onScroll={(event) => {
            const node = event.currentTarget
            stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 72
            setAway(!stick.current)
          }}
        >
          {messages.length === 0 && !passOpen && (
            <Suggestions
              state={finance.state}
              derived={finance.derived}
              today={finance.today}
              hasPass={config.hasPass}
              onAsk={ask}
              onFill={(text) => setSeed({ text })}
              onUnlock={askPass}
            />
          )}
          {messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              ctx={finance}
              privacy={ui.privacy}
              busy={busy}
              hasPass={config.hasPass}
              actions={messageActions}
            />
          ))}
          {passOpen && <PassCard onUnlocked={unlocked} />}
        </div>

        <AnimatePresence>
          {away && (
            <motion.button
              type="button"
              className="g-mk-jump g-press"
              onClick={jump}
              initial={{ opacity: 0, y: 12, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.8 }}
            >
              <LuArrowDown aria-hidden="true" /> Latest
            </motion.button>
          )}
        </AnimatePresence>

        {focus && (
          <div className="g-mk-focus" role="status">
            <LuPaperclip aria-hidden="true" />
            <span className="g-mk-focus__label">
              About <strong>{focus.label}</strong>
            </span>
            <button type="button" className="g-mk-focus__drop g-press" onClick={ui.clearAgentFocus} aria-label="Remove the attached payment">
              <LuX aria-hidden="true" />
            </button>
          </div>
        )}

        <Composer
          busy={busy}
          placeholder={focus ? 'What was it for? e.g. “dinner, split with Ravi”' : undefined}
          onSend={ask}
          onStop={stop}
          voiceLang={config.voiceLang}
          onField={(node) => {
            field.current = node
          }}
          onNotice={(text) => ui.toast(text, { tone: 'butter' })}
          seed={seed}
        />
      </motion.section>
    </div>
  )
}
