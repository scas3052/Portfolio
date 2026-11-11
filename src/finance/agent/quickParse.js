// Offline fast path for plain entries: "spent 250 on lunch yesterday", "lent 500 to Ravi",
// "got salary 72k in HDFC", "paid bike EMI". It is confident only when every word is
// accounted for; anything unclear returns { confident: false } and goes to the model.
import { categoryMeta } from '../lib/categories'
import { draftEntries, EPS, MAX_ENTRIES } from './entries'
import { findVerb, groupWords, kindAccount, personFrom, scanDates, scanMoney, Skip, skip, textOf, tokenize, VERBS } from './quickLex'
import { guessCategory, norm, resolveAccount, resolveCategory, resolvePerson } from './resolve'

const QUESTION =
  /\?\s*$|^(?:how|what|whats|when|where|why|which|who|whom|whose|did|do|does|is|are|am|was|were|can|could|should|would|will|shall|show|list|tell|give me|find|compare|explain|summari[sz]e|analy[sz]e|help|calc(?:ulate)?|predict|forecast|estimate|suggest|plan|check|any|have i|search|display|open|go to)\b/
const MANAGE = [
  /\b(?:budgets?|goals?|jars?|delete|remove|undo|cancel|erase|change|update|edit|rename|correct|modify|limits?|targets?|invest(?:ed|ing|ment)?|sip|mutual|stocks?|shares?|split(?:ting)?|remind(?:er)?|recurring|every)\b/,
  /^(?:set|reset)\b|\bset ?up\b/,
  /\bnew (?:account|card|loan|goal|jar|budget|person|contact|wallet)\b/,
  /\b(?:card|cc) (?:bill|dues?|statement|payment|outstanding)\b/,
  /\bsav(?:e|ed|ing)\b/,
]
const SPLIT = /[;\n]+|,(?!\d)|\band\b|&|\bthen\b|(?<!\b(?:rs|no|mr|mrs|dr|st))\.(?=\s|$)/i
const INCOME_NOUN = /\b(?:salary|bonus|refund|cashback|stipend|dividends?|incentive|freelance|reimbursement|interest|payday|paycheck|wages)\b/
const ACCOUNTISH = /\b(?:card|pay|account|acc|a\/c|ac|bank|wallet|upi|cc|credit|debit|savings|salary|cash|gpay|phonepe|paytm|bhim|mobikwik|\d{4})\b/

const words = (list) => new Set(list.split(' '))
const SUBJECT_DROP = words("i ive i've we just also have has had already finally then")
const NOTE_DROP = words('add log record note expense worth rs inr rupees amount some also just back me us')
const LOAN_DROP = words('emi emis paid pay loan loans for my the of this month monthly instalment installment')
const OUT_PREPS = words('from via using through thru with by in into')
const IN_PREPS = words('to in into via through thru by')
const GUESS_PREPS = words('on for at with')
const PEOPLE = ['lend', 'borrow', 'collect', 'repay']
const NO_AMOUNT = ['emi', 'collect', 'repay']
const ORDER = {
  lend: ['object', 'to', 'loose'],
  borrow: ['subject', 'from', 'object', 'loose'],
  collect: ['subject', 'from', 'object', 'loose'],
  repay: ['to', 'object', 'loose'],
}

const fail = (reason) => ({ confident: false, drafts: [], errors: [], entries: [], reason })

/** Reads a plain sentence into entry drafts without the model. */
export function quickParse(text, ctx) {
  const input = String(text ?? '').trim()
  if (!input || input.length > 280) return fail('length')
  const lower = input.toLowerCase()
  if (QUESTION.test(lower)) return fail('question')
  if (MANAGE.some((re) => re.test(lower))) return fail('manage')
  if (/\bloans?\b/.test(lower) && !/\bemis?\b/.test(lower)) return fail('loan')
  const clauses = input.split(SPLIT).map((c) => c.trim()).filter(Boolean)
  if (!clauses.length || clauses.length > MAX_ENTRIES) return fail('clauses')
  const carry = { kind: '', date: '', account: '', unsure: false }
  const entries = []
  try {
    for (const clause of clauses) entries.push(readClause(clause, ctx, carry))
  } catch (err) {
    if (err instanceof Skip) return fail(err.message)
    throw err
  }
  const { drafts, errors } = draftEntries(entries, ctx)
  // An account the user named but we couldn't place ("via gpay") keeps the drafts for offline use only.
  const confident = !carry.unsure && !errors.length && drafts.length > 0 && drafts.every((d) => !d.needsEdit)
  return { confident, drafts, errors, entries, reason: confident ? '' : carry.unsure ? 'account' : 'needs' }
}

