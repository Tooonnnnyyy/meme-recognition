import assert from 'node:assert/strict'
import test from 'node:test'
import { averageVectors, cosineSimilarity, createLeaderTracker, EXPRESSION_KEYS, expressionDelta, expressionVector, mirrorVector, rankMatches } from '../src/lookalike.js'
import { MEME_LIBRARY } from '../src/meme-library.js'

const vector = scores => expressionVector(scores)

test('expression vectors skip neutral and gaze scores', () => {
  assert.equal(EXPRESSION_KEYS.length, 43)
  assert.ok(!EXPRESSION_KEYS.includes('_neutral'))
  assert.ok(!EXPRESSION_KEYS.some(key => key.startsWith('eyeLook')))
  const fromCategories = vector([{ categoryName: 'jawOpen', score: 0.7 }, { categoryName: 'eyeLookUpLeft', score: 0.9 }])
  assert.equal(fromCategories[EXPRESSION_KEYS.indexOf('jawOpen')], 0.7)
  assert.equal(fromCategories.reduce((sum, value) => sum + value, 0), 0.7)
  assert.deepEqual(vector({ jawOpen: 0.7 }), fromCategories)
})

test('mirroring swaps left and right scores', () => {
  const wink = vector({ eyeBlinkLeft: 1, mouthLeft: 0.4 })
  const mirrored = mirrorVector(wink)
  assert.equal(mirrored[EXPRESSION_KEYS.indexOf('eyeBlinkRight')], 1)
  assert.equal(mirrored[EXPRESSION_KEYS.indexOf('mouthRight')], 0.4)
  assert.equal(mirrored[EXPRESSION_KEYS.indexOf('eyeBlinkLeft')], 0)
})

test('cosine similarity ignores intensity but not direction', () => {
  const smile = vector({ mouthSmileLeft: 0.4, mouthSmileRight: 0.4 })
  const bigSmile = vector({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 })
  const frown = vector({ mouthFrownLeft: 0.8, mouthFrownRight: 0.8 })
  assert.ok(Math.abs(cosineSimilarity(smile, bigSmile) - 1) < 1e-9)
  assert.equal(cosineSimilarity(smile, frown), 0)
  assert.equal(cosineSimilarity(smile, vector({})), 0)
})

test('ranks the closest meme first and matches a wink copied from a mirror', () => {
  const references = [
    { id: 'smile', vector: vector({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.5, cheekSquintRight: 0.5 }) },
    { id: 'wink', vector: vector({ eyeBlinkLeft: 0.95, mouthSmileLeft: 0.3 }) },
    { id: 'shock', vector: vector({ jawOpen: 0.9, eyeWideLeft: 0.7, eyeWideRight: 0.7 }) },
  ]
  assert.equal(rankMatches(vector({ jawOpen: 0.6, eyeWideLeft: 0.5, eyeWideRight: 0.4 }), references)[0].id, 'shock')
  const mirroredWink = rankMatches(vector({ eyeBlinkRight: 0.9, mouthSmileRight: 0.25 }), references)[0]
  assert.equal(mirroredWink.id, 'wink')
  assert.equal(mirroredWink.mirrored, true)
})

test('a calibrated resting face is removed before comparing', () => {
  const rest = vector({ eyeSquintLeft: 0.4, eyeSquintRight: 0.4 })
  assert.deepEqual(expressionDelta(vector({ eyeSquintLeft: 0.3, jawOpen: 0.5 }), rest), vector({ jawOpen: 0.5 }))
  assert.equal(expressionDelta(rest, null), rest)
})

test('leader tracker needs a clear margin before switching', () => {
  const leader = createLeaderTracker({ margin: 0.05 })
  assert.equal(leader([{ id: 'a', score: 0.8 }, { id: 'b', score: 0.7 }]), 'a')
  assert.equal(leader([{ id: 'b', score: 0.82 }, { id: 'a', score: 0.8 }]), 'a')
  assert.equal(leader([{ id: 'b', score: 0.9 }, { id: 'a', score: 0.8 }]), 'b')
  assert.equal(leader([]), null)
})

test('averages captured vectors element by element', () => {
  assert.deepEqual(averageVectors([[0, 1], [1, 0], [0.5, 0.5]]), [0.5, 0.5])
})

test('meme library entries are unique and point at local reaction images', () => {
  const ids = MEME_LIBRARY.map(meme => meme.id)
  assert.equal(new Set(ids).size, ids.length)
  MEME_LIBRARY.forEach(meme => assert.match(meme.image, /^reactions\/[\w-]+\.(jpe?g|png|webp)$/))
})
