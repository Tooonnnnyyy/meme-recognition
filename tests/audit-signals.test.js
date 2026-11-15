import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { createRecorder, describeTarget } from '../src/research/recorder.js'
import { detectSignals, sessionFixations } from '../src/research/signals.js'
import { areasAt } from '../src/research/fixations.js'
import messages from '../src/i18n/messages/researcher.js'

// Audit fixes to the recorder, the signals and the review screen (#21, #25,
// #32, #65–#69, #127, #130, #132).

// DOM stand-ins, enough for the recorder in node.
const textNode = text => ({ nodeType: 3, textContent: text })
const element = (tag, { id = '', classes = [], attrs = {}, text = '', children = [], aoi, rect = { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }, ...rest } = {}) => {
  const node = {
    nodeType: 1, tagName: tag.toUpperCase(), id, classList: classes, dataset: aoi ? { aoi } : {}, childNodes: [...(text ? [textNode(text)] : []), ...children], parentElement: null, position: 'static',
    getAttribute: name => attrs[name] ?? null,
    getBoundingClientRect: () => (typeof rect === 'function' ? rect() : rect),
    ...rest,
  }
  node.closest = selector => {
    const parts = selector.split(',').map(part => part.trim())
    for (let item = node; item; item = item.parentElement) {
      if (parts.some(part => {
        const [, tagName, attr] = part.match(/^([a-z]*)(?:\[([\w-]+)(?:="[^"]*")?\])?$/) || []
        if (tagName && item.tagName.toLowerCase() !== tagName) return false
        if (attr) return attr === 'data-aoi' ? item.dataset.aoi != null : item.getAttribute(attr) != null
        return Boolean(tagName)
      })) return item
    }
    return null
  }
  children.forEach(child => { child.parentElement = node })
  return node
}
const body = element('body')
const root = element('html')

// A recorder watching a fake same-origin frame. The clock is moved by the
// test; the frame's document and window keep their listeners apart.
function harness({ href = 'http://x/meme-recognition/research-site/faq.html', scrollY = 0, aois = () => [], byId = {}, study = { id: 's', title: 'Study', siteBase: 'research-site/' } } = {}) {
  let clock = 0
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true })
  globalThis.document = { baseURI: 'http://x/meme-recognition/research.html' }
  let observer = null
  globalThis.MutationObserver = class { constructor(callback) { observer = callback } observe() {} disconnect() {} }
  const onDoc = {}
  const onWin = {}
  const win = {
    scrollX: 0, scrollY, location: { href },
    addEventListener: (type, fn) => { onWin[type] = fn }, removeEventListener() {},
    getComputedStyle: node => ({ position: node.position, visibility: node.visibility || 'visible', display: 'block', borderLeftWidth: '0px', borderRightWidth: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }),
  }
  const doc = {
    body, documentElement: root,
    querySelectorAll: () => aois(),
    querySelector: () => null,
    getElementById: name => byId[name] || null,
    getElementsByName: () => [],
    addEventListener: (type, fn) => { onDoc[type] = fn }, removeEventListener() {},
  }
  const frame = { contentWindow: win, contentDocument: doc, clientWidth: 1200, clientHeight: 700, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1200, bottom: 700 }) }
  const recorder = createRecorder({ study, participant: 'P-TEST' })
  recorder.startTask({ id: 'T1', prompt: 'Do it' })
  const page = recorder.attachFrame(frame)
  const at = (t, action) => { clock = t; action() }
  return {
    recorder, page, win, doc, onDoc, onWin, at,
    mutate: t => at(t, () => observer([])),
    press: (t, target, extra = {}) => at(t, () => onDoc.pointerdown({ button: 0, pageX: 10, pageY: 10, target, ...extra })),
    // The click event that follows a press, as it reaches the frame's window.
    follow: (t, target, extra = {}) => at(t, () => onWin.click({ button: 0, target, defaultPrevented: false, ...extra })),
    focus: (t, target) => at(t, () => onDoc.focusin({ target })),
    end: t => at(t, () => recorder.endTask('success')),
  }
}
const of = (session, type) => session.events.filter(event => event.type === type)
const dead = session => detectSignals(session).filter(signal => signal.kind === 'dead-click')
const link = (href, attrs = {}, text = 'Jump') => element('a', { id: 'jump', text, attrs: { href, ...attrs }, href })

