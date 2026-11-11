import { AnimatePresence, motion } from 'motion/react'
import {
  LuCheck,
  LuLandmark,
  LuPencil,
  LuPencilLine,
  LuPiggyBank,
  LuRotateCcw,
  LuTarget,
  LuTrash2,
  LuTriangleAlert,
  LuWallet,
  LuX,
} from 'react-icons/lu'
import { TYPE_META } from '../../lib/categories'
import { cx, toneVar } from '../../lib/cx'
import { formatINR, MASK } from '../../lib/format'

const KIND_ICON = { update: LuPencilLine, delete: LuTrash2, budget: LuTarget, contribution: LuPiggyBank }
const SETUP_ICON = { account: LuWallet, loan: LuLandmark, goal: LuPiggyBank }
const RUPEES = /[-−+]?₹\s?[\d,]+(?:\.\d+)?/g

function iconFor(draft) {
  if (draft.kind === 'entry') return TYPE_META[draft.data?.type]?.icon || LuPencil
  if (draft.kind === 'setup') return SETUP_ICON[draft.data?.setup] || LuWallet
  return KIND_ICON[draft.kind] || LuPencil
}

function Glyph({ icon: Icon }) {
  return <Icon aria-hidden="true" />
}

function confirmLabel(draft) {
  if (draft.kind === 'delete') return 'Delete'
  if (draft.kind === 'setup') return 'Create'
  if (draft.kind === 'update') return 'Save change'
  return 'Confirm'
}

const tear = {
  initial: { opacity: 0, y: 14, rotateX: -24 },
  animate: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 420, damping: 30 } },
  exit: {
    opacity: 0,
    y: 34,
    rotate: -5,
    x: -18,
    clipPath: 'polygon(0 0, 100% 0, 100% 84%, 88% 100%, 72% 86%, 55% 100%, 38% 86%, 20% 100%, 0 88%)',
    transition: { duration: 0.32, ease: [0.55, 0, 0.75, 0.2] },
  },
}

/**
 * One proposed change as a carbon-copy voucher. Pending vouchers can be confirmed, edited or discarded;
 * saved ones get a stamp, discarded ones fold into a stub that can be restored.
 */
export default function DraftCard({ draft, view, privacy, busy, canEdit, onConfirm, onEdit, onDiscard, onRestore }) {
  const money = (value) => (privacy ? MASK : formatINR(value))
  const show = (text) => (privacy ? String(text).replace(RUPEES, MASK) : text)
  const saved = draft.status === 'saved'
  const blocked = Boolean(draft.needsEdit)
  const serial = String(draft.id || '').slice(-4).toUpperCase()

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {draft.status === 'discarded' ? (
        <motion.div
          key="stub"
          className="g-mk-stub"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.12 } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <LuX aria-hidden="true" />
          <span className="g-mk-stub__text">
            Discarded · {view.title}
            {view.amount != null && ` · ${money(view.amount)}`}
          </span>
          <button type="button" className="g-link g-mk-stub__undo" onClick={onRestore} disabled={busy}>
            <LuRotateCcw aria-hidden="true" /> Restore
          </button>
        </motion.div>
      ) : (
        <motion.article
          key="voucher"
          className={cx('g-mk-voucher', saved && 'is-saved', blocked && 'is-blocked')}
          style={toneVar(view.tone)}
          aria-label={`${view.title} draft${saved ? ', saved' : ''}`}
          {...tear}
        >
          <span className="g-mk-voucher__carbon" aria-hidden="true" />
          <div className="g-mk-voucher__paper">
            <header className="g-mk-voucher__head">
              <span className="g-mk-voucher__kind">
                <Glyph icon={iconFor(draft)} /> {view.title}
              </span>
              <span className="g-mk-voucher__no" aria-hidden="true">
                No. {serial}
              </span>
            </header>

            <div className="g-mk-voucher__amount">
              {view.was != null && <s className="g-mk-voucher__was">{money(view.was)}</s>}
              <strong>{view.amount != null ? money(view.amount) : '₹ ?'}</strong>
              {view.caption && <span className="g-mk-voucher__caption">{show(view.caption)}</span>}
            </div>

            {view.rows.length > 0 && (
              <dl className="g-mk-voucher__rows">
                {view.rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{show(value)}</dd>
                  </div>
                ))}
              </dl>
            )}

            {(blocked || draft.warnings?.length > 0 || draft.error) && !saved && (
              <ul className="g-mk-voucher__notes">
                {blocked && (
                  <li className="is-need">
                    <LuPencil aria-hidden="true" /> Needs: {draft.needsEdit}
                  </li>
                )}
                {draft.warnings?.map((warning) => (
                  <li key={warning}>
                    <LuTriangleAlert aria-hidden="true" /> {show(warning)}
                  </li>
                ))}
                {draft.error && (
                  <li className="is-error" role="alert">
                    <LuTriangleAlert aria-hidden="true" /> {draft.error}
                  </li>
                )}
              </ul>
            )}

            {!saved && (
              <footer className="g-mk-voucher__actions">
                <button
                  type="button"
                  className={cx('g-btn g-btn--sm g-press', draft.kind === 'delete' ? 'g-mk-btn--danger' : 'g-btn--ink')}
                  onClick={onConfirm}
                  disabled={busy || blocked}
                  title={blocked ? `Edit first: ${draft.needsEdit}` : undefined}
                >
                  <LuCheck aria-hidden="true" /> {confirmLabel(draft)}
                </button>
                {canEdit && (
                  <button type="button" className="g-btn g-btn--sm g-press" onClick={onEdit} disabled={busy}>
                    <LuPencil aria-hidden="true" /> Edit
                  </button>
                )}
                <button type="button" className="g-btn g-btn--sm g-btn--ghost g-press" onClick={onDiscard} disabled={busy}>
                  <LuX aria-hidden="true" /> Discard
                </button>
              </footer>
            )}

            {saved && (
              <span className="g-mk-stamp" aria-hidden="true">
                Saved
              </span>
            )}
          </div>
        </motion.article>
      )}
    </AnimatePresence>
  )
}
