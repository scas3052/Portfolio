// A stand-in for the native SpendCapture plugin, for working on the app in a browser (npm run dev:app).
// It reads a handful of realistic messages with the same parser rules the phone uses, merges SMS and app
// notifications for the same payment, and answers the plugin's calls from memory. Never in a production build.
import { parseApp, parseSms } from './parse'

const MINUTE = 60_000
const WINDOW = 15 * MINUTE

// Account digits match the sample book (HDFC ••4821, SBI ••0937, ICICI card ••7712).
const MESSAGES = [
  { ago: 38, source: 'sms', from: 'VM-HDFCBK-S', text: 'Sent Rs.486.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 23/11/26\nRef 532112345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808' },
  { ago: 37, source: 'gpay', title: '₹486 paid to Swiggy', text: 'Paid from HDFC Bank •• 4821' },
  { ago: 95, source: 'sms', from: 'VM-ICICIT', text: 'INR 1,299.00 spent using ICICI Bank Card XX7712 on 23-Nov-26 on AMAZON. Avl Limit: INR 85,432.10. If not you, call 1800 2662' },
  { ago: 180, source: 'sms', from: 'VM-SBIINB', text: 'Dear SBI User, your A/c X0937-credited by Rs.2,500 on 23Nov26 transfer from RAVI KUMAR Ref No 532112345679 -SBI', hint: 'paid back for the Goa tickets' },
  { ago: 260, source: 'sms', from: 'AD-HDFCBK', text: 'Rs 180.00 debited from a/c **4821 on 23-11-26 to VPA chai.stall@ybl(UPI Ref No 532112345680). Not you? Call on 18002586161 to report' },
  { ago: 1500, source: 'sms', from: 'VM-HDFCBK-S', text: 'Rs.5,000.00 debited from A/c XX4821 on 22-11-26 to RAJESH SBI SAVINGS via IMPS. Ref 532112345681' },
  { ago: 1499, source: 'sms', from: 'VM-SBIINB', text: 'Dear SBI User, your A/c X0937-credited by Rs.5,000 on 22Nov26 transfer from SELF Ref No 532112345682 -SBI' },
  { ago: 1700, source: 'phonepe', title: 'Paid ₹342 to Uber', text: 'Debited from HDFC Bank - 4821' },
]

const clone = (value) => JSON.parse(JSON.stringify(value))

function build(now) {
  const spends = []
  let n = 0
  for (const message of MESSAGES) {
    const at = now - message.ago * MINUTE
    const parsed = message.source === 'sms' ? parseSms(message.from, message.text) : parseApp(message.title, message.text)
    if (!parsed) continue
    const raw = { source: message.source, sender: message.from || message.source, text: message.title ? `${message.title}\n${message.text}` : message.text, at }
    const twin = spends.find(
      (s) =>
        s.amountPaise === parsed.amountPaise &&
        s.direction === parsed.direction &&
        Math.abs(s.at - at) <= WINDOW &&
        !s.sources.includes(message.source),
    )
    if (twin) {
      if (message.source !== 'sms' && parsed.party) twin.party = parsed.party
      twin.sources.push(message.source)
      twin.raw.push(raw)
      continue
    }
    n += 1
    spends.push({
      id: `sp_mock${n}`,
      status: 'unfiled',
      amountPaise: parsed.amountPaise,
      direction: parsed.direction,
      at,
      account: parsed.account,
      party: parsed.party,
      vpa: parsed.vpa,
      ref: parsed.ref,
      channel: parsed.channel,
      bank: parsed.bank,
      sources: [message.source],
      raw: [raw],
      hint: message.hint || null,
      hintAt: message.hint ? at + MINUTE : 0,
      entryIds: [],
      closedAt: 0,
    })
  }
  return spends
}

export function createMockCapture() {
  let spends = build(Date.now())
  const status = {
    available: true,
    mock: true,
    sms: 'prompt',
    notifications: 'prompt',
    listener: false,
    telephony: true,
    paused: false,
    sources: { sms: true, gpay: true, phonepe: true, paytm: true },
    lookbackSet: false,
    lastScanAt: 0,
    sdk: 36,
  }
  const listeners = new Map()
  const emit = (event, data = {}) => (listeners.get(event) || []).forEach((fn) => fn(data))
  const statusNow = () => ({ ...clone(status), unfiled: spends.filter((s) => s.status === 'unfiled').length })
  const change = (id, patch) => {
    spends = spends.map((s) => (s.id === id ? { ...s, ...patch } : s))
    emit('changed')
    return { ok: spends.some((s) => s.id === id) }
  }
  const asPlugin = (s) => {
    const copy = { ...clone(s), hasOriginal: Boolean(s.raw) }
    delete copy.raw
    return copy
  }

  return {
    async getStatus() {
      return statusNow()
    },
    async requestSms() {
      status.sms = 'granted'
      return statusNow()
    },
    async requestNotifications() {
      status.notifications = 'granted'
      return statusNow()
    },
    async openListenerSettings() {
      status.listener = true
      setTimeout(() => emit('changed'), 300)
    },
    async openAppSettings() {},
    async setPrefs({ paused, sources } = {}) {
      if (typeof paused === 'boolean') status.paused = paused
      if (sources) Object.assign(status.sources, sources)
      return statusNow()
    },
    async scanInbox({ days } = {}) {
      if (days == null && !status.lookbackSet) return { added: 0, needsLookback: true }
      if (days != null) status.lookbackSet = true
      status.lastScanAt = Date.now()
      return { added: 0, needsLookback: false }
    },
    async list() {
      return { spends: spends.map(asPlugin) }
    },
    async getOriginal({ id }) {
      return { messages: clone(spends.find((s) => s.id === id)?.raw || []) }
    },
    async markFiled({ id, entryIds = [] }) {
      return change(id, { status: 'filed', entryIds, raw: null, closedAt: Date.now() })
    },
    async dismiss({ id }) {
      return change(id, { status: 'dismissed', raw: null, closedAt: Date.now() })
    },
    async restore({ id }) {
      return change(id, { status: 'unfiled', entryIds: [], closedAt: 0 })
    },
    async setHint({ id, hint = '' }) {
      return change(id, { hint: hint.trim() || null, hintAt: Date.now() })
    },
    async addListener(event, fn) {
      listeners.set(event, [...(listeners.get(event) || []), fn])
      return {
        remove: async () => listeners.set(event, (listeners.get(event) || []).filter((f) => f !== fn)),
      }
    },
  }
}
