import { backupJSON, downloadText, transactionsCSV } from '../lib/backup'
import { curtainNavigate } from '../lib/effects'
import { formatINR, plural } from '../lib/format'
import { stamp, uid } from '../lib/id'
import { navigate } from '../lib/router'
import { portfolioBackground } from '../lib/storage'
import { useApp, useFinance, useUi } from '../store/contexts'

/** Shared commands used by several views, the palette and the insight deck. */
export function useActions() {
  const { state, dispatch, derived, today } = useFinance()
  const ui = useUi()
  // The app's web view can't download files, so the app saves them through Android's share sheet.
  const saveFile = useApp()?.saveFile

  const addEntry = (prefill = {}) => ui.openSheet('txn', { prefill })
  const editEntry = (txn) => ui.openSheet('txn', { txn })

  const deleteEntry = (txn) => {
    dispatch({ type: 'txn/delete', id: txn.id })
    ui.toast('Entry deleted', {
      tone: 'rose',
      action: { label: 'Undo', run: () => dispatch({ type: 'txn/restore', txn }) },
    })
  }

  const logEmi = (status) => {
    const { loan } = status
    if (!(loan.emi > 0)) {
      addEntry({ type: 'emi', loanId: loan.id })
      return
    }
    const txn = {
      id: uid('t'),
      type: 'emi',
      amount: loan.emi,
      date: today,
      note: '',
      category: 'emi',
      accountId: loan.accountId,
      toAccountId: '',
      personId: '',
      loanId: loan.id,
      createdAt: stamp(),
    }
    dispatch({ type: 'txn/add', txn })
    const left = status.remaining - 1
    if (left <= 0) ui.celebrate('paidoff', `${loan.name} is fully paid off`)
    else ui.celebrate('emi', `${loan.name} · ${plural(left, 'EMI')} to go`)
    ui.toast(ui.privacy ? `Logged an EMI for ${loan.name}` : `Logged ${formatINR(loan.emi)} for ${loan.name}`, {
      tone: 'coral',
      action: { label: 'Undo', run: () => dispatch({ type: 'txn/delete', id: txn.id }) },
    })
  }

  const settle = (person, type) =>
    addEntry({ type, personId: person.id, amount: Math.abs(person.net) || '' })

  const runInsight = (action) => {
    if (!action) return
    switch (action.kind) {
      case 'add':
        addEntry({ type: 'expense' })
        break
      case 'emi':
        addEntry({ type: 'emi', loanId: action.loanId })
        break
      case 'paycard': {
        // Pay from wherever this card was last paid from; otherwise the form picks.
        const last = derived.sorted.find(
          (t) => t.type === 'transfer' && t.toAccountId === action.accountId && derived.lookups.accounts.has(t.accountId),
        )
        addEntry({ type: 'transfer', accountId: last?.accountId, toAccountId: action.accountId, amount: action.amount })
        break
      }
      case 'collect':
      case 'repay': {
        const person = derived.people.find((p) => p.id === action.personId)
        if (person) settle(person, action.kind)
        break
      }
      case 'nav':
        navigate(action.view, action.params)
        break
      case 'contribute':
        ui.openSheet('contribute', { goalId: action.goalId })
        break
      case 'edit': {
        const txn = state.transactions.find((t) => t.id === action.txnId)
        if (txn) editEntry(txn)
        break
      }
      default:
        break
    }
  }

  const exportJSON = () => {
    const name = `gullak-backup-${today}.json`
    const text = backupJSON(state, new Date().toISOString())
    if (saveFile) {
      saveFile(name, text, 'application/json').catch(() => ui.toast('Couldn’t save the backup.', { tone: 'rose' }))
      return
    }
    downloadText(name, text)
    ui.toast('Backup downloaded. Keep it somewhere safe.', { tone: 'lime' })
  }

  const exportCSV = () => {
    const name = `gullak-entries-${today}.csv`
    const text = transactionsCSV(state)
    if (saveFile) {
      saveFile(name, text, 'text/csv').catch(() => ui.toast('Couldn’t save the CSV.', { tone: 'rose' }))
      return
    }
    downloadText(name, text, 'text/csv')
    ui.toast(`Exported ${plural(state.transactions.length, 'entry', 'entries')} as CSV`, { tone: 'lime' })
  }

  const lockNow = () => {
    if (!ui.lock()) ui.toast('Set a PIN in Settings to use the lock.', { tone: 'butter' })
  }

  const goPortfolio = () => curtainNavigate('../', portfolioBackground())

  return { addEntry, editEntry, deleteEntry, logEmi, settle, runInsight, exportJSON, exportCSV, lockNow, goPortfolio }
}
