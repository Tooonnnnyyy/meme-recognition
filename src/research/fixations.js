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

// points: [{ t (ms), x, y }] in time order. Returns [{ start, end, x, y, samples }].
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
      fixations.push({
        start: segment[first].t,
        end: segment[last].t,
        x: window.reduce((sum, point) => sum + point.x, 0) / window.length,
        y: window.reduce((sum, point) => sum + point.y, 0) / window.length,
        samples: window.length,
      })
      first = last + 1
    }
  })
  return fixations
}

// The area of interest a point falls in, after growing every area by
// marginPx to absorb gaze error. Overlaps go to the smallest area.
export function aoiAt(point, aois, marginPx = 0) {
  const hits = aois.filter(({ rect }) => point.x >= rect.x - marginPx && point.x <= rect.x + rect.width + marginPx && point.y >= rect.y - marginPx && point.y <= rect.y + rect.height + marginPx)
  hits.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)
  return hits[0]?.id || null
}
