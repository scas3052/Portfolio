import { AnimatePresence } from 'motion/react'
import { createPortal } from 'react-dom'
import { useUi } from '../../store/contexts'
import Celebration from './Celebration'
import LockScreen from './LockScreen'
import Palette from './Palette'
import SheetHost from './SheetHost'
import Toasts from './Toasts'

/** Everything that floats above the app. */
export default function Overlays() {
  const { paletteOpen, setPaletteOpen, locked } = useUi()
  return (
    <>
      <SheetHost />
      {createPortal(
        <>
          <AnimatePresence>{paletteOpen && <Palette key="palette" onClose={() => setPaletteOpen(false)} />}</AnimatePresence>
          <Toasts />
          <Celebration />
          <AnimatePresence>{locked && <LockScreen key="lock" />}</AnimatePresence>
        </>,
        document.body,
      )}
    </>
  )
}
