import { motion } from 'motion/react'
import { memo } from 'react'
import {
  LuCheckCheck,
  LuCircleCheck,
  LuCircleStop,
  LuKeyRound,
  LuPaperclip,
  LuRotateCcw,
  LuSparkles,
  LuTriangleAlert,
  LuWifiOff,
} from 'react-icons/lu'
import { cx } from '../../lib/cx'
import DraftCard from './DraftCard'
import Markdown from './Markdown'
import Thinking from './Thinking'
import { voucherView } from './voucher'

const EDITABLE = new Set(['entry', 'update', 'setup'])
// A captured payment filed as one entry can open in the usual form; splits are confirmed or redrafted.
const canEditDraft = (draft) => EDITABLE.has(draft.kind) || (draft.kind === 'spend' && draft.data?.entries?.length === 1)

function clock(at) {
  if (!at) return ''
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function tilt(id) {
  let sum = 0
  for (const char of String(id)) sum = (sum + char.charCodeAt(0)) % 7
  return `${(sum - 3) * 0.45}deg`
}

function UserChit({ message }) {
  return (
    <motion.div
      className="g-mk-row g-mk-row--user"
      initial={{ opacity: 0, x: 60, rotate: 6 }}
      animate={{ opacity: 1, x: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 32 }}
    >
      <p className="g-mk-chit" style={{ '--tilt': tilt(message.id) }}>
        {message.text}
        {message.chip && (
          <span className="g-mk-chit__chip">
            <LuPaperclip aria-hidden="true" /> {message.chip}
          </span>
        )}
      </p>
    </motion.div>
  )
}

function Tally({ steps }) {
  return (
    <ul className="g-mk-tally" aria-label="What Munshi looked at">
      {steps.map((step, i) => (
        <li key={`${step.name}-${i}`} className={cx(step.ok === false && 'is-off')} style={{ '--i': i }}>
          {step.ok === false ? <LuTriangleAlert aria-hidden="true" /> : <LuCircleCheck aria-hidden="true" />}
          {step.label}
        </li>
      ))}
    </ul>
  )
}

function ErrorNote({ error, onRetry, onPass, disabled }) {
  const Icon = error.code === 'network' ? LuWifiOff : LuTriangleAlert
  const passIssue = error.code === 'unauthorized' || error.code === 'no_pass'
  return (
    <div className="g-mk-error" role="alert">
      <Icon aria-hidden="true" />
      <div>
        <strong>{error.title}</strong>
        {error.hint && <p>{error.hint}</p>}
      </div>
      {error.retry && (
        <button type="button" className="g-btn g-btn--sm g-press" onClick={onRetry} disabled={disabled}>
          <LuRotateCcw aria-hidden="true" /> Retry
        </button>
      )}
      {passIssue && (
        <button type="button" className="g-btn g-btn--sm g-press" onClick={onPass}>
          <LuKeyRound aria-hidden="true" /> Enter passphrase
        </button>
      )}
    </div>
  )
}

/** One line in the ledger: the user's chit, or Munshi's inked reply with any vouchers it drafted. */
function Message({ message, ctx, privacy, busy, hasPass, actions }) {
  if (message.role === 'user') return <UserChit message={message} />

  const drafts = message.drafts || []
  const pending = drafts.filter((d) => d.status === 'pending' && !d.needsEdit)
  const anySaved = drafts.some((d) => d.status === 'saved')
  const quick = message.source === 'quick'
  const thinking = message.streaming && !message.text
  const steps = message.steps || []

  return (
    <div className="g-mk-row g-mk-row--munshi">
      <span className="g-mk-margin" aria-hidden="true">
        {clock(message.at)}
      </span>
      <span className="g-mk-seal" aria-hidden="true">
        M
      </span>
      <div className="g-mk-entry">
        {quick && (
          <span className="g-mk-flag">
            <LuWifiOff aria-hidden="true" /> Quick add · read on this device
          </span>
        )}

        {thinking && <Thinking steps={steps} />}

        {message.text && (
          <motion.div
            className={cx('g-mk-ink', message.streaming && 'is-streaming')}
            initial={{ opacity: 0, filter: 'blur(5px)', letterSpacing: '0.04em' }}
            animate={{ opacity: 1, filter: 'blur(0px)', letterSpacing: '0em' }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <Markdown text={message.text} privacy={privacy} />
          </motion.div>
        )}

        {!message.streaming && steps.length > 0 && <Tally steps={steps} />}

        {drafts.length > 0 && (
          <div className="g-mk-vouchers">
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                view={voucherView(draft, ctx)}
                privacy={privacy}
                busy={Boolean(message.streaming)}
                canEdit={canEditDraft(draft)}
                onConfirm={() => actions.confirm(message, draft)}
                onEdit={() => actions.edit(message, draft)}
                onDiscard={() => actions.setStatus(message, draft, 'discarded')}
                onRestore={() => actions.setStatus(message, draft, 'pending')}
              />
            ))}
          </div>
        )}

        {pending.length > 1 && !message.streaming && (
          <button type="button" className="g-btn g-btn--sm g-btn--ink g-press g-mk-all" onClick={() => actions.confirmAll(message)}>
            <LuCheckCheck aria-hidden="true" /> Confirm all {pending.length}
          </button>
        )}

        {message.error && (
          <ErrorNote
            error={message.error}
            onRetry={() => actions.retry(message.id)}
            onPass={actions.askPass}
            disabled={busy}
          />
        )}

        {message.stopped && (
          <p className="g-mk-quiet">
            <LuCircleStop aria-hidden="true" /> Stopped.{' '}
            <button type="button" className="g-link" onClick={() => actions.retry(message.id)} disabled={busy}>
              Ask again
            </button>
          </p>
        )}

        {quick && hasPass && !anySaved && (
          <button type="button" className="g-link g-mk-askai" onClick={() => actions.retry(message.id)} disabled={busy}>
            <LuSparkles aria-hidden="true" /> Ask the AI instead
          </button>
        )}

        {message.meta?.model && !message.streaming && (
          <p className="g-mk-meta">
            {message.meta.provider} · {message.meta.model}
          </p>
        )}
      </div>
    </div>
  )
}

export default memo(Message)
