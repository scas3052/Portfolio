import { AnimatePresence } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { commitDraft, commitDrafts } from '../../agent/commit'
import { useAgent } from '../../agent/useAgent'
import { useFinance, useUi } from '../../store/contexts'
import AgentLauncher from './AgentLauncher'
import AgentPanel from './AgentPanel'

/** Wraps ui.toast so that pressing Undo on a save toast also flips the voucher back to pending. */
function withUndoHook(finance, ui, onUndone) {
  const toast = (message, options = {}) => {
    const action = options.action
    if (!action) return ui.toast(message, options)
    return ui.toast(message, {
      ...options,
      action: {
        ...action,
        run: () => {
          action.run()
          onUndone()
        },
      },
    })
  }
  return { ...finance, ui: { ...ui, toast } }
}

function AgentDock() {
  const finance = useFinance()
  const ui = useUi()
  const agent = useAgent()
  const { updateDraft, retry, send } = agent
  const { agentOpen, agentClosedAt, agentPrompt, takeAgentPrompt, setAgentOpen, locked, toast } = ui
  const live = useRef(null)
  const asked = useRef('')

  useLayoutEffect(() => {
    live.current = { finance, ui }
  })

  // A question handed over by the command palette is sent once, as soon as the panel opens.
  useEffect(() => {
    if (!agentPrompt || locked || asked.current === agentPrompt.id) return
    asked.current = agentPrompt.id
    takeAgentPrompt(agentPrompt.id)
    if (!send(agentPrompt.text)) toast('Munshi is still writing the last answer. Ask again in a moment.', { tone: 'butter' })
  }, [agentPrompt, locked, send, takeAgentPrompt, toast])

  const actions = useMemo(() => {
    const ctxFor = (onUndone) => withUndoHook(live.current.finance, live.current.ui, onUndone)
    // The saved entry's id lets Munshi change or delete it in a later turn.
    const saved = (draft, record) => ({
      status: 'saved',
      error: '',
      ...((draft.kind === 'entry' || draft.kind === 'update') && record?.id ? { entryId: record.id } : {}),
    })
    const mark = (messageId, draft) => (record) => updateDraft(messageId, draft.id, saved(draft, record))

    return {
      retry,
      setStatus: (message, draft, status) => updateDraft(message.id, draft.id, { status, error: '' }),

      confirm: (message, draft) => {
        if (message.streaming || draft.status !== 'pending') return
        const reopen = () => updateDraft(message.id, draft.id, { status: 'pending' })
        const result = commitDraft(ctxFor(reopen), draft)
        updateDraft(message.id, draft.id, result.ok ? saved(draft, result.record) : { error: result.error })
      },

      confirmAll: (message) => {
        if (message.streaming) return
        const pending = (message.drafts || []).filter((d) => d.status === 'pending' && !d.needsEdit)
        let saved = []
        const reopen = () => saved.forEach((id) => updateDraft(message.id, id, { status: 'pending' }))
        const outcomes = commitDrafts(ctxFor(reopen), pending)
        saved = outcomes.filter((o) => o.ok).map((o) => o.draft.id)
        outcomes.forEach((o) => updateDraft(message.id, o.draft.id, o.ok ? saved(o.draft, o.record) : { error: o.error }))
      },

      edit: (message, draft) => {
        const { openSheet } = live.current.ui
        const onSaved = mark(message.id, draft)
        const data = draft.data || {}
        if (draft.kind === 'entry') {
          openSheet('txn', { prefill: data, onSaved })
        } else if (draft.kind === 'update') {
          const current = live.current.finance.state.transactions.find((t) => t.id === data.id)
          openSheet('txn', current ? { txn: current, prefill: data.after, onSaved } : { prefill: data.after, onSaved })
        } else if (draft.kind === 'setup') {
          openSheet(data.setup, { prefill: data.prefill, onSaved })
        }
      },
    }
  }, [updateDraft, retry])

  const visible = !locked

  return (
    <>
      <AnimatePresence>
        {visible && !agentOpen && (
          <AgentLauncher key="launcher" unread={agent.unreadAt > agentClosedAt} onOpen={() => setAgentOpen(true)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {visible && agentOpen && (
          <AgentPanel key="panel" agent={agent} finance={finance} actions={actions} onClose={() => setAgentOpen(false)} />
        )}
      </AnimatePresence>
    </>
  )
}

/** Mounts Munshi once the money book is set up; the chat hook stays alive while the panel is closed. */
export default function AgentHost() {
  const { state } = useFinance()
  return state.settings.onboarded ? <AgentDock /> : null
}
