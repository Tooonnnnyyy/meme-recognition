import assert from 'node:assert/strict'
import test from 'node:test'
import { createRecorder, describeTarget, pageId } from '../src/research/recorder.js'
import { detectSignals } from '../src/research/signals.js'

// A few DOM stand-ins, enough for the recorder: no browser needed.
const matches = (node, selector) => selector.split(',').map(part => part.trim()).some(part => {
  const attr = part.match(/^\[([\w-]+)(?:="(.*)")?\]$/)
  if (!attr) return node.tagName.toLowerCase() === part
  const value = attr[1] === 'data-aoi' ? node.dataset.aoi : node.getAttribute(attr[1])
  return value != null && (attr[2] === undefined || value === attr[2])
})
const textNode = text => ({ nodeType: 3, textContent: text })
const element = (tag, { id = '', classes = [], attrs = {}, text = '', children = [], parent = null, aoi, position = 'static', rect, ...rest } = {}) => {
  const node = {
    nodeType: 1, tagName: tag.toUpperCase(), id, classList: classes, dataset: aoi ? { aoi } : {}, childNodes: [...(text ? [textNode(text)] : []), ...children], parentElement: parent, position,
    getAttribute: name => attrs[name] ?? null,
    getBoundingClientRect: () => rect,
    ...rest,
  }
  node.closest = selector => { for (let item = node; item; item = item.parentElement) if (matches(item, selector)) return item; return null }
  children.forEach(child => { child.parentElement = node })
  parent?.childNodes.push(node)
  return node
}
const doc = { body: element('body'), documentElement: element('html') }

test('page ids keep sub-folders under the site root and drop .html', () => {
  const root = '/meme-recognition/research-site/'
  assert.equal(pageId('http://x/meme-recognition/research-site/orders.html?a=1#top', root), 'orders')
  assert.equal(pageId('http://x/meme-recognition/research-site/cart/index.html', root), 'cart/index')
  assert.equal(pageId('http://x/meme-recognition/research-site/checkout/', root), 'checkout/index')
  assert.equal(pageId('http://x/meme-recognition/research-site/', root), 'index')
  assert.equal(pageId('http://x/elsewhere/page.html', root), 'page')
})

test('click labels name a field but never hold what was typed into it', () => {
  const email = element('input', { id: 'email', attrs: { type: 'email', name: 'email' }, value: 'jane.doe@example.com' })
  email.labels = [{ childNodes: [textNode('Email address')] }]
  assert.equal(describeTarget(email, doc).label, 'Email address')
  const notes = element('textarea', { attrs: { placeholder: 'Tell us more' }, text: 'my secret', value: 'my secret' })
  assert.equal(describeTarget(notes, doc).label, 'Tell us more')
  assert.equal(describeTarget(element('input', { attrs: { name: 'coupon' }, value: 'SAVE10' }), doc).label, 'coupon')
  assert.equal(describeTarget(element('input', { attrs: { type: 'password' }, value: 'hunter2' }), doc).label, 'password')
  const radio = element('input', { attrs: { type: 'radio', name: 'refund' } })
  radio.labels = [{ childNodes: [radio, textNode(' Store credit')] }]
  assert.equal(describeTarget(radio, doc).label, 'Store credit')
  const editor = element('div', { text: 'typed into an editor', isContentEditable: true })
  assert.deepEqual([describeTarget(editor, doc).label, describeTarget(editor, doc).formField], ['div', true])
  const track = element('button', { classes: ['track'], children: [element('span', { text: 'Track' }), textNode(' package')] })
  assert.deepEqual([describeTarget(track.childNodes[0], doc).label, describeTarget(track, doc).formField], ['Track package', false])
})

test('click labels never hold text the participant typed, even outside a field', () => {
  // A list item the page made from typed text, and the padding round an editor.
  assert.equal(describeTarget(element('li', { text: 'buy insulin for mum' }), doc).label, '')
  assert.equal(describeTarget(element('li', { text: 'buy insulin for mum', attrs: { 'aria-label': 'Shopping item' } }), doc).label, 'Shopping item')
  const draft = () => element('div', { text: 'my private draft', isContentEditable: true })
  assert.equal(describeTarget(element('div', { classes: ['editor-wrap'], children: [draft()] }), doc).label, '')
  // Controls are named by their text, without the fields and editors inside them.
  assert.equal(describeTarget(element('div', { attrs: { 'data-track': 'notes' }, children: [textNode('Notes'), draft()] }), doc).label, 'Notes')
  const reason = element('label', { children: [textNode('Reason'), element('select', { children: [element('option', { text: 'Too small' })] })] })
  assert.equal(describeTarget(reason, doc).label, 'Reason')
  const topic = element('summary', { children: [element('b', { text: 'Refunds' }), element('br'), element('span', { text: '5–7 business days' })] })
  assert.equal(describeTarget(topic.childNodes[2], doc).label, 'Refunds 5–7 business days')
  // Hidden parts of a control, such as a closed suggestion list, are skipped.
  const search = element('button', { children: [textNode('Search'), element('span', { text: 'my typed query', hidden: true }), element('span', { text: 'my typed query', attrs: { 'aria-hidden': 'true' } })] })
  assert.equal(describeTarget(search, doc).label, 'Search')
})

