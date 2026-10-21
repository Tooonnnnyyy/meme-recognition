// One Euro filter (Casiez, Roussel & Vogel, CHI 2012). It smooths heavily while
// a signal is still and lets it through almost unchanged while it moves fast,
// so jitter drops without adding noticeable lag. Time is in seconds.
export function createOneEuroFilter({ minCutoff = 1, beta = 0, derivativeCutoff = 1 } = {}) {
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
  let lastTime = null
  let lastValue = 0
  let lastDerivative = 0
  return (value, time) => {
    if (lastTime === null) {
      lastTime = time
      lastValue = value
      return value
    }
    const dt = time - lastTime
    if (dt <= 0) return lastValue
    const derivative = (value - lastValue) / dt
    lastDerivative += alpha(derivativeCutoff, dt) * (derivative - lastDerivative)
    const cutoff = minCutoff + beta * Math.abs(lastDerivative)
    lastValue += alpha(cutoff, dt) * (value - lastValue)
    lastTime = time
    return lastValue
  }
}

// Landmarks are normalized 0–1 image coordinates; blendshape scores are 0–1
// but change faster (a blink takes ~100 ms), so they get a higher base cutoff.
const LANDMARK_FILTER = { minCutoff: 1.2, beta: 8 }
const SCORE_FILTER = { minCutoff: 2, beta: 1 }

// Smooths every landmark set and blendshape list in a vision frame. Each
// tracked face/hand/body keeps its own filters; a filter is dropped as soon as
// its target leaves the frame so a returning hand starts fresh.
export function createFrameSmoother({ landmarks = LANDMARK_FILTER, scores = SCORE_FILTER } = {}) {
  const banks = new Map()
  return (result, timestampMs) => {
    const time = timestampMs / 1000
    const seen = new Set()
    const bank = key => {
      seen.add(key)
      if (!banks.has(key)) banks.set(key, new Map())
      return banks.get(key)
    }
    const filter = (filters, key, options) => {
      if (!filters.has(key)) filters.set(key, createOneEuroFilter(options))
      return filters.get(key)
    }
    const smoothPoints = (key, points) => {
      const filters = bank(key)
      return points.map((point, index) => ({
        ...point,
        x: filter(filters, `${index}x`, landmarks)(point.x, time),
        y: filter(filters, `${index}y`, landmarks)(point.y, time),
        z: filter(filters, `${index}z`, landmarks)(point.z || 0, time),
      }))
    }
    const smoothScores = (key, categories) => {
      const filters = bank(key)
      return categories.map(category => ({ ...category, score: filter(filters, category.categoryName, scores)(category.score, time) }))
    }

    const labels = (result.hand?.handedness || []).map((categories, index) => categories?.[0]?.categoryName || String(index))
    const handKey = index => (labels.indexOf(labels[index]) === index && labels[index] ? labels[index] : String(index))
    const smoothed = {
      hand: result.hand && { ...result.hand, landmarks: (result.hand.landmarks || []).map((points, index) => smoothPoints(`hand:${handKey(index)}`, points)) },
      face: result.face && {
        ...result.face,
        faceLandmarks: (result.face.faceLandmarks || []).map((points, index) => smoothPoints(`face:${index}`, points)),
        faceBlendshapes: (result.face.faceBlendshapes || []).map((item, index) => ({ ...item, categories: smoothScores(`blendshapes:${index}`, item.categories || []) })),
      },
      pose: result.pose && { ...result.pose, landmarks: (result.pose.landmarks || []).map((points, index) => smoothPoints(`pose:${index}`, points)) },
    }
    for (const key of banks.keys()) if (!seen.has(key)) banks.delete(key)
    return smoothed
  }
}
