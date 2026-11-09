import { motion, useTransform } from 'motion/react'
import { SiAngular, SiDotnet } from 'react-icons/si'
import { VscAzure } from 'react-icons/vsc'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useTilt } from '../hooks/useTilt'
import './CodeWindow.css'

const I = (n) => ['', ' '.repeat(n)]

// Hand-tokenised so it needs no syntax-highlighting library: [tokenType, text]
const CODE = [
  [['kw', 'public'], ['', ' '], ['kw', 'class'], ['', ' '], ['cls', 'Gopichand'], ['p', ' : '], ['cls', 'SoftwareEngineer']],
  [['p', '{']],
  [I(4), ['kw', 'string'], ['p', '[]'], ['', ' '], ['var', 'Stack'], ['op', ' = '], ['p', '['], ['str', '"Angular"'], ['p', ', '], ['str', '".NET"'], ['p', ',']],
  [I(22), ['str', '"Azure"'], ['p', ', '], ['str', '"GenAI"'], ['p', '];']],
  [],
  [I(4), ['kw', 'public'], ['', ' '], ['kw', 'async'], ['', ' '], ['cls', 'Task'], ['p', '<'], ['cls', 'App'], ['p', '>'], ['', ' '], ['fn', 'Ship'], ['p', '('], ['cls', 'Idea'], ['', ' '], ['param', 'idea'], ['p', ')']],
  [I(4), ['p', '{']],
  [I(8), ['cm', '// turn manual work into software']],
  [I(8), ['kw', 'var'], ['', ' '], ['var', 'app'], ['op', ' = '], ['kw', 'await'], ['', ' '], ['fn', 'Build'], ['p', '('], ['param', 'idea'], ['p', ');']],
  [I(8), ['kw', 'return'], ['', ' '], ['kw', 'await'], ['', ' '], ['fn', 'Deploy'], ['p', '('], ['var', 'app'], ['p', ');']],
  [I(4), ['p', '}']],
  [['p', '}']],
]

// `depth` = how far (px) each badge drifts with the pointer, for a layered parallax feel
const BADGES = [
  { label: 'Angular', icon: SiAngular, color: '#dd0031', className: 'code-window__badge--1', depth: 14 },
  { label: '.NET', icon: SiDotnet, color: '#8b5cf6', className: 'code-window__badge--2', depth: 22 },
  { label: 'Azure', icon: VscAzure, color: '#0089d6', className: 'code-window__badge--3', depth: 18 },
]

function Badge({ label, icon: Icon, color, className, depth, pointerX, pointerY }) {
  const x = useTransform(pointerX, (value) => value * depth)
  const y = useTransform(pointerY, (value) => value * depth)

  return (
    <motion.span className={`code-window__badge ${className}`} style={{ x, y }} aria-hidden="true">
      <span className="code-window__badge-inner">
        <Icon style={{ color }} />
        {label}
      </span>
    </motion.span>
  )
}

export default function CodeWindow() {
  const compact = useMediaQuery('(max-width: 640px)')
  const { rotateX, rotateY, pointerX, pointerY, handlers } = useTilt({
    max: 7,
    restX: compact ? 0 : 3,
    restY: compact ? 0 : -6,
  })

  return (
    <div className="code-window-wrap" {...handlers}>
      <motion.div
        className="code-window"
        style={{ rotateX, rotateY, transformPerspective: 1400 }}
        role="img"
        aria-label="C# code snippet: a Gopichand class whose Ship method builds an idea into an app and deploys it."
      >
        <div className="code-window__bar" aria-hidden="true">
          <span className="code-window__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="code-window__tab">Gopichand.cs</span>
          <span className="code-window__lang">C#</span>
        </div>

        <pre className="code-window__code" aria-hidden="true">
          <code>
            {CODE.map((tokens, line) => (
              <motion.span
                key={line}
                className="code-window__line"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + line * 0.07, duration: 0.4 }}
              >
                <span className="code-window__ln">{line + 1}</span>
                <span>
                  {tokens.map(([type, text], i) => (
                    <span key={i} className={type ? `tk-${type}` : undefined}>
                      {text}
                    </span>
                  ))}
                  {line === CODE.length - 1 && <span className="code-window__cursor" />}
                </span>
              </motion.span>
            ))}
          </code>
        </pre>

        <div className="code-window__status" aria-hidden="true">
          <span>
            <span className="code-window__status-dot" /> main
          </span>
          <span>UTF-8 · .NET</span>
        </div>

        <span className="code-window__glare" aria-hidden="true" />
      </motion.div>

      {BADGES.map((badge) => (
        <Badge key={badge.label} {...badge} pointerX={pointerX} pointerY={pointerY} />
      ))}
    </div>
  )
}