// #25
test('an observed session, with no input to see, has no idle signals', () => {
  const tasks = [{ id: 'T1', start: 1000, end: 181000, outcome: 'success' }, { id: 'T2', start: 200000, end: 262000, outcome: 'partial' }]
  const session = kind => ({ study: { id: 's', kind, title: 'Study' }, tasks, events: [], gaze: [], face: [], quality: { gazeEnabled: false } })
  assert.deepEqual(detectSignals(session('observed')).filter(signal => signal.kind === 'idle'), [])
  // A site session with the same quiet stretch is still idle.
  assert.equal(detectSignals({ ...session(undefined), study: { id: 's', title: 'Study', siteBase: 'site/' } }).filter(signal => signal.kind === 'idle').length, 2)
})

// #65
test('an in-page anchor link that jumps answers its press', () => {
  const faq = element('h2', { id: 'faq', text: 'FAQ' })
  const run = harness({ byId: { faq } })
  const jump = link('http://x/meme-recognition/research-site/faq.html#faq', {}, 'Jump to the FAQ')
  run.press(400, jump)
  run.focus(400, jump)
  run.follow(410, jump)
  run.end(20000)
  assert.deepEqual(of(run.recorder.session, 'fragment').map(event => [event.t, event.page]), [[410, 'faq']])
  assert.deepEqual(dead(run.recorder.session), [])
  // A jump the page scrolls itself (default prevented) still counts.
  const smooth = harness({ byId: { faq } })
  smooth.press(400, jump)
  smooth.follow(410, jump, { defaultPrevented: true })
  smooth.end(20000)
  assert.deepEqual(dead(smooth.recorder.session), [])
  // Page loops count page loads only.
  assert.equal(of(run.recorder.session, 'navigate').length, 1)
})

test('a placeholder href="#" on a page at its top is still a dead click; on a scrolled page it jumps to the top', () => {
  const placeholder = link('http://x/meme-recognition/research-site/faq.html#', {}, 'Buy now')
  const top = harness()
  top.press(400, placeholder)
  top.follow(410, placeholder)
  top.end(20000)
  assert.deepEqual(of(top.recorder.session, 'fragment'), [])
  assert.deepEqual(dead(top.recorder.session).map(signal => signal.detail.label), ['Buy now'])
  const scrolled = harness({ scrollY: 900 })
  scrolled.press(400, placeholder)
  scrolled.follow(410, placeholder)
  scrolled.end(20000)
  assert.deepEqual(dead(scrolled.recorder.session), [])
  // A missing anchor jumps nowhere.
  const missing = harness()
  const nowhere = link('http://x/meme-recognition/research-site/faq.html#nowhere')
  missing.press(400, nowhere)
  missing.follow(410, nowhere)
  missing.end(20000)
  assert.equal(dead(missing.recorder.session).length, 1)
})

test('a link that opens a new tab answers its press', () => {
  const run = harness()
  const guide = link('http://x/meme-recognition/research-site/size-guide.html', { target: '_blank' }, 'Size guide (opens in a new tab)')
  run.press(900, guide)
  run.focus(900, guide)
  run.follow(920, guide)
  // Ctrl-click on an ordinary link opens a tab too.
  const other = link('http://x/meme-recognition/research-site/orders.html', {}, 'Orders')
  run.press(6000, other)
  run.follow(6010, other, { ctrlKey: true })
  // A link to another page in this frame waits for the frame's load, as before.
  const same = link('http://x/meme-recognition/research-site/returns.html', {}, 'Returns')
  run.press(12000, same)
  run.follow(12010, same)
  run.end(30000)
  assert.equal(of(run.recorder.session, 'new-tab').length, 2)
  assert.deepEqual(dead(run.recorder.session).map(signal => signal.detail.label), ['Returns'])
})

