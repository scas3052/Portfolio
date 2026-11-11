import { motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { LuCircleCheck, LuKeyRound, LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu'
import { setPass } from '../../agent/agentConfig'
import { describeError, testConnection } from '../../agent/client'
import { cx } from '../../lib/cx'

const MIN = 12

/** Unlocks the AI relay with the passphrase set on the server, then checks that a provider answers. */
export default function PassCard({ onUnlocked, compact = false }) {
  const id = useId()
  const [pass, setValue] = useState('')
  const [remember, setRemember] = useState(true)
  const [status, setStatus] = useState({ state: 'idle' })
  const aborter = useRef(null)

  useEffect(() => () => aborter.current?.abort(), [])

  const short = pass.trim().length < MIN

  const unlock = async (event) => {
    event.preventDefault()
    if (short || status.state === 'checking') return
    setPass(pass, remember)
    aborter.current?.abort()
    const controller = new AbortController()
    aborter.current = controller
    setStatus({ state: 'checking' })
    try {
      const result = await testConnection(controller.signal)
      if (controller.signal.aborted) return
      setStatus({ state: 'ok', text: `Connected to ${result.provider} · ${result.model} in ${result.ms} ms` })
      setValue('')
      onUnlocked?.(result)
    } catch (err) {
      if (controller.signal.aborted) return
      const info = describeError(err)
      if (info.code === 'unauthorized') setPass('', false)
      setStatus({ state: 'error', text: info.title, hint: info.hint })
    }
  }

  return (
    <motion.form
      className={cx('g-mk-pass', compact && 'is-compact')}
      onSubmit={unlock}
      initial={{ opacity: 0, rotateX: -60, y: -10 }}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      style={{ transformPerspective: 700, originY: 0 }}
    >
      <div className="g-mk-pass__lock" aria-hidden="true">
        <LuKeyRound />
      </div>
      <h3 className="g-mk-pass__title">Unlock the AI</h3>
      <p className="g-mk-pass__text">
        Enter the passphrase you set as <code>AGENT_PASSPHRASE</code> on your relay. It stays on this device.
      </p>
      <label className="g-field__label" htmlFor={`${id}-pass`}>
        Passphrase
      </label>
      <input
        id={`${id}-pass`}
        className="g-input g-input--mono"
        type="password"
        autoComplete="current-password"
        value={pass}
        onChange={(event) => setValue(event.target.value)}
        aria-describedby={`${id}-help`}
        aria-invalid={status.state === 'error' || undefined}
      />
      <small id={`${id}-help`} className="g-mk-pass__help">
        {pass && short ? `${MIN - pass.trim().length} more characters` : `At least ${MIN} characters`}
      </small>
      <div className="g-mk-pass__row">
        <span id={`${id}-remember`}>Remember on this device</span>
        <button
          type="button"
          role="switch"
          aria-checked={remember}
          aria-labelledby={`${id}-remember`}
          className={cx('g-switch', remember && 'is-on')}
          onClick={() => setRemember((on) => !on)}
        >
          <span className="g-switch__knob" />
        </button>
      </div>
      <button type="submit" className="g-btn g-btn--ink g-press g-mk-pass__go" disabled={short || status.state === 'checking'}>
        {status.state === 'checking' ? <LuLoaderCircle className="g-mk-spin" aria-hidden="true" /> : <LuKeyRound aria-hidden="true" />}
        {status.state === 'checking' ? 'Checking…' : 'Unlock'}
      </button>
      {status.state !== 'idle' && status.state !== 'checking' && (
        <p className={cx('g-mk-pass__status', `is-${status.state}`)} role="status">
          {status.state === 'ok' ? <LuCircleCheck aria-hidden="true" /> : <LuTriangleAlert aria-hidden="true" />}
          <span>
            {status.text}
            {status.hint && <small>{status.hint}</small>}
          </span>
        </p>
      )}
      <p className="g-mk-pass__fine">Quick add (“spent 200 on food”) works without this, offline and on-device.</p>
    </motion.form>
  )
}
