import { motion, useAnimate } from 'motion/react'
import { useState } from 'react'
import { LuDelete, LuKeyRound, LuX } from 'react-icons/lu'
import { useKeydown } from '../../hooks/useKeydown'
import { cx } from '../../lib/cx'
import { checkPin, PIN_LENGTH } from '../../lib/pin'
import { useCloud, useFinance, useUi } from '../../store/contexts'
import { HoldButton } from '../bits'
import CloudForgot from '../cloud/CloudForgot'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']
const TICKS = Array.from({ length: 40 }, (_, i) => i)
const DOOR = { duration: 0.62, ease: [0.76, 0, 0.24, 1] }

/** Vault doors close over the app until the right PIN spins the dial open. */
export default function LockScreen() {
  const { state, dispatch } = useFinance()
  const { unlock } = useUi()
  const { linked } = useCloud()
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState('idle')
  const [forgot, setForgot] = useState(false)
  const [scope, animate] = useAnimate()

  const press = (key) => {
    if (status === 'ok') return
    if (key === 'clear') {
      setPin('')
      return
    }
    if (key === 'back') {
      setPin((value) => value.slice(0, -1))
      return
    }
    if (pin.length >= PIN_LENGTH) return
    const next = pin + key
    setPin(next)
    setStatus('idle')
    if (next.length < PIN_LENGTH) return
    if (checkPin(next, state.settings.pinHash)) {
      setStatus('ok')
      setTimeout(unlock, 420)
    } else {
      setStatus('wrong')
      animate(scope.current, { x: [0, -16, 13, -9, 6, -2, 0] }, { duration: 0.45 })
      setTimeout(() => setPin(''), 260)
    }
  }

  useKeydown((event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (/^\d$/.test(event.key)) press(event.key)
    else if (event.key === 'Backspace') press('back')
    else if (event.key === 'Escape') press('clear')
    else return
    event.preventDefault()
  }, !forgot)

  const turns = status === 'ok' ? 2 : 0
  const dialRotate = turns * 360 + pin.length * 90 + (status === 'wrong' ? -30 : 0)

  return (
    <div className="g-lock" role="dialog" aria-modal="true" aria-label="Gullak is locked">
      <motion.div className="g-lock__door g-lock__door--left" initial={{ x: '-101%' }} animate={{ x: 0 }} exit={{ x: '-101%' }} transition={DOOR} />
      <motion.div className="g-lock__door g-lock__door--right" initial={{ x: '101%' }} animate={{ x: 0 }} exit={{ x: '101%' }} transition={DOOR} />
      <motion.div
        className="g-lock__panel"
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: 1, transition: { delay: 0.32, type: 'spring', stiffness: 300, damping: 22 } }}
        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.16 } }}
      >
        <div className="g-lock__dialwrap" ref={scope}>
          <motion.svg
            className={cx('g-lock__dial', status === 'ok' && 'is-ok', status === 'wrong' && 'is-wrong')}
            viewBox="0 0 120 120"
            aria-hidden="true"
            animate={{ rotate: dialRotate }}
            transition={{ type: 'spring', stiffness: status === 'ok' ? 60 : 150, damping: status === 'ok' ? 16 : 13 }}
          >
            <circle cx="60" cy="60" r="56" className="g-lock__rim" />
            {TICKS.map((i) => (
              <line
                key={i}
                x1="60"
                y1="7"
                x2="60"
                y2={i % 5 === 0 ? 17 : 12}
                className={i % 5 === 0 ? 'g-lock__tick g-lock__tick--major' : 'g-lock__tick'}
                transform={`rotate(${i * 9} 60 60)`}
              />
            ))}
            <circle cx="60" cy="60" r="34" className="g-lock__hub" />
            <path d="M60 22 l-6 -9 h12 z" className="g-lock__pointer" />
          </motion.svg>
          <span className="g-lock__keyhole" aria-hidden="true">
            <LuKeyRound />
          </span>
        </div>

        <p className="g-lock__hello">
          {status === 'ok' ? 'Opening…' : `Hi ${state.settings.name || 'there'}, enter your PIN`}
        </p>
        <div className="g-lock__dots" aria-hidden="true">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className={cx('g-lock__dot', i < pin.length && 'is-filled', status === 'ok' && 'is-ok')} />
          ))}
        </div>
        <p className="sr-only" aria-live="assertive">
          {status === 'wrong' ? 'Wrong PIN, try again.' : status === 'ok' ? 'Unlocked.' : `${pin.length} of ${PIN_LENGTH} digits entered`}
        </p>

        {forgot && linked ? (
          // Erasing here would sync an empty book to every device, so a syncing device asks Google instead.
          <CloudForgot onCancel={() => setForgot(false)} />
        ) : forgot ? (
          <div className="g-lock__forgot">
            <p>
              The PIN only hides Gullak on this browser, so it can’t be recovered. To start over, hold the button: it
              erases everything saved here. You can import a backup afterwards.
            </p>
            <HoldButton tone="coral" duration={1600} onConfirm={() => dispatch({ type: 'data/clear' })}>
              Erase everything
            </HoldButton>
            <button type="button" className="g-btn g-btn--ghost g-btn--sm g-press" onClick={() => setForgot(false)}>
              <LuX aria-hidden="true" /> Never mind
            </button>
          </div>
        ) : (
          <>
            <div className="g-lock__pad">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={cx('g-lock__key g-press', (key === 'clear' || key === 'back') && 'g-lock__key--fn')}
                  onClick={() => press(key)}
                  aria-label={key === 'back' ? 'Delete last digit' : key === 'clear' ? 'Clear' : key}
                >
                  {key === 'back' ? <LuDelete aria-hidden="true" /> : key === 'clear' ? 'C' : key}
                </button>
              ))}
            </div>
            <button type="button" className="g-lock__link" onClick={() => setForgot(true)}>
              Forgot PIN?
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
