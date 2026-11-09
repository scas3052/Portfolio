import { LuFlaskConical } from 'react-icons/lu'
import { uid } from '../../lib/id'
import { navigate } from '../../lib/router'
import { useFinance, useUi } from '../../store/contexts'

/** Taped note shown while the book is filled with sample data. */
export default function SampleBanner() {
  const { state, dispatch } = useFinance()
  const ui = useUi()
  if (!state.meta.sample) return null

  const startOwn = () =>
    ui.openSheet('confirm', {
      title: 'Start your own book?',
      body: 'This clears the sample entries, accounts, loans, people and goals so you can add your real ones. Your name, theme and PIN stay as they are.',
      confirmLabel: 'Wipe sample & start',
      tone: 'rose',
      onConfirm: () => {
        dispatch({
          type: 'onboard/fresh',
          account: { id: uid('a'), name: 'Cash', kind: 'cash', opening: 0, color: 'butter' },
        })
        navigate('overview')
        ui.toast('Fresh book ready. Add your accounts, then log your first entry.', { tone: 'lime' })
      },
    })

  return (
    <div className="g-banner" role="note">
      <span className="g-banner__tape" aria-hidden="true" />
      <LuFlaskConical className="g-banner__icon" aria-hidden="true" />
      <p className="g-banner__text">
        <strong>You’re exploring sample data.</strong> Poke around freely — none of it is real.
      </p>
      <button type="button" className="g-btn g-btn--sm g-btn--ink g-press" onClick={startOwn}>
        Start my own book
      </button>
    </div>
  )
}
