import assert from 'node:assert/strict'
import test from 'node:test'
import { describeSignal, detectSignals, findCandidates } from '../src/research/signals.js'

const button = { selector: 'button.track', label: 'Track package', interactive: true }
const base = overrides => ({
  tasks: [{ id: 'T1', start: 0, end: 60000, outcome: 'success' }],
  events: [],
  gaze: [],
  face: [],
  quality: { gazeEnabled: false },
  ...overrides,
})
const kinds = signals => signals.map(signal => signal.kind)

test('a click with no page change within 3.5 s is a dead click; repeats on one target merge', () => {
  const session = base({ events: [
    { type: 'click', t: 1000, taskId: 'T1', x: 10, y: 10, target: button },
    { type: 'click', t: 5000, taskId: 'T1', x: 10, y: 10, target: button },
    { type: 'click', t: 20000, taskId: 'T1', x: 50, y: 50, target: { selector: 'a.returns', label: 'Returns' } },
    { type: 'navigate', t: 20400, taskId: 'T1', page: 'returns' },
  ] })
  const dead = detectSignals(session).filter(signal => signal.kind === 'dead-click')
  assert.equal(dead.length, 1)
  assert.equal(dead[0].count, 2)
  assert.equal(describeSignal(dead[0]), 'No response to a click ×2 on “Track package”')
})

test('form-field clicks and clicks answered by a value change are not dead clicks', () => {
  const session = base({ events: [
    { type: 'click', t: 1000, taskId: 'T1', x: 1, y: 1, target: { selector: 'select#reason', label: 'Reason', interactive: true, formField: true } },
    { type: 'click', t: 9000, taskId: 'T1', x: 5, y: 5, target: { selector: 'label', label: 'Store credit', interactive: true } },
    { type: 'change', t: 9050, taskId: 'T1' },
  ] })
  assert.ok(!kinds(detectSignals(session)).includes('dead-click'))
})

test('a click right before the task ends is not judged', () => {
  const session = base({ tasks: [{ id: 'T1', start: 0, end: 2000, outcome: 'done' }], events: [{ type: 'click', t: 1000, taskId: 'T1', x: 1, y: 1, target: button }] })
  assert.deepEqual(kinds(detectSignals(session)), [])
})

test('four clicks within 2 s and 60 px are rage clicks', () => {
  const events = [0, 300, 600, 900].map((t, index) => ({ type: 'click', t: 10000 + t, taskId: 'T1', x: 100 + index * 5, y: 100, target: button }))
  events.push({ type: 'mutation', t: 10100, taskId: 'T1' })
  const signals = detectSignals(base({ events }))
  const rage = signals.filter(signal => signal.kind === 'rage-click')
  assert.equal(rage.length, 1)
  assert.equal(rage[0].count, 4)
  // The unanswered clicks in the burst are also dead clicks: both are evidence of one moment.
  assert.ok(kinds(signals).includes('dead-click'))
  assert.equal(findCandidates(signals.filter(signal => signal.strength === 'strong'))[0].confidence, 'high')
})

test('a third visit to the same page in one task is a page loop', () => {
  const pages = ['orders', 'account', 'orders', 'account', 'orders']
  const events = pages.map((page, index) => ({ type: 'navigate', t: 1000 + index * 2000, taskId: 'T1', page }))
  const loops = detectSignals(base({ events })).filter(signal => signal.kind === 'page-loop')
  assert.equal(loops.length, 1)
  assert.equal(loops[0].detail.page, 'orders')
  assert.equal(describeSignal(loops[0]), 'Returned to orders 2 times')
})

test('8 s without input is an idle period', () => {
  const session = base({ tasks: [{ id: 'T1', start: 0, end: 12000, outcome: 'success' }], events: [{ type: 'activity', t: 1000, taskId: 'T1' }, { type: 'activity', t: 10000, taskId: 'T1' }] })
  const idle = detectSignals(session)
  assert.deepEqual(kinds(idle), ['idle'])
  assert.equal(idle[0].detail.seconds, 9)
})

test('brow lowering counts only when held 2 s above the calibrated baseline', () => {
  const face = []
  for (let t = 0; t <= 6000; t += 100) face.push({ t, brow: t >= 2000 && t <= 4600 ? 0.5 : 0.1, scale: 0.2 })
  const signals = detectSignals(base({ face, baseline: { brow: 0.1, scale: 0.2 } })).filter(signal => signal.strength === 'weak')
  assert.deepEqual(kinds(signals), ['brow-lowered'])
  assert.equal(signals[0].detail.seconds, 2.6)
})

test('jumping between many areas without clicking is visual search', () => {
  const aois = { orders: ['nav', 'list', 'footer', 'sidebar'].map((id, index) => ({ id, rect: { x: index * 400, y: 0, width: 300, height: 300 } })) }
  const gaze = []
  for (let hop = 0; hop < 9; hop += 1) for (let frame = 0; frame < 6; frame += 1) gaze.push({ t: 1000 + hop * 400 + frame * 40, page: 'orders', x: (hop % 4) * 400 + 150, y: 150 })
  const session = base({ gaze, aois, quality: { gazeEnabled: true, accuracy: { meanPx: 60 } }, events: [{ type: 'activity', t: 1000, taskId: 'T1' }, { type: 'activity', t: 6000, taskId: 'T1' }] })
  const search = detectSignals(session).filter(signal => signal.kind === 'visual-search')
  assert.equal(search.length, 1)
  assert.equal(search[0].detail.areas, 4)
})

test('candidates: strong signals stand alone, medium needs a weak partner, overlaps merge', () => {
  const signals = [
    { kind: 'dead-click', strength: 'strong', taskId: 'T1', start: 10000, end: 12000, count: 2, detail: {} },
    { kind: 'visual-search', strength: 'medium', taskId: 'T1', start: 11000, end: 15000, count: 7, detail: { areas: 4 } },
    { kind: 'brow-lowered', strength: 'weak', taskId: 'T1', start: 13000, end: 15500, count: 1, detail: { seconds: 2.5 } },
    { kind: 'idle', strength: 'medium', taskId: 'T1', start: 40000, end: 49000, count: 1, detail: { seconds: 9 } },
    { kind: 'lean-in', strength: 'weak', taskId: 'T2', start: 70000, end: 72500, count: 1, detail: { seconds: 2.5 } },
  ]
  const candidates = findCandidates(signals)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].confidence, 'high')
  assert.equal(candidates[0].start, 8000)
  assert.equal(candidates[0].end, 17500)
  assert.deepEqual(kinds(candidates[0].signals), ['dead-click', 'visual-search', 'brow-lowered'])
})

test('candidate confidence reflects the evidence', () => {
  const strong = { kind: 'timeout', strength: 'strong', taskId: 'T1', start: 1000, end: 2000, count: 1, detail: {} }
  assert.equal(findCandidates([strong])[0].confidence, 'medium')
  const pair = [
    { kind: 'idle', strength: 'medium', taskId: 'T1', start: 1000, end: 9000, count: 1, detail: { seconds: 8 } },
    { kind: 'lean-in', strength: 'weak', taskId: 'T1', start: 9500, end: 12000, count: 1, detail: { seconds: 2.5 } },
  ]
  assert.equal(findCandidates(pair)[0].confidence, 'low')
})
