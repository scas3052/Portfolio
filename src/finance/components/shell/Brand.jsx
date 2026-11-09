import { cx } from '../../lib/cx'
import { hrefFor } from '../../lib/router'

/** Wordmark: a lime money box whose coin drops into the slot on hover. */
export default function Brand({ compact = false, className }) {
  return (
    <a className={cx('g-brand', compact && 'g-brand--compact', className)} href={hrefFor('overview')} aria-label="Gullak overview">
      <span className="g-brand__mark" aria-hidden="true">
        <span className="g-brand__coin">₹</span>
        <span className="g-brand__slot" />
      </span>
      {!compact && (
        <span className="g-brand__word" aria-hidden="true">
          Gullak<span className="g-brand__dot">.</span>
        </span>
      )}
    </a>
  )
}
