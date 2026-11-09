import { marquee } from '../data/portfolio'
import './TechMarquee.css'

const REVERSED = [...marquee].reverse()

function Row({ items, hidden = false }) {
  return (
    <ul className="marquee__row" aria-hidden={hidden || undefined}>
      {items.map(({ name, icon: Icon }) => (
        <li key={name} className="marquee__item">
          <Icon aria-hidden="true" />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  )
}

// Each track holds two copies of its row so the -50% loop is seamless
function Track({ items, reverse = false, hidden = false }) {
  return (
    <div className={`marquee__track${reverse ? ' marquee__track--reverse' : ''}`} aria-hidden={hidden || undefined}>
      <Row items={items} />
      <Row items={items} hidden />
    </div>
  )
}

export default function TechMarquee() {
  return (
    <section className="marquee" aria-label="Technologies I work with">
      <Track items={marquee} />
      <Track items={REVERSED} reverse hidden />
    </section>
  )
}