// #66
test('wheel turns and scrolling inside a pane are input, so reading a pane is not idle', () => {
  const run = harness()
  const pane = element('div', { id: 'pane' })
  for (let t = 500; t <= 12000; t += 500) run.at(t, () => (t % 1000 ? run.onDoc.wheel({ target: pane }) : run.onDoc.scroll({ target: pane })))
  run.end(12500)
  assert.ok(of(run.recorder.session, 'activity').length >= 1)
  assert.deepEqual(detectSignals(run.recorder.session).filter(signal => signal.kind === 'idle'), [])
  // The page's own scroll is still recorded once, through the window.
  run.at(13000, () => run.onDoc.scroll({ target: run.doc }))
  assert.deepEqual(of(run.recorder.session, 'scroll'), [])
})

test('a press on a pane\'s scrollbar is input, not a click', () => {
  const run = harness()
  const pane = element('div', { id: 'pane', classes: ['pane'], aoi: 'list', clientWidth: 1186, clientHeight: 640, offsetWidth: 1200, offsetHeight: 640, ownerDocument: run.doc })
  run.press(400, pane, { offsetX: 1192, offsetY: 300, clientX: 1192, clientY: 360 })
  // A press inside the pane's content is a click as before.
  run.press(5000, pane, { offsetX: 600, offsetY: 300 })
  // Inline elements have no client box, so never a scrollbar.
  const word = element('span', { clientWidth: 0, clientHeight: 0, offsetWidth: 40, offsetHeight: 18, ownerDocument: run.doc })
  run.press(9000, word, { offsetX: 30, offsetY: 5 })
  run.end(30000)
  assert.deepEqual(of(run.recorder.session, 'click').map(event => event.t), [5000, 9000])
  assert.ok(of(run.recorder.session, 'activity').some(event => event.t === 400))
})

// #67
test('an area hidden at load is left out, then added where it shows once the layout changes', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let shown = false
  const nav = element('nav', { aoi: 'main-nav', rect: { left: 0, top: 0, width: 1200, height: 100 } })
  const form = element('form', { aoi: 'form', rect: () => ({ left: 0, top: 100, width: 1200, height: shown ? 120 : 101 }) })
  const error = element('p', { aoi: 'email-error', rect: () => (shown ? { left: 40, top: 161, width: 1120, height: 18 } : { left: 0, top: 0, width: 0, height: 0 }) })
  const run = harness({ aois: () => [nav, form, error] })
  assert.deepEqual(run.recorder.session.aois[run.page].map(area => area.id), ['main-nav', 'form'])
  // The error shows at 5 s; the areas are measured once the change settles.
  run.at(5000, () => { shown = true })
  run.mutate(5000)
  run.mutate(5100)
  t.mock.timers.tick(300)
  const areas = run.recorder.session.aois[run.page]
  assert.deepEqual(areas.map(area => [area.id, area.from, area.to]), [['main-nav', undefined, undefined], ['form', undefined, 5000], ['form', 5000, undefined], ['email-error', 5000, undefined]])
  assert.deepEqual(areasAt(areas, 1000).map(area => area.id), ['main-nav', 'form'])
  assert.deepEqual(areasAt(areas, 6000).map(area => area.id), ['main-nav', 'form', 'email-error'])
  // An unchanged layout adds nothing.
  run.mutate(8000)
  t.mock.timers.tick(300)
  assert.equal(run.recorder.session.aois[run.page].length, 4)
  // Fixations: the logo before the error shows is in the nav, not the
  // hidden error; the error's text after it shows is the error.
  const session = run.recorder.session
  session.quality = { gazeEnabled: true, accuracy: { meanPx: 40, meanDegrees: 0.9 } }
  const dwell = (start, x, y) => Array.from({ length: 10 }, (_, index) => ({ t: start + index * 30, page: run.page, x, y, sx: 0, sy: 0 }))
  session.gaze = [...dwell(2000, 40, 30), ...dwell(7000, 100, 169)]
  assert.deepEqual(sessionFixations(session).map(fixation => fixation.aoi), ['main-nav', 'email-error'])
})

