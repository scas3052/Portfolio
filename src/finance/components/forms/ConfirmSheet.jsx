import { toneVar } from '../../lib/cx'
import { HoldButton } from '../bits'

/** Generic "are you sure?" sheet. Risky actions can ask for a press-and-hold. */
export default function ConfirmSheet({ body, confirmLabel = 'Confirm', tone = 'rose', hold = false, onConfirm, onDone }) {
  const run = () => {
    onDone()
    onConfirm?.()
  }

  return (
    <div className="g-form g-confirm">
      {body && <div className="g-confirm__body">{body}</div>}
      <div className="g-form__actions">
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone} autoFocus={hold}>
          Cancel
        </button>
        {hold ? (
          <HoldButton tone={tone} onConfirm={run}>
            {confirmLabel}
          </HoldButton>
        ) : (
          <button type="button" className="g-btn g-press" style={toneVar(tone)} onClick={run} autoFocus>
            {confirmLabel}
          </button>
        )}
      </div>
    </div>
  )
}
