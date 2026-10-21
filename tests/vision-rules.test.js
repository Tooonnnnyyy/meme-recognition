import assert from 'node:assert/strict'
import test from 'node:test'
import { calibrationSignals, classifyVision, createVisionGate } from '../src/vision-rules.js'

test('fires a stable gesture once and requires release before it can fire again', () => {
  const gate = createVisionGate({ stableFrames: 3, cooldownMs: 1200 })
  assert.equal(gate('thumbs_up', 0), null)
  assert.equal(gate('thumbs_up', 80), null)
  assert.equal(gate('thumbs_up', 160), 'thumbs_up')
  assert.equal(gate('thumbs_up', 1400), null)
  assert.equal(gate(null, 1450), null)
  assert.equal(gate('thumbs_up', 1600), null)
  assert.equal(gate('thumbs_up', 1680), null)
  assert.equal(gate('thumbs_up', 1760), 'thumbs_up')
})

test('maps MediaPipe canned thumbs up to the reaction action', () => {
  const candidate = classifyVision({
    handResult: {
      landmarks: [[{ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.45, y: 0.45 }]],
      gestures: [[{ categoryName: 'Thumb_Up', score: 0.94 }]],
    },
    faceResult: { faceLandmarks: [], faceBlendshapes: [] },
    poseResult: { landmarks: [] },
  })
  assert.equal(candidate.id, 'thumbs_up')
  assert.ok(candidate.score > 0.9)
})

test('uses face blendshapes to identify an open mouth', () => {
  const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  face[10] = { x: 0.5, y: 0.2, z: 0 }
  face[152] = { x: 0.5, y: 0.8, z: 0 }
  face[13] = { x: 0.5, y: 0.55, z: 0 }
  face[14] = { x: 0.5, y: 0.57, z: 0 }
  face[33] = { x: 0.4, y: 0.4, z: 0 }; face[133] = { x: 0.47, y: 0.4, z: 0 }
  face[159] = { x: 0.43, y: 0.4, z: 0 }; face[145] = { x: 0.43, y: 0.42, z: 0 }
  face[362] = { x: 0.53, y: 0.4, z: 0 }; face[263] = { x: 0.6, y: 0.4, z: 0 }
  face[386] = { x: 0.57, y: 0.4, z: 0 }; face[374] = { x: 0.57, y: 0.42, z: 0 }
  const candidate = classifyVision({
    handResult: { landmarks: [], gestures: [] },
    faceResult: {
      faceLandmarks: [face],
      faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.9 }] }],
    },
    poseResult: { landmarks: [] },
  })
  assert.equal(candidate.id, 'open_mouth')
})

function faceFrame({ jawOpen = 0, blinks = 0 } = {}) {
  const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  face[10] = { x: 0.5, y: 0.2, z: 0 }
  face[152] = { x: 0.5, y: 0.8, z: 0 }
  face[13] = { x: 0.5, y: 0.55, z: 0 }
  face[14] = { x: 0.5, y: 0.555, z: 0 }
  face[33] = { x: 0.4, y: 0.4, z: 0 }; face[133] = { x: 0.47, y: 0.4, z: 0 }
  face[159] = { x: 0.43, y: 0.39, z: 0 }; face[145] = { x: 0.43, y: 0.42, z: 0 }
  face[362] = { x: 0.53, y: 0.4, z: 0 }; face[263] = { x: 0.6, y: 0.4, z: 0 }
  face[386] = { x: 0.57, y: 0.39, z: 0 }; face[374] = { x: 0.57, y: 0.42, z: 0 }
  return {
    handResult: { landmarks: [], gestures: [] },
    faceResult: {
      faceLandmarks: [face],
      faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: jawOpen }, { categoryName: 'eyeBlinkLeft', score: blinks }, { categoryName: 'eyeBlinkRight', score: blinks }] }],
    },
    poseResult: { landmarks: [] },
  }
}

test('a calibrated resting mouth no longer reads as an open mouth', () => {
  const frame = faceFrame({ jawOpen: 0.6 })
  assert.equal(classifyVision(frame).id, 'open_mouth')
  const resting = calibrationSignals(faceFrame({ jawOpen: 0.55 }))
  assert.equal(classifyVision(frame, { baseline: resting }).id, null)
  assert.equal(classifyVision(faceFrame({ jawOpen: 0.95 }), { baseline: resting }).id, 'open_mouth')
})

test('calibration signals include the raw blendshape scores by name', () => {
  const signals = calibrationSignals(faceFrame({ jawOpen: 0.3, blinks: 0.1 }))
  assert.equal(signals.blendshapes.jawOpen, 0.3)
  assert.equal(signals.blinkLeft, 0.1)
  assert.equal(calibrationSignals({ faceResult: { faceLandmarks: [] } }), null)
})

test('ignores pose wrists the model only guessed (low visibility)', () => {
  const pose = visibility => {
    const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }))
    points[0] = { x: 0.5, y: 0.3, z: 0, visibility: 0.99 }
    points[11] = { x: 0.65, y: 0.6, z: 0, visibility: 0.99 }
    points[12] = { x: 0.35, y: 0.6, z: 0, visibility: 0.99 }
    points[15] = { x: 0.6, y: 0.25, z: 0, visibility }
    points[16] = { x: 0.4, y: 0.25, z: 0, visibility }
    return { handResult: { landmarks: [], gestures: [] }, faceResult: { faceLandmarks: [] }, poseResult: { landmarks: [points] } }
  }
  assert.equal(classifyVision(pose(0.95)).id, 'hands_head')
  assert.equal(classifyVision(pose(0.45)).id, null)
})

test('stableMs keeps the hold time constant at higher frame rates', () => {
  const gate = createVisionGate({ stableFrames: 3, stableMs: 200, cooldownMs: 1200 })
  assert.equal(gate('thumbs_up', 0), null)
  assert.equal(gate('thumbs_up', 33), null)
  assert.equal(gate('thumbs_up', 66), null)
  assert.equal(gate('thumbs_up', 166), null)
  assert.equal(gate('thumbs_up', 200), 'thumbs_up')
})
