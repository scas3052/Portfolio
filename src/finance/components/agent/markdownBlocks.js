const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/
const HR = /^\s*([-*_])\1{2,}\s*$/
const STRAY_RULE = /^\s*\|?[\s:-]+\|[\s|:-]*$/
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/

const isTableRule = (line) => typeof line === 'string' && line.includes('|') && TABLE_RULE.test(line)

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function alignOf(cell) {
  if (!cell.endsWith(':')) return null
  return cell.startsWith(':') ? 'center' : 'right'
}

/**
 * Splits a reply into paragraphs, lists and pipe tables. Headings come through as plain lines.
 * Forgiving on purpose: replies arrive while streaming, so a table only becomes one once its `---|---` rule shows up.
 */
export function blocks(text) {
  const out = []
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  for (let n = 0; n < lines.length; n += 1) {
    const raw = lines[n]
    const last = out[out.length - 1]

    if (last && last.type === 'table' && !last.closed && raw.includes('|')) {
      if (!isTableRule(raw)) last.rows.push(cells(raw))
      continue
    }
    if (raw.includes('|') && isTableRule(lines[n + 1])) {
      out.push({ type: 'table', head: cells(raw), align: cells(lines[n + 1]).map(alignOf), rows: [] })
      n += 1
      continue
    }

    const line = raw.replace(/^#{1,6}\s+/, '').replace(/^\|(.*)\|$/, '$1')
    if (HR.test(line) || STRAY_RULE.test(raw)) continue
    if (!line.trim()) {
      if (last) last.closed = true
      continue
    }
    if (BULLET.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const item = line.replace(BULLET, '')
      if (last && last.type === 'list' && last.ordered === ordered && !last.closed) last.items.push(item)
      else out.push({ type: 'list', ordered, items: [item] })
    } else if (last && last.type === 'p' && !last.closed) {
      last.lines.push(line.trim())
    } else if (last && last.type === 'list' && !last.closed && /^\s{2,}/.test(raw)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`
    } else {
      out.push({ type: 'p', lines: [line.trim()] })
    }
  }
  return out
}
