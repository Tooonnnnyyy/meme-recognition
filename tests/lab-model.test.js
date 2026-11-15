import assert from 'node:assert/strict'
import test from 'node:test'
import { consentDocument, dataFlowStatement, demoStudy, newStudy, newTask, studyProblems, taskOrder, toRuntimeStudy, williamsSquare } from '../src/research/studyModel.js'
import { umuxLiteScore } from '../src/research/questionnaire.js'
import { buildReport, reportCsv, reportMarkdown } from '../src/research/studyReport.js'
import { exportPackage, importPackage, saveSession, saveStudy, sessionsOf, workspace } from '../src/lab/workspace.js'

test('Williams squares balance first position and carry-over', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const rows = williamsSquare(n)
    assert.equal(rows.length, n % 2 ? 2 * n : n)
    // Every task appears once per row and equally often in each position.
    rows.forEach(row => assert.deepEqual([...row].sort(), [...Array(n).keys()]))
    for (let position = 0; position < n; position += 1) {
      const counts = Array(n).fill(0)
      rows.forEach(row => { counts[row[position]] += 1 })
      assert.ok(counts.every(count => count === rows.length / n), `n=${n} position ${position}: ${counts}`)
    }
    // Every ordered pair (a directly before b) occurs equally often.
    const pairs = new Map()
    rows.forEach(row => row.slice(1).forEach((b, index) => { const key = `${row[index]}>${b}`; pairs.set(key, (pairs.get(key) || 0) + 1) }))
    assert.equal(pairs.size, n * (n - 1))
    assert.equal(new Set(pairs.values()).size, 1)
  }
})

test('task order follows the square only when counterbalancing is on', () => {
  const study = newStudy({ tasks: [newTask(1), newTask(2), newTask(3), newTask(4)] })
  assert.deepEqual(taskOrder(study, 2), ['T1', 'T2', 'T3', 'T4'])
  const balanced = { ...study, counterbalance: true }
  const orders = [0, 1, 2, 3].map(index => taskOrder(balanced, index).join(''))
  assert.equal(new Set(orders).size, 4)
  assert.equal(taskOrder(balanced, 4).join(''), orders[0])
})

test('study problems name what blocks running', () => {
  const study = newStudy()
  assert.ok(studyProblems(study).some(problem => /title/.test(problem)))
  assert.ok(studyProblems(study).some(problem => /instructions/.test(problem)))
  const ready = { ...study, title: 'Drop a course', tasks: [{ ...newTask(1), prompt: 'Find the drop deadline.' }] }
  assert.deepEqual(studyProblems(ready), [])
  assert.ok(studyProblems({ ...ready, method: 'unmoderated' }).some(problem => /needs a prototype/.test(problem)))
  const figma = { ...ready, source: { kind: 'figma', figma: { fileKey: 'AbCdEf1234567890', name: 'Shop' } } }
  assert.deepEqual(studyProblems(figma), [])
  assert.ok(studyProblems({ ...figma, method: 'unmoderated' }).some(problem => /client ID/.test(problem)))
  assert.deepEqual(studyProblems(demoStudy()), [])
})

test('runtime copies keep the order and the source', () => {
  const study = { ...demoStudy(), counterbalance: true }
  const order = taskOrder(study, 1)
  const runtime = toRuntimeStudy(study, order)
  assert.deepEqual(runtime.tasks.map(task => task.id), order)
  assert.equal(runtime.siteBase, 'research-site/')
  assert.equal(toRuntimeStudy({ ...newStudy({ title: 'x' }) }).kind, 'observed')
})

