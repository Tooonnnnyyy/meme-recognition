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
const element = (tag, { id = '', classes = [], attrs = {}, text = '', parent = null, aoi, position = 'static', rect, ...rest } = {}) => {
  const node = {
    nodeType: 1, tagName: tag.toUpperCase(), id, classList: classes, dataset: aoi ? { aoi } : {}, innerText: text, textContent: text, parentElement: parent, position,
    getAttribute: name => attrs[name] ?? null,
    getBoundingClientRect: () => rect,
    ...rest,
  }
  node.closest = selector => { for (let item = node; item; item = item.parentElement) if (matches(item, selector)) return item; return null }
  return node
}
const textNode = text => ({ nodeType: 3, textContent: text })
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
  const track = element('button', { classes: ['track'], text: 'Track package' })
  assert.deepEqual([describeTarget(element('span', { text: 'Track', parent: track }), doc).label, describeTarget(track, doc).formField], ['Track package', false])
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
  // A change in the click's own millisecond does not use up the exemption.
  run.press(6000, button)
  run.mutate(6000)
  run.mutate(6050)
  run.end(60000)
  assert.deepEqual(of(run.recorder.session, 'mutation').map(event => event.t), [5000, 5090, 6000, 6050])
  assert.equal(of(run.recorder.session, 'mutation')[1].last, 5150)
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
  const button = element('button', { classes: ['apply'], text: 'Apply coupon' })
  run.press(5000, element('span', { text: 'Apply', parent: button }))
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