test('an area that goes away stops matching, and older files without times read as before', () => {
  const old = [{ id: 'nav', rect: { x: 0, y: 0, width: 100, height: 50 } }]
  assert.deepEqual(areasAt(old, 123456), old)
  const timed = [{ id: 'modal', rect: { x: 0, y: 0, width: 100, height: 50 }, to: 3000 }]
  assert.deepEqual(areasAt(timed, 2999).length, 1)
  assert.deepEqual(areasAt(timed, 3000), [])
})

// #68
test('focus the press gives a container (tabindex wrapper, dialog) is no response', () => {
  const photo = element('img', { classes: ['photo'], aoi: 'product' })
  const main = element('main', { id: 'content', children: [photo] })
  const run = harness()
  run.press(400, photo)
  run.focus(400, main)
  run.press(5000, photo)
  run.end(30000)
  assert.deepEqual(of(run.recorder.session, 'focus').map(event => [event.selector, event.own]), [['main#content', true]])
  assert.deepEqual(dead(run.recorder.session).map(signal => [signal.detail.aoi, signal.count]), [['product', 2]])
  // Focus moved to another element, such as the field a label names, still answers.
  const field = element('input', { id: 'email', attrs: { type: 'email' } })
  const label = element('label', { text: 'Email', attrs: { for: 'email' } })
  const other = harness()
  other.press(400, label)
  other.focus(400, field)
  other.end(30000)
  assert.equal(of(other.recorder.session, 'focus')[0].own, undefined)
  assert.deepEqual(dead(other.recorder.session), [])
})

// #69
test('a control\'s label does not change when part of it is scrolled out of view', () => {
  let scrollTop = 0
  const view = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) }
  const ownerDocument = { defaultView: view }
  const box = (top, height) => () => ({ left: 20, right: 400, top: top - scrollTop, bottom: top + height - scrollTop, width: 380, height })
  const heading = element('h3', { text: 'Pro plan', rect: box(71, 22), ownerDocument })
  const price = element('p', { text: '$12 per month, billed yearly', rect: box(100, 22), ownerDocument })
  const card = element('div', { id: 'pro', classes: ['plan'], attrs: { 'data-track': 'pro' }, children: [heading, price], rect: box(60, 300), ownerDocument })
  const page = element('html', { children: [element('body', { children: [card] })] })
  Object.defineProperty(page, 'scrollTop', { get: () => scrollTop })
  const doc = { body: page.childNodes[0], documentElement: page }
  assert.equal(describeTarget(price, doc).label, 'Pro plan $12 per month, billed yearly')
  scrollTop = 120
  assert.equal(describeTarget(price, doc).label, 'Pro plan $12 per month, billed yearly')
  // Screen-reader-only text moved off the page is still left out.
  const hidden = element('span', { text: 'opens a dialog', rect: { left: -10000, right: -9900, top: 80, bottom: 98, width: 100, height: 18 }, ownerDocument })
  const button = element('button', { text: 'Compare', children: [hidden], rect: box(400, 40), ownerDocument })
  assert.equal(describeTarget(button, doc).label, 'Compare')
})

