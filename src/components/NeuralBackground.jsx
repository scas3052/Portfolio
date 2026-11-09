import { useEffect, useRef } from 'react'

const PALETTES = {
  dark: { dot: '167, 139, 250', line: '34, 211, 238' },
  light: { dot: '124, 58, 237', line: '8, 145, 178' },
}
const LINK_DISTANCE = 130
const POINTER_DISTANCE = 180

function createParticle(width, height) {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: Math.random() * 1.6 + 0.8,
  }
}

/** Animated "neural network" constellation drawn on a canvas behind the hero. */
export default function NeuralBackground({ theme }) {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return undefined

    const palette = PALETTES[theme] ?? PALETTES.dark
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: -9999, y: -9999 }
    let width = 0
    let height = 0
    let frame = 0
    let running = false
    let onScreen = true

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const previous = { width, height }
      width = rect.width
      height = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const target = Math.max(28, Math.min(90, Math.round((width * height) / 16000)))
      const particles = particlesRef.current
      if (previous.width && previous.height) {
        particles.forEach((p) => {
          p.x = (p.x / previous.width) * width
          p.y = (p.y / previous.height) * height
        })
      }
      while (particles.length < target) particles.push(createParticle(width, height))
      particles.length = target
    }

    const draw = () => {
      const particles = particlesRef.current
      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j]
          const distance = Math.hypot(a.x - b.x, a.y - b.y)
          if (distance < LINK_DISTANCE) {
            ctx.strokeStyle = `rgba(${palette.line}, ${(1 - distance / LINK_DISTANCE) * 0.22})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }

        const toPointer = Math.hypot(a.x - pointer.x, a.y - pointer.y)
        if (toPointer < POINTER_DISTANCE) {
          ctx.strokeStyle = `rgba(${palette.dot}, ${(1 - toPointer / POINTER_DISTANCE) * 0.45})`
          ctx.lineWidth = 1.1
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(pointer.x, pointer.y)
          ctx.stroke()
        }

        ctx.fillStyle = `rgba(${palette.dot}, 0.85)`
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const step = () => {
      particlesRef.current.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > width) p.vx *= -1
        if (p.y < 0 || p.y > height) p.vy *= -1
        p.x = Math.max(0, Math.min(width, p.x))
        p.y = Math.max(0, Math.min(height, p.y))
      })
      draw()
      frame = requestAnimationFrame(step)
    }

    const start = () => {
      if (running || reduceMotion || !onScreen || document.hidden) return
      running = true
      frame = requestAnimationFrame(step)
    }

    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    const onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
    }

    const onPointerLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }

    const onVisibility = () => (document.hidden ? stop() : start())

    const resizeObserver = new ResizeObserver(() => {
      resize()
      if (!running) draw()
    })
    resizeObserver.observe(canvas)

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) start()
      else stop()
    })
    intersectionObserver.observe(canvas)

    resize()
    draw()
    start()

    const host = canvas.parentElement
    host?.addEventListener('pointermove', onPointerMove)
    host?.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      host?.removeEventListener('pointermove', onPointerMove)
      host?.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [theme])

  return <canvas ref={canvasRef} className="neural-bg" aria-hidden="true" />
}
