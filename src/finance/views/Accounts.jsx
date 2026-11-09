import { useMemo } from 'react'
import { LuArrowLeftRight, LuCreditCard, LuLayers, LuPlus, LuWallet } from 'react-icons/lu'
import { AccountCard } from '../components/AccountCard'
import { EmptyState, Tile, ViewHeader } from '../components/bits'
import { Money, Odometer } from '../components/Money'
import { TxnMiniList } from '../components/TxnRow'
import { useActions } from '../hooks/useActions'
import { toneVar } from '../lib/cx'
import { formatPercent, plural, round2 } from '../lib/format'
import { useFinance, useUi } from '../store/contexts'

export default function Accounts() {
  const { state, derived } = useFinance()
  const { openSheet } = useUi()
  const { addEntry } = useActions()
  const { position } = derived

  const rows = useMemo(
    () =>
      state.accounts.map((account) => ({
        account,
        balance: derived.balances.get(account.id) || 0,
      })),
    [state.accounts, derived.balances],
  )
  const banks = rows.filter((row) => row.account.kind !== 'credit')
  const cards = rows.filter((row) => row.account.kind === 'credit')
  const stack = useMemo(
    () =>
      rows
        .filter((row) => row.account.kind !== 'credit' && row.balance > 0)
        .sort((a, b) => b.balance - a.balance),
    [rows],
  )
  const stackTotal = stack.reduce((sum, row) => sum + row.balance, 0)
  const transfers = useMemo(
    () => derived.sorted.filter((txn) => txn.type === 'transfer').slice(0, 5),
    [derived.sorted],
  )
  const dues = Math.max(0, -position.credit)

  const headerActions = (
    <>
      {state.accounts.length > 1 && (
        <button type="button" className="g-btn g-press" onClick={() => addEntry({ type: 'transfer' })}>
          <LuArrowLeftRight aria-hidden="true" /> Move money
        </button>
      )}
      <button type="button" className="g-btn g-btn--ink g-press" onClick={() => openSheet('account')}>
        <LuPlus aria-hidden="true" /> Add account
      </button>
    </>
  )

  if (state.accounts.length === 0) {
    return (
      <div className="g-view g-accounts">
        <ViewHeader title="Accounts" tone="butter" sub="Bank accounts, cards, wallets and cash." />
        <EmptyState
          icon={LuWallet}
          title="No accounts yet"
          body="Add each bank account, credit card, UPI wallet and the cash in your pocket. Balances then update with every entry."
          action={
            <button type="button" className="g-btn g-btn--ink g-press" onClick={() => openSheet('account')}>
              <LuPlus aria-hidden="true" /> Add your first account
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="g-view g-accounts">
      <ViewHeader
        title="Accounts"
        tone="butter"
        sub={`${plural(state.accounts.length, 'place')} your money lives. Tap a card to flip it.`}
        actions={headerActions}
      />

      <div className="g-bento">
        <Tile span={5} index={0} tone="butter" icon={LuWallet} kicker="Across every account" title="Cash on hand" className="g-hero">
          <Odometer value={position.cash} className="g-hero__value" />
          <dl className="g-stats g-stats--wide">
            <div>
              <dt>Card dues</dt>
              <dd>
                <Money value={dues} tone={dues > 0 ? 'neg' : undefined} />
              </dd>
            </div>
            <div className="g-stats__total">
              <dt>After paying cards</dt>
              <dd>
                <Money value={round2(position.cash + position.credit)} tone="auto" />
              </dd>
            </div>
          </dl>
        </Tile>

        <Tile span={7} index={1} icon={LuLayers} kicker="Share of positive balances" title="Where your cash sits">
          {stack.length > 0 ? (
            <>
              <div className="g-stack" role="img" aria-label="Cash split across accounts">
                {stack.map((row, i) => (
                  <span
                    key={row.account.id}
                    className="g-stack__brick"
                    style={{ flexGrow: row.balance, '--i': i, ...toneVar(row.account.color) }}
                  />
                ))}
              </div>
              <ul className="g-legend">
                {stack.map((row) => (
                  <li key={row.account.id} style={toneVar(row.account.color)}>
                    <span className="g-legend__dot" aria-hidden="true" />
                    <span className="g-legend__name">{row.account.name}</span>
                    <span className="g-legend__share">{formatPercent(row.balance / stackTotal)}</span>
                    <Money value={row.balance} compact />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState compact icon={LuLayers} title="No positive balances right now" />
          )}
        </Tile>
      </div>

      {banks.length > 0 && (
        <section className="g-shelf" aria-labelledby="g-shelf-banks">
          <h2 id="g-shelf-banks" className="g-shelf__title">
            <LuWallet aria-hidden="true" /> Bank, wallet &amp; cash
          </h2>
          <div className="g-cards">
            {banks.map((row, i) => (
              <AccountCard key={row.account.id} account={row.account} balance={row.balance} index={i} />
            ))}
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section className="g-shelf" aria-labelledby="g-shelf-cards">
          <h2 id="g-shelf-cards" className="g-shelf__title">
            <LuCreditCard aria-hidden="true" /> Credit cards
          </h2>
          <div className="g-cards">
            {cards.map((row, i) => (
              <AccountCard key={row.account.id} account={row.account} balance={row.balance} index={i} />
            ))}
          </div>
        </section>
      )}

      {transfers.length > 0 && (
        <div className="g-bento">
          <Tile span={12} index={2} icon={LuArrowLeftRight} kicker="Latest five" title="Money moved between accounts">
            <TxnMiniList txns={transfers} />
          </Tile>
        </div>
      )}
    </div>
  )
}
