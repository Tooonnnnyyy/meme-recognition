import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalibrationSession, summarizeBaseline } from '../src/calibration.js'

const sample = (overrides = {}) => ({ mouthOpen: 0.1, blinkLeft: 0.05, blinkRight: 0.05, tongue: 0, roll: 0.02, blendshapes: { jawOpen: 0.1 }, ...overrides })

test('baseline uses the median, so a blink during calibration does not count', () => {
  const samples = [sample(), sample(), sample({ blinkLeft: 0.95, blinkRight: 0.95 }), sample(), sample({ blinkLeft: 0.07 })]
  const baseline = summarizeBaseline(samples)
  assert.equal(baseline.blinkLeft, 0.05)
  assert.equal(baseline.blinkRight, 0.05)
  assert.equal(baseline.blendshapes.jawOpen, 0.1)
  assert.equal(baseline.samples, 5)
})

test('calibration session reports progress, then a baseline', () => {
  const session = createCalibrationSession({ durationMs: 1000, minSamples: 3 })
  assert.deepEqual(session.add(sample(), 0), { progress: 0 })
  assert.equal(session.add(sample(), 500).progress, 0.5)
  session.add(sample(), 750)
  const done = session.add(sample({ mouthOpen: 0.2 }), 1000)
  assert.equal(done.progress, 1)
  assert.equal(done.baseline.mouthOpen, 0.1)
})

test('calibration fails clearly when no face was seen', () => {
  const session = createCalibrationSession({ durationMs: 1000, minSamples: 3 })
  session.add(null, 0)
  session.add(sample(), 500)
  const done = session.add(null, 1000)
  assert.equal(done.baseline, undefined)
  assert.match(done.error, /No steady face/)
})
