/** Pointer-move handler that feeds the card "spotlight" effect (see .card in global.css). */
export function trackSpotlight(event) {
  const element = event.currentTarget
  const rect = element.getBoundingClientRect()
  element.style.setProperty('--mx', `${event.clientX - rect.left}px`)
  element.style.setProperty('--my', `${event.clientY - rect.top}px`)
}
