import { AnimatePresence } from 'motion/react'
import { createPortal } from 'react-dom'
import { useUi } from '../../store/contexts'
import AccountForm from '../forms/AccountForm'
import BudgetForm from '../forms/BudgetForm'
import ConfirmSheet from '../forms/ConfirmSheet'
import ContributeForm from '../forms/ContributeForm'
import GoalForm from '../forms/GoalForm'
import LoanForm from '../forms/LoanForm'
import MoreMenu from '../forms/MoreMenu'
import PersonForm from '../forms/PersonForm'
import PinForm from '../forms/PinForm'
import Shortcuts from '../forms/Shortcuts'
import TxnForm from '../forms/TxnForm'
import Sheet from './Sheet'

const KINDS = {
  txn: { Form: TxnForm, tone: 'lime', kicker: 'Money book', title: (p) => (p.txn ? 'Edit entry' : 'New entry') },
  account: { Form: AccountForm, tone: 'butter', kicker: 'Accounts', title: (p) => (p.account ? 'Edit account' : 'Add an account') },
  loan: { Form: LoanForm, tone: 'coral', kicker: 'EMIs & loans', title: (p) => (p.loan ? 'Edit loan' : 'Add a loan or EMI') },
  person: { Form: PersonForm, tone: 'mint', kicker: 'Lend & owe', title: (p) => (p.person ? 'Edit person' : 'Add a person') },
  budget: { Form: BudgetForm, tone: 'lilac', kicker: 'Plan', title: () => 'Monthly budgets', wide: true },
  goal: { Form: GoalForm, tone: 'sky', kicker: 'Savings goal', title: (p) => (p.goal ? 'Edit goal' : 'New savings goal') },
  contribute: { Form: ContributeForm, tone: 'sky', kicker: 'Savings goal', title: () => 'Move money in or out' },
  pin: { Form: PinForm, tone: 'butter', kicker: 'Security', title: () => 'PIN lock' },
  confirm: { Form: ConfirmSheet, tone: 'rose', kicker: 'Check', title: (p) => p.title || 'Are you sure?' },
  more: { Form: MoreMenu, tone: 'tan', kicker: 'Gullak', title: () => 'Everything else' },
  shortcuts: { Form: Shortcuts, tone: 'sky', kicker: 'Speed run', title: () => 'Keyboard shortcuts', wide: true },
}

/** Renders whichever form sheet is open, with enter/exit animations. */
export default function SheetHost() {
  const { sheet, closeSheet } = useUi()
  const config = sheet ? KINDS[sheet.kind] : null

  return createPortal(
    <AnimatePresence>
      {config && (
        <Sheet
          key={sheet.key}
          title={config.title(sheet.props)}
          kicker={config.kicker}
          tone={config.tone}
          wide={config.wide}
          onClose={closeSheet}
        >
          <config.Form {...sheet.props} onDone={closeSheet} />
        </Sheet>
      )}
    </AnimatePresence>,
    document.body,
  )
}
