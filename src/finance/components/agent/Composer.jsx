import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LuCircleStop, LuMic, LuSendHorizontal } from 'react-icons/lu'
import { cx } from '../../lib/cx'
import { useApp } from '../../store/contexts'

const MAX = 2000
const MAX_HEIGHT = 136
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

/** The pen: an autosizing note field with voice input. Enter sends, Shift+Enter starts a new line. */
export default function Composer({ busy, onSend, onStop, voiceLang = 'en-IN', onField, onNotice, seed, placeholder }) {
  // The app's web view has no speech service behind SpeechRecognition, so the mic only shows in browsers.
  const native = Boolean(useApp()?.native)
  const canListen = Boolean(Recognition) && !native
  const [value, setValue] = useState('')
  const [seenSeed, setSeenSeed] = useState(seed)
  const [listening, setListening] = useState(false)
  const field = useRef(null)
  const recognition = useRef(null)
  const spoken = useRef('')

  if (seed !== seenSeed) {
    setSeenSeed(seed)
    if (seed) setValue(seed.text.slice(0, MAX))
  }

  useEffect(() => {
    const node = field.current
    if (!seed || !node) return
    node.focus({ preventScroll: true })
    node.setSelectionRange(node.value.length, node.value.length)
  }, [seed])

  useLayoutEffect(() => {
    const node = field.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  useEffect(() => () => recognition.current?.abort(), [])

  const setRefs = (node) => {
    field.current = node
    onField?.(node)
  }

  const submit = () => {
    if (busy) return
    recognition.current?.stop()
    if (onSend(value)) setValue('')
  }

  const toggleMic = () => {
    if (!canListen) return
    if (recognition.current) {
      recognition.current.stop()
      return
    }
    const rec = new Recognition()
    rec.lang = voiceLang
    rec.interimResults = true
    rec.continuous = false
    spoken.current = value.trim() ? `${value.trimEnd()} ` : ''
    rec.onresult = (event) => {
      let heard = ''
      for (const result of event.results) heard += result[0].transcript
      setValue((spoken.current + heard).slice(0, MAX))
    }
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') onNotice?.('Microphone access is blocked for this site.')
      else if (event.error === 'no-speech') onNotice?.('Didn’t catch that. Try again a little closer.')
    }
    rec.onend = () => {
      recognition.current = null
      setListening(false)
      field.current?.focus({ preventScroll: true })
    }
    try {
      rec.start()
      recognition.current = rec
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const near = value.length > MAX - 400

  return (
    <form
      className={cx('g-mk-composer', listening && 'is-listening', busy && 'is-busy')}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="sr-only" htmlFor="g-mk-input">
        Ask Munshi or note something down
      </label>
      <textarea
        id="g-mk-input"
        ref={setRefs}
        className="g-mk-composer__field"
        rows={1}
        value={value}
        maxLength={MAX}
        placeholder={listening ? 'Listening…' : placeholder || 'Ask, or note: “spent 240 on lunch”'}
        enterKeyHint="send"
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
      />
      {near && (
        <span className={cx('g-mk-composer__count', value.length >= MAX && 'is-full')} aria-live="polite">
          {value.length}/{MAX}
        </span>
      )}
      {canListen && (
        <button
          type="button"
          className={cx('g-icon-btn g-press g-mk-mic', listening && 'is-on')}
          onClick={toggleMic}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : 'Speak instead'}
          disabled={busy}
        >
          {listening ? (
            <span className="g-mk-eq" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          ) : (
            <LuMic aria-hidden="true" />
          )}
        </button>
      )}
      {busy ? (
        <button type="button" className="g-icon-btn g-press g-mk-send is-stop" onClick={onStop} aria-label="Stop">
          <LuCircleStop aria-hidden="true" />
        </button>
      ) : (
        <button type="submit" className="g-icon-btn g-press g-mk-send" aria-label="Send" disabled={!value.trim()}>
          <LuSendHorizontal aria-hidden="true" />
        </button>
      )}
    </form>
  )
}