test('a label names the field it controls, so the field\'s change answers its press', () => {
  const policy = element('input', { id: 'policy', attrs: { type: 'checkbox' } })
  const label = element('label', { text: 'I accept the returns policy', control: policy })
  assert.equal(describeTarget(label, doc).controls, 'input#policy')
  assert.equal(describeTarget(element('button', { text: 'Go' }), doc).controls, undefined)
})

test('input buttons are named by their caption and judged like buttons', () => {
  const place = element('input', { id: 'place', attrs: { type: 'submit' }, value: 'Place order' })
  assert.deepEqual([describeTarget(place, doc).label, describeTarget(place, doc).formField], ['Place order', false])
  assert.equal(describeTarget(element('input', { attrs: { type: 'image', alt: 'Search' } }), doc).label, 'Search')
  const run = harness()
  run.press(5000, place)
  run.end(60000)
  assert.deepEqual(detectSignals(run.recorder.session).filter(signal => signal.kind === 'dead-click').map(signal => signal.detail.label), ['Place order'])
})

// A recorder watching a fake same-origin frame, with a clock the test moves.
function harness({ href = 'http://x/meme-recognition/research-site/returns.html', scrollY = 0, aois = [] } = {}) {
  let clock = 0
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true })
  globalThis.document = { baseURI: 'http://x/meme-recognition/research.html' }
  let observer = null
  globalThis.MutationObserver = class { constructor(callback) { observer = callback } observe() {} disconnect() {} }
  const handlers = {}
  const win = { scrollX: 0, scrollY, location: { href }, addEventListener: (type, fn) => { handlers[type] = fn }, removeEventListener() {}, getComputedStyle: node => ({ position: node.position }) }
  const frameDoc = { ...doc, querySelectorAll: () => aois, addEventListener: (type, fn) => { handlers[type] = fn }, removeEventListener() {} }
  const frame = { contentWindow: win, contentDocument: frameDoc, clientWidth: 1440, clientHeight: 726, getBoundingClientRect: () => ({ left: 0, top: 75, right: 1440, bottom: 801 }) }
  const recorder = createRecorder({ study: { id: 's', title: 'Study', siteBase: 'research-site/' }, participant: 'P-TEST' })
  recorder.startTask({ id: 'T1', prompt: 'Do it' })
  const page = recorder.attachFrame(frame)
  const at = (t, action) => { clock = t; action() }
  return {
    recorder, page, win, at,
    mutate: t => at(t, () => observer([])),
    press: (t, target) => at(t, () => handlers.pointerdown({ button: 0, pageX: 10, pageY: 10, target })),
    focus: (t, target) => at(t, () => handlers.focusin({ target })),
    change: (t, target) => at(t, () => handlers.change({ target })),
    move: t => at(t, () => handlers.mousemove({})),
    end: t => at(t, () => recorder.endTask('done')),
  }
}
const of = (session, type) => session.events.filter(event => event.type === type)

test('the first DOM change after a click is kept even inside the mutation throttle', () => {
  const run = harness()
  const button = element('button', { id: 'menu', text: 'Open menu' })
  run.mutate(5000)
  run.press(5020, button)
  run.mutate(5090)
  run.mutate(5150)
  // Also when it lands in the click's own millisecond.
  run.mutate(5950)
  run.press(6000, button)
  run.mutate(6000)
  run.mutate(6050)
  run.end(60000)
  assert.deepEqual(of(run.recorder.session, 'mutation').map(event => [event.t, event.last]), [[5000, undefined], [5090, 5150], [5950, undefined], [6000, 6050]])
  assert.ok(!detectSignals(run.recorder.session).some(signal => signal.kind === 'dead-click'))
})

test('a DOM change in the press\'s own millisecond answers it, even with another click within 3.5 s', () => {
  const run = harness()
  const track = element('button', { text: 'Track package' })
  run.press(41104, track)
  run.focus(41104, track)
  run.mutate(41104)
  run.press(42000, element('a', { classes: ['button', 'secondary'], text: 'View details' }))
  run.mutate(42100)
  run.end(60000)
  assert.deepEqual(of(run.recorder.session, 'mutation').map(event => event.t), [41104, 42100])
  assert.ok(!detectSignals(run.recorder.session).some(signal => signal.kind === 'dead-click'))
})

