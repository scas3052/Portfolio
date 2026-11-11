import { useEffect, useId, useRef, useState } from 'react'
import {
  LuCircleCheck,
  LuEraser,
  LuKeyRound,
  LuLoaderCircle,
  LuPlugZap,
  LuRotateCcw,
  LuTriangleAlert,
  LuUnlink,
} from 'react-icons/lu'
import {
  clearChat,
  DEFAULT_ENDPOINT,
  forgetPass,
  saveAgentSettings,
  setPass,
  useAgentConfig,
  validEndpoint,
} from '../../agent/agentConfig'
import { describeError, getRelayStatus, testConnection } from '../../agent/client'
import { cx } from '../../lib/cx'
import { useUi } from '../../store/contexts'

const MIN = 12
const HAS_VOICE = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
const VOICES = [
  ['en-IN', 'English (India)'],
  ['hi-IN', 'Hindi'],
  ['te-IN', 'Telugu'],
  ['ta-IN', 'Tamil'],
  ['kn-IN', 'Kannada'],
  ['ml-IN', 'Malayalam'],
  ['mr-IN', 'Marathi'],
  ['bn-IN', 'Bengali'],
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
]

function EndpointField({ initial, onSave }) {
  const [draft, setDraft] = useState(initial)
  const commit = () => {
    const next = onSave(draft)
    setDraft(next)
  }
  return (
    <input
      className="g-input g-input--mono"
      value={draft}
      maxLength={300}
      spellCheck="false"
      autoComplete="off"
      inputMode="url"
      aria-label="Relay address"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/** The "Munshi" group in Settings: relay passphrase, provider, quick add, voice and chat history. */
export default function AssistantSettings() {
  const id = useId()
  const ui = useUi()
  const config = useAgentConfig()
  const [pass, setValue] = useState('')
  const [remember, setRemember] = useState(true)
  const [check, setCheck] = useState({ state: 'idle' })
  const [providers, setProviders] = useState(null)
  const aborter = useRef(null)

  useEffect(() => () => aborter.current?.abort(), [])

  // Fill the provider list from the relay whenever a passphrase is available.
  useEffect(() => {
    if (!config.hasPass) return undefined
    const controller = new AbortController()
    getRelayStatus(controller.signal)
      .then((status) => {
        if (!controller.signal.aborted) setProviders(status.providers)
      })
      .catch(() => {
        if (!controller.signal.aborted) setProviders(null)
      })
    return () => controller.abort()
  }, [config.hasPass, config.endpoint])

  const short = pass.trim().length < MIN
  const checking = check.state === 'checking'

  const run = async (unlocking) => {
    aborter.current?.abort()
    const controller = new AbortController()
    aborter.current = controller
    setCheck({ state: 'checking' })
    try {
      const result = await testConnection(controller.signal)
      if (controller.signal.aborted) return
      setProviders(result.providers)
      setCheck({ state: 'ok', text: `${result.provider} · ${result.model} answered in ${result.ms} ms` })
      if (unlocking) {
        setValue('')
        ui.toast('Munshi is unlocked', { tone: 'mint' })
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const info = describeError(err)
      if (info.code === 'unauthorized') setPass('', false)
      setCheck({ state: 'error', text: info.title, hint: info.hint })
    }
  }

  const unlock = (event) => {
    event.preventDefault()
    if (short || checking) return
    setPass(pass, remember)
    run(true)
  }

  const forget = () => {
    aborter.current?.abort()
    forgetPass()
    setProviders(null)
    setCheck({ state: 'idle' })
    ui.toast('Passphrase removed from this device', { tone: 'butter' })
  }

  const saveEndpoint = (text) => {
    const next = validEndpoint(text)
    if (!next) {
      ui.toast('That isn’t a relay address. Use /api/agent or a full https:// link.', { tone: 'rose' })
      return config.endpoint
    }
    if (next !== config.endpoint) {
      saveAgentSettings({ endpoint: next })
      setCheck({ state: 'idle' })
      ui.toast('Relay address saved', { tone: 'lime' })
    }
    return next
  }

  const askClear = () =>
    ui.openSheet('confirm', {
      title: 'Clear Munshi’s chat?',
      body: 'Entries you already confirmed stay saved. Drafts you haven’t confirmed will be gone.',
      confirmLabel: 'Clear chat',
      tone: 'rose',
      onConfirm: () => {
        clearChat()
        ui.toast('Chat cleared', { tone: 'gray' })
      },
    })

  const known = providers || []
  const savedMissing = config.provider && !known.some((p) => p.id === config.provider)

  return (
    <>
      <p className="g-settings__note">
        Ask Munshi about your money, or tell it what happened (“lent 500 to Ravi”) and it drafts the entry. Nothing is
        saved until you confirm the card.
      </p>

      <div className="g-settings__row">
        <span className="g-settings__label">
          AI access
          <small>
            {config.hasPass
              ? config.remembered
                ? 'Unlocked and remembered on this device.'
                : 'Unlocked for this tab only.'
              : 'Locked. Quick add still works offline.'}
          </small>
        </span>
        <span className={cx('g-mk-set__state', config.hasPass && 'is-on')}>
          <span className="g-mk-set__dot" aria-hidden="true" />
          {config.hasPass ? 'Unlocked' : 'Locked'}
        </span>
      </div>

      {config.hasPass ? (
        <div className="g-settings__actions">
          <button type="button" className="g-btn g-btn--ink g-press" onClick={() => run(false)} disabled={checking}>
            {checking ? <LuLoaderCircle className="g-mk-spin" aria-hidden="true" /> : <LuPlugZap aria-hidden="true" />}
            {checking ? 'Testing…' : 'Test connection'}
          </button>
          <button type="button" className="g-btn g-press" onClick={forget}>
            <LuUnlink aria-hidden="true" /> Forget passphrase
          </button>
        </div>
      ) : (
        <form className="g-mk-set__unlock" onSubmit={unlock}>
          <label className="g-field__label" htmlFor={`${id}-pass`}>
            Relay passphrase
          </label>
          <input
            id={`${id}-pass`}
            className="g-input g-input--mono"
            type="password"
            autoComplete="current-password"
            value={pass}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={`${id}-pass-help`}
            aria-invalid={check.state === 'error' || undefined}
          />
          <small id={`${id}-pass-help`} className="g-mk-set__help">
            The <code>AGENT_PASSPHRASE</code> you set on Vercel or Netlify.{' '}
            {pass && short ? `${MIN - pass.trim().length} more characters.` : `At least ${MIN} characters.`}
          </small>
          <div className="g-mk-set__line">
            <span id={`${id}-remember`}>Remember on this device</span>
            <button
              type="button"
              role="switch"
              aria-checked={remember}
              aria-labelledby={`${id}-remember`}
              className={cx('g-switch', remember && 'is-on')}
              onClick={() => setRemember((on) => !on)}
            >
              <span className="g-switch__knob" aria-hidden="true" />
            </button>
          </div>
          <button type="submit" className="g-btn g-btn--ink g-press" disabled={short || checking}>
            {checking ? <LuLoaderCircle className="g-mk-spin" aria-hidden="true" /> : <LuKeyRound aria-hidden="true" />}
            {checking ? 'Checking…' : 'Unlock Munshi'}
          </button>
        </form>
      )}

      {(check.state === 'ok' || check.state === 'error') && (
        <p className={cx('g-mk-set__check', `is-${check.state}`)} role="status">
          {check.state === 'ok' ? <LuCircleCheck aria-hidden="true" /> : <LuTriangleAlert aria-hidden="true" />}
          <span>
            {check.text}
            {check.hint && <small>{check.hint}</small>}
          </span>
        </p>
      )}

      <div className="g-settings__row">
        <label className="g-settings__label" htmlFor={`${id}-provider`}>
          AI provider
          <small>Automatic tries each free provider on the relay until one answers.</small>
        </label>
        <select
          id={`${id}-provider`}
          className="g-select g-mk-set__select"
          value={config.provider}
          onChange={(event) => saveAgentSettings({ provider: event.target.value })}
        >
          <option value="">Automatic</option>
          {known.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.model ? ` · ${p.model}` : ''}
            </option>
          ))}
          {savedMissing && <option value={config.provider}>{config.provider}</option>}
        </select>
      </div>

      <div className="g-settings__row">
        <span className="g-settings__label" id={`${id}-quick`}>
          Quick add
          <small>Simple notes like “spent 200 on food” become drafts instantly, on this device, without the AI.</small>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={config.quickAdd}
          aria-labelledby={`${id}-quick`}
          className={cx('g-switch', config.quickAdd && 'is-on')}
          onClick={() => saveAgentSettings({ quickAdd: !config.quickAdd })}
        >
          <span className="g-switch__knob" aria-hidden="true" />
        </button>
      </div>

      {HAS_VOICE && (
        <div className="g-settings__row">
          <label className="g-settings__label" htmlFor={`${id}-voice`}>
            Voice language
            <small>For the mic in Munshi’s message box.</small>
          </label>
          <select
            id={`${id}-voice`}
            className="g-select g-mk-set__select"
            value={config.voiceLang}
            onChange={(event) => saveAgentSettings({ voiceLang: event.target.value })}
          >
            {!VOICES.some(([code]) => code === config.voiceLang) && (
              <option value={config.voiceLang}>{config.voiceLang}</option>
            )}
            {VOICES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="g-settings__row g-settings__row--stack">
        <span className="g-settings__label">
          Relay address
          <small>Keep /api/agent when this site is deployed with its relay. Use a full https:// link to share another one.</small>
        </span>
        <div className="g-mk-set__endpoint">
          <EndpointField key={config.endpoint} initial={config.endpoint} onSave={saveEndpoint} />
          {config.endpoint !== DEFAULT_ENDPOINT && (
            <button
              type="button"
              className="g-btn g-btn--ghost g-press"
              onClick={() => saveEndpoint(DEFAULT_ENDPOINT)}
              aria-label="Reset the relay address"
            >
              <LuRotateCcw aria-hidden="true" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="g-settings__actions">
        <button type="button" className="g-btn g-press" onClick={askClear}>
          <LuEraser aria-hidden="true" /> Clear chat history
        </button>
      </div>

      <p className="g-settings__fine">
        Questions and the few numbers needed to answer them go through your relay to the AI provider. The passphrase and
        chat stay in this browser and are never part of backups.
      </p>
    </>
  )
}
