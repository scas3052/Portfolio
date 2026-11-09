import { useEffect, useState } from 'react'

/** Types and deletes each word in turn, like a terminal prompt. */
export function useTypewriter(words, { enabled = true, typeSpeed = 75, deleteSpeed = 40, pause = 1700 } = {}) {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!enabled || words.length === 0) return undefined

    const word = words[index % words.length]
    let delay = deleting ? deleteSpeed : typeSpeed
    let tick

    if (!deleting && text === word) {
      delay = pause
      tick = () => setDeleting(true)
    } else if (deleting && text === '') {
      delay = 300
      tick = () => {
        setDeleting(false)
        setIndex((i) => (i + 1) % words.length)
      }
    } else {
      tick = () => setText(deleting ? word.slice(0, text.length - 1) : word.slice(0, text.length + 1))
    }

    const timeout = setTimeout(tick, delay)
    return () => clearTimeout(timeout)
  }, [enabled, words, index, text, deleting, typeSpeed, deleteSpeed, pause])

  return enabled ? text : (words[0] ?? '')
}
