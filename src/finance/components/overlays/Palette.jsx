import { motion, useIsPresent } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  LuArrowDownLeft,
  LuArrowLeftRight,
  LuArrowUpRight,
  LuEye,
  LuEyeOff,
  LuFeather,
  LuFileDown,
  LuFileSpreadsheet,
  LuHandCoins,
  LuHandshake,
  LuKeyboard,
  LuLandmark,
  LuLock,
  LuMoon,
  LuReceipt,
  LuSearch,
  LuSun,
  LuTarget,
  LuUndo2,
  LuWallet,
  LuWalletCards,
} from 'react-icons/lu'
import { useActions } from '../../hooks/useActions'
import { categoryMeta } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { formatDay } from '../../lib/dates'
import { lockScroll, restoreFocus } from '../../lib/dom'
import { formatINR, MASK } from '../../lib/format'
import { navigate, VIEWS } from '../../lib/router'
import { describeTxn, searchText } from '../../lib/selectors'
import { useFinance, useUi } from '../../store/contexts'

function matches(item, words) {
  const hay = `${item.label} ${item.keywords || ''}`.toLowerCase()
  return words.every((word) => hay.includes(word))
}

/** ⌘K command palette that prints out like a shop receipt. */
export default function Palette({ onClose }) {
  const { state, derived, today } = useFinance()
  const ui = useUi()
  const actions = useActions()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [opener] = useState(() => document.activeElement)
  const present = useIsPresent()
  const paper = useRef(null)
  const listRef = useRef(null)
  const inputId = useId()
  const listId = useId()

  useEffect(() => lockScroll(), [])

  useEffect(() => {
    if (!present) restoreFocus(opener, paper.current)
  }, [present, opener])

  const goTo = VIEWS.map((view) => ({
    id: `view-${view.id}`,
    section: 'Go to',
    label: view.label,
    keywords: `${view.short} page view open`,
    icon: view.icon,
    keys: String(view.key),
    run: () => navigate(view.id),
  }))

  const munshi = state.settings.onboarded
  const commands = [
    munshi && { id: 'munshi', label: 'Ask Munshi', keywords: 'assistant ai chat agent ask help question note', icon: LuFeather, keys: 'A', run: () => ui.setAgentOpen(true) },
    { id: 'spend', label: 'Add a spend', keywords: 'expense new entry paid bought', icon: LuArrowUpRight, keys: 'N', run: () => actions.addEntry({ type: 'expense' }) },
    { id: 'income', label: 'Add income', keywords: 'salary earning received credit', icon: LuArrowDownLeft, keys: 'I', run: () => actions.addEntry({ type: 'income' }) },
    { id: 'transfer', label: 'Move money between accounts', keywords: 'transfer self', icon: LuArrowLeftRight, run: () => actions.addEntry({ type: 'transfer' }) },
    { id: 'emi', label: 'Log an EMI payment', keywords: 'loan instalment installment', icon: LuLandmark, run: () => actions.addEntry({ type: 'emi' }) },
    { id: 'lend', label: 'I lent money', keywords: 'lend gave friend owe', icon: LuHandCoins, run: () => actions.addEntry({ type: 'lend' }) },
    { id: 'borrow', label: 'I borrowed money', keywords: 'borrow took owe debt', icon: LuHandshake, run: () => actions.addEntry({ type: 'borrow' }) },
    { id: 'account', label: 'Add a bank account or card', keywords: 'account bank wallet card cash', icon: LuWalletCards, run: () => ui.openSheet('account') },
    { id: 'loan', label: 'Add a loan or EMI plan', keywords: 'loan emi', icon: LuReceipt, run: () => ui.openSheet('loan') },
    { id: 'goal', label: 'Start a savings goal', keywords: 'goal save target jar', icon: LuTarget, run: () => ui.openSheet('goal') },
    { id: 'budget', label: 'Set monthly budgets', keywords: 'budget limit plan', icon: LuWallet, run: () => ui.openSheet('budget') },
    {
      id: 'privacy',
      label: ui.privacy ? 'Show amounts' : 'Hide amounts',
      keywords: 'privacy mask blur hide',
      icon: ui.privacy ? LuEye : LuEyeOff,
      keys: 'H',
      run: ui.togglePrivacy,
    },
    { id: 'theme', label: ui.theme === 'ink' ? 'Switch to paper theme' : 'Switch to ink theme', keywords: 'dark light mode theme', icon: ui.theme === 'ink' ? LuSun : LuMoon, keys: 'T', run: ui.toggleTheme },
    { id: 'lock', label: 'Lock Gullak', keywords: 'pin lock secure', icon: LuLock, keys: 'L', run: actions.lockNow },
    { id: 'backup', label: 'Download a backup (JSON)', keywords: 'export save backup', icon: LuFileDown, run: actions.exportJSON },
    { id: 'csv', label: 'Export entries as CSV', keywords: 'excel sheet export', icon: LuFileSpreadsheet, run: actions.exportCSV },
    { id: 'shortcuts', label: 'Keyboard shortcuts', keywords: 'keys help hotkeys', icon: LuKeyboard, keys: '?', run: () => ui.openSheet('shortcuts') },
    { id: 'portfolio', label: 'Back to portfolio', keywords: 'portfolio home exit leave', icon: LuUndo2, run: actions.goPortfolio },
  ]
    .filter(Boolean)
    .map((item) => ({ ...item, section: 'Actions' }))

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  let items = [...goTo, ...commands].filter((item) => matches(item, words))
  if (words.length && query.trim().length >= 2) {
    const entries = []
    for (const t of derived.sorted) {
      const text = searchText(t, derived.lookups)
      if (!words.every((word) => text.includes(word))) continue
      const { title } = describeTxn(t, derived.lookups)
      entries.push({
        id: `txn-${t.id}`,
        section: 'Entries',
        label: title,
        hint: `${ui.privacy ? MASK : formatINR(t.amount)} · ${formatDay(t.date, { year: t.date.slice(0, 4) !== today.slice(0, 4) })}`,
        icon: categoryMeta(t.category).icon,
        run: () => actions.editEntry(t),
      })
      if (entries.length === 6) break
    }
    items = [...items, ...entries]
  }
  // Anything typed can go straight to Munshi as a question or a note ("paid 240 for lunch").
  const question = query.trim()
  if (munshi && question.length >= 3) {
    items = [...items, { id: 'ask-munshi', section: 'Munshi', label: `Ask “${question}”`, icon: LuFeather, run: () => ui.askAgent(question) }]
  }

  const current = items.length ? Math.min(active, items.length - 1) : -1

  useEffect(() => {
    if (current < 0) return
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const run = (item) => {
    onClose()
    item.run()
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!items.length) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (current >= 0) run(items[current])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Tab') {
      event.preventDefault()
    }
  }

  return (
    <div className="g-palette-layer" inert={!present}>
      <motion.div
        className="g-scrim g-scrim--light"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="g-receipt" role="dialog" aria-modal="true" aria-label="Command menu">
        <div className="g-receipt__slot" aria-hidden="true" />
        <motion.div
          ref={paper}
          className="g-receipt__paper"
          initial={{ clipPath: 'inset(0% 0% 100% 0%)' }}
          animate={{ clipPath: 'inset(0% 0% 0% 0%)', transition: { duration: 0.5, ease: [0.22, 0.9, 0.3, 1] } }}
          exit={{ clipPath: 'inset(0% 0% 100% 0%)', transition: { duration: 0.2, ease: 'easeIn' } }}
        >
          <p className="g-receipt__brand" aria-hidden="true">
            <span>GULLAK</span>
            <span>{formatDay(today)}</span>
          </p>
          <div className="g-receipt__search">
            <LuSearch aria-hidden="true" />
            <label htmlFor={inputId} className="sr-only">
              Search commands and entries
            </label>
            <input
              id={inputId}
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Type a command or search entries…"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={current >= 0 ? `${listId}-${current}` : undefined}
              autoComplete="off"
              spellCheck="false"
            />
            <kbd className="g-kbd">Esc</kbd>
          </div>
          <ul className="g-receipt__list" id={listId} role="listbox" aria-label="Results" ref={listRef}>
            {items.map((item, index) => {
              const Icon = item.icon
              const header = index === 0 || items[index - 1].section !== item.section
              return (
                <li key={item.id} role="presentation">
                  {header && (
                    <p className="g-receipt__section" aria-hidden="true">
                      {item.section}
                    </p>
                  )}
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === current}
                    tabIndex={-1}
                    data-index={index}
                    className={cx('g-receipt__item', index === current && 'is-active')}
                    onPointerMove={() => {
                      if (index !== current) setActive(index)
                    }}
                    onClick={() => run(item)}
                  >
                    {Icon && <Icon aria-hidden="true" />}
                    <span className="g-receipt__label">{item.label}</span>
                    <span className="g-receipt__dots" aria-hidden="true" />
                    {item.hint && <span className="g-receipt__hint">{item.hint}</span>}
                    {item.keys && <kbd className="g-kbd">{item.keys}</kbd>}
                  </button>
                </li>
              )
            })}
          </ul>
          {items.length === 0 && (
            <p className="g-receipt__empty">
              Nothing matches “{query.trim()}”. Try a shop name, an amount or a category.
            </p>
          )}
          <p className="g-receipt__foot" aria-hidden="true">
            <span>↑↓ move</span>
            <span>↵ open</span>
            <span>** thank you **</span>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
