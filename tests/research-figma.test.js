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
  const decoded = decodeStudy(encodeStudy(study))
  assert.match(decoded.id, /^figma-AbCdEf1234567890-[0-9a-z]+$/)
  assert.deepEqual({ ...decoded, id: undefined, lang: undefined, questionnaire: undefined }, { ...study, id: undefined, lang: undefined, questionnaire: undefined })
  // A link without questionnaire settings keeps the old ones: SEQ and SUS.
  assert.deepEqual(decoded.questionnaire, { seq: true, post: 'sus' })
  const umux = decodeStudy(encodeStudy({ ...study, questionnaire: { seq: false, post: 'umux-lite' } }))
  assert.deepEqual(umux.questionnaire, { seq: false, post: 'umux-lite' })
  assert.throws(() => decodeStudy(encodeStudy({ ...study, questionnaire: { seq: 'no' } })), /questionnaire/)
  // Who to send the results file to travels when the researcher typed it.
  assert.equal(decoded.contact, undefined)
  assert.deepEqual(decodeStudy(encodeStudy({ ...study, contact: { researcher: 'A. Researcher', contact: 'a@example.org' } })).contact, { researcher: 'A. Researcher', contact: 'a@example.org' })
  // The study's language travels too; a link without one means English.
  assert.equal(decoded.lang, 'en')
  assert.equal(decodeStudy(encodeStudy({ ...study, lang: 'zh' })).lang, 'zh')
  assert.equal(decodeStudy(encodeStudy({ ...study, lang: 'xx' })).lang, 'en')
  // Another study on the same file gets another id; the same study keeps its id.
  assert.notEqual(decodeStudy(encodeStudy({ ...study, title: 'Checkout test, round 2' })).id, decoded.id)
  assert.equal(decodeStudy(encodeStudy(study)).id, decoded.id)
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

test('a demo link carries the study options, and reads back with defaults', async () => {
  const { demoLink, demoOptions } = await import('../src/research/studyLink.js')
  const plain = demoLink({ lang: 'zh', questionnaire: { seq: true, post: 'sus' } }, 'https://example.org/research.html')
  assert.equal(plain, 'https://example.org/research.html?lang=zh')
  assert.deepEqual(demoOptions(new URL(plain).search), { lang: 'zh', questionnaire: { seq: true, post: 'sus' }, contact: null })
  const custom = demoLink({ lang: 'en', questionnaire: { seq: false, post: 'none' }, contact: { researcher: 'A. Researcher', contact: 'a@example.org' } }, 'https://example.org/research.html')
  assert.deepEqual(demoOptions(new URL(custom).search), { lang: 'en', questionnaire: { seq: false, post: 'none' }, contact: { researcher: 'A. Researcher', contact: 'a@example.org' } })
  assert.deepEqual(demoOptions('?post=other&seq=1'), { lang: null, questionnaire: { seq: true, post: 'sus' }, contact: null })
})

test('a session is finished when stamped, or when every task of a participant file ended', async () => {
  const { isFinished } = await import('../src/research/sessionStatus.js')
  assert.equal(isFinished({ mode: 'moderated', tasks: [{ end: 5 }] }), false)
  assert.equal(isFinished({ mode: 'moderated', finishedAt: '2026-11-15T00:00:00Z', tasks: [] }), true)
  assert.equal(isFinished({ tasks: [{ end: 5 }, { end: 9 }] }), true)
  assert.equal(isFinished({ tasks: [{ end: 5 }, { end: null }] }), false)
  assert.equal(isFinished({ tasks: [] }), false)
})
