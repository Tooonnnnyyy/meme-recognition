import assert from 'node:assert/strict'
import test from 'node:test'
import { describeSignal, detectSignals, findCandidates, sessionFixations } from '../src/research/signals.js'

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

test('a response to the next click does not answer an earlier dead click', () => {
  const submit = { selector: 'button#submit-return', label: 'Submit return', interactive: true }
  const radio = { selector: 'label', label: 'Store credit', interactive: true }
  const session = base({ events: [
    { type: 'click', t: 5000, taskId: 'T1', x: 10, y: 10, target: submit },
    { type: 'click', t: 5400, taskId: 'T1', x: 10, y: 10, target: submit },
    { type: 'click', t: 7000, taskId: 'T1', x: 10, y: 80, target: radio },
    { type: 'change', t: 7010, taskId: 'T1' },
  ] })
  const dead = detectSignals(session).filter(signal => signal.kind === 'dead-click')
  assert.deepEqual(dead.map(signal => [signal.detail.label, signal.count]), [['Submit return', 2]])
})

test('pressing the same element again leaves its response window open', () => {
  const details = { selector: 'a.button.secondary', label: 'View details', interactive: true }
  const session = base({ events: [
    { type: 'click', t: 451, taskId: 'T1', x: 300, y: 10, target: details },
    { type: 'focus', t: 451, taskId: 'T1', selector: 'a.button.secondary' },
    { type: 'click', t: 575, taskId: 'T1', x: 300, y: 10, target: details },
    { type: 'navigate', t: 612, taskId: 'T1', page: 'order-48213' },
  ] })
  assert.ok(!kinds(detectSignals(session)).includes('dead-click'))
})

test('a response in the press\'s own millisecond counts if it was recorded after the press', () => {
  const details = { selector: 'a.button.secondary', label: 'View details', interactive: true }
  const press = { type: 'click', t: 41104, taskId: 'T1', x: 10, y: 10, target: button }
  const change = { type: 'mutation', t: 41104, taskId: 'T1' }
  const rest = [{ type: 'focus', t: 41104, taskId: 'T1', selector: 'button.track' }, { type: 'click', t: 42000, taskId: 'T1', x: 300, y: 10, target: details }, { type: 'navigate', t: 42100, taskId: 'T1', page: 'order' }]
  assert.ok(!kinds(detectSignals(base({ events: [press, change, ...rest] }))).includes('dead-click'))
  const dead = detectSignals(base({ events: [change, press, ...rest] })).filter(signal => signal.kind === 'dead-click')
  assert.deepEqual(dead.map(signal => signal.detail.label), ['Track package'])
})

test('clicks between tasks are not judged, and a click with no target does not break detection', () => {
  const tasks = [{ id: 'T1', start: 0, end: 5000, outcome: 'success' }]
  const between = [0, 200, 400, 600].map(t => ({ type: 'click', t: 6000 + t, taskId: null, x: 10, y: 10, target: button }))
  assert.deepEqual(kinds(detectSignals(base({ tasks, events: between }))), [])
  const bare = detectSignals(base({ tasks, events: [{ type: 'click', t: 1000, taskId: 'T1', x: 1, y: 1 }] }))
  assert.deepEqual(bare.map(describeSignal), ['No response to a click'])
})

test('a dead click is still judged when the next click ends the task', () => {
  // The recorder gives text that is not a control no label, only its area.
  const title = { selector: 'b', label: '', interactive: false, aoi: 'order-list' }
  const details = { selector: 'a.button.secondary', label: 'View details', interactive: true }
  const session = base({ tasks: [{ id: 'T1', start: 0, end: 6600, outcome: 'success' }], events: [
    { type: 'click', t: 5000, taskId: 'T1', x: 10, y: 10, target: title },
    { type: 'click', t: 6500, taskId: 'T1', x: 300, y: 10, target: details },
    { type: 'navigate', t: 6600, taskId: 'T1', page: 'order' },
  ] })
  const dead = detectSignals(session).filter(signal => signal.kind === 'dead-click')
  assert.deepEqual(dead.map(describeSignal), ['No response to a click in the order-list area'])
})

