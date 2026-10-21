import assert from 'node:assert/strict'
import test from 'node:test'
import { createFrameSmoother, createOneEuroFilter } from '../src/smoothing.js'

const FPS = 30
const standardDeviation = values => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}
// Deterministic jitter so the test never flakes.
const jitter = index => (((index * 7919) % 101) / 100 - 0.5) * 0.008

test('one euro filter removes most jitter from a still landmark', () => {
  const filter = createOneEuroFilter({ minCutoff: 1.2, beta: 8 })
  const raw = Array.from({ length: 90 }, (_, index) => 0.5 + jitter(index))
  const smoothed = raw.map((value, index) => filter(value, index / FPS))
  assert.ok(standardDeviation(smoothed.slice(15)) < standardDeviation(raw.slice(15)) * 0.6)
})

test('one euro filter follows a fast jump within ~150 ms', () => {
  const filter = createOneEuroFilter({ minCutoff: 1.2, beta: 8 })
  for (let index = 0; index < 30; index += 1) filter(0.3, index / FPS)
  let value = 0
  for (let index = 30; index < 35; index += 1) value = filter(0.6, index / FPS)
  assert.ok(value > 0.57, `reached ${value.toFixed(3)} after 5 frames`)
})

test('one euro filter ignores repeated timestamps', () => {
  const filter = createOneEuroFilter()
  filter(1, 0)
  assert.equal(filter(5, 0), 1)
})

test('frame smoother keeps result shapes and resets a hand that leaves the frame', () => {
  const smooth = createFrameSmoother()
  const hand = x => ({ landmarks: [[{ x, y: 0.5, z: 0 }]], handedness: [[{ categoryName: 'Left' }]], gestures: [[{ categoryName: 'Open_Palm', score: 0.9 }]] })
  const frame = (handResult, time) => smooth({ hand: handResult, face: { faceLandmarks: [], faceBlendshapes: [] }, pose: { landmarks: [] } }, time)

  frame(hand(0.2), 0)
  const moved = frame(hand(0.21), 33)
  assert.equal(moved.hand.gestures[0][0].categoryName, 'Open_Palm')
  assert.ok(moved.hand.landmarks[0][0].x > 0.2 && moved.hand.landmarks[0][0].x <= 0.21)

  frame({ landmarks: [], handedness: [], gestures: [] }, 66)
  const returned = frame(hand(0.8), 99)
  assert.equal(returned.hand.landmarks[0][0].x, 0.8)
})

test('frame smoother smooths blendshape scores by name', () => {
  const smooth = createFrameSmoother()
  const face = score => ({ faceLandmarks: [], faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score }] }] })
  smooth({ face: face(0.1) }, 0)
  const next = smooth({ face: face(0.12) }, 33).face.faceBlendshapes[0].categories[0]
  assert.equal(next.categoryName, 'jawOpen')
  assert.ok(next.score > 0.1 && next.score < 0.12)
})
