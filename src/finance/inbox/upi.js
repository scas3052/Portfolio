// Scan & Pay: reading a scanned UPI QR code, building the link that opens a UPI app with the amount filled in,
// and reading what that app says when it hands control back. Plain functions, so they're tested in Node.

const VPA = /^[a-z0-9][a-z0-9._-]{0,63}@[a-z][a-z0-9]{1,30}$/i
const RRN = /^\d{12}$/
const MAX_AMOUNT = 1e7

const decode = (value) => {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'))
  } catch {
    return value
  }
}

/** "120", "1,250.50" → 120, 1250.5; null for anything that isn't a sensible rupee amount. */
export function parseRupees(value) {
  const n = Number(String(value ?? '').replace(/[,\s₹]/g, ''))
  return Number.isFinite(n) && n > 0 && n < MAX_AMOUNT ? Math.round(n * 100) / 100 : null
}

/** [key, value] pairs of a query string, in their original order, keys as written. */
function pairs(query) {
  return query
    .split('&')
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf('=')
      return at < 0 ? [decode(part), ''] : [decode(part.slice(0, at)), decode(part.slice(at + 1))]
    })
}

/**
 * The payment a scanned QR asks for: `{vpa, name, amount, note, merchant, params}`, or null when the text isn't a
 * UPI payment link (`upi://pay?pa=…`). `amount` is null for a static QR where you type the amount.
 */
export function parseUpiUri(raw) {
  const text = String(raw ?? '').trim()
  const match = /^upi:\/\/pay\/?\?(.*)$/is.exec(text)
  if (!match) return null
  const params = pairs(match[1])
  const get = (key) => params.find(([k]) => k.toLowerCase() === key)?.[1]?.trim() || ''
  const vpa = get('pa')
  if (!VPA.test(vpa)) return null
  const mc = get('mc')
  return {
    vpa: vpa.toLowerCase(),
    name: get('pn').replace(/\s+/g, ' ').slice(0, 60),
    amount: parseRupees(get('am')),
    note: get('tn').slice(0, 80),
    merchant: Boolean(mc && !/^0+$/.test(mc)),
    query: match[1].replace(/&+$/, ''),
    params,
  }
}

/**
 * The link that opens a UPI app on this payment. The scanned QR's text is kept exactly as it was (merchant codes
 * and signatures included). A QR with its own amount is passed on untouched; otherwise the amount you typed is
 * added, with the currency if the QR left it out.
 */
export function buildPayUri(scan, amount) {
  const rupees = parseRupees(amount)
  if (!scan || !rupees) return null
  const fixed = scan.amount != null
  const segments = scan.query.split('&').filter((segment) => segment && (fixed || !/^am=/i.test(segment)))
  if (!fixed) segments.push(`am=${rupees.toFixed(2)}`)
  if (!segments.some((segment) => /^cu=/i.test(segment))) segments.push('cu=INR')
  return `upi://pay?${segments.join('&')}`
}

/**
 * What the UPI app reported when it came back: `{status, ref, txnId, code}`. `status` is 'success', 'failure',
 * 'submitted' (sent, bank still deciding) or 'unknown' (no answer, which many apps give even when the payment
 * went through, so Gullak asks). `ref` is the 12-digit bank reference when the app gave one; it's the number
 * bank SMS quote, so the payment and its SMS merge into one spend.
 */
export function parseUpiResponse(result) {
  const fields = {}
  const add = (key, value) => {
    const k = String(key || '').trim().toLowerCase()
    const v = value == null ? '' : String(value).trim()
    if (k && v && !(k in fields)) fields[k] = v
  }
  for (const [key, value] of pairs(String(result?.response || ''))) add(key, value)
  for (const [key, value] of Object.entries(result?.extras || {})) add(key, value)
  const said = (fields.status || '').toLowerCase()
  let status = 'unknown'
  if (said.startsWith('success')) status = 'success'
  else if (said.startsWith('fail') || said === 'declined') status = 'failure'
  else if (said.startsWith('submit') || said === 'pending') status = 'submitted'
  const ref = [fields.approvalrefno, fields.approvalref, fields.rrn].find((v) => RRN.test(v || '')) || null
  return { status, ref, txnId: fields.txnid || null, code: fields.responsecode || null }
}