test('a click on another element with the same selector still closes the window', () => {
  // The demo has three 'Track package' buttons sharing one selector.
  const track = { selector: 'button', label: 'Track package', interactive: true }
  const other = { selector: 'button', label: 'Start return', interactive: true }
  const dead = position => detectSignals(base({ events: [
    { type: 'click', t: 5000, taskId: 'T1', x: 100, y: 100, target: track },
    { type: 'click', t: 6000, taskId: 'T1', ...position },
    { type: 'mutation', t: 6010, taskId: 'T1' },
  ] })).filter(signal => signal.kind === 'dead-click')
  assert.equal(dead({ x: 100, y: 400, target: track }).length, 1, 'same selector and label, far away')
  assert.equal(dead({ x: 110, y: 100, target: other }).length, 1, 'same selector, other label')
  assert.equal(dead({ x: 110, y: 100, target: track }).length, 0, 'a second press on the same button')
})

test('the change of a field left by the press does not answer it; a label\'s own field does', () => {
  const submit = { selector: 'button#submit-return', label: 'Submit return', interactive: true }
  const policy = { selector: 'label.policy', label: 'I accept the returns policy', interactive: true, controls: 'input#policy' }
  const session = base({ events: [
    // Typing in a field, then pressing a disabled button: the field's change
    // fires on the press, as the field loses focus.
    { type: 'click', t: 5000, taskId: 'T1', x: 100, y: 100, target: submit },
    { type: 'change', t: 5000, taskId: 'T1', selector: 'textarea#details' },
    { type: 'click', t: 12000, taskId: 'T1', x: 100, y: 300, target: policy },
    { type: 'change', t: 12001, taskId: 'T1', selector: 'input#policy' },
  ] })
  const dead = detectSignals(session).filter(signal => signal.kind === 'dead-click')
  assert.deepEqual(dead.map(signal => signal.detail.label), ['Submit return'])
})

