import { useMemo, useState } from 'react'
import {
  LuArrowDownLeft,
  LuArrowUpRight,
  LuHandCoins,
  LuHandshake,
  LuMessageCircleHeart,
  LuPencil,
  LuScale,
  LuUserPlus,
  LuUsers,
} from 'react-icons/lu'
import { Avatar, EmptyState, Segmented, Sticker, Tile, ViewHeader } from '../components/bits'
import { Money, Odometer } from '../components/Money'
import { TxnMiniList } from '../components/TxnRow'
import { useActions } from '../hooks/useActions'
import { cx, toneFor, toneVar } from '../lib/cx'
import { diffDays, formatDay, shortDate } from '../lib/dates'
import { formatINR, plural, round2 } from '../lib/format'
import { useApp, useFinance, useUi } from '../store/contexts'

const EPS = 0.005
const MAX_TILT = 12

const stateOf = (person) => (person.net > EPS ? 'in' : person.net < -EPS ? 'out' : 'settled')

function Scale({ receivable, payable }) {
  const heavier = Math.max(receivable, payable)
  const tilt = heavier > 0 ? ((payable - receivable) / heavier) * MAX_TILT : 0
  return (
    <div className="g-scale" style={{ '--tilt': `${tilt.toFixed(2)}deg` }} aria-hidden="true">
      <span className="g-scale__post" />
      <span className="g-scale__base" />
      <span className="g-scale__beam">
        <span className="g-scale__pan g-scale__pan--in">
          <span className="g-scale__chain" />
          <span className="g-scale__dish">
            <Money value={receivable} compact />
          </span>
        </span>
        <span className="g-scale__pan g-scale__pan--out">
          <span className="g-scale__chain" />
          <span className="g-scale__dish">
            <Money value={payable} compact />
          </span>
        </span>
      </span>
      <span className="g-scale__pivot" />
    </div>
  )
}

