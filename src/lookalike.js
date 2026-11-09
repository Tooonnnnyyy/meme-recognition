// Meme Lookalike treats a facial expression as a vector: one 0–1 score per
// MediaPipe blendshape (jawOpen, mouthSmileLeft, eyeBlinkRight…). Cosine
// similarity then measures whether two faces move the same muscles in the
// same proportions, regardless of how strongly.

// MediaPipe's 52 blendshapes minus `_neutral` and the eight eyeLook* scores:
// where someone is looking is not part of the expression.
export const EXPRESSION_KEYS = [
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel',
  'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight', 'mouthPucker',
  'mouthRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight',
]

// Accepts MediaPipe categories ([{ categoryName, score }]) or a { name: score } map.
export function expressionVector(scores = []) {
  const lookup = Array.isArray(scores) ? new Map(scores.map(item => [item.categoryName, item.score])) : new Map(Object.entries(scores))
  return EXPRESSION_KEYS.map(key => lookup.get(key) || 0)
}

const MIRROR_INDEX = EXPRESSION_KEYS.map(key => {
  const swapped = key.endsWith('Left') ? `${key.slice(0, -4)}Right` : key.endsWith('Right') ? `${key.slice(0, -5)}Left` : key
  return EXPRESSION_KEYS.indexOf(swapped)
})

// Swaps left/right scores. Someone copying a photo from a mirrored preview
// usually uses the opposite side of their face (a wink, a lopsided smirk).
export const mirrorVector = vector => MIRROR_INDEX.map(index => vector[index])

export function cosineSimilarity(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]
    normA += a[index] * a[index]
    normB += b[index] * b[index]
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}

// Removes the resting face so only the expression is compared. Without a
// calibrated rest the raw scores are used.
export const expressionDelta = (vector, rest) => (rest ? vector.map((value, index) => Math.max(0, value - rest[index])) : vector)

export const expressionStrength = vector => Math.hypot(...vector)

// Scores every reference against the live face (and its mirror image), best first.
export function rankMatches(live, references, rest = null) {
  const liveDelta = expressionDelta(live, rest)
  const mirrored = mirrorVector(liveDelta)
  return references
    .map(reference => {
      const target = expressionDelta(reference.vector, rest)
      const direct = cosineSimilarity(liveDelta, target)
      const flipped = cosineSimilarity(mirrored, target)
      return { id: reference.id, score: Math.max(direct, flipped), mirrored: flipped > direct }
    })
    .sort((a, b) => b.score - a.score)
}

// Keeps the displayed best match from flickering between two close scores:
// a challenger must beat the current leader by `margin` to take over.
export function createLeaderTracker({ margin = 0.03 } = {}) {
  let leader = null
  return ranking => {
    const top = ranking[0]
    if (!top) return (leader = null)
    const current = ranking.find(match => match.id === leader)
    if (!current || top.score > current.score + margin) leader = top.id
    return leader
  }
}

export const averageVectors = vectors => vectors[0].map((_, index) => vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length)
