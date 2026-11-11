import { motion } from 'motion/react'
import { useMemo } from 'react'
import { LuFeather, LuKeyRound, LuMessageCircleQuestion, LuNotebookPen } from 'react-icons/lu'
import { currentHour, greeting, monthOf } from '../../lib/dates'
import { categoryBreakdown, recentAccountId, summarize, txnsInMonth } from '../../lib/selectors'

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

function buildAsks(state, derived, today) {
  const asks = []
  const debtor = derived.people.find((p) => p.net > 0)
  if (debtor) asks.push(`How much does ${debtor.name} owe me?`)
  const month = summarize(txnsInMonth(state.transactions, monthOf(today)))
  const top = categoryBreakdown(month.byCategory)[0]
  asks.push(top ? `How much did I spend on ${top.meta.label.toLowerCase()} this month?` : 'How much did I spend this month?')
  const loan = derived.loans.find((l) => !l.done)
  if (loan) asks.push(`How many EMIs are left on my ${loan.loan.name}?`)
  asks.push('What’s my net worth right now?')
  return asks.slice(0, 4)
}

function buildNotes(state, derived) {
  const accounts = state.accounts.filter((a) => !a.archived)
  const accountId = recentAccountId(derived.sorted, accounts, ['expense'])
  const account = derived.lookups.accounts.get(accountId)
  const via = account ? ` via ${account.name}` : ''
  const friend = derived.people[0]?.name || 'Ravi'
  const notes = [`Spent 250 on lunch${via}`, `Lent 500 to ${firstName(friend)}`]
  const loan = derived.loans.find((l) => !l.done && !l.paidThisMonth)
  notes.push(loan ? `Paid this month’s ${loan.loan.name} EMI` : 'Got 2000 cashback today')
  return notes
}

const lift = {
  hidden: { opacity: 0, y: 12, rotate: -2 },
  show: (i) => ({ opacity: 1, y: 0, rotate: 0, transition: { delay: 0.12 + i * 0.05, type: 'spring', stiffness: 380, damping: 26 } }),
}

/** First page of the ledger: a greeting, a few questions to ask and a few things to note down. */
export default function Suggestions({ state, derived, today, hasPass, onAsk, onFill, onUnlock }) {
  const asks = useMemo(() => buildAsks(state, derived, today), [state, derived, today])
  const notes = useMemo(() => buildNotes(state, derived), [state, derived])
  const name = firstName(state.settings.name)
  const offset = hasPass ? asks.length : 1

  return (
    <div className="g-mk-hello">
      <motion.p className="g-mk-hello__date" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {new Date(`${today}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      </motion.p>
      <motion.h3
        className="g-mk-hello__title"
        initial={{ opacity: 0, filter: 'blur(6px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.6 }}
      >
        {greeting(currentHour())}
        {name && `, ${name}`}.
      </motion.h3>
      <p className="g-mk-hello__text">
        I’m Munshi, your ledger clerk. Ask me anything about your money, or tell me what happened and I’ll write up a
        voucher for you to sign.
      </p>

      <section className="g-mk-hello__group" aria-labelledby="g-mk-ask">
        <h4 id="g-mk-ask" className="g-mk-hello__kicker">
          <LuMessageCircleQuestion aria-hidden="true" /> Ask
        </h4>
        {hasPass ? (
          <div className="g-mk-prompts">
            {asks.map((text, i) => (
              <motion.button
                key={text}
                type="button"
                className="g-mk-prompt g-press"
                variants={lift}
                initial="hidden"
                animate="show"
                custom={i}
                onClick={() => onAsk(text)}
              >
                {text}
              </motion.button>
            ))}
          </div>
        ) : (
          <button type="button" className="g-btn g-btn--sm g-press g-mk-hello__unlock" onClick={onUnlock}>
            <LuKeyRound aria-hidden="true" /> Unlock the AI to ask questions
          </button>
        )}
      </section>

      <section className="g-mk-hello__group" aria-labelledby="g-mk-note">
        <h4 id="g-mk-note" className="g-mk-hello__kicker">
          <LuNotebookPen aria-hidden="true" /> Note down
        </h4>
        <div className="g-mk-prompts">
          {notes.map((text, i) => (
            <motion.button
              key={text}
              type="button"
              className="g-mk-prompt g-mk-prompt--note g-press"
              variants={lift}
              initial="hidden"
              animate="show"
              custom={offset + i}
              onClick={() => onFill(text)}
            >
              <LuFeather aria-hidden="true" /> {text}
            </motion.button>
          ))}
        </div>
      </section>

      <p className="g-mk-hello__fine">
        Nothing is saved until you confirm it. Questions, and the figures Munshi looks up to answer them, go to the AI
        provider on your relay; simple notes are read right here on your device.
      </p>
    </div>
  )
}
