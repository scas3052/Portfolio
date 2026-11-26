// A stand-in for the native SpendCapture plugin, for working on the app in a browser (npm run dev:app).
// It reads a handful of realistic messages with the same parser rules the phone uses, merges SMS and app
// notifications for the same payment, and answers the plugin's calls from memory, bank email senders and
// statement import included. Never in a production build.
import { mailText, parseApp, parseMail, parseSms } from './parse'

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
  // A bank email, as Gmail's notification shows it (slice's wording; the details are made up).
  {
    ago: 520,
    source: 'mail',
    from: 'slice',
    title: '',
    text: 'Hi Asha,\n₹60 debited from your slice account xx5510 via UPI.\nTransaction date 23-Nov-26\nTo CHAI POINT\nRRN 532112345690\nBest,\nTeam slice',
  },
]
const MAIL_SAMPLE = MESSAGES.find((m) => m.source === 'mail')

const clone = (value) => JSON.parse(JSON.stringify(value))

// The apps the phone side knows (PaymentApps.java); the preview pretends the first four are installed.
const BUILT_IN = [
  ['gpay', 'com.google.android.apps.nbu.paisa.user', 'Google Pay'],
  ['phonepe', 'com.phonepe.app', 'PhonePe'],
  ['paytm', 'net.one97.paytm', 'Paytm'],
  ['slice', 'indwin.c3.shareapp', 'slice'],
  ['cred', 'com.dreamplug.androidapp', 'CRED'],
  ['bhim', 'in.org.npci.upiapp', 'BHIM'],
  ['navi', 'com.naviapp', 'Navi'],
  ['supermoney', 'money.super.payments', 'super.money'],
  ['mobikwik', 'com.mobikwik_new', 'MobiKwik'],
  ['yono', 'com.sbi.lotusintouch', 'YONO SBI'],
  ['imobile', 'com.csam.icici.bank.imobile', 'ICICI iMobile'],
  ['hdfc', 'com.snapwork.hdfc', 'HDFC Bank'],
]
const INSTALLED = new Set(['gpay', 'phonepe', 'paytm', 'slice'])
const PHONE_APPS = [
  ['com.example.bank', 'Sample Bank', 50],
  ['com.example.wallet', 'Sample Wallet', 300],
  ['com.whatsapp', 'WhatsApp', 5],
  ['in.swiggy.android', 'Swiggy', 120],
]
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Sender names compare without case or punctuation, as on the phone (MailSenders.java).
const words = (text) => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function build(now) {
  const spends = []
  let n = 0
  for (const message of MESSAGES) {
    const at = now - message.ago * MINUTE
    const mail = message.source === 'mail'
    const parsed =
      message.source === 'sms'
        ? parseSms(message.from, message.text)
        : mail
          ? parseMail(message.from, message.title, message.text)
          : parseApp(message.title, message.text)
    if (!parsed) continue
    const text = mail ? mailText(message.title, message.text) : message.title ? `${message.title}\n${message.text}` : message.text
    const raw = { source: message.source, sender: message.from || message.source, text, at }
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
      accountId: null,
    })
  }
  return spends
}

export function createMockCapture() {
  const startedAt = Date.now()
  let spends = build(startedAt)
  let added = []
  let made = 0
  const mail = { senders: ['slice'], last: { sender: MAIL_SAMPLE.from, at: startedAt - MAIL_SAMPLE.ago * MINUTE, payment: true } }
  const status = {
    available: true,
    mock: true,
    sms: 'prompt',
    notifications: 'prompt',
    listener: false,
    telephony: true,
    paused: false,
    sources: Object.fromEntries([['sms', true], ['mail', true], ...BUILT_IN.map(([id]) => [id, true])]),
    lookbackSet: false,
    lastScanAt: 0,
    sdk: 36,
  }
  const listeners = new Map()
  const emit = (event, data = {}) => (listeners.get(event) || []).forEach((fn) => fn(data))
  const apps = () => [
    ...BUILT_IN.map(([id, pkg, label]) => ({ id, package: pkg, label, builtIn: true, installed: INSTALLED.has(id), on: status.sources[id] !== false })),
    ...added.map(({ pkg, label }) => ({ id: pkg, package: pkg, label, builtIn: false, installed: true, on: status.sources[pkg] !== false })),
  ]
  const statusNow = () => ({
    ...clone(status),
    apps: apps(),
    mail: { senders: [...mail.senders], apps: ['Gmail'], last: { ...mail.last } },
    unfiled: spends.filter((s) => s.status === 'unfiled').length,
  })
  const addSpend = (fields) => {
    made += 1
    const spend = {
      id: `sp_made${made}`,
      status: 'unfiled',
      account: null,
      party: null,
      vpa: null,
      ref: null,
      channel: null,
      bank: null,
      hint: null,
      hintAt: 0,
      entryIds: [],
      closedAt: 0,
      accountId: null,
      ...fields,
    }
    spends = [spend, ...spends]
    return spend
  }
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
    async listApps() {
      await wait(250)
      const read = new Set(apps().map((a) => a.package))
      const now = Date.now()
      return {
        apps: [...PHONE_APPS, ...BUILT_IN.filter(([id]) => INSTALLED.has(id)).map(([, pkg, label]) => [pkg, label, 0])].map(([pkg, label, minutes]) => ({
          package: pkg,
          label,
          lastSeen: minutes ? now - minutes * MINUTE : 0,
          read: read.has(pkg),
        })),
      }
    },
    async addApp({ package: pkg, label }) {
      if (!added.some((a) => a.pkg === pkg) && !BUILT_IN.some(([, p]) => p === pkg)) added = [...added, { pkg, label: label || pkg }]
      return statusNow()
    },
    async removeApp({ package: pkg }) {
      added = added.filter((a) => a.pkg !== pkg)
      delete status.sources[pkg]
      return statusNow()
    },
    async addMailSender({ name } = {}) {
      const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
      if (!words(clean)) throw new Error('Type the sender’s name as your mail app shows it')
      if (!mail.senders.some((s) => words(s) === words(clean))) {
        if (mail.senders.length >= 20) throw new Error('That’s 20 senders already. Remove one first.')
        mail.senders = [...mail.senders, clean]
      }
      return statusNow()
    },
    async removeMailSender({ name } = {}) {
      mail.senders = mail.senders.filter((s) => words(s) !== words(name))
      return statusNow()
    },
    async importSpends({ rows = [] }) {
      for (const row of rows) {
        addSpend({
          amountPaise: row.amountPaise,
          direction: row.direction === 'in' ? 'in' : 'out',
          at: row.at,
          party: row.party || null,
          vpa: row.vpa || null,
          ref: row.ref || null,
          channel: row.channel || null,
          account: row.account || null,
          bank: row.bank || null,
          accountId: row.accountId || null,
          sources: ['statement'],
          raw: [{ source: 'statement', sender: 'Statement', text: row.text || '', at: row.at }],
        })
      }
      if (rows.length) emit('changed')
      return { added: rows.length, merged: 0, duplicates: 0 }
    },
    async setBalanceReminder(options = {}) {
      status.balanceReminder = { ...options }
    },
    async addListener(event, fn) {
      listeners.set(event, [...(listeners.get(event) || []), fn])
      return {
        remove: async () => listeners.set(event, (listeners.get(event) || []).filter((f) => f !== fn)),
      }
    },
  }
}
