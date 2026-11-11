import { useEffect, useRef, useState } from 'react'
import { LuArrowDownRight, LuArrowUpRight, LuEqual, LuSparkles } from 'react-icons/lu'
import { cx, toneVar } from '../lib/cx'
import { formatPercent, initials } from '../lib/format'

/** Bento tile. `index` staggers the "lift off the page" entrance. */
export function Tile({ title, icon: Icon, kicker, actions, tone, span, index = 0, className, children, ...rest }) {
  return (
    <section
      className={cx('g-tile', tone && 'g-tile--tone', span && `g-span-${span}`, className)}
      style={{ '--i': index, ...toneVar(tone) }}
      {...rest}
    >
      {(title || actions) && (
        <header className="g-tile__head">
          <div className="g-tile__title">
            {Icon && (
              <span className="g-tile__icon" aria-hidden="true">
                <Icon />
              </span>
            )}
            <div>
              {kicker && <p className="g-kicker">{kicker}</p>}
              {title && <h2>{title}</h2>}
            </div>
          </div>
          {actions && <div className="g-tile__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function ViewHeader({ title, sub, tone = 'lime', actions, children }) {
  return (
    <header className="g-view__head">
      <div>
        <h1 className="g-view__title">
          <span className="g-marker" style={toneVar(tone)}>
            {title}
          </span>
        </h1>
        {sub && <p className="g-view__sub">{sub}</p>}
      </div>
      {actions && <div className="g-view__actions">{actions}</div>}
      {children}
    </header>
  )
}

export function Sticker({ tone = 'butter', rotate = -3, className, children }) {
  return (
    <span className={cx('g-sticker', className)} style={{ ...toneVar(tone), '--rot': `${rotate}deg` }}>
      {children}
    </span>
  )
}

export function ProgressBar({ value, tone = 'lime', label, size, className }) {
  const ratio = Number.isFinite(value) ? Math.max(0, value) : 0
  return (
    <div
      className={cx('g-bar', ratio > 1 && 'is-over', size && `g-bar--${size}`, className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, ratio) * 100)}
      style={{ '--p': Math.min(1, ratio), ...toneVar(tone) }}
    >
      <span className="g-bar__fill" />
    </div>
  )
}

export function EmptyState({ icon: Icon = LuSparkles, title, body, action, compact }) {
  return (
    <div className={cx('g-empty', compact && 'g-empty--compact')}>
      <span className="g-empty__icon" aria-hidden="true">
        <Icon />
      </span>
      <p className="g-empty__title">{title}</p>
      {body && <p className="g-empty__body">{body}</p>}
      {action}
    </div>
  )
}

/** Row of mechanical keys; the chosen one stays pressed down. */
export function Segmented({ options, value, onChange, label, size, className }) {
  return (
    <div className={cx('g-seg', size && `g-seg--${size}`, className)} role="group" aria-label={label}>
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className={cx('g-seg__opt', active && 'is-active')}
            aria-pressed={active}
            style={toneVar(option.tone)}
            onClick={() => onChange(option.value)}
          >
            {Icon && <Icon aria-hidden="true" />}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Destructive actions need a press-and-hold instead of a second dialog. */
export function HoldButton({ onConfirm, children, tone = 'coral', duration = 1200, icon: Icon, className, disabled = false }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef(0)
  if (disabled && holding) setHolding(false)

  useEffect(() => {
    const pending = timer
    return () => clearTimeout(pending.current)
  }, [])

  useEffect(() => {
    if (disabled) clearTimeout(timer.current)
  }, [disabled])

  const start = () => {
    if (disabled) return
    clearTimeout(timer.current)
    setHolding(true)
    timer.current = setTimeout(() => {
      setHolding(false)
      onConfirm()
    }, duration)
  }
  const cancel = () => {
    clearTimeout(timer.current)
    setHolding(false)
  }

  return (
    <button
      type="button"
      className={cx('g-hold', holding && 'is-holding', className)}
      style={{ ...toneVar(tone), '--hold': `${duration}ms` }}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button === 0) start()
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
          event.preventDefault()
          start()
        }
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') cancel()
      }}
      onBlur={cancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="g-hold__fill" aria-hidden="true" />
      <span className="g-hold__label">
        {Icon && <Icon aria-hidden="true" />}
        {children}
      </span>
      <span className="sr-only">(press and hold to confirm)</span>
    </button>
  )
}

export function Avatar({ name, tone = 'lilac', size }) {
  return (
    <span className={cx('g-avatar', size && `g-avatar--${size}`)} style={toneVar(tone)} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function IconBadge({ icon: Icon, tone = 'gray', size }) {
  return (
    <span className={cx('g-badge', size && `g-badge--${size}`)} style={toneVar(tone)} aria-hidden="true">
      <Icon />
    </span>
  )
}

export function Kbd({ children }) {
  return <kbd className="g-kbd">{children}</kbd>
}

/** Percentage change against an earlier amount. `goodWhen` says which direction deserves the green. */
export function Delta({ value, previous, against, goodWhen = 'down' }) {
  if (!(previous > 0)) return null
  const change = (value - previous) / previous
  if (Math.abs(change) < 0.005) {
    return (
      <span className="g-delta">
        <LuEqual aria-hidden="true" /> Same as {against}
      </span>
    )
  }
  const up = change > 0
  const good = goodWhen === 'up' ? up : !up
  const Icon = up ? LuArrowUpRight : LuArrowDownRight
  return (
    <span className={cx('g-delta', good ? 'is-good' : 'is-bad')}>
      <Icon aria-hidden="true" />
      {formatPercent(Math.abs(change))} {up ? 'more' : 'less'} than {against}
    </span>
  )
}
