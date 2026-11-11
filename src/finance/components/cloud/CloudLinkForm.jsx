import { useId } from 'react'
import {
  LuCloud,
  LuCloudDownload,
  LuCloudUpload,
  LuDownload,
  LuLoaderCircle,
  LuMerge,
  LuMonitorSmartphone,
} from 'react-icons/lu'
import { useActions } from '../../hooks/useActions'
import { backupJSON, downloadText } from '../../lib/backup'
import { toneVar } from '../../lib/cx'
import { formatDay } from '../../lib/dates'
import { useCloud, useFinance, useUi } from '../../store/contexts'
import { HoldButton } from '../bits'

const STATS = [
  ['entries', 'Entries'],
  ['accounts', 'Accounts'],
  ['loans', 'Loans'],
  ['people', 'People'],
  ['goals', 'Goals'],
  ['budgets', 'Budgets'],
]

/** One of the two books, summarised so they can be told apart. */
function BookCard({ icon: Icon, where, book, tone }) {
  return (
    <section className="g-sync-book" style={toneVar(tone)}>
      <header className="g-sync-book__head">
        <span className="g-sync-book__icon" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <p className="g-kicker">{where}</p>
          <h3 className="g-sync-book__name">{book.name ? `${book.name}’s book` : 'Your book'}</h3>
        </div>
      </header>
      <dl className="g-sync-book__stats">
        {STATS.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{book[key]}</dd>
          </div>
        ))}
      </dl>
      <p className="g-sync-book__foot">
        <span>{book.latest ? `Latest entry ${formatDay(book.latest, { year: true })}` : 'No entries yet'}</span>
        <span>{book.pin ? 'PIN set' : 'No PIN'}</span>
      </p>
    </section>
  )
}

function Choice({ icon: Icon, tone, title, id, children, action }) {
  return (
    <li className="g-sync-choice" style={toneVar(tone)}>
      <span className="g-sync-choice__icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="g-sync-choice__text">
        <strong>{title}</strong>
        <p id={id}>{children}</p>
      </div>
      <div className="g-sync-choice__go">{action}</div>
    </li>
  )
}

/** Both this device and the cloud hold a book: the owner picks which one to keep, or merges them. */
export default function CloudLinkForm({ here, cloud: inCloud, email, onDone }) {
  const sync = useCloud()
  const { today } = useFinance()
  const ui = useUi()
  const { exportJSON } = useActions()
  const id = useId()
  const open = sync.linking === 'choosing'
  const saving = sync.linking === 'saving'

  const backupCloud = () => {
    const copy = sync.cloudCopy()
    if (!copy) return
    downloadText(`gullak-cloud-backup-${today}.json`, backupJSON(copy, new Date().toISOString()))
    ui.toast('Cloud backup downloaded. Keep it somewhere safe.', { tone: 'lime' })
  }

  const button = (choice, tone, Icon, label) => (
    <button
      type="button"
      className="g-btn g-press"
      style={toneVar(tone)}
      disabled={!open}
      aria-describedby={`${id}-${choice}`}
      onClick={() => sync.chooseLink(choice)}
    >
      <Icon aria-hidden="true" /> {label}
    </button>
  )

  return (
    <div className="g-form g-sync-link">
      <p className="g-form__note">
        You’re signed in as <strong>{email || 'your Google account'}</strong>. This device and your cloud book both have
        entries, so choose which one Gullak should keep.
      </p>

      <div className="g-sync-link__books">
        <BookCard icon={LuMonitorSmartphone} where="On this device" book={here} tone="peach" />
        <BookCard icon={LuCloud} where="In the cloud" book={inCloud} tone="sky" />
      </div>

      <div className="g-sync-link__backup">
        <span>Want a copy first?</span>
        <button type="button" className="g-btn g-btn--sm g-btn--ghost g-press" onClick={exportJSON} disabled={!open}>
          <LuDownload aria-hidden="true" /> This device’s book
        </button>
        <button type="button" className="g-btn g-btn--sm g-btn--ghost g-press" onClick={backupCloud} disabled={!open}>
          <LuDownload aria-hidden="true" /> The cloud book
        </button>
      </div>

      <ul className="g-sync-choices" aria-label="What Gullak can keep">
        <Choice
          icon={LuCloudDownload}
          tone="sky"
          title="Start from the cloud"
          id={`${id}-keep`}
          action={button('keep', 'sky', LuCloudDownload, 'Use the cloud book')}
        >
          This device switches to the book in the cloud. What’s on this device now is replaced.
        </Choice>
        <Choice
          icon={LuMerge}
          tone="lilac"
          title="Keep both"
          id={`${id}-merge`}
          action={button('merge', 'lilac', LuMerge, 'Merge both')}
        >
          Everything from both books goes into one. Where they differ, the cloud’s name, PIN and budgets win.
        </Choice>
        <Choice
          icon={LuCloudUpload}
          tone="coral"
          title="Start from this device"
          id={`${id}-replace`}
          action={
            <HoldButton tone="coral" icon={LuCloudUpload} disabled={!open} onConfirm={() => sync.chooseLink('replace')}>
              Replace the cloud book
            </HoldButton>
          }
        >
          The cloud, and every device that syncs with it, switches to this device’s book. Press and hold to confirm.
        </Choice>
      </ul>

      {saving && (
        <p className="g-sync-link__saving" role="status">
          <LuLoaderCircle className="g-sync-spin" aria-hidden="true" /> Saving your choice…
        </p>
      )}

      <div className="g-form__actions">
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  )
}
