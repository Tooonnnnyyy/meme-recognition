import test from 'node:test'
import assert from 'node:assert/strict'
import { addSession, exportPackage, importPackage, normalizeStudy, replaces, saveSession, saveStudy, sessionsOf, workspace } from '../src/lab/workspace.js'
import { demoStudy, newStudy, STUDY_FORMAT, studyProblems, williamsSquare } from '../src/research/studyModel.js'
import { errorText, translate, translator } from '../src/i18n/index.js'

const PACKAGE = 'usability-lab/package@1'
const read = text => JSON.parse(text)
const session = (participant, overrides = {}) => ({
  version: 1,
  participant,
  startedAt: `2026-11-0${participant.slice(-1)}T10:00:00.000Z`,
  mode: 'moderated',
  tasks: [{ id: 'T1', start: 0, end: 1000, outcome: 'success' }],
  notes: [],
  events: [],
  finishedAt: '2026-11-01T10:20:00.000Z',
  ...overrides,
})
const reviewed = (base, count) => ({ ...base, reviews: Object.fromEntries(Array.from({ length: count }, (_, index) => [`T1-dead-click-${index}`, { status: 'confirmed', severity: 3 }])) })

test('#29: a minimal or older study is completed from the defaults when imported', async () => {
  const minimal = { id: 's-colleague', title: 'From a colleague', tasks: [{ prompt: 'Find the opening hours.' }] }
  const normal = normalizeStudy(minimal)
  const defaults = newStudy()
  assert.equal(normal.format, STUDY_FORMAT)
  assert.deepEqual(normal.source, { kind: 'none' })
  assert.equal(normal.method, 'moderated')
  assert.deepEqual(normal.questionnaire, { seq: true, post: 'sus' })
  assert.equal(normal.plannedParticipants, 5)
  assert.deepEqual(Object.keys(normal.consent).sort(), Object.keys(defaults.consent).sort())
  assert.deepEqual(normal.tasks, [{ id: 'T1', prompt: 'Find the opening hours.', success: '', limitSec: 300, start: null, successPage: null }])
  // Everything the screens read is there, so the studies list and the plan draw.
  assert.ok(Array.isArray(studyProblems(normal)))

  // Odd values are replaced, good ones kept, the Figma settings cleaned.
  const odd = normalizeStudy({ ...minimal, method: 'remote', source: { kind: 'figma', figma: { fileKey: 'AbCdEf1234567890', name: 7, startNodeId: 12 } }, plannedParticipants: 0, questionnaire: { seq: false, post: 'nps' }, consent: { researcher: 'A. Student', durationMin: 3045 }, counterbalance: 'yes' })
  assert.equal(odd.method, 'moderated')
  assert.deepEqual(odd.source, { kind: 'figma', figma: { fileKey: 'AbCdEf1234567890', name: '', startNodeId: null, clientId: '' } })
  assert.equal(odd.plannedParticipants, 5)
  assert.deepEqual(odd.questionnaire, { seq: false, post: 'sus' })
  assert.equal(odd.consent.researcher, 'A. Student')
  assert.equal(odd.consent.durationMin, 30)
  assert.equal(odd.counterbalance, false)

  // Studies that cannot be used are refused.
  assert.equal(normalizeStudy({ ...minimal, tasks: [{ prompt: 3 }] }), null)
  assert.equal(normalizeStudy({ ...minimal, tasks: ['Find it'] }), null)
  assert.equal(normalizeStudy({ ...minimal, format: 'usability-lab/study@9' }), null)
  assert.equal(normalizeStudy({ title: 'No id', tasks: [] }), null)

  const result = await importPackage({ format: PACKAGE, studies: [minimal], sessions: [] }, read)
  assert.deepEqual(result, { studies: 1, sessions: 0 })
  const stored = await (await workspace()).getStudy('s-colleague')
  assert.equal(stored.source.kind, 'none')
  assert.equal(stored.consent.durationMin, 30)
})

test('#30: a package with a bad session changes nothing', async () => {
  const study = await saveStudy({ ...demoStudy(), id: 's-partial', title: 'Current plan' })
  const old = { ...study, title: 'OLD backup', tasks: study.tasks.slice(0, 1), updatedAt: '2030-01-01T00:00:00.000Z' }
  const bad = { studyId: 's-partial', session: { participant: 'P09' } }
  const check = text => { const data = JSON.parse(text); if (!data.version) throw Object.assign(new Error('bad'), { key: 'researcher.file.notSession' }); return data }
  await assert.rejects(importPackage({ format: PACKAGE, studies: [old], sessions: [{ studyId: 's-partial', session: session('P01') }, bad] }, check), error => {
    assert.equal(error.key, 'lab.import.badSession')
    assert.equal(error.vars.participant, 'P09')
    assert.equal(error.cause.key, 'researcher.file.notSession')
    assert.match(errorText(translator('zh'), error), /场次 P09/)
    return true
  })
  assert.equal((await (await workspace()).getStudy('s-partial')).title, 'Current plan')
  assert.equal((await sessionsOf('s-partial')).length, 0)
  // A damaged study after a good one: nothing is written either.
  await assert.rejects(importPackage({ format: PACKAGE, studies: [old, { id: 's-x', title: 'x', tasks: [null] }], sessions: [] }, read), /damaged/)
  assert.equal((await (await workspace()).getStudy('s-partial')).title, 'Current plan')
})

