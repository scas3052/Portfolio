// Squarified treemap (Bruls, Huizing & van Wijk). Returns rectangles in the
// same units as `width`/`height`, largest items first.

function worst(row, side) {
  let sum = 0
  let min = Infinity
  let max = 0
  for (const node of row) {
    sum += node.area
    min = Math.min(min, node.area)
    max = Math.max(max, node.area)
  }
  const s2 = sum * sum
  const side2 = side * side
  return Math.max((side2 * max) / s2, s2 / (side2 * min))
}

export function squarify(items, width, height) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0)
  if (!(total > 0)) return []
  const nodes = items
    .filter((item) => item.value > 0)
    .map((item) => ({ ...item, area: (item.value / total) * width * height }))
    .sort((a, b) => b.area - a.area)

  const out = []
  let x = 0
  let y = 0
  let w = width
  let h = height

  const place = (row) => {
    const sum = row.reduce((s, node) => s + node.area, 0)
    if (w >= h) {
      const colW = sum / h
      let cy = y
      for (const node of row) {
        const nh = node.area / colW
        out.push({ ...node, x, y: cy, w: colW, h: nh })
        cy += nh
      }
      x += colW
      w -= colW
    } else {
      const rowH = sum / w
      let cx = x
      for (const node of row) {
        const nw = node.area / rowH
        out.push({ ...node, x: cx, y, w: nw, h: rowH })
        cx += nw
      }
      y += rowH
      h -= rowH
    }
  }

  let row = []
  let i = 0
  while (i < nodes.length) {
    const side = Math.min(w, h)
    const candidate = [...row, nodes[i]]
    if (row.length === 0 || worst(candidate, side) <= worst(row, side)) {
      row = candidate
      i += 1
    } else {
      place(row)
      row = []
    }
  }
  if (row.length) place(row)
  return out
}
