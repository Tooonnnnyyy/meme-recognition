// Fixation detection by dispersion threshold (I-DT, Salvucci & Goldberg 2000).
// It suits webcam gaze: it needs no velocities, so it tolerates the low and
// uneven sampling rate (~10–30 Hz) that velocity-based methods struggle with.

const dispersion = points => {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)
}

// Splits the stream wherever the face was lost for longer than maxGapMs, so a
// fixation never spans a moment with no data.
function segments(points, maxGapMs) {
  const result = []
  let current = []
  points.forEach(point => {
    if (current.length && point.t - current[current.length - 1].t > maxGapMs) {
      result.push(current)
      current = []
    }
    current.push(point)
  })
  if (current.length) result.push(current)
  return result
}

// points: [{ t (ms), x, y, sx?, sy? }] in time order, where sx, sy is the page's
// scroll offset at that moment. Returns [{ start, end, x, y, sx, sy, samples }].
export function detectFixations(points, { dispersionPx = 100, minDurationMs = 120, maxGapMs = 250 } = {}) {
  const fixations = []
  segments(points, maxGapMs).forEach(segment => {
    let first = 0
    while (first < segment.length) {
      let last = first
      while (last < segment.length && segment[last].t - segment[first].t < minDurationMs) last += 1
      if (last >= segment.length) break
      if (dispersion(segment.slice(first, last + 1)) > dispersionPx) {
        first += 1
        continue
      }
      while (last + 1 < segment.length && dispersion(segment.slice(first, last + 2)) <= dispersionPx) last += 1
      const window = segment.slice(first, last + 1)
      const mean = key => window.reduce((sum, point) => sum + (point[key] || 0), 0) / window.length
      fixations.push({ start: segment[first].t, end: segment[last].t, x: mean('x'), y: mean('y'), sx: mean('sx'), sy: mean('sy'), samples: window.length })
      first = last + 1
    }
  })
  return fixations
}

// The area of interest a point falls in. Areas grow by marginPx to absorb gaze
// error and the smallest hit wins, the nearest on ties, except that a point
// squarely inside an area is not taken by a grown neighbour, only by an area
// nested inside it. A point on a fixed area (fixed: true, such as a fixed
// footer) ignores the areas scrolling under it. Fixed areas are in viewport
// coordinates, so they are moved into the page with the point's scroll
// offset (sx, sy).
export const aoiAt = (point, aois, marginPx = 0) => aoiHit(point, aois, marginPx)?.id || null

// As aoiAt, but returns the area with its box in page coordinates
// ({ id, x, y, right, bottom }), or null.
export function aoiHit(point, aois, marginPx = 0) {
  const areas = aois.map(({ id, rect, fixed }) => {
    const x = fixed ? rect.x + (point.sx || 0) : rect.x
    const y = fixed ? rect.y + (point.sy || 0) : rect.y
    const dx = Math.max(x - point.x, 0, point.x - x - rect.width)
    const dy = Math.max(y - point.y, 0, point.y - y - rect.height)
    return { id, fixed, x, y, right: x + rect.width, bottom: y + rect.height, gap: Math.hypot(dx, dy), within: dx <= marginPx && dy <= marginPx, area: rect.width * rect.height }
  })
  const onFixed = areas.some(area => area.fixed && area.gap === 0)
  const hits = areas.filter(area => area.within && (area.fixed || !onFixed))
  const inside = hits.filter(hit => hit.gap === 0)
  // 2 px of slack: sub-pixel layout can put a child's edge just past its
  // container's.
  const contains = (outer, inner) => outer.x - 2 <= inner.x && outer.y - 2 <= inner.y && outer.right + 2 >= inner.right && outer.bottom + 2 >= inner.bottom
  const kept = hits.filter(hit => hit.gap === 0 || inside.every(outer => contains(outer, hit)))
  kept.sort((a, b) => a.area - b.area || a.gap - b.gap)
  const best = kept[0]
  return best ? { id: best.id, x: best.x, y: best.y, right: best.right, bottom: best.bottom } : null
}

// Distance between two boxes from aoiHit; 0 when they touch, overlap or nest.
export const boxGap = (a, b) => Math.hypot(Math.max(a.x - b.right, 0, b.x - a.right), Math.max(a.y - b.bottom, 0, b.y - a.bottom))
