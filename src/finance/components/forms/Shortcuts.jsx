import { Fragment } from 'react'
import { toneVar } from '../../lib/cx'
import { MOD_KEY } from '../../lib/dom'
import { Kbd } from '../bits'

// Each entry in `keys` is one alternative; each alternative is a list of keys pressed together.
const GROUPS = [
  {
    title: 'Anywhere',
    tone: 'lime',
    items: [
      { keys: [[MOD_KEY, 'K'], ['/']], label: 'Search entries and commands' },
      { keys: [['N']], label: 'Log a spend' },
      { keys: [['I']], label: 'Log income' },
      { keys: [['H']], label: 'Hide or show amounts' },
      { keys: [['T']], label: 'Paper or ink theme' },
      { keys: [['L']], label: 'Lock Gullak (needs a PIN)' },
      { keys: [['?']], label: 'Open this list' },
    ],
  },
  {
    title: 'Getting around',
    tone: 'sky',
    items: [
      { keys: [['1'], ['8']], range: true, label: 'Jump to a section, in sidebar order' },
      { keys: [['[']], label: 'Previous month' },
      { keys: [[']']], label: 'Next month' },
      { keys: [['↑'], ['↓']], label: 'Move through search results' },
    ],
  },
  {
    title: 'While filling a form',
    tone: 'peach',
    items: [
      { keys: [['Enter']], label: 'Save' },
      { keys: [[MOD_KEY, 'Enter']], label: 'Save and log another' },
      { keys: [['Esc']], label: 'Close without saving' },
      { keys: [['240+65']], label: 'Type sums in any amount box, it works them out' },
    ],
  },
]

function Combo({ keys }) {
  return keys.map((key, i) => (
    <Fragment key={key}>
      {i > 0 && <span className="g-shortcuts__plus">+</span>}
      <Kbd>{key}</Kbd>
    </Fragment>
  ))
}

/** Cheat sheet for keyboard users, opened with "?". */
export default function Shortcuts() {
  return (
    <div className="g-shortcuts">
      {GROUPS.map((group) => (
        <section key={group.title} className="g-shortcuts__group" style={toneVar(group.tone)}>
          <h3 className="g-shortcuts__title">{group.title}</h3>
          <dl className="g-shortcuts__list">
            {group.items.map((item) => (
              <div key={item.label} className="g-shortcuts__row">
                <dt className="g-shortcuts__keys">
                  {item.keys.map((combo, i) => (
                    <Fragment key={combo.join('+')}>
                      {i > 0 && <span className="g-shortcuts__or">{item.range ? 'to' : 'or'}</span>}
                      <Combo keys={combo} />
                    </Fragment>
                  ))}
                </dt>
                <dd>{item.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