function PersonCard({ person, index }) {
  const { today } = useFinance()
  const { openSheet, toast } = useUi()
  const app = useApp()
  const { addEntry, settle } = useActions()
  const status = stateOf(person)
  const amount = Math.abs(person.net)
  const waiting = person.since ? diffDays(person.since, today) : 0

  const nudge = async () => {
    const text = `Hi ${person.name}! Gentle reminder about the ${formatINR(amount)} from ${formatDay(person.since || person.last)}. No rush, whenever you can.`
    try {
      if (app?.shareText) {
        await app.shareText(text)
        return
      }
      if (navigator.share) {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      toast('Reminder copied. Paste it in your chat.', { tone: 'mint' })
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Couldn’t share the reminder on this device.', { tone: 'rose' })
    }
  }

  const stats = [
    ['Lent', person.lent],
    ['Got back', person.collected],
    ['Borrowed', person.borrowed],
    ['Paid back', person.repaid],
  ].filter(([, value]) => value > 0)

  return (
    <article
      className={cx('g-person', `is-${status}`)}
      style={{ '--i': index, ...toneVar(toneFor(person.id)) }}
      aria-labelledby={`g-person-${person.id}`}
    >
      <header className="g-person__head">
        <Avatar name={person.name} tone={toneFor(person.id)} />
        <div className="g-person__who">
          <h3 id={`g-person-${person.id}`} className="g-person__name">
            {person.name}
          </h3>
          <p className="g-person__status">
            {status === 'in' && 'Owes you'}
            {status === 'out' && 'You owe'}
            {status === 'settled' && (person.last ? `All square · last on ${shortDate(person.last)}` : 'No entries yet')}
            {status !== 'settled' && person.since && (
              <span className="g-muted"> · since {shortDate(person.since)}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="g-icon-btn g-press"
          onClick={() => openSheet('person', { person })}
          aria-label={`Edit ${person.name}`}
        >
          <LuPencil aria-hidden="true" />
        </button>
      </header>

      {status === 'settled' ? (
        <p className="g-person__amount g-person__amount--settled">
          <Sticker tone="mint" rotate={-3}>
            <LuHandshake aria-hidden="true" /> Settled
          </Sticker>
        </p>
      ) : (
        <p className="g-person__amount">
          <Money value={amount} tone={status === 'in' ? 'pos' : 'neg'} />
          {waiting >= 30 && <span className="g-person__age">{plural(waiting, 'day')}</span>}
        </p>
      )}

      {stats.length > 0 && (
        <dl className="g-person__stats">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <Money value={value} compact />
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="g-person__actions">
        {status === 'in' && (
          <>
            <button type="button" className="g-btn g-btn--ink g-press" onClick={() => settle(person, 'collect')}>
              <LuArrowDownLeft aria-hidden="true" /> Got it back
            </button>
            <button type="button" className="g-btn g-btn--sm g-press" onClick={nudge}>
              <LuMessageCircleHeart aria-hidden="true" /> Nudge
            </button>
          </>
        )}
        {status === 'out' && (
          <button type="button" className="g-btn g-btn--ink g-press" onClick={() => settle(person, 'repay')}>
            <LuArrowUpRight aria-hidden="true" /> Pay back
          </button>
        )}
        <button
          type="button"
          className="g-btn g-btn--sm g-btn--ghost g-press"
          onClick={() => addEntry({ type: 'lend', personId: person.id })}
        >
          Lend
        </button>
        <button
          type="button"
          className="g-btn g-btn--sm g-btn--ghost g-press"
          onClick={() => addEntry({ type: 'borrow', personId: person.id })}
        >
          Borrow
        </button>
      </div>

      {person.history.length > 0 && (
        <details className="g-details g-person__history">
          <summary>
            History <span className="g-muted">· {plural(person.history.length, 'entry', 'entries')}</span>
          </summary>
          <TxnMiniList txns={person.history} />
        </details>
      )}
    </article>
  )
}

export default function People() {
  const { derived, today } = useFinance()
  const { openSheet } = useUi()
  const { owe } = derived
  const [filter, setFilter] = useState('all')

  const people = useMemo(
    () =>
      [...derived.people].sort((a, b) => {
        const rank = (p) => (stateOf(p) === 'settled' ? 1 : 0)
        return rank(a) - rank(b) || Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name)
      }),
    [derived.people],
  )
  const counts = useMemo(() => {
    const tally = { all: people.length, in: 0, out: 0, settled: 0 }
    for (const person of people) tally[stateOf(person)] += 1
    return tally
  }, [people])
  const shown = filter === 'all' ? people : people.filter((person) => stateOf(person) === filter)
  const oldest = useMemo(
    () =>
      people
        .filter((person) => stateOf(person) === 'in' && person.since)
        .sort((a, b) => a.since.localeCompare(b.since))[0],
    [people],
  )
  const net = round2(owe.receivable - owe.payable)

  const addPerson = (
    <button type="button" className="g-btn g-btn--ink g-press" onClick={() => openSheet('person')}>
      <LuUserPlus aria-hidden="true" /> Add person
    </button>
  )

  if (people.length === 0) {
    return (
      <div className="g-view g-people-view">
        <ViewHeader title="People" tone="mint" sub="Money you lent, borrowed, got back and paid back." />
        <EmptyState
          icon={LuUsers}
          title="Nobody here yet"
          body="Add a friend, family member or colleague. Log what you lend or borrow and Gullak keeps the running tab."
          action={addPerson}
        />
      </div>
    )
  }

  return (
    <div className="g-view g-people-view">
      <ViewHeader
        title="People"
        tone="mint"
        sub="Money you lent, borrowed, got back and paid back."
        actions={addPerson}
      />

      <div className="g-bento">
        <Tile span={5} index={0} tone="mint" icon={LuScale} kicker="Which way it leans" title="The balance">
          <Scale key={`${owe.receivable}:${owe.payable}`} receivable={owe.receivable} payable={owe.payable} />
          <div className="g-owe">
            <p className="g-owe__side is-in">
              <span className="g-owe__label">Owed to you</span>
              <Money value={owe.receivable} tone="pos" />
            </p>
            <p className="g-owe__side is-out">
              <span className="g-owe__label">You owe</span>
              <Money value={owe.payable} tone="neg" />
            </p>
          </div>
        </Tile>

        <Tile span={7} index={1} icon={LuHandCoins} kicker="Lending, all time" title="Where things stand" className="g-hero">
          <Odometer value={net} sign="always" tone="auto" className="g-hero__value" />
          <p className="g-muted">
            {net > EPS && 'More is owed to you than you owe.'}
            {net < -EPS && 'You owe more than is owed to you.'}
            {Math.abs(net) <= EPS && 'Everything evens out.'}
          </p>
          <dl className="g-stats g-stats--wide">
            <div>
              <dt>Owe you</dt>
              <dd>{plural(owe.owesYou, 'person', 'people')}</dd>
            </div>
            <div>
              <dt>You owe</dt>
              <dd>{plural(owe.youOwe, 'person', 'people')}</dd>
            </div>
            <div>
              <dt>Settled</dt>
              <dd>{counts.settled}</dd>
            </div>
            {oldest && (
              <div>
                <dt>Waiting longest</dt>
                <dd>
                  {oldest.name} <small className="g-muted">· {plural(diffDays(oldest.since, today), 'day')}</small>
                </dd>
              </div>
            )}
          </dl>
        </Tile>
      </div>

      <Segmented
        label="Show people"
        className="g-people__filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `All ${counts.all}` },
          { value: 'in', label: `Owe you ${counts.in}` },
          { value: 'out', label: `You owe ${counts.out}` },
          { value: 'settled', label: `Settled ${counts.settled}` },
        ]}
      />

      {shown.length > 0 ? (
        <div className="g-people">
          {shown.map((person, i) => (
            <PersonCard key={person.id} person={person} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState compact icon={LuHandshake} title="Nobody in this list" body="Try another filter." />
      )}
    </div>
  )
}
