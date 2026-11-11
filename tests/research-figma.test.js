import assert from 'node:assert/strict'
import test from 'node:test'
import { embedUrl, figmaTranslator, parseFigmaLink, toNodeId } from '../src/research/figma.js'
import { decodeStudy, encodeStudy } from '../src/research/studyLink.js'
import { detectSignals } from '../src/research/signals.js'

const study = {
  kind: 'figma',
  title: 'Checkout test',
  figma: { fileKey: 'AbCdEf1234567890', name: 'Shop', startNodeId: '1:2', clientId: 'Qh4pDELgOVadrxPT' },
  tasks: [{ id: 'T1', prompt: 'Buy the cheapest item.', start: null, successPage: '5:9', limitSec: 120 }],
}

test('Figma links and node ids are parsed in every form links use', () => {
  assert.equal(toNodeId('12-34'), '12:34')
  assert.equal(toNodeId('12%3A34'), '12:34')
  assert.equal(toNodeId('frame'), null)
  assert.deepEqual(parseFigmaLink('https://www.figma.com/proto/AbCdEf1234567890/My-Shop?node-id=1-2&starting-point-node-id=1%3A2'), { fileKey: 'AbCdEf1234567890', name: 'My-Shop', nodeId: '1:2', startNodeId: '1:2' })
  assert.deepEqual(parseFigmaLink('5-9'), { nodeId: '5:9' })
  assert.equal(parseFigmaLink('https://evil.example/proto/AbCdEf1234567890/x'), null)
  assert.equal(parseFigmaLink('http://www.figma.com/proto/AbCdEf1234567890/x'), null)
})

test('the embed opens at the frame, with the client id and without hotspot hints', () => {
  const url = new URL(embedUrl(study.figma, '5:9'))
  assert.equal(url.origin, 'https://embed.figma.com')
  assert.equal(url.searchParams.get('node-id'), '5-9')
  assert.equal(url.searchParams.get('client-id'), 'Qh4pDELgOVadrxPT')
  assert.equal(url.searchParams.get('hotspot-hints'), '0')
})

test('a study survives the participant link, and a bad one is refused', () => {
  assert.deepEqual(decodeStudy(encodeStudy(study)), { id: 'figma-AbCdEf1234567890', ...study })
  assert.throws(() => decodeStudy('not-a-study'), /damaged/)
  assert.throws(() => encodeStudy({ ...study, figma: { ...study.figma, clientId: '' } }), /client ID/)
  assert.throws(() => encodeStudy({ ...study, tasks: [{ ...study.tasks[0], limitSec: 5 }] }), /time limit/)
})

test('embed events become frames and clicks; a release folds into its press', () => {
  const translate = figmaTranslator()
  assert.deepEqual(translate({ type: 'INITIAL_LOAD' }, 0), { type: 'ready' })
  assert.deepEqual(translate({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:2' } }, 10), { type: 'navigate', page: '1:2' })
  const press = translate({ type: 'MOUSE_PRESS_OR_RELEASE', data: { targetNodeId: '3:4', handled: false, targetNodeMousePosition: { x: 10.4, y: 20 } } }, 100)
  assert.equal(press.type, 'click')
  assert.equal(press.target.handled, false)
  assert.deepEqual(translate({ type: 'MOUSE_PRESS_OR_RELEASE', data: { targetNodeId: '3:4', handled: true, targetNodeMousePosition: { x: 10.4, y: 20 } } }, 180), { type: 'release', handled: true })
  assert.equal(translate({ type: 'MOUSE_PRESS_OR_RELEASE', data: { targetNodeId: '3:4', targetNodeMousePosition: { x: 10.4, y: 20 } } }, 900).type, 'click')
  assert.equal(translate({ type: 'SOMETHING_ELSE' }, 1000), null)
})

test('in a Figma study a click off any hotspot is unanswered, a hotspot click is not, and quiet reading is not idle', () => {
  const click = (t, handled) => ({ type: 'click', t, taskId: 'T1', page: '1:2', x: 10, y: 10 + t / 100, target: { selector: 'figma:3:4', label: '', interactive: handled, formField: false, aoi: null, handled } })
  const session = {
    study: { kind: 'figma', title: 'x', figma: study.figma },
    tasks: [{ id: 'T1', start: 0, end: 60000, outcome: 'success' }],
    // A hotspot click (navigation follows) and, 20 s later, a press on nothing.
    events: [{ type: 'navigate', t: 0, taskId: 'T1', page: '1:2' }, click(1000, true), { type: 'navigate', t: 1100, taskId: 'T1', page: '1:3' }, click(30000, false), { type: 'mutation', t: 30010, taskId: 'T1' }],
    gaze: [], face: [], quality: { gazeEnabled: false },
  }
  const signals = detectSignals(session)
  assert.deepEqual(signals.filter(signal => signal.kind === 'dead-click').map(signal => signal.start), [30000])
  assert.equal(signals.filter(signal => signal.kind === 'idle').length, 0)
})
