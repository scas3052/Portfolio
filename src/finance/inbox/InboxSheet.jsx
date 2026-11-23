import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  LuArrowDownLeft,
  LuArrowLeftRight,
  LuArrowUpRight,
  LuBan,
  LuCheck,
  LuChevronDown,
  LuCreditCard,
  LuFeather,
  LuInbox,
  LuLandmark,
  LuMessageSquareText,
  LuPencil,
  LuSendHorizontal,
  LuSettings2,
  LuShare2,
  LuSmartphone,
  LuWandSparkles,
} from 'react-icons/lu'
import { useAgentConfig } from '../agent/agentConfig'
import { commitEntry, validateEntry } from '../agent/commit'
import { spendContext } from '../agent/spends'
import { EmptyState } from '../components/bits'
import { Money } from '../components/Money'
import { categoryMeta } from '../lib/categories'
import { cx, toneVar } from '../lib/cx'
import { relativeDay } from '../lib/dates'
import { formatINR, MASK, plural } from '../lib/format'
import { navigate } from '../lib/router'
import { describeTxn } from '../lib/selectors'
import { undoAlso } from '../lib/undo'
import { useApp, useFinance, useUi } from '../store/contexts'
import { findTwin, linkedEntryIds, matchAccount, pairTransfers, rupees, spendDate, suggest, toPrefill } from './enrich'
import { merchantKey, payeeName, ruleFromEntry } from './rules'

const SOURCES = {
  sms: ['SMS', LuMessageSquareText],
  gpay: ['GPay', LuSmartphone],
  phonepe: ['PhonePe', LuSmartphone],
  paytm: ['Paytm', LuSmartphone],
  share: ['Shared', LuShare2],
}

const clock = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const nameOf = (spend) => payeeName(spend) || (spend.direction === 'in' ? 'Money in' : 'Payment')

/** Everything a card can do to its payment. Each action reads the latest book, UI and inbox when it runs. */
function useFiling(onDone) {
  const app = useApp()
  const finance = useFinance()
  const ui = useUi()
  const { hasPass } = useAgentConfig()
  const live = useRef(null)
  useLayoutEffect(() => {
    live.current = { finance, ui, inbox: app?.inbox, hasPass }
  })

  return useMemo(() => {
    const now = () => live.current
    const learnFrom = (spend, entry) => {
      const key = merchantKey(spend)
      const rule = ruleFromEntry(entry, spend)
      if (key && rule) now().inbox.learn(key, rule)
    }
    // After filing from the form, come back to the list while payments are left.
    const backToList = () =>
      setTimeout(() => {
        const { inbox, ui: latest } = now()
        if (inbox?.unfiled.length) latest.openSheet('inbox')
      }, 360)

    const edit = (spend, tip) => {
      const { ui: latest, inbox } = now()
      latest.openSheet('txn', {
        prefill: toPrefill(spend, tip),
        onSaved: (record) => {
          inbox.markFiled(spend.id, [record.id])
          learnFrom(spend, record)
          backToList()
        },
        onUndo: () => inbox.restore(spend.id),
      })
    }

    return {
      edit,
      looksRight(spend, tip) {
        const { finance: book, ui: latest, inbox } = now()
        const entry = toPrefill(spend, tip)
        if (Object.keys(validateEntry(entry, book.state)).length) {
          edit(spend, tip)
          return
        }
        const ctx = { dispatch: book.dispatch, derived: book.derived, ui: undoAlso(latest, () => inbox.restore(spend.id)) }
        const { record } = commitEntry(ctx, entry)
        inbox.markFiled(spend.id, [record.id])
        learnFrom(spend, record)
      },
      /**
       * "What was it for?" answered on the card: saved like a notification reply. With Munshi set up, the sheet
       * closes and Munshi drafts the entry from your words (the app shell hands noted payments over); without
       * it, the entry form opens with your note and a category guessed from it.
       */
      describe(spend, text) {
        const { finance: book, inbox, hasPass: canAsk } = now()
        const note = text.trim().slice(0, 200)
        if (!note) return
        inbox.setHint(spend.id, note)
        if (canAsk && navigator.onLine !== false) {
          onDone()
          return
        }
        const noted = { ...spend, hint: note }
        edit(noted, suggest(noted, { book: inbox.book, accounts: book.state.accounts }))
      },
      munshi(spend) {
        const { finance: book, ui: latest, inbox } = now()
        const amount = latest.privacy ? MASK : formatINR(rupees(spend))
        latest.focusAgent({ id: spend.id, label: `${amount} · ${nameOf(spend)}`, context: spendContext(spend, { ...book, inbox }) })
        onDone()
      },
      dismiss(spend) {
        const { ui: latest, inbox } = now()
        inbox.dismiss(spend.id)
        latest.toast(`Set aside · ${nameOf(spend)}`, { tone: 'gray', action: { label: 'Undo', run: () => inbox.restore(spend.id) } })
      },
      sameOne(spend, twin) {
        const { ui: latest, inbox } = now()
        inbox.markFiled(spend.id, [twin.id])
        latest.toast('Marked as already in the book', { tone: 'sky', action: { label: 'Undo', run: () => inbox.restore(spend.id) } })
      },
      transfer(pair) {
        const { finance: book, ui: latest, inbox } = now()
        const entry = {
          type: 'transfer',
          amount: rupees(pair.from),
          date: spendDate(pair.from),
          note: '',
          category: '',
          accountId: pair.fromAccount.id,
          toAccountId: pair.toAccount.id,
        }
        const restoreBoth = () => {
          inbox.restore(pair.from.id)
          inbox.restore(pair.to.id)
        }
        const { record } = commitEntry({ dispatch: book.dispatch, derived: book.derived, ui: undoAlso(latest, restoreBoth) }, entry)
        inbox.markFiled(pair.from.id, [record.id])
        inbox.markFiled(pair.to.id, [record.id])
      },
      remember(spend, accountId) {
        now().inbox.setAlias(spend.account, accountId)
      },
      settings() {
        navigate('settings', { focus: 'capture' })
        onDone()
      },
    }
  }, [onDone])
}