function readClause(clause, ctx, carry) {
  const { state, derived, today } = ctx
  const tokens = tokenize(clause)
  if (!tokens.length) skip('empty')
  const lower = tokens.map((t) => t.w).join(' ')
  const date = scanDates(tokens, today) || carry.date
  let amount = scanMoney(tokens)
  const groups = groupWords(tokens)
  const used = new Set()
  const candidates = []
  for (const g of groups) {
    const hit = g.prep ? null : kindAccount(g.words, state.accounts)
    if (!hit) continue
    candidates.push(hit)
    used.add(g)
  }

  const verbGroup = groups.find((g) => !g.prep && !used.has(g) && findVerb(g.words))
  const verb = verbGroup ? findVerb(verbGroup.words) : null
  const verbToks = verb ? verbGroup.words.slice(verb.i, verb.end) : []
  let subject = []
  let object = []
  let meAfter = false
  if (verb) {
    used.add(verbGroup)
    subject = verbGroup.words.slice(0, verb.i).filter((t) => !SUBJECT_DROP.has(t.w))
    if (subject.length > 3) skip('subject')
    object = verbGroup.words.slice(verb.end)
    if (object[0] && (object[0].w === 'me' || object[0].w === 'us')) {
      meAfter = true
      object = object.slice(1)
    }
    const hit = kindAccount(object, state.accounts)
    if (hit) {
      candidates.push(hit)
      object = []
    }
  }
  const dropTok = new Set()
  for (const t of groups.flatMap((g) => g.words)) {
    const kind = VERBS.get(t.w)
    if (!kind || verbToks.includes(t)) continue
    if (kind !== 'expense') skip('verbs')
    if (!t.w.startsWith('recharg')) dropTok.add(t)
  }

  let looseWords = groups.filter((g) => !g.prep && !used.has(g)).flatMap((g) => g.words)
  const seg = (prep) => groups.find((g) => g.prep === prep && !used.has(g))
  const source = (name) => (name === 'object' ? object : name === 'subject' ? subject : name === 'loose' ? looseWords : seg(name)?.words || [])
  const consume = (name) => {
    if (name === 'object') object = []
    else if (name === 'subject') subject = []
    else if (name === 'loose') looseWords = []
    else used.add(seg(name))
  }
  const existing = (list) => {
    const name = personFrom(list)
    const hit = name ? resolvePerson(name, state.people) : null
    return hit && !hit.isNew ? hit.item : null
  }
  const netOf = (p) => derived.people.find((x) => x.id === p.id)?.net || 0
  const back = /\bback\b/.test(lower) && !/\bcash ?back\b/.test(lower)
  const emiWord = /\bemis?\b/.test(lower)
  const allText = textOf(tokens.filter((t) => !t.role)).toLowerCase()

  let type = ''
  let pick = null
  let order = null
  let withdraw = false
  let inherited = false
  let guessOnly = false
  let needCategory = false
  let incomeWords = []
  const kind = verb?.kind || ''
  if (kind === 'lend') type = meAfter || subject.length ? 'borrow' : 'lend'
  else if (kind === 'borrow') {
    const from = seg('from')
    if (subject.length && from?.words.length === 1 && from.words[0].w === 'me') {
      type = 'lend'
      order = ['subject']
      used.add(from)
    } else if (subject.length) skip('subject')
    else type = 'borrow'
  } else if (kind === 'repay') type = subject.length || meAfter ? 'collect' : 'repay'
  else if (kind === 'settle') {
    for (const name of ['with', 'object', 'to', 'subject']) {
      const item = existing(source(name))
      if (!item) continue
      const net = netOf(item)
      if (Math.abs(net) <= EPS) skip('settled')
      type = net > 0 ? 'collect' : 'repay'
      pick = item
      consume(name)
      break
    }
    if (!pick) skip('settle')
  } else if (kind === 'expense' || kind === 'give') {
    if (back) type = subject.length || meAfter ? 'collect' : 'repay'
    else if (meAfter && subject.length) type = 'collect'
    else if (subject.length || meAfter) skip('direction')
    else if (kind === 'expense' && emiWord) type = 'emi'
    else {
      type = 'expense'
      needCategory = kind === 'give'
    }
  } else if (kind === 'got') {
    if (subject.length) skip('subject')
    const from = seg('from')
    const giver = from ? existing(from.words) : null
    if (back || (giver && netOf(giver) > EPS)) type = 'collect'
    else if (INCOME_NOUN.test(allText) || guessCategory(allText, 'income')) type = 'income'
    else skip('got')
  } else if (kind === 'income') {
    if (subject.length && !guessCategory(textOf(subject), 'income')) skip('subject')
    type = 'income'
    incomeWords = subject
    subject = []
  } else if (kind === 'collect') type = 'collect'
  else if (kind === 'withdraw' || kind === 'transfer') {
    type = 'transfer'
    withdraw = kind === 'withdraw'
  } else if (carry.kind) {
    inherited = true
    withdraw = carry.kind === 'withdraw'
    type = withdraw ? 'transfer' : carry.kind
  } else if (emiWord) type = 'emi'
  else if (INCOME_NOUN.test(allText)) type = 'income'
  else {
    type = 'expense'
    guessOnly = true
  }

  if (type === 'expense') {
    const to = seg('to')
    if (to && guessOnly) skip('to')
    if (to && !guessCategory(textOf(to.words), 'expense')) {
      const item = existing(to.words)
      if (!item || netOf(item) >= -EPS) skip('to')
      type = 'repay'
      pick = item
      used.add(to)
    }
  }

  let person = ''
  if (PEOPLE.includes(type)) {
    if (pick) person = pick.id
    else {
      let name = ''
      for (const src of order || ORDER[type]) {
        name = personFrom(source(src))
        if (name) {
          consume(src)
          break
        }
      }
      if (name) {
        const hit = resolvePerson(name, state.people)
        const known = hit && !hit.isNew ? hit.item : null
        if (!known && (guessCategory(name, 'expense') || guessCategory(name, 'income') || resolveAccount(name, state.accounts))) skip('not a person')
        if (type === 'collect' && !(known && netOf(known) > EPS)) skip('owes')
        if (type === 'repay' && !(known && netOf(known) < -EPS)) skip('owed')
        person = known ? known.id : name
      }
    }
  }
  if (subject.length) skip('subject')

  let account = ''
  let toAccount = ''
  const income = ['income', 'borrow', 'collect'].includes(type)
  const accountOf = (g) => {
    const hit = resolveAccount(textOf(g.words), state.accounts)
    if (!hit || hit.ambiguous.length) skip('account')
    used.add(g)
    return hit.item.id
  }
  if (type === 'transfer') {
    const to = seg('to')
    const from = seg('from')
    if (to) toAccount = accountOf(to)
    else if (withdraw) toAccount = state.accounts.find((a) => a.kind === 'cash' && !a.archived)?.id || skip('cash')
    else skip('to')
    if (from) account = accountOf(from)
  } else {
    const preps = income ? IN_PREPS : OUT_PREPS
    for (const g of groups) {
      if (!g.prep || used.has(g) || !preps.has(g.prep)) continue
      const text = textOf(g.words)
      if (guessCategory(text, income ? 'income' : 'expense') && !ACCOUNTISH.test(text.toLowerCase())) continue
      const hit = resolveAccount(text, state.accounts)
      if (!hit) {
        if (ACCOUNTISH.test(text.toLowerCase())) carry.unsure = true
        continue
      }
      if (hit.ambiguous.length) skip('account')
      candidates.push({ text, id: hit.item.id })
      used.add(g)
    }
    const ids = [...new Set(candidates.map((c) => c.id))]
    if (ids.length > 1) skip('accounts')
    account = ids[0] || ''
  }
  if (inherited && !account && carry.account) account = carry.account
  if (guessOnly) for (const g of groups) if (g.prep && !used.has(g) && !GUESS_PREPS.has(g.prep)) skip('guess')

  const leftovers = [looseWords, ...groups.filter((g) => g.prep && !used.has(g)).map((g) => g.words)]
  if (!PEOPLE.includes(type)) leftovers.push(object)
  if (leftovers.some((list) => existing(list))) skip('person')

  const rest = [...object, ...looseWords, ...incomeWords]
  for (const g of groups) if (g.prep && !used.has(g)) rest.push(g.prepTok, ...g.words)
  rest.sort((a, b) => a.i - b.i)
  let note = textOf(rest.filter((t) => !NOTE_DROP.has(t.w) && !dropTok.has(t))).replace(/^(?:on|for|at|from|to)\s+/i, '')

  let category = ''
  let loan = ''
  if (type === 'expense' || type === 'income') {
    const recharge = verbToks.some((t) => t.w.startsWith('recharg'))
    category = resolveCategory([note, recharge ? 'recharge' : ''].filter(Boolean).join(' '), type)
    if ((guessOnly || needCategory) && !category) skip('category')
    if (category) {
      const meta = categoryMeta(category)
      const n = norm(note)
      if (n === category || n === norm(meta.label) || n === norm(meta.short || '')) note = ''
    }
  } else if (type === 'emi') {
    category = 'emi'
    const loanToks = [...object, ...looseWords]
    for (const g of groups) if (g.prep && !used.has(g)) loanToks.push(...g.words)
    const money = tokens.filter((t) => t.role === 'money')
    // "paid iphone 16 emi": a bare number between a word and "emi" is part of the loan's name
    if (money.length === 1 && amount != null) {
      const [prev, next] = [tokens[money[0].i - 1], tokens[money[0].i + 1]]
      if (prev && !prev.role && /^\p{L}+$/u.test(prev.w) && !VERBS.has(prev.w) && /^emis?$/.test(next?.w || '')) {
        amount = null
        loanToks.push(money[0])
      }
    }
    const query = textOf(loanToks.filter((t) => !LOAN_DROP.has(t.w)).sort((a, b) => a.i - b.i))
    if (query) loan = query
    else if (amount != null) {
      const match = derived.loans.filter((l) => !l.done && Math.abs((l.loan.emi || 0) - amount) <= 1)
      if (match.length === 1) loan = match[0].loan.id
    }
    note = ''
  }
  if (amount == null && !NO_AMOUNT.includes(type)) skip('amount')

  carry.date = date
  carry.kind = withdraw ? 'withdraw' : type
  if (account) carry.account = account
  return { type, amount: amount ?? '', category, account, toAccount, person, loan, date, note }
}
