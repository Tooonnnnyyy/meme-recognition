import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyVision, createVisionGate } from '../src/vision-rules.js'

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
