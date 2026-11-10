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

// The area of interest a point falls in. If the point is inside one or more
// areas, the smallest wins. Only when it is inside none do the areas grow by
// marginPx to absorb gaze error, and the nearest wins. Areas on fixed
// elements (fixed: true) are in viewport coordinates, so the point is moved
// there with its scroll offset (sx, sy).
export function aoiAt(point, aois, marginPx = 0) {
  const hits = aois.map(({ id, rect, fixed }) => {
    const x = fixed ? point.x - (point.sx || 0) : point.x
    const y = fixed ? point.y - (point.sy || 0) : point.y
    const dx = Math.max(rect.x - x, 0, x - rect.x - rect.width)
    const dy = Math.max(rect.y - y, 0, y - rect.y - rect.height)
    return { id, gap: Math.hypot(dx, dy), within: dx <= marginPx && dy <= marginPx, area: rect.width * rect.height }
  }).filter(hit => hit.within)
  hits.sort((a, b) => a.gap - b.gap || a.area - b.area)
  return hits[0]?.id || null
}
