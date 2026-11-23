// Runs one tool call against the current data. Reads answer immediately; writes only ever return drafts.
import { parseJSON } from './parse'
import { READERS } from './readers'
import { SPEND_READERS, SPEND_WRITERS } from './spends'
import { WRITERS } from './writers'

export { draftEntries, entrySummary } from './entries'
export { monthArg, parseDate, parseMoney } from './parse'

/** `args` may be the raw JSON string from the model. Returns `{result, drafts}` and never throws. */
export function executeTool(name, args, ctx) {
  const parsed = typeof args === 'string' ? parseJSON(args) : args
  if (typeof args === 'string' && args.trim() && !parsed) {
    return { result: { ok: false, error: 'Arguments were not valid JSON. Send one JSON object.' }, drafts: [] }
  }
  const input = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  try {
    if (Object.hasOwn(WRITERS, name)) return WRITERS[name](input, ctx)
    if (Object.hasOwn(READERS, name)) return { result: READERS[name](input, ctx), drafts: [] }
    if (Object.hasOwn(SPEND_WRITERS, name)) return SPEND_WRITERS[name](input, ctx)
    if (Object.hasOwn(SPEND_READERS, name)) return { result: SPEND_READERS[name](input, ctx), drafts: [] }
    return { result: { ok: false, error: `Unknown tool ${name}` }, drafts: [] }
  } catch (err) {
    return { result: { ok: false, error: `Tool failed: ${err?.message || err}` }, drafts: [] }
  }
}

function largestArray(node, best = null) {
  if (Array.isArray(node)) {
    if (node.length > 1 && (!best || node.length > best.length)) best = node
    for (const child of node) best = largestArray(child, best)
  } else if (node && typeof node === 'object') {
    for (const child of Object.values(node)) best = largestArray(child, best)
  }
  return best
}

/** Serialises a tool result for the model, halving the longest lists until it fits `limit` characters. */
export function fitResult(value, limit = 3000) {
  let text = JSON.stringify(value ?? null)
  if (text.length <= limit) return text
  const copy = structuredClone(value)
  for (let pass = 0; pass < 12 && text.length > limit; pass += 1) {
    const list = largestArray(copy)
    if (!list) break
    list.splice(Math.ceil(list.length / 2))
    if (copy && typeof copy === 'object' && !Array.isArray(copy)) copy.truncated = true
    text = JSON.stringify(copy)
  }
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`
}