test('throttled activity keeps the time of the last input, so idle is not overstated', () => {
  const run = harness()
  ;[100, 600, 1100, 1500, 2090].forEach(t => run.move(t))
  run.press(9900, doc.body)
  run.end(12000)
  assert.deepEqual(of(run.recorder.session, 'activity').map(event => [event.t, event.last]), [[100, 600], [1100, 2090]])
  assert.ok(!detectSignals(run.recorder.session).some(signal => signal.kind === 'idle'))
})

test('focus events name their element, so a button focusing itself on press is still a dead click', () => {
  const run = harness()
  const button = element('button', { classes: ['apply'], children: [element('span', { text: 'Apply' }), textNode(' coupon')] })
  run.press(5000, button.childNodes[0])
  run.focus(5001, button)
  run.end(60000)
  assert.equal(of(run.recorder.session, 'focus')[0].selector, 'button.apply')
  assert.equal(detectSignals(run.recorder.session).filter(signal => signal.kind === 'dead-click').length, 1)
})

test('areas on fixed elements are stored in viewport coordinates; gaze keeps the scroll offset', () => {
  const footer = element('footer', { aoi: 'footer', position: 'fixed', rect: { left: 0, top: 606, width: 1440, height: 120 } })
  const link = element('a', { aoi: 'footer-returns', parent: footer, rect: { left: 40, top: 666, width: 325, height: 18 } })
  const form = element('form', { aoi: 'return-form', rect: { left: 300, top: 50, width: 800, height: 700 } })
  const run = harness({ scrollY: 50, href: 'http://x/meme-recognition/research-site/account/returns.html', aois: [footer, link, form] })
  assert.equal(run.page, 'account/returns')
  assert.deepEqual(run.recorder.session.aois['account/returns'], [
    { id: 'footer', rect: { x: 0, y: 606, width: 1440, height: 120 }, fixed: true },
    { id: 'footer-returns', rect: { x: 40, y: 666, width: 325, height: 18 }, fixed: true },
    { id: 'return-form', rect: { x: 300, y: 100, width: 800, height: 700 } },
  ])
  run.win.scrollY = 300
  run.at(1000, () => run.recorder.recordGaze({ x: 600, y: 735 }))
  assert.deepEqual(run.recorder.session.gaze, [{ t: 1000, page: 'account/returns', x: 600, y: 960, sx: 0, sy: 300 }])
})

test('with no baseline from calibration, the first 30 task face frames give one', () => {
  const run = harness()
  const face = (t, brow, scale = 0.2) => run.at(t, () => run.recorder.recordFace(brow == null ? null : { brow, scale }))
  for (let frame = 0; frame < 29; frame += 1) face(1000 + frame * 50, 0.1 + (frame % 3) / 100)
  face(2480, null)
  assert.equal(run.recorder.session.baseline, null)
  face(2500, 0.5, 0.3)
  assert.deepEqual(run.recorder.session.baseline, { brow: 0.11, scale: 0.2, from: 'tasks' })
  // Brow lowered for 3 s later in the task, judged against that baseline.
  for (let t = 3000; t <= 9000; t += 50) face(t, t >= 5000 && t <= 8000 ? 0.5 : 0.1)
  run.end(10000)
  assert.deepEqual(detectSignals(run.recorder.session).filter(signal => signal.strength === 'weak').map(signal => [signal.kind, signal.start]), [['brow-lowered', 5000]])
  // A baseline from calibration is kept.
  const calibrated = harness()
  calibrated.recorder.session.baseline = { brow: 0.3, scale: 0.25 }
  for (let t = 0; t < 2000; t += 50) calibrated.at(t, () => calibrated.recorder.recordFace({ brow: 0.1, scale: 0.2 }))
  assert.deepEqual(calibrated.recorder.session.baseline, { brow: 0.3, scale: 0.25 })
})

test('a field changing as a press blurs it is not the press\'s response', () => {
  const { recorder, press, change, end } = harness()
  press(5000, element('button', { id: 'submit-return', text: 'Submit return' }))
  change(5000, element('textarea', { id: 'details' }))
  end(20000)
  const changes = recorder.session.events.filter(event => event.type === 'change')
  assert.deepEqual(changes.map(event => event.selector), ['textarea#details'])
  assert.deepEqual(detectSignals(recorder.session).filter(signal => signal.kind === 'dead-click').map(signal => signal.detail.label), ['Submit return'])
})

test('area edges are rounded, not sizes, so a flush child stays inside its container', () => {
  const box = (left, width) => element('div', { aoi: `box-${left}`, rect: { left, top: 0, width, height: 50 } })
  const { recorder, page } = harness({ aois: [box(0.4, 200.2), box(100.5, 100.1)] })
  const [outer, inner] = recorder.session.aois[page].map(area => area.rect)
  assert.equal(outer.x + outer.width, inner.x + inner.width)
})
