import test from 'node:test'
import assert from 'node:assert/strict'
import { limitsFor, newStudy, studyProblems, toRuntimeStudy } from '../src/research/studyModel.js'

const figmaStudy = overrides => newStudy({
  title: 'Shop',
  source: { kind: 'figma', figma: { fileKey: 'AbCdEf1234567890', name: 'Shop', clientId: '' } },
  tasks: [{ id: 'T1', prompt: 'Buy it.', success: '', limitSec: 120, start: null, successPage: null }],
  ...overrides,
})

test('a moderated Figma study without a client ID gives the runtime null, not an empty string', () => {
  assert.equal(toRuntimeStudy(figmaStudy()).figma.clientId, null)
})

test('the runtime study carries the questionnaires and the researcher contact', () => {
  const study = figmaStudy({ questionnaire: { seq: false, post: 'umux-lite' } })
  study.consent = { ...study.consent, researcher: ' A. Researcher ', contact: '' }
  const runtime = toRuntimeStudy(study)
  assert.deepEqual(runtime.questionnaire, { seq: false, post: 'umux-lite' })
  assert.deepEqual(runtime.contact, { researcher: 'A. Researcher', contact: null })
  assert.equal(toRuntimeStudy(figmaStudy()).contact, undefined)
})

test('an unmoderated study is held to what a link can carry', () => {
  assert.deepEqual(limitsFor({ method: 'unmoderated' }), { tasks: 10, limitSec: 1800 })
  assert.deepEqual(limitsFor({ method: 'moderated' }), { tasks: 12, limitSec: 3600 })
  const long = figmaStudy({ method: 'unmoderated', tasks: [{ id: 'T1', prompt: 'Buy it.', success: '', limitSec: 2400, start: null, successPage: null }] })
  long.source.figma.clientId = 'Qh4pDELgOVadrxPT'
  assert.ok(studyProblems(long).some(text => /30 minutes/.test(text)))
  assert.ok(!studyProblems({ ...long, method: 'moderated' }).some(text => /minutes/.test(text)))
  const many = { ...long, tasks: Array.from({ length: 11 }, (_, index) => ({ id: `T${index + 1}`, prompt: 'Do it.', success: '', limitSec: 120, start: null, successPage: null })) }
  assert.ok(studyProblems(many).some(text => /at most 10 tasks/.test(text)))
})

test('#0: a typed client ID that is not a client ID is a plan problem, and never reaches a session', () => {
  const study = figmaStudy()
  study.source.figma.clientId = 'https://www.figma.com/developers/apps'
  assert.ok(studyProblems(study).some(text => /client ID does not look right/.test(text)))
  assert.equal(toRuntimeStudy(study).figma.clientId, null)
})
