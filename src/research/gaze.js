// Webcam gaze estimation from MediaPipe face landmarks. Each frame becomes a
// short list of eye and head features; a ridge regression fitted on the
// participant's own calibration clicks maps those features to screen pixels.
// Accuracy is coarse (a few degrees), good enough for areas, not for words.

// CSS "reference pixel": the visual angle of one pixel at arm's length on a
// 96 dpi screen (CSS Values spec). Browsers size CSS pixels close to this, so
// it converts pixel errors to approximate degrees without knowing the screen.
export const DEGREES_PER_CSS_PX = 0.0213

const IRIS = { right: 468, left: 473 }
const EYE = {
  right: { inner: 133, outer: 33, upper: 159, lower: 145 },
  left: { inner: 362, outer: 263, upper: 386, lower: 374 },
}
const GAZE_BLENDSHAPES = ['eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight']

// 18 numbers: iris position inside each eye (4), MediaPipe's own eye-direction
// scores (8), head offset, position, size and tilt (6).
export function gazeFeatures(faceResult, aspect = 4 / 3) {
  const face = faceResult?.faceLandmarks?.[0]
  if (!face || face.length < 478) return null
  const point = index => ({ x: face[index].x * aspect, y: face[index].y })
  const eye = side => {
    const { inner, outer, upper, lower } = EYE[side]
    const start = point(inner)
    const end = point(outer)
    const iris = point(IRIS[side])
    const axis = { x: end.x - start.x, y: end.y - start.y }
    const widthSquared = Math.max(axis.x * axis.x + axis.y * axis.y, 1e-9)
    const lidMiddle = { x: (point(upper).x + point(lower).x) / 2, y: (point(upper).y + point(lower).y) / 2 }
    const along = ((iris.x - start.x) * axis.x + (iris.y - start.y) * axis.y) / widthSquared
    const across = ((iris.x - lidMiddle.x) * -axis.y + (iris.y - lidMiddle.y) * axis.x) / widthSquared
    return { along, across, centre: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } }
  }
  const right = eye('right')
  const left = eye('left')
  const between = { x: (right.centre.x + left.centre.x) / 2, y: (right.centre.y + left.centre.y) / 2 }
  const span = Math.max(Math.hypot(left.centre.x - right.centre.x, left.centre.y - right.centre.y), 1e-6)
  const nose = point(1)
  const scores = new Map((faceResult.faceBlendshapes?.[0]?.categories || []).map(item => [item.categoryName, item.score]))
  return [
    right.along, right.across, left.along, left.across,
    ...GAZE_BLENDSHAPES.map(name => scores.get(name) || 0),
    (nose.x - between.x) / span, (nose.y - between.y) / span,
    between.x, between.y, span,
    Math.atan2(left.centre.y - right.centre.y, left.centre.x - right.centre.x),
  ]
}

// Solves A·w = b by Gaussian elimination with partial pivoting.
function solve(matrix, vector) {
  const size = vector.length
  const rows = matrix.map((row, index) => [...row, vector[index]])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row
    ;[rows[column], rows[pivot]] = [rows[pivot], rows[column]]
    const lead = rows[column][column] || 1e-12
    for (let row = column + 1; row < size; row += 1) {
      const factor = rows[row][column] / lead
      for (let index = column; index <= size; index += 1) rows[row][index] -= factor * rows[column][index]
    }
  }
  const result = Array(size).fill(0)
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = rows[row][size]
    for (let index = row + 1; index < size; index += 1) sum -= rows[row][index] * result[index]
    result[row] = sum / (rows[row][row] || 1e-12)
  }
  return result
}

// Ridge regression on standardized features. Ridge keeps the fit stable when
// features are correlated (iris position and eye-direction scores move
// together) and when a feature barely changes during calibration.
export function fitGazeModel(samples, { lambda = 1 } = {}) {
  const count = samples.length
  const size = samples[0].features.length
  const mean = Array(size).fill(0)
  const spread = Array(size).fill(0)
  samples.forEach(({ features }) => features.forEach((value, index) => { mean[index] += value / count }))
  samples.forEach(({ features }) => features.forEach((value, index) => { spread[index] += (value - mean[index]) ** 2 / count }))
  const scale = spread.map(value => (value > 1e-12 ? Math.sqrt(value) : 1))
  const standardized = samples.map(({ features }) => features.map((value, index) => (value - mean[index]) / scale[index]))
  const meanX = samples.reduce((sum, sample) => sum + sample.x, 0) / count
  const meanY = samples.reduce((sum, sample) => sum + sample.y, 0) / count
  const gram = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => standardized.reduce((sum, z) => sum + z[row] * z[column], 0) + (row === column ? lambda : 0)))
  const project = target => Array.from({ length: size }, (_, row) => standardized.reduce((sum, z, index) => sum + z[row] * target[index], 0))
  return {
    mean, scale, meanX, meanY,
    weightsX: solve(gram, project(samples.map(sample => sample.x - meanX))),
    weightsY: solve(gram, project(samples.map(sample => sample.y - meanY))),
  }
}

export function predictGaze(model, features) {
  let x = model.meanX
  let y = model.meanY
  features.forEach((value, index) => {
    const z = (value - model.mean[index]) / model.scale[index]
    x += z * model.weightsX[index]
    y += z * model.weightsY[index]
  })
  return { x, y }
}

// Averages the predictions for each target (about a second of frames per dot)
// before measuring the error, as eye-tracking validation usually does.
export function measureAccuracy(model, samples) {
  const byTarget = new Map()
  samples.forEach(sample => {
    const key = `${sample.x},${sample.y}`
    if (!byTarget.has(key)) byTarget.set(key, { target: { x: sample.x, y: sample.y }, estimates: [] })
    byTarget.get(key).estimates.push(predictGaze(model, sample.features))
  })
  const points = [...byTarget.values()].map(({ target, estimates }) => {
    const estimate = { x: estimates.reduce((sum, item) => sum + item.x, 0) / estimates.length, y: estimates.reduce((sum, item) => sum + item.y, 0) / estimates.length }
    return { target, estimate, errorPx: Math.hypot(estimate.x - target.x, estimate.y - target.y) }
  })
  const meanPx = points.reduce((sum, point) => sum + point.errorPx, 0) / Math.max(points.length, 1)
  return { points, meanPx, maxPx: Math.max(0, ...points.map(point => point.errorPx)), meanDegrees: meanPx * DEGREES_PER_CSS_PX }
}
