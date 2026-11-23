// Munshi's tool loop: ask the model, run the tools it calls, feed the results back,
// and stop at a text answer or as soon as drafts are ready. Nothing is saved here.
import { AgentError, chat } from './client'
import { executeTool, fitResult } from './executors'
import { parseJSON } from './parse'
import { buildSystemPrompt } from './prompt'
import { unfiledSpends } from './spends'
import { toolsFor, WRITE_TOOLS } from './tools'

export const MAX_STEPS = 5
// Keeps every request inside the relay's limits (40 messages, 64 KB).
const MAX_CALLS = 6
const HISTORY_MESSAGES = 8
const HISTORY_CHARS = 800
// A reply's memo lines outlive its text when a turn is clipped: they carry the ids follow-ups need.
const MEMO_CHARS = 500
const MAX_FACTS = 6
const FACTS_CHARS = 300
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const STEP_LABELS = {
  get_overview: 'Reading the overview',
  query_transactions: 'Searching transactions',
  calculate: 'Doing the maths',
  get_accounts: 'Checking accounts',
  get_people: 'Checking people',
  get_loans: 'Checking loans',
  get_budgets: 'Checking budgets',
  get_goals: 'Checking goals',
  propose_entries: 'Drafting entries',
  propose_update_entry: 'Drafting a change',
  propose_delete_entry: 'Drafting a deletion',
  propose_budget: 'Drafting a budget',
  propose_goal_contribution: 'Drafting a contribution',
  propose_setup: 'Drafting a new item',
  get_unfiled_spends: 'Checking captured payments',
  propose_file_spend: 'Filing a payment',
  propose_dismiss_spend: 'Setting a payment aside',
  propose_spend_rule: 'Drafting a rule',
}

export const stepLabel = (name) => STEP_LABELS[name] || 'Working'

/** Fresh 9-character ids: Mistral requires them, and they stay valid if the relay switches provider mid-turn. */
export function callId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('')
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** `[Label: a; b; +N more]` with as many whole items as fit in `max` characters, so an id is never cut in half. */
function memoLine(label, items, max) {
  for (let n = items.length; n > 0; n -= 1) {
    const rest = items.length - n
    const line = `[${label}: ${items.slice(0, n).join('; ')}${rest ? `; +${rest} more` : ''}]`
    if (line.length <= max) return line
  }
  return ''
}

function draftMemo(drafts) {
  if (!Array.isArray(drafts) || !drafts.length) return ''
  const lines = drafts.map((d, i) => {
    const status = d.status === 'saved' && d.entryId ? `saved as ${d.entryId}` : d.status || 'pending'
    return `D${i + 1} ${d.summary || d.kind} (${status})`
  })
  return memoLine('Draft cards', lines, MEMO_CHARS) || `[Draft cards: ${drafts.length}]`
}

/** Remembers entries a read tool showed the model, so "change the second one" can reach them by id next turn. */
function noteFacts(facts, name, result) {
  if (!result || result.ok === false) return
  let rows = []
  if (name === 'query_transactions') rows = result.items || []
  else if (name === 'get_people' && result.name) {
    rows = (result.history || []).map((t) => ({ ...t, title: [t.type, result.name, t.note].filter(Boolean).join(' ') }))
  }
  for (const t of rows) {
    if (facts.length >= MAX_FACTS) return
    if (typeof t?.id !== 'string' || !t.id || facts.some((f) => f.id === t.id)) continue
    facts.push({ id: t.id, title: clip(String(t.title || t.type || ''), 24), amount: t.amount, date: t.date })
  }
}

function factsMemo(facts, max) {
  if (!Array.isArray(facts) || !facts.length) return ''
  const items = facts.map((f) => [f.id, f.title, Number.isFinite(f.amount) ? `₹${f.amount}` : '', f.date].filter(Boolean).join(' '))
  return memoLine('Entries found', items, max)
}

/** One stored message as history text; an assistant reply keeps its memo lines whole and clips its words to make room. */
function turnText(m) {
  const text = typeof m.text === 'string' ? m.text.trim() : ''
  // A user turn keeps what was attached to it (a captured payment), so follow-ups still know which one.
  if (m.role !== 'assistant') return clip(typeof m.context === 'string' && m.context ? `${text}\n${m.context}` : text, HISTORY_CHARS)
  const cards = draftMemo(m.drafts)
  const found = factsMemo(m.facts, Math.min(FACTS_CHARS, MEMO_CHARS - (cards ? cards.length + 1 : 0)))
  const memo = [cards, found].filter(Boolean).join('\n')
  if (!memo) return clip(text, HISTORY_CHARS)
  return text ? `${clip(text, HISTORY_CHARS - memo.length - 1)}\n${memo}` : memo
}

