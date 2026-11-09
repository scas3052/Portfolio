// Tiny calculator for amount fields: "120+45*2", "1,250 - 99", "(300+450)/3", "12x4".
// Recursive descent, no eval.

const NUMBER = /^(\d+\.?\d*|\.\d+)/

export function normalizeExpression(input) {
  return String(input ?? '')
    .replace(/[\s,₹]/g, '')
    .replace(/[×xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
}

export function evaluate(input) {
  const src = normalizeExpression(input)
  if (!src || !/^[0-9+\-*/().]+$/.test(src)) return null
  let pos = 0

  const peek = () => src[pos]

  function parseExpression() {
    let value = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = src[pos]
      pos += 1
      const right = parseTerm()
      value = op === '+' ? value + right : value - right
    }
    return value
  }

  function parseTerm() {
    let value = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = src[pos]
      pos += 1
      const right = parseFactor()
      value = op === '*' ? value * right : value / right
    }
    return value
  }

  function parseFactor() {
    if (peek() === '-') {
      pos += 1
      return -parseFactor()
    }
    if (peek() === '+') {
      pos += 1
      return parseFactor()
    }
    if (peek() === '(') {
      pos += 1
      const value = parseExpression()
      if (peek() !== ')') throw new Error('Unclosed bracket')
      pos += 1
      return value
    }
    const match = NUMBER.exec(src.slice(pos))
    if (!match) throw new Error('Expected a number')
    pos += match[0].length
    return parseFloat(match[0])
  }

  try {
    const result = parseExpression()
    if (pos !== src.length || !Number.isFinite(result)) return null
    return Math.round(result * 100) / 100
  } catch {
    return null
  }
}

/** True when the input is more than a plain number (so we can show "= ₹…"). */
export function isExpression(input) {
  const src = normalizeExpression(input)
  return /\d[+\-*/()]|[()]/.test(src) && !/^-?\d+\.?\d*$/.test(src)
}