test('the consent draft has the TCPS 2 elements and the data statement matches the settings', () => {
  const study = { ...demoStudy(), consent: { ...demoStudy().consent, researcher: 'A. Student', ethicsBoard: 'Ethics office' } }
  const consent = consentDocument(study)
  for (const part of ['Who is doing this study', 'Why we are doing this study', 'What you will be asked to do', 'What is recorded', 'Risks and benefits', 'Taking part is voluntary', 'How your information is protected', 'Compensation', 'Questions and concerns', 'Consent']) assert.ok(consent.includes(part), part)
  assert.match(consent, /A\. Student/)
  assert.match(consent, /\[email or phone\]/)
  assert.match(consent, /SEQ|rate how easy/)
  assert.match(dataFlowStatement(study), /Clicks and screens/)
  assert.doesNotMatch(dataFlowStatement({ ...study, source: { kind: 'none' } }), /Clicks and screens/)
})

test('UMUX-Lite scores and its SUS equivalent', () => {
  assert.deepEqual(umuxLiteScore([7, 7]), { raw: 100, sus: 87.9 })
  assert.deepEqual(umuxLiteScore([1, 1]), { raw: 0, sus: 22.9 })
  assert.deepEqual(umuxLiteScore([5, 6]), { raw: 75, sus: 71.7 })
  assert.equal(umuxLiteScore([5]), null)
})

const moderated = (participant, notes, extra = {}) => ({ version: 1, mode: 'moderated', study: { id: 'lab', kind: 'observed', title: 'Drop a course' }, participant, startedAt: participant, quality: { gazeEnabled: false, frames: 0, faceFrames: 0 }, tasks: [{ id: 'T1', prompt: 'Find the deadline', start: 0, end: 90000, outcome: 'partial', seq: 4 }], events: [], gaze: [], face: [], aois: {}, notes, ...extra })
const note = (kind, text, tags = []) => ({ t: 5000, taskId: 'T1', kind, text, tags })

test('observer notes become problems grouped by tag across participants; pilots stay out', () => {
  const sessions = [
    moderated('P01', [note('problem', 'Looked in the wrong menu', ['nav']), note('quote', 'Where would that even be?', ['nav'])]),
    moderated('P02', [note('assist', 'Pointed to the Academics menu', ['nav']), note('note', 'Liked the colours')]),
    moderated('P03', [note('error', 'Clicked Add course instead of Drop')]),
    moderated('PILOT-1', [note('problem', 'Pilot only', ['nav'])], { pilot: true }),
  ]
  const report = buildReport(sessions)
  assert.equal(report.pilotsLeftOut, 1)
  assert.equal(report.participants.length, 3)
  const [nav, other] = report.observations
  assert.equal(nav.label, '#nav')
  assert.equal(nav.participants, 2)
  assert.deepEqual(nav.kinds, { problem: 1, quote: 1, assist: 1 })
  assert.equal(other.label, 'Clicked Add course instead of Drop')
  assert.ok(!report.observations.some(group => /Liked/.test(group.label)))
  assert.equal(buildReport(sessions, { includePilot: true }).observations[0].participants, 3)
  assert.equal(report.tasks[0].outcomes.partial, 3)
  assert.equal(report.tasks[0].completion.successes, 0)
  assert.match(reportMarkdown(report), /## Observed problems/)
  assert.match(reportCsv(report), /^observation,T1,#nav,2,/m)
})

test('the workspace keeps studies and sessions, and packages round-trip', async () => {
  const store = await workspace()
  assert.equal(store.persistent, false)
  const study = await saveStudy({ ...demoStudy(), title: 'Round trip' })
  await saveSession(study.id, moderated('P01', []))
  await saveSession(study.id, moderated('P02', []))
  assert.deepEqual((await sessionsOf(study.id)).map(session => session.participant), ['P01', 'P02'])
  const pack = await exportPackage([study.id])
  await store.deleteStudy(study.id)
  assert.equal((await sessionsOf(study.id)).length, 0)
  const result = await importPackage(JSON.parse(JSON.stringify(pack)), text => JSON.parse(text))
  assert.deepEqual(result, { studies: 1, sessions: 2 })
  assert.equal((await store.getStudy(study.id)).title, 'Round trip')
  await assert.rejects(importPackage({ format: 'other' }, JSON.parse), /not a Usability Lab package/)
})
