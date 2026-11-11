// The chat behind the Munshi panel: messages, the running turn, offline quick add and persistence.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { uid } from '../lib/id'
import { useFinance, useUi } from '../store/contexts'
import { clearChat, getAgentConfig, loadChat, onChatCleared, saveChat } from './agentConfig'
import { buildHistory, runAgent } from './agentLoop'
import { AgentError, describeError } from './client'
import { quickParse } from './quickParse'

const MAX_INPUT = 2000
const OFFLINE_NOTE = 'Read offline, so give it a quick check before saving.'

const reply = (fields) => ({ id: uid('m'), role: 'assistant', text: '', drafts: [], steps: [], at: Date.now(), ...fields })

/**
 * Messages are `{id, role:'user', text}` or `{id, role:'assistant', text, drafts, steps,
 * source:'ai'|'quick', meta?, error?, stopped?, streaming?}`. Drafts carry their own `status`.
 */
export function useAgent() {
  const finance = useFinance()
  const ui = useUi()
  const [messages, setMessages] = useState(loadChat)
  const [busy, setBusy] = useState(false)
  const [unreadAt, setUnreadAt] = useState(0)
  const ctxRef = useRef(null)
  const messagesRef = useRef(messages)
  const controllerRef = useRef(null)

  useLayoutEffect(() => {
    ctxRef.current = { ...finance, ui }
    messagesRef.current = messages
  })

  useEffect(() => {
    if (!busy) saveChat(messages)
  }, [messages, busy])

  useEffect(
    () =>
      onChatCleared(() => {
        controllerRef.current?.abort()
        setMessages([])
      }),
    [],
  )

  useEffect(() => () => controllerRef.current?.abort(), [])

  const patch = useCallback((id, change) => {
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)))
  }, [])

  const runAI = useCallback(
    async (text, history) => {
      const placeholder = reply({ source: 'ai', streaming: true })
      const { id } = placeholder
      const controller = new AbortController()
      controllerRef.current = controller
      setBusy(true)
      setMessages((list) => [...list, placeholder])
      let frame = 0
      let streamed = null
      const flush = () => {
        frame = 0
        if (streamed !== null) patch(id, { text: streamed })
      }
      try {
        const result = await runAgent({
          text,
          history,
          getCtx: () => ctxRef.current,
          signal: controller.signal,
          onDelta: (partial) => {
            streamed = partial
            frame ||= requestAnimationFrame(flush)
          },
          onStep: ({ steps, drafts }) => patch(id, { steps, drafts }),
        })
        patch(id, { text: result.text, drafts: result.drafts, steps: result.steps, meta: result.meta, streaming: false, at: Date.now() })
      } catch (err) {
        const stopped = err instanceof AgentError && err.code === 'aborted'
        patch(id, (m) =>
          stopped
            ? { streaming: false, stopped: true, text: streamed ?? m.text }
            : { streaming: false, error: describeError(err), text: '' },
        )
      } finally {
        cancelAnimationFrame(frame)
        if (controllerRef.current === controller) controllerRef.current = null
        setBusy(false)
        setUnreadAt(Date.now())
      }
    },
    [patch],
  )

  /** Quick add answers plain entries offline; everything else goes to the model. */
  const send = useCallback(
    (raw) => {
      const text = String(raw ?? '').trim().slice(0, MAX_INPUT)
      if (!text || controllerRef.current) return false
      const config = getAgentConfig()
      const history = buildHistory(messagesRef.current)
      const user = { id: uid('m'), role: 'user', text, at: Date.now() }
      const quick = config.quickAdd ? quickParse(text, ctxRef.current) : null
      const offline = !config.hasPass || navigator.onLine === false
      if (quick?.confident || (offline && quick?.drafts.length)) {
        const note = quick.confident ? '' : OFFLINE_NOTE
        setMessages((list) => [...list, user, reply({ source: 'quick', text: note, drafts: quick.drafts })])
        setUnreadAt(Date.now())
        return true
      }
      if (offline) {
        const error = describeError(new AgentError(config.hasPass ? 'network' : 'no_pass'))
        setMessages((list) => [...list, user, reply({ source: 'ai', error })])
        return true
      }
      setMessages((list) => [...list, user])
      runAI(text, history)
      return true
    },
    [runAI],
  )

  /** Re-asks the model for the question behind a reply: retries a failure, or swaps a quick-add guess for an AI answer. */
  const retry = useCallback(
    (messageId) => {
      if (controllerRef.current) return
      const list = messagesRef.current
      const index = list.findIndex((m) => m.id === messageId)
      let ask = index - 1
      while (ask >= 0 && list[ask].role !== 'user') ask -= 1
      if (index < 0 || ask < 0) return
      const question = list[ask]
      const latest = index === list.length - 1
      // An older reply is re-asked at the bottom, with the question repeated so the answer reads in order.
      setMessages((current) => {
        const rest = current.filter((m) => m.id !== messageId)
        return latest ? rest : [...rest, { ...question, id: uid('m'), at: Date.now() }]
      })
      const before = latest ? list.slice(0, ask) : list.filter((m) => m.id !== messageId && m.id !== question.id)
      runAI(question.text, buildHistory(before))
    },
    [runAI],
  )

  const stop = useCallback(() => controllerRef.current?.abort(), [])

  const clear = useCallback(() => {
    controllerRef.current?.abort()
    clearChat()
  }, [])

  const updateDraft = useCallback(
    (messageId, draftId, change) => {
      patch(messageId, (m) => ({ drafts: (m.drafts || []).map((d) => (d.id === draftId ? { ...d, ...change } : d)) }))
    },
    [patch],
  )

  return useMemo(
    () => ({ messages, busy, unreadAt, send, retry, stop, clear, updateDraft }),
    [messages, busy, unreadAt, send, retry, stop, clear, updateDraft],
  )
}