function Sources({ list }) {
  return (
    <span className="g-spend__sources">
      {list.map((source) => {
        const [label, Icon] = SOURCES[source] || [source, LuSmartphone]
        return (
          <span key={source} className="g-spend__source">
            <Icon aria-hidden="true" /> {label}
          </span>
        )
      })}
    </span>
  )
}

function Original({ spend }) {
  const { getOriginal } = useApp().inbox
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(null)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && messages === null) setMessages(await getOriginal(spend.id))
  }

  return (
    <div className="g-spend__original">
      <button type="button" className="g-link g-spend__fold" aria-expanded={open} onClick={toggle}>
        <LuChevronDown aria-hidden="true" /> Original message
      </button>
      {open && (
        <div className="g-spend__raw">
          {messages === null && <p>Reading…</p>}
          {messages?.length === 0 && <p>No longer kept on this phone.</p>}
          {messages?.map((m, i) => (
            <figure key={`${m.at}-${i}`}>
              <figcaption>
                {SOURCES[m.source]?.[0] || m.source}
                {m.sender && m.sender !== m.source ? ` · ${m.sender}` : ''} · {clock(m.at)}
              </figcaption>
              <blockquote>{m.text}</blockquote>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

/** The question every new payment gets: what was it for? */
function AskFor({ spend, onAnswer }) {
  const [text, setText] = useState('')
  const id = useId()
  const incoming = spend.direction === 'in'
  return (
    <form
      className="g-spend__ask"
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim()) onAnswer(text)
      }}
    >
      <label htmlFor={id}>{incoming ? 'What was this money for?' : 'What was it for?'}</label>
      <div className="g-spend__ask-row">
        <input
          id={id}
          className="g-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={incoming ? 'e.g. Ravi paid me back for dinner' : 'e.g. dinner, split with Ravi'}
          maxLength={200}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="submit" className="g-icon-btn g-press" aria-label="File with this note" disabled={!text.trim()}>
          <LuSendHorizontal aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}

function SpendCard({ spend, tip, twin, match, focused, actions }) {
  const { state, derived, today } = useFinance()
  const card = useRef(null)
  const incoming = spend.direction === 'in'
  const name = nameOf(spend)
  const amount = rupees(spend)
  const ruled = tip.ruled && !twin
  const Badge = spend.channel === 'card' ? LuCreditCard : incoming ? LuArrowDownLeft : LuArrowUpRight

  useEffect(() => {
    if (focused) card.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused])

  return (
    <article ref={card} className={cx('g-spend', focused && 'is-focused')} style={toneVar(incoming ? 'lime' : 'peach')} aria-label={name}>
      <header className="g-spend__head">
        <span className="g-spend__badge" aria-hidden="true">
          <Badge />
        </span>
        <div className="g-spend__who">
          <p className="g-spend__name">{name}</p>
          <p className="g-spend__meta">
            {relativeDay(spendDate(spend), today)}, {clock(spend.at)}
            <Sources list={spend.sources} />
          </p>
        </div>
        <Money value={incoming ? amount : -amount} sign="always" tone={incoming ? 'pos' : undefined} className="g-spend__amount" />
      </header>

      <div className="g-spend__account">
        <LuLandmark aria-hidden="true" />
        {match.account ? (
          <span>
            {match.account.name}
            {spend.account && <span className="g-spend__digits"> ••{spend.account}</span>}
          </span>
        ) : spend.account && state.accounts.length > 0 ? (
          <label className="g-spend__pick">
            <span>Which account is ••{spend.account}?</span>
            <select className="g-input g-select" value="" onChange={(event) => event.target.value && actions.remember(spend, event.target.value)}>
              <option value="">Choose…</option>
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.last4 ? ` ••${a.last4}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="g-spend__muted">{spend.bank || 'No account named'}</span>
        )}
      </div>

      {!spend.hint && !twin && <AskFor spend={spend} onAnswer={(text) => actions.describe(spend, text)} />}

      {spend.hint && (
        <p className="g-spend__note">
          <LuMessageSquareText aria-hidden="true" /> “{spend.hint}”
        </p>
      )}

      {twin ? (
        <div className="g-spend__twin" role="note">
          <p>
            Looks like you already added this: <strong>“{describeTxn(twin, derived.lookups).title}”</strong> ·{' '}
            {relativeDay(twin.date, today)}
          </p>
          <button type="button" className="g-btn g-btn--sm g-press" onClick={() => actions.sameOne(spend, twin)}>
            <LuCheck aria-hidden="true" /> Same one, mark filed
          </button>
        </div>
      ) : (
        tip.category && (
          <p className={cx('g-spend__tip', ruled && 'is-learned')}>
            {ruled && <LuWandSparkles aria-hidden="true" />}
            {ruled ? 'Learned: ' : 'Looks like '}
            <strong>{categoryMeta(tip.category).label}</strong>
            {ruled && tip.note && tip.note !== name ? ` · “${tip.note}”` : ''}
          </p>
        )
      )}

      <footer className="g-spend__actions">
        {ruled && (
          <button type="button" className="g-btn g-btn--sm g-btn--ink g-press" onClick={() => actions.looksRight(spend, tip)}>
            <LuCheck aria-hidden="true" /> Looks right
          </button>
        )}
        <button type="button" className={cx('g-btn g-btn--sm g-press', !ruled && 'g-btn--ink')} onClick={() => actions.edit(spend, tip)}>
          <LuPencil aria-hidden="true" /> Edit &amp; file
        </button>
        <button
          type="button"
          className="g-icon-btn g-press g-spend__munshi"
          onClick={() => actions.munshi(spend)}
          aria-label={`Explain ${name} to Munshi`}
          title="Explain it to Munshi"
        >
          <LuFeather aria-hidden="true" />
        </button>
        <button type="button" className="g-btn g-btn--sm g-btn--ghost g-press" onClick={() => actions.dismiss(spend)}>
          <LuBan aria-hidden="true" /> Not a spend
        </button>
      </footer>

      {spend.hasOriginal && <Original spend={spend} />}
    </article>
  )
}

function PairCard({ pair, actions, onSkip }) {
  const { today } = useFinance()
  return (
    <article className="g-spend g-spend--pair" style={toneVar('sky')} aria-label="Possible transfer">
      <header className="g-spend__head">
        <span className="g-spend__badge" aria-hidden="true">
          <LuArrowLeftRight />
        </span>
        <div className="g-spend__who">
          <p className="g-spend__name">
            {pair.fromAccount.name} → {pair.toAccount.name}
          </p>
          <p className="g-spend__meta">
            {relativeDay(spendDate(pair.from), today)}, {clock(pair.from.at)} · money left one account and reached the other
          </p>
        </div>
        <Money value={rupees(pair.from)} className="g-spend__amount" />
      </header>
      <footer className="g-spend__actions">
        <button type="button" className="g-btn g-btn--sm g-btn--ink g-press" onClick={() => actions.transfer(pair)}>
          <LuArrowLeftRight aria-hidden="true" /> File as one transfer
        </button>
        <button type="button" className="g-btn g-btn--sm g-btn--ghost g-press" onClick={onSkip}>
          They’re separate
        </button>
      </footer>
    </article>
  )
}

/** The review sheet: every unfiled spend as a card, newest first (or the one a notification opened). */
export default function InboxSheet({ focus = null, onDone }) {
  const inbox = useApp()?.inbox
  const { state } = useFinance()
  const actions = useFiling(onDone)
  const [skipped, setSkipped] = useState([])
  const unfiled = inbox?.unfiled
  const spends = inbox?.spends
  const book = inbox?.book

  const linked = useMemo(() => linkedEntryIds(spends || []), [spends])
  const pairs = useMemo(
    () => (unfiled ? pairTransfers(unfiled, state.accounts, book?.aliases).filter((p) => !skipped.includes(p.from.id)) : []),
    [unfiled, state.accounts, book, skipped],
  )
  const cards = useMemo(() => {
    if (!unfiled || !book) return []
    const paired = new Set(pairs.flatMap((p) => [p.from.id, p.to.id]))
    const ordered = focus ? [...unfiled.filter((s) => s.id === focus), ...unfiled.filter((s) => s.id !== focus)] : unfiled
    return ordered
      .filter((s) => !paired.has(s.id))
      .map((spend) => {
        const tip = suggest(spend, { book, accounts: state.accounts })
        return {
          spend,
          tip,
          match: matchAccount(spend, state.accounts, book.aliases),
          twin: findTwin(spend, state.transactions, tip.accountId, linked),
        }
      })
  }, [unfiled, book, pairs, focus, state.accounts, state.transactions, linked])

  if (!inbox) return null
  const status = inbox.status
  const capturing = status && (status.sms === 'granted' || status.listener) && !status.paused

  return (
    <div className="g-form g-inbox">
      {pairs.length + cards.length === 0 ? (
        <EmptyState
          icon={LuInbox}
          title="All filed"
          body={
            capturing
              ? 'New payments land here, and a notification asks what each was for right after you pay.'
              : 'Switch on payment capture and Gullak catches bank SMS and UPI payments for you to file.'
          }
          action={
            !capturing && (
              <button type="button" className="g-btn g-btn--ink g-press" onClick={actions.settings}>
                <LuSettings2 aria-hidden="true" /> Set up payment capture
              </button>
            )
          }
        />
      ) : (
        <>
          <p className="g-inbox__lead">
            {plural(pairs.length * 2 + cards.length, 'payment')} caught from your messages. Nothing is in your book until you
            file it.
          </p>
          <ol className="g-inbox__list">
            {pairs.map((pair) => (
              <li key={`pair-${pair.from.id}`}>
                <PairCard pair={pair} actions={actions} onSkip={() => setSkipped((list) => [...list, pair.from.id])} />
              </li>
            ))}
            {cards.map((row) => (
              <li key={row.spend.id}>
                <SpendCard {...row} focused={row.spend.id === focus} actions={actions} />
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="g-inbox__foot">
        <button type="button" className="g-link" onClick={actions.settings}>
          <LuSettings2 aria-hidden="true" /> Payment capture settings
        </button>
      </p>
    </div>
  )
}
