import { motion } from 'motion/react'
import { useId, useState } from 'react'
import {
  LuArrowLeft,
  LuCalculator,
  LuChartColumnBig,
  LuCommand,
  LuHandCoins,
  LuLandmark,
  LuLock,
  LuPiggyBank,
  LuSparkles,
  LuWalletCards,
} from 'react-icons/lu'
import { useActions } from '../../hooks/useActions'
import { toneVar } from '../../lib/cx'
import { uid } from '../../lib/id'
import { useFinance } from '../../store/contexts'

const FEATURES = [
  { icon: LuWalletCards, label: 'Every bank, card & wallet', tone: 'butter', rotate: -4 },
  { icon: LuLandmark, label: 'EMIs: paid vs left', tone: 'coral', rotate: 3 },
  { icon: LuHandCoins, label: 'Who owes whom', tone: 'mint', rotate: -2 },
  { icon: LuChartColumnBig, label: 'Where the money goes', tone: 'peach', rotate: 4 },
  { icon: LuCalculator, label: 'Type 120+80, get 200', tone: 'sky', rotate: -3 },
  { icon: LuCommand, label: 'Ctrl K for everything', tone: 'lilac', rotate: 2 },
  { icon: LuLock, label: 'PIN lock & privacy blur', tone: 'rose', rotate: -5 },
]

function CoinLogo({ drops, onDrop }) {
  return (
    <button type="button" className="g-welcome__logo" onClick={onDrop} aria-label="Drop a coin into the gullak">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <motion.g
          key={drops}
          initial={{ y: -70, opacity: 0 }}
          animate={{ y: [-70, 26, 26], opacity: [0, 1, 0], scaleX: [1, 0.25, 0.25] }}
          transition={{ duration: 0.9, times: [0, 0.55, 1], ease: ['easeIn', 'linear'] }}
        >
          <circle cx="60" cy="22" r="13" className="g-welcome__coin" />
          <text x="60" y="27" textAnchor="middle" className="g-welcome__coin-mark">
            ₹
          </text>
        </motion.g>
        <motion.g
          key={`jar-${drops}`}
          initial={{ scaleY: 1, scaleX: 1 }}
          animate={{ scaleY: [1, 1, 0.9, 1.04, 1], scaleX: [1, 1, 1.07, 0.98, 1] }}
          transition={{ duration: 1.1, times: [0, 0.48, 0.6, 0.78, 1] }}
          style={{ originY: 1 }}
        >
          <path
            className="g-welcome__pot"
            d="M24 58 C24 40 40 34 60 34 C80 34 96 40 96 58 L96 86 C96 102 82 108 60 108 C38 108 24 102 24 86 Z"
          />
          <rect className="g-welcome__slot" x="46" y="44" width="28" height="6" rx="3" />
          <path className="g-welcome__band" d="M24 70 H96" />
          <path className="g-welcome__band" d="M24 80 H96" />
        </motion.g>
      </svg>
    </button>
  )
}

/** First run: pick a name, then start empty or play with sample data. */
export default function Welcome() {
  const { state, dispatch, today } = useFinance()
  const { goPortfolio } = useActions()
  const [name, setName] = useState(state.settings.name || 'Gopichand')
  const [drops, setDrops] = useState(0)
  const nameId = useId()
  const cleanName = name.trim().slice(0, 40)

  const startFresh = () =>
    dispatch({
      type: 'onboard/fresh',
      name: cleanName,
      account: { id: uid('a'), name: 'Cash', kind: 'cash', opening: 0, color: 'butter' },
    })
  const startSample = () => dispatch({ type: 'onboard/sample', today, name: cleanName })

  return (
    <main className="g-welcome">
      <motion.div
        className="g-welcome__card"
        initial={{ y: 60, rotate: -2, opacity: 0 }}
        animate={{ y: 0, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      >
        <CoinLogo drops={drops} onDrop={() => setDrops((n) => n + 1)} />
        <p className="g-kicker">Personal money book</p>
        <h1 className="g-welcome__title">
          Gullak<span aria-hidden="true">.</span>
        </h1>
        <p className="g-welcome__lead">
          One place for what you spend, earn, lend, owe and still have to pay. Log an entry a day and Gullak does the
          maths.
        </p>

        <ul className="g-welcome__stickers">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon
            return (
              <motion.li
                key={feature.label}
                className="g-sticker"
                style={{ ...toneVar(feature.tone), '--rot': `${feature.rotate}deg` }}
                initial={{ opacity: 0, y: 40, rotate: feature.rotate * 4, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, rotate: feature.rotate, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.25 + i * 0.07 }}
              >
                <Icon aria-hidden="true" />
                {feature.label}
              </motion.li>
            )
          })}
        </ul>

        <form
          className="g-welcome__form"
          onSubmit={(event) => {
            event.preventDefault()
            startFresh()
          }}
        >
          <label htmlFor={nameId} className="g-field__label">
            What should Gullak call you?
          </label>
          <input
            id={nameId}
            className="g-input"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            autoComplete="given-name"
          />
          <div className="g-welcome__actions">
            <button type="submit" className="g-btn g-btn--ink g-press">
              <LuPiggyBank aria-hidden="true" /> Start fresh
            </button>
            <button type="button" className="g-btn g-press" style={toneVar('lime')} onClick={startSample}>
              <LuSparkles aria-hidden="true" /> Explore with sample data
            </button>
          </div>
          <p className="g-welcome__note">
            Everything stays in this browser (localStorage). Nothing is uploaded unless you ask the Munshi assistant a
            question. Sample data can be wiped from the banner later.
          </p>
        </form>
      </motion.div>
      <button type="button" className="g-welcome__back" onClick={goPortfolio}>
        <LuArrowLeft aria-hidden="true" /> Back to portfolio
      </button>
    </main>
  )
}
