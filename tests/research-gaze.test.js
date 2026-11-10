import assert from 'node:assert/strict'
import test from 'node:test'
import { DEGREES_PER_CSS_PX, fitGazeModel, gazeFeatures, measureAccuracy, predictGaze } from '../src/research/gaze.js'
import { aoiAt, detectFixations } from '../src/research/fixations.js'

// Deterministic pseudo-noise so tests never flake.
const noise = index => (((index * 7919) % 97) / 97 - 0.5)

test('ridge regression recovers a linear eye-to-screen mapping', () => {
  const samples = []
  for (let index = 0; index < 90; index += 1) {
    const a = noise(index), b = noise(index + 31), c = noise(index + 57)
    samples.push({ features: [a, b, c], x: 700 + 900 * a + 40 * c, y: 450 + 600 * b })
  }
  const model = fitGazeModel(samples, { lambda: 0.01 })
  const estimate = predictGaze(model, [0.2, -0.1, 0])
  assert.ok(Math.abs(estimate.x - 880) < 5, `x ${estimate.x}`)
  assert.ok(Math.abs(estimate.y - 390) < 5, `y ${estimate.y}`)
})

test('features that never change fall back to the average point instead of failing', () => {
  const samples = [100, 700, 1300].map(x => ({ features: [0.5, 0.5], x, y: 400 }))
  const model = fitGazeModel(samples)
  assert.deepEqual(predictGaze(model, [0.5, 0.5]), { x: 700, y: 400 })
  const accuracy = measureAccuracy(model, samples)
  assert.equal(Math.round(accuracy.meanPx), 400)
  assert.ok(Math.abs(accuracy.meanDegrees - 400 * DEGREES_PER_CSS_PX) < 1e-9)
})

test('accuracy averages the frames recorded for each target before measuring error', () => {
  const model = { mean: [0], scale: [1], meanX: 0, meanY: 0, weightsX: [1], weightsY: [0] }
  const samples = [{ features: [90], x: 100, y: 0 }, { features: [110], x: 100, y: 0 }]
  const accuracy = measureAccuracy(model, samples)
  assert.equal(accuracy.points.length, 1)
  assert.equal(accuracy.meanPx, 0)
})

test('gaze features need the 478 refined face landmarks', () => {
  assert.equal(gazeFeatures({ faceLandmarks: [Array(468).fill({ x: 0.5, y: 0.5 })] }), null)
  const face = Array.from({ length: 478 }, (_, index) => ({ x: 0.3 + (index % 10) / 50, y: 0.3 + (index % 7) / 40 }))
  const features = gazeFeatures({ faceLandmarks: [face], faceBlendshapes: [{ categories: [{ categoryName: 'eyeLookUpLeft', score: 0.4 }] }] })
  assert.equal(features.length, 18)
  assert.ok(features.every(Number.isFinite))
  assert.equal(features[10], 0.4)
})

test('I-DT finds fixations and skips saccades and data gaps', () => {
  const points = []
  for (let t = 0; t <= 300; t += 33) points.push({ t, x: 200 + noise(t) * 20, y: 300 + noise(t + 5) * 20 })
  points.push({ t: 340, x: 600, y: 320 })
  for (let t = 380; t <= 700; t += 33) points.push({ t, x: 900 + noise(t) * 20, y: 310 })
  for (let t = 1200; t <= 1260; t += 33) points.push({ t, x: 900, y: 310 })
  const fixations = detectFixations(points, { dispersionPx: 60, minDurationMs: 120, maxGapMs: 250 })
  assert.equal(fixations.length, 2)
  assert.ok(Math.abs(fixations[0].x - 200) < 15)
  assert.ok(Math.abs(fixations[1].x - 900) < 15)
})

test('areas of interest: a point inside areas goes to the smallest; the margin only applies outside all of them', () => {
  const aois = [{ id: 'page', rect: { x: 0, y: 0, width: 1000, height: 800 } }, { id: 'button', rect: { x: 100, y: 100, width: 80, height: 30 } }]
  assert.equal(aoiAt({ x: 120, y: 110 }, aois), 'button')
  assert.equal(aoiAt({ x: 220, y: 110 }, aois), 'page')
  assert.equal(aoiAt({ x: 220, y: 110 }, aois, 50), 'page')
  assert.equal(aoiAt({ x: 2000, y: 110 }, aois), null)
  assert.equal(aoiAt({ x: 1040, y: 110 }, aois, 50), 'page')
})

test('a point inside one area is not taken by a smaller neighbour grown by the margin', () => {
  const aois = [{ id: 'refund-method', rect: { x: 40, y: 300, width: 400, height: 60 } }, { id: 'submit-return', rect: { x: 40, y: 380, width: 120, height: 36 } }]
  assert.equal(aoiAt({ x: 100, y: 330 }, aois, 141), 'refund-method')
  // Outside both: the nearer grown area wins, then the smaller.
  assert.equal(aoiAt({ x: 100, y: 371 }, aois, 40), 'submit-return')
  assert.equal(aoiAt({ x: 100, y: 365 }, aois, 40), 'refund-method')
})

test('fixed areas are in viewport coordinates and use the point\'s scroll offset', () => {
  const aois = [{ id: 'footer', rect: { x: 0, y: 600, width: 1000, height: 120 }, fixed: true }, { id: 'form', rect: { x: 0, y: 100, width: 1000, height: 800 } }]
  assert.equal(aoiAt({ x: 500, y: 950, sx: 0, sy: 300 }, aois), 'footer')
  assert.equal(aoiAt({ x: 500, y: 650, sx: 0, sy: 300 }, aois), 'form')
  assert.equal(aoiAt({ x: 500, y: 650 }, aois), 'footer')
})

test('fixations carry the mean scroll offset of their samples', () => {
  const points = [0, 40, 80, 120, 160].map((t, index) => ({ t, x: 500, y: 900 + index, sx: 0, sy: index < 3 ? 300 : 310 }))
  const [fixation] = detectFixations(points)
  assert.equal(fixation.sy, 304)
  assert.equal(detectFixations(points.map(({ sx, sy, ...point }) => point))[0].sy, 0)
})
