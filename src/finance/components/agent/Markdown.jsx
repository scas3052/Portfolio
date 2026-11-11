import { Fragment } from 'react'
import { MASK } from '../../lib/format'
import { blocks } from './markdownBlocks'

// Rupee amounts as models tend to write them (₹1,250 · Rs. 500 · INR 2.5L · −₹300), plus bare grouped numbers like 1,25,000.
const AMOUNT =
  /((?:[-−+]\s?)?(?:₹|Rs\.?|INR)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|K|L|lakhs?|Cr|cr|crores?)\b)?|\b\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d+)?\b)/g
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g

function Amounts({ text, privacy }) {
  const parts = text.split(AMOUNT)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="g-mk-amt">
        {privacy ? MASK : part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

function Inline({ text, privacy }) {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i}>
          <Amounts text={part.slice(2, -2)} privacy={privacy} />
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="g-mk-code">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <Amounts key={i} text={part} privacy={privacy} />
  })
}

function Lines({ lines, privacy }) {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      <Inline text={line} privacy={privacy} />
    </Fragment>
  ))
}

function Table({ block, privacy }) {
  const align = (j) => (block.align[j] ? { textAlign: block.align[j] } : undefined)
  return (
    <div className="g-mk-table">
      <table>
        <thead>
          <tr>
            {block.head.map((cell, j) => (
              <th key={j} scope="col" style={align(j)}>
                <Inline text={cell} privacy={privacy} />
              </th>
            ))}
          </tr>
        </thead>
        {block.rows.length > 0 && (
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {block.head.map((_, j) => (
                  <td key={j} style={align(j)}>
                    <Inline text={row[j] ?? ''} privacy={privacy} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  )
}

/** A tiny, safe markdown subset for Munshi's replies: paragraphs, lists, tables, bold and code. Never uses innerHTML. */
export default function Markdown({ text, privacy = false }) {
  return (
    <div className="g-mk">
      {blocks(text).map((block, i) => {
        if (block.type === 'table') return <Table key={i} block={block} privacy={privacy} />
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul'
          return (
            <List key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} privacy={privacy} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <p key={i}>
            <Lines lines={block.lines} privacy={privacy} />
          </p>
        )
      })}
    </div>
  )
}