test('a button taking focus on its own press is not a response; focus elsewhere is', () => {
  const own = base({ events: [
    { type: 'click', t: 5000, taskId: 'T1', x: 10, y: 10, target: button },
    { type: 'focus', t: 5001, taskId: 'T1', selector: 'button.track' },
  ] })
  assert.ok(kinds(detectSignals(own)).includes('dead-click'))
  const elsewhere = base({ events: [
    { type: 'click', t: 5000, taskId: 'T1', x: 10, y: 10, target: button },
    { type: 'focus', t: 5001, taskId: 'T1', selector: 'input#coupon' },
  ] })
  assert.ok(!kinds(detectSignals(elsewhere)).includes('dead-click'))
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

test('idle time starts at the last input of a throttled burst', () => {
  const events = [{ type: 'activity', t: 100, last: 2090, taskId: 'T1' }, { type: 'click', t: 9900, taskId: 'T1', x: 0, y: 0, target: { selector: 'body' } }]
  assert.deepEqual(kinds(detectSignals(base({ tasks: [{ id: 'T1', start: 0, end: 12000, outcome: 'success' }], events }))), [])
  events[1].t = 11000
  const idle = detectSignals(base({ tasks: [{ id: 'T1', start: 0, end: 12000, outcome: 'success' }], events }))
  assert.deepEqual(kinds(idle), ['idle'])
  assert.equal(idle[0].start, 2090)
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

test('gaze flickering between two areas closer than the gaze error is not visual search', () => {
  // A button 15 px under a radio group: staring at it, noise flips the label.
  const aois = { returns: [{ id: 'refund-method', rect: { x: 0, y: 0, width: 300, height: 100 } }, { id: 'submit-return', rect: { x: 0, y: 115, width: 160, height: 40 } }] }
  const gaze = []
  for (let hop = 0; hop < 12; hop += 1) for (let frame = 0; frame < 6; frame += 1) gaze.push({ t: 1000 + hop * 400 + frame * 40, page: 'returns', x: hop % 2 ? 140 : 20, y: hop % 2 ? 135 : 40 })
  const session = base({ gaze, aois, quality: { gazeEnabled: true, accuracy: { meanPx: 60 } }, events: [{ type: 'activity', t: 1000, taskId: 'T1' }, { type: 'activity', t: 6000, taskId: 'T1' }] })
  assert.ok(sessionFixations(session).length >= 10)
  assert.deepEqual(kinds(detectSignals(session)).filter(kind => kind === 'visual-search'), [])
})

test('fixations come out in time order across pages, so visual search never ends before it starts', () => {
  const aois = {
    orders: [{ id: 'list', rect: { x: 0, y: 0, width: 300, height: 300 } }],
    help: ['a', 'b', 'c', 'd'].map((id, index) => ({ id, rect: { x: index * 400, y: 0, width: 300, height: 300 } })),
  }
  const gaze = []
  const look = (from, to, page, x) => { for (let t = from; t < to; t += 40) gaze.push({ t, page, x, y: 150 }) }
  look(0, 1200, 'orders', 150)
  for (let hop = 0; hop < 17; hop += 1) look(1600 + hop * 400, 1960 + hop * 400, 'help', (hop % 4) * 400 + 150)
  look(9600, 11000, 'orders', 150)
  const click = t => ({ type: 'click', t, taskId: 'T1', x: 0, y: 0, target: { selector: 'body' } })
  const session = base({ gaze, aois, quality: { gazeEnabled: true, accuracy: { meanPx: 40 } }, events: [click(5000), click(7000), click(10000)] })
  const fixations = sessionFixations(session)
  assert.ok(fixations.every((fixation, index) => index === 0 || fixation.start >= fixations[index - 1].start))
  assert.deepEqual(kinds(detectSignals(session)).filter(kind => kind === 'visual-search'), [])
})

test('areas on fixed elements are matched in the viewport, so scrolling does not move them', () => {
  const aois = { returns: [
    { id: 'return-form', rect: { x: 300, y: 100, width: 800, height: 700 } },
    { id: 'footer', rect: { x: 0, y: 606, width: 1440, height: 120 }, fixed: true },
  ] }
  const gaze = []
  // Scrolled 300 px: first on the footer (viewport y 660), then on the form (viewport y 350).
  for (let t = 1000; t < 1400; t += 40) gaze.push({ t, page: 'returns', x: 600, y: 960, sx: 0, sy: 300 })
  for (let t = 2000; t < 2400; t += 40) gaze.push({ t, page: 'returns', x: 600, y: 650, sx: 0, sy: 300 })
  const fixations = sessionFixations(base({ gaze, aois, quality: { gazeEnabled: true, accuracy: { meanPx: 40 } } }))
  assert.deepEqual(fixations.map(fixation => fixation.aoi), ['footer', 'return-form'])
  // Older files have no flag or scroll offsets and keep document coordinates.
  const old = sessionFixations(base({ gaze: gaze.map(({ sx, sy, ...point }) => point), aois: { returns: aois.returns.map(({ fixed, ...aoi }) => aoi) }, quality: { gazeEnabled: true, accuracy: { meanPx: 40 } } }))
  assert.deepEqual(old.map(fixation => fixation.aoi), [null, 'footer'])
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

test('candidate ids stay the same when re-scoring adds or removes other moments', () => {
  const dead = { kind: 'dead-click', strength: 'strong', taskId: 'T2', start: 28400, end: 30100, count: 2, detail: {} }
  const idle = { kind: 'idle', strength: 'medium', taskId: 'T2', start: 1000, end: 9000, count: 1, detail: { seconds: 8 } }
  const lean = { kind: 'lean-in', strength: 'weak', taskId: 'T2', start: 9500, end: 12000, count: 1, detail: { seconds: 2.5 } }
  const before = findCandidates([dead])
  const after = findCandidates([idle, lean, dead])
  assert.equal(after.length, 2)
  assert.equal(after[1].id, before[0].id)
  assert.equal(before[0].id, 'T2-dead-click-28400')
  assert.equal(after[0].id, 'T2-idle-1000')
  // A strong signal names a merged moment even when a medium one opened it first.
  const merged = findCandidates([{ ...idle, end: 26000 }, { ...lean, start: 25000, end: 27000 }, dead])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'T2-dead-click-28400')
})