test('#60: import keeps the newer study and the session copy with more reviews', async () => {
  const study = await saveStudy({ ...demoStudy(), id: 's-two', consent: { ...demoStudy().consent, researcher: 'A. Student' } })
  const local = reviewed(session('P01'), 1)
  await saveSession('s-two', local)
  const older = { ...study, consent: { ...study.consent, researcher: '' }, updatedAt: '2020-01-01T00:00:00.000Z' }
  const packed = { format: PACKAGE, studies: [older], sessions: [{ studyId: 's-two', session: session('P01') }, { studyId: 's-two', session: session('P02') }, { studyId: 's-elsewhere', session: session('P03') }] }
  const result = await importPackage(packed, read)
  assert.deepEqual(result, { studies: 0, sessions: 1, keptStudies: 1, keptSessions: 1, skipped: 1 })
  assert.equal((await (await workspace()).getStudy('s-two')).consent.researcher, 'A. Student')
  const sessions = await sessionsOf('s-two')
  assert.deepEqual(sessions.map(item => item.participant), ['P01', 'P02'])
  assert.equal(Object.keys(sessions[0].reviews).length, 1)

  // A newer study, and a session copy with more reviews, do replace.
  const newer = { ...study, title: 'Newer', updatedAt: '2099-01-01T00:00:00.000Z' }
  const again = await importPackage({ format: PACKAGE, studies: [newer], sessions: [{ studyId: 's-two', session: reviewed(session('P01'), 2) }] }, read)
  assert.deepEqual(again, { studies: 1, sessions: 1 })
  assert.equal((await (await workspace()).getStudy('s-two')).title, 'Newer')
  assert.equal(Object.keys((await sessionsOf('s-two'))[0].reviews).length, 2)

  // The message says what was kept and skipped, in both languages.
  const en = ['keptStudies', 'keptSessions', 'skipped'].map(key => translate('en', `lab.studies.${key}`, { count: 1 }))
  assert.deepEqual(en, ['Kept this computer’s copy of 1 study, which is newer.', 'Kept this computer’s copy of 1 session.', 'Skipped 1 session whose study is not in the file.'])
  assert.equal(translate('zh', 'lab.studies.keptSessions', { count: 2 }), '保留了这台电脑上2个场次的现有版本。')
})

test('the round trip still reports plain counts', async () => {
  const study = await saveStudy({ ...demoStudy(), id: 's-trip', title: 'Round trip' })
  await saveSession(study.id, session('P01'))
  const pack = JSON.parse(JSON.stringify(await exportPackage([study.id])))
  await (await workspace()).deleteStudy(study.id)
  assert.deepEqual(await importPackage(pack, read), { studies: 1, sessions: 1 })
  // The same package again: the study is rewritten, the session is already here.
  assert.deepEqual(await importPackage(pack, read), { studies: 1, sessions: 0, keptSessions: 1 })
})

test('#31: adding a results file again keeps the reviews saved here', async () => {
  const raw = session('P05', { mode: 'unmoderated', finishedAt: undefined })
  assert.deepEqual((await addSession('s-files', raw)).status, 'added')
  await saveSession('s-files', reviewed(raw, 1))
  const again = await addSession('s-files', raw)
  assert.equal(again.status, 'kept')
  assert.equal(again.reviews, 1)
  assert.equal(Object.keys((await sessionsOf('s-files'))[0].reviews).length, 1)
  // A copy exported from the review screen with more reviews replaces it.
  const more = await addSession('s-files', reviewed(raw, 3))
  assert.equal(more.status, 'replaced')
  assert.equal(more.reviews, 3)
  assert.equal(translate('en', 'lab.run.already', { file: 'p05.json', participant: 'P05', count: 1 }), 'p05.json: P05 was already added; kept the copy here with 1 reviewed moment')
  assert.equal(translate('en', 'lab.run.already', { file: 'p05.json', participant: 'P05', count: 0 }), 'p05.json: P05 was already added; nothing changed')
  assert.equal(translate('zh', 'lab.run.replaced', { file: 'p05.json', participant: 'P05', count: 3 }), 'p05.json：P05 已替换为这份含3个已审阅时刻的副本')
})

test('a finished copy replaces an unfinished one with as many reviews', () => {
  const partial = session('P01', { finishedAt: undefined, tasks: [{ id: 'T1', start: 0, end: null }] })
  const whole = session('P01')
  assert.equal(replaces(whole, partial), true)
  assert.equal(replaces(partial, whole), false)
  assert.equal(replaces(whole, whole), false)
  assert.equal(replaces(reviewed(partial, 1), whole), true)
  assert.equal(replaces(whole, null), true)
})

test('#83: the plan says when the planned participants do not balance the orders', () => {
  assert.equal(williamsSquare(4).length, 4)
  assert.equal(translate('en', 'lab.plan.unbalanced', { a: 4, b: 8, c: 12, planned: 5 }), 'Balanced with 4, 8, 12… participants; you plan 5.')
  assert.equal(translate('zh', 'lab.plan.unbalanced', { a: 6, b: 12, c: 18, planned: 5 }), '参与者人数为6、12、18……时才完全平衡；你计划了5位。')
  assert.doesNotMatch(translate('en', 'lab.plan.orderHint', { first: 'a', second: 'b', third: 'c' }), /different order/)
})

test('#29: a study stored by an older version is completed as it is read', async () => {
  const { workspace } = await import('../src/lab/workspace.js')
  const store = await workspace()
  await store.putStudy({ id: 'old-1', title: 'Old study', tasks: [{ id: 'T1', prompt: 'Find it' }] })
  await store.putStudy({ id: 'old-2', title: 'Broken tasks', tasks: 'not a list' })
  const listed = await store.listStudies()
  const old = listed.find(study => study.id === 'old-1')
  assert.equal(old.source.kind, 'none')
  assert.deepEqual(old.questionnaire, { seq: true, post: 'sus' })
  assert.equal((await store.getStudy('old-2')).tasks.length, 0)
  assert.equal((await store.getStudy('old-2')).title, 'Broken tasks')
})