/** Recent turns as model messages: text plus memos, clipped, same-role turns merged, starting with the user and ending on an answer. */
export function buildHistory(messages, limit = HISTORY_MESSAGES) {
  const out = []
  for (const m of messages || []) {
    if ((m.role !== 'user' && m.role !== 'assistant') || m.error || m.streaming) continue
    const content = turnText(m)
    if (!content) continue
    const last = out[out.length - 1]
    if (last?.role === m.role) last.content = clip(`${last.content}\n\n${content}`, HISTORY_CHARS * 2)
    else out.push({ role: m.role, content })
  }
  const recent = out.slice(-limit)
  while (recent[0]?.role === 'assistant') recent.shift()
  // An unanswered question (failed or stopped) would leave two user turns in a row.
  while (recent[recent.length - 1]?.role === 'user') recent.pop()
  return recent
}

const MEMO_LINE = /\n\[(?:Draft cards|Entries found):[^\n]*/g

/** True when Munshi's last reply in `history` ended with a question, so the new message is probably the answer. */
export function askedLast(history) {
  const last = history?.[history.length - 1]
  if (last?.role !== 'assistant' || typeof last.content !== 'string') return false
  return /\?[\s"'”’)*_]*$/.test(last.content.replace(MEMO_LINE, '').trim())
}

/** Words for the bubble when the model went straight to drafts without saying anything. */
export function draftText(drafts) {
  if (!drafts.length) return 'I couldn’t finish that one. Try rephrasing it?'
  const head = drafts.length === 1 ? 'Here’s a draft' : `Here are ${drafts.length} drafts`
  const needs = drafts.filter((d) => d.needsEdit).length
  if (!needs) return `${head}. Check ${drafts.length === 1 ? 'it' : 'them'} over and confirm to save.`
  return `${head}. ${needs === 1 ? 'One needs' : `${needs} need`} a quick edit before saving.`
}

async function ask(options) {
  try {
    return await chat(options)
  } catch (err) {
    // Groq rejects a malformed tool call outright; a calmer second try usually works.
    if (!(err instanceof AgentError) || err.code !== 'upstream' || err.upstream !== 'tool_use_failed') throw err
    return chat({ ...options, temperature: 0 })
  }
}

function argumentsJSON(raw) {
  const parsed = typeof raw === 'string' && raw.trim() ? parseJSON(raw) : {}
  return JSON.stringify(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {})
}

/**
 * Runs one user turn. `getCtx()` must return fresh `{state, derived, today}`; it is read
 * again for every tool call. Resolves to `{text, drafts, steps, meta, facts}` (facts: the
 * entries it looked up, for the next turn's history) and throws AgentError for relay or
 * provider failures (including `aborted`).
 */
export async function runAgent({ text, history = [], getCtx, signal, onDelta, onStep }) {
  const start = getCtx()
  const waiting = unfiledSpends(start.inbox).length
  const tools = toolsFor(text, { followUp: askedLast(history), spends: waiting > 0 })
  const messages = [
    { role: 'system', content: buildSystemPrompt(start.state, start.derived, start.today, { unfiled: waiting }) },
    ...history,
    { role: 'user', content: text },
  ]
  const drafts = []
  const steps = []
  const facts = []
  let meta = null

  for (let round = 0; round < MAX_STEPS; round += 1) {
    const final = round === MAX_STEPS - 1
    const reply = await ask({ messages, tools, toolChoice: final ? 'none' : 'auto', signal, onDelta })
    meta = reply.meta || meta
    const content = (reply.content || '').trim()
    const calls = final ? [] : reply.toolCalls.slice(0, MAX_CALLS)
    if (!calls.length) return { text: content || draftText(drafts), drafts, steps, meta, facts }

    const assistant = { role: 'assistant', content: content || null, tool_calls: [] }
    const results = []
    const limit = calls.length > 2 ? 1500 : 3000
    let draftsOnly = true
    for (const call of calls) {
      const id = callId()
      assistant.tool_calls.push({ id, type: 'function', function: { name: call.name, arguments: argumentsJSON(call.arguments) } })
      const { result, drafts: made } = executeTool(call.name, call.arguments, getCtx())
      const ok = result?.ok !== false
      steps.push({ name: call.name, label: stepLabel(call.name), ok })
      drafts.push(...made)
      noteFacts(facts, call.name, result)
      results.push({ role: 'tool', tool_call_id: id, content: fitResult(result, limit) })
      if (!WRITE_TOOLS.has(call.name) || !ok || result?.errors) draftsOnly = false
    }
    onStep?.({ steps: [...steps], drafts: [...drafts] })
    // Clean proposals need no commentary; skipping the extra round saves a request.
    if (draftsOnly) return { text: content || draftText(drafts), drafts, steps, meta, facts }
    messages.push(assistant, ...results)
  }
  return { text: draftText(drafts), drafts, steps, meta, facts }
}