// The review screen, loaded through Vite as the app loads it.
let server = null
const load = async () => {
  server ??= await createServer({ root: path.resolve(import.meta.dirname, '..'), configFile: false, logLevel: 'silent', cacheDir: path.join(os.tmpdir(), 'audit-signals-vite'), server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  return server.ssrLoadModule('/src/research/Review.jsx')
}
test.after(() => server?.close())

const sessionFile = (outcome, extra = {}) => ({
  version: 1, study: { id: 's', title: 'Study', siteBase: 'research-site/' }, participant: 'P01', startedAt: '2026-01-01T00:00:00.000Z',
  quality: { gazeEnabled: false, frames: 0, faceFrames: 0 },
  tasks: [{ id: 'T1', prompt: 'Do it', start: 0, end: 20000, outcome }],
  events: [{ type: 'navigate', t: 0, taskId: 'T1', page: 'index' }, { type: 'click', t: 1000, taskId: 'T1', page: 'index', x: 1, y: 1, target: { selector: 'button', label: 'Go' } }, { type: 'click', t: 9000, taskId: 'T1', page: 'index', x: 200, y: 1, target: { selector: 'a', label: 'Back' } }],
  ...extra,
})

// #32
test('a session file is read only with outcomes the app writes', async () => {
  const { readSession } = await load()
  for (const outcome of ['success', 'self-reported', 'unverified', 'partial', 'failed', 'skipped', 'timeout', null]) {
    assert.equal(readSession(JSON.stringify(sessionFile(outcome))).tasks[0].outcome, outcome)
  }
  for (const outcome of ['constructor', 'toString', '__proto__', 'done', 7]) {
    assert.throws(() => readSession(JSON.stringify(sessionFile(outcome))), error => error.key === 'researcher.file.badField' && error.vars.field === 'tasks')
  }
  // Areas with layout times are read; damaged times are not.
  const area = times => ({ aois: { index: [{ id: 'nav', rect: { x: 0, y: 0, width: 10, height: 10 }, ...times }] } })
  assert.ok(readSession(JSON.stringify(sessionFile('success', area({ from: 5000, to: 9000 })))))
  assert.throws(() => readSession(JSON.stringify(sessionFile('success', area({ from: 'soon' })))))
})

test('the review screen has a main landmark and headings; the Lab offers no other file to load', async () => {
  const { Review } = await load()
  globalThis.location = new URL('http://x/meme-recognition/research.html')
  const render = props => renderToStaticMarkup(React.createElement(Review, { initialSession: sessionFile('partial'), ...props }))
  const lab = render({ onSave: () => {} })
  // #127
  assert.match(lab, /<main class="review">/)
  assert.match(lab, /<h1>Session review · P01<\/h1>/)
  assert.deepEqual([...lab.matchAll(/<h2 class="kicker">([^<]*)<\/h2>/g)].map(match => match[1]), ['Data quality', 'Candidate moments'])
  // #21
  assert.doesNotMatch(lab, /session-file/)
  assert.match(render({}), /id="session-file"/)
  // #130
  assert.match(lab, /<i class="seg partial"[^>]*>T1 ½<\/i>/)
  // #132: each moment is one tab stop, with its state and a full label.
  const buttons = [...lab.matchAll(/<button class="cand[^"]*"[^>]*>/g)].map(match => match[0])
  assert.equal(buttons.length, 6)
  const reachable = buttons.filter(button => !/tabindex="-1"/.test(button))
  assert.deepEqual(reachable.map(button => button.match(/aria-label="([^"]*)"/)[1]), ['Moment 0:00–0:03, T1, high confidence', 'Moment 0:07–0:11, T1, high confidence'])
  assert.deepEqual(reachable.map(button => button.match(/aria-pressed="([^"]*)"/)[1]), ['true', 'false'])
  assert.ok(buttons.filter(button => /tabindex="-1"/.test(button)).every(button => /aria-hidden="true"/.test(button) && !/aria-label/.test(button)))
})

test('new review copy exists in English and Chinese', () => {
  for (const lang of ['en', 'zh']) {
    for (const key of ['review.failedLedeSaved', 'timeline.moment', 'timeline.confidence.high', 'timeline.confidence.medium', 'timeline.confidence.low']) assert.equal(typeof messages[lang][key], 'string', `${lang} ${key}`)
  }
  assert.equal(messages.zh['timeline.moment'], '{start}–{end}的时刻，{task}，{confidence}')
})
