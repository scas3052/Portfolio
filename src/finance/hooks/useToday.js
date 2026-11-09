import { useEffect, useState } from 'react'
import { msUntilMidnight, todayISO } from '../lib/dates'

/** Today's local date ("YYYY-MM-DD"), refreshed at midnight and when the tab wakes up. */
export function useToday() {
  const [today, setToday] = useState(todayISO)

  useEffect(() => {
    let timer = 0
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setToday(todayISO())
        schedule()
      }, msUntilMidnight() + 500)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setToday(todayISO())
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}
