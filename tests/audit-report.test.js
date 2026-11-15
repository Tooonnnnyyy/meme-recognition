import assert from 'node:assert/strict'
import test from 'node:test'
import { meanInterval, timeInterval } from '../src/research/stats.js'
import { buildReport, outcomeSummary, reportCsv, reportMarkdown } from '../src/research/studyReport.js'
import { susGrade } from '../src/research/questionnaire.js'

// Audit fixes for the study report: which sessions count, the exports, the
// statistics at their edges, and the order of the tasks.

const FIGMA = { id: 'figma-AbCdEfGhIj12-x', kind: 'figma', title: 'Checkout', figma: { fileKey: 'AbCdEfGhIj12', name: 'Shop', clientId: null } }
const SITE = { id: 'site', title: 'Returns flow', siteBase: 'site/' }
const LAB = { id: 'lab', kind: 'observed', title: 'Drop a course' }
const task = (id, outcome, extra = {}) => ({ id, prompt: `Do ${id}`, start: 0, end: 60000, outcome, ...extra })
const session = (participant, study, tasks, extra = {}) => ({ version: 1, study, participant, startedAt: participant, quality: { gazeEnabled: false, frames: 0, faceFrames: 0 }, tasks, events: [], gaze: [], face: [], aois: {}, reviews: {}, ...extra })
const moderated = (participant, tasks, extra = {}) => session(participant, LAB, tasks, { mode: 'moderated', finishedAt: '2026-11-15T10:00:00.000Z', ...extra })
const deadClick = (t, taskId) => ({ type: 'click', t, taskId, page: 'returns', x: 100, y: 100, target: { selector: 'button#submit-return', label: 'Submit return', interactive: true, formField: false, aoi: null } })

test('#24 a moderated Figma study without events does not claim attempts were left out', () => {
  const silent = { gazeEnabled: false, frames: 0, faceFrames: 0, figmaEvents: 0 }
  const sessions = [['P01', 'partial'], ['P02', 'success'], ['P03', 'failed']].map(([participant, outcome]) => session(participant, FIGMA, [task('T1', outcome)], { mode: 'moderated', finishedAt: 'x', quality: silent }))
  const report = buildReport(sessions)
  assert.deepEqual(report.silentFigma, [])
  assert.deepEqual(report.figmaNoEvents, ['P01', 'P02', 'P03'])
  assert.equal(report.tasks[0].completion.n, 3)
  const markdown = reportMarkdown(report)
  assert.doesNotMatch(markdown, /left out of completion/)
  assert.match(markdown, /no clicks or frames were recorded/)
  // An unmoderated session whose goal frames could not be seen still gets the warning.
  const unverified = session('P04', FIGMA, [task('T1', 'unverified')], { quality: silent })
  const mixed = buildReport([...sessions, unverified])
  assert.deepEqual(mixed.silentFigma, ['P04'])
  assert.match(reportMarkdown(mixed), /sent no events for P04, so their goal frames could not be checked/)
  assert.match(reportMarkdown(mixed, 'zh'), /没有记录点击或画框/)
})

test('#23 pilots are not counted as participants; a report of pilots only says why it is empty', () => {
  const real = ['P1', 'P2', 'P3'].map(participant => session(participant, SITE, [task('T1', 'success')]))
  const pilots = ['PILOT-1', 'PILOT-2'].map(participant => session(participant, SITE, [task('T1', 'success')], { pilot: true, sus: { score: 70 } }))
  const report = buildReport([...real, ...pilots])
  assert.deepEqual(report.participants, ['P1', 'P2', 'P3'])
  assert.equal(report.pilotsLeftOut, 2)
  const only = buildReport(pilots)
  assert.equal(only.participants.length, 0)
  assert.equal(only.pilotsLeftOut, 2)
  // The title still comes from the loaded files, and the export does not read "0 participants: ."
  assert.equal(only.title, 'Returns flow')
  const markdown = reportMarkdown(only)
  assert.match(markdown, /^# Returns flow: usability test report$/m)
  assert.match(markdown, /^No participants\.$/m)
  assert.match(markdown, /^> 2 pilot sessions left out\.$/m)
  assert.match(reportMarkdown(only, 'zh'), /^没有参与者。$/m)
  assert.equal(buildReport(pilots, { includePilot: true }).participants.length, 2)
})

test('#36 exports keep every outcome; a task of unverifiable attempts stays in the CSV', () => {
  const sessions = ['partial', 'partial', 'partial', 'failed', 'success'].map((outcome, index) => moderated(`P0${index + 1}`, [task('T1', outcome)]))
  const report = buildReport(sessions)
  assert.equal(outcomeSummary(report.tasks[0]), '1 completed · 3 partial success · 1 failed or gave up')
  const markdown = reportMarkdown(report)
  assert.match(markdown, /^\| Task \| Completion \| Outcomes \| Time on task/m)
  assert.match(markdown, /\| T1: Do T1 \| 1\/5, 20%[^|]* \| 1 completed · 3 partial success · 1 failed or gave up \|/)
  assert.match(reportMarkdown(report, 'zh'), /1人完成 · 3人部分成功 · 1人失败或放弃/)
  const csv = reportCsv(report)
  assert.match(csv, /^task,T1,outcome: success,1,,,5,/m)
  assert.match(csv, /^task,T1,outcome: partial,3,,,5,/m)
  assert.match(csv, /^task,T1,outcome: failed,1,,,5,/m)
  // 3 partial + 2 failed no longer exports the same files as 5 failed.
  const failed = buildReport(['failed', 'failed', 'failed', 'failed', 'success'].map((outcome, index) => moderated(`P0${index + 1}`, [task('T1', outcome)])))
  assert.notEqual(reportCsv(failed), csv)
  assert.notEqual(reportMarkdown(failed), markdown)
  // Every attempt unverifiable (a silent Figma embed): the task still has rows.
  const silent = ['P1', 'P2', 'P3'].map(participant => session(participant, { ...FIGMA, figma: { ...FIGMA.figma, clientId: 'c' } }, [task('T1', 'unverified')], { quality: { figmaEvents: 0 } }))
  const unverifiable = reportCsv(buildReport(silent))
  assert.match(unverifiable, /^task,T1,completion rate,,,,0,,,,3 unverifiable$/m)
  assert.match(unverifiable, /^task,T1,outcome: unverified,3,,,3,/m)
})

test('#38 equal values give no interval even when their mean is not exact in floating point', () => {
  const umux = meanInterval([58.3, 58.3, 58.3], { min: 0, max: 100 })
  assert.equal(umux.noSpread, true)
  assert.equal(umux.low, null)
  assert.equal(umux.mean, 58.3)
  for (const value of [8.3, 16.7, 33.3, 41.7, 66.7, 83.3, 91.7]) {
    for (const n of [2, 3, 5, 8, 12]) assert.equal(meanInterval(Array(n).fill(value)).noSpread, true, `${value} × ${n}`)
  }
  assert.equal(timeInterval([30100, 30100, 30100]).noSpread, true)
  assert.equal(timeInterval([30100, 30100, 30100]).geo, 30100)
  // Values that differ still get an interval.
  assert.ok(meanInterval([58.3, 58.3, 66.7]).low != null)
  const report = buildReport(['P1', 'P2', 'P3'].map(participant => session(participant, SITE, [task('T1', 'success')], { umuxLite: { raw: 58.3, sus: 60.8 } })))
  assert.match(reportMarkdown(report), /Mean UMUX-Lite 58\.3 \(all values equal, no interval\)/)
})

test('#40 the SUS grade is read off the mean as it is shown', () => {
  const sus = scores => buildReport(scores.map((score, index) => session(`P${index + 1}`, SITE, [task('T1', 'success')], { sus: { score } }))).sus
  const low = sus([50, 52.5, 52.5])
  assert.equal(low.mean.toFixed(1), '51.7')
  assert.equal(low.grade, susGrade(51.7))
  assert.equal(low.grade, 'D')
  const high = sus([80, 80, 80, 80, 80, 82.5, 82.5, 80, 80, 82.5])
  assert.equal(high.mean.toFixed(1), '80.8')
  assert.equal(high.grade, 'A')
  // UMUX-Lite's SUS equivalent: 71.7 + 82.5 + 82.5 averages 78.9, but 78.89999999999999 in floating point.
  const umux = buildReport([[75, 71.7], [91.7, 82.5], [91.7, 82.5]].map(([raw, equivalent], index) => session(`P${index + 1}`, SITE, [task('T1', 'success')], { umuxLite: { raw, sus: equivalent } }))).umuxLite
  assert.equal(umux.grade, 'A−')
})

test('#41 and #72 unfinished sessions are left out unless included, and never flag more than their attempts', () => {
  // P01 closed mid-task: T1 ended, T2 still open with three unanswered clicks.
  const crashed = moderated('P01', [task('T1', 'success'), { id: 'T2', prompt: 'Do T2', start: 61000, end: null, outcome: null }], { finishedAt: undefined, events: [deadClick(62000, 'T2'), deadClick(70000, 'T2'), deadClick(80000, 'T2')] })
  const done = ['P02', 'P03'].map(participant => moderated(participant, [task('T1', 'success'), task('T2', 'success', { start: 61000, end: 120000 })]))
  const report = buildReport([crashed, ...done])
  assert.deepEqual(report.participants, ['P02', 'P03'])
  assert.deepEqual(report.unfinished, ['P01'])
  assert.equal(report.unfinishedLeftOut, 1)
  assert.match(reportMarkdown(report), /^> 1 unfinished session left out \(P01\)\.$/m)
  assert.match(reportMarkdown(report, 'zh'), /^> 未计入1个未完成的场次（P01）。$/m)
  const all = buildReport([crashed, ...done], { includeUnfinished: true })
  assert.equal(all.participants.length, 3)
  assert.equal(all.unfinishedLeftOut, 0)
  const t2 = all.tasks.find(item => item.id === 'T2')
  assert.equal(t2.attempts, 2)
  assert.ok(t2.flagged <= t2.attempts, `${t2.flagged}/${t2.attempts}`)
  assert.equal(t2.flagged, 0)
  // The unanswered clicks are still a problem in the open task.
  assert.ok(all.issues.some(issue => issue.taskId === 'T2' && issue.kind === 'dead-click'))
  // A participant file whose tasks did not all end is unfinished too, and one ended before any task.
  assert.deepEqual(buildReport([session('P9', SITE, [{ ...task('T1', null), end: null }]), session('P8', SITE, [])]).unfinished, ['P9', 'P8'])
  // An unfinished pilot counts once, as a pilot.
  const pilot = buildReport([...done, { ...crashed, participant: 'PILOT-1', pilot: true }])
  assert.equal(pilot.pilotsLeftOut, 1)
  assert.equal(pilot.unfinishedLeftOut, 0)
})

test('#42 tasks are listed in the study\'s order, not the first participant\'s', () => {
  const order = ids => ids.map(id => task(id, 'success'))
  const report = buildReport([moderated('P01', order(['T1', 'T2', 'T4', 'T3'])), moderated('P02', order(['T2', 'T3', 'T1', 'T4']))])
  assert.deepEqual(report.tasks.map(item => item.id), ['T1', 'T2', 'T3', 'T4'])
  const many = buildReport([moderated('P01', order(['T10', 'T2', 'T1']))])
  assert.deepEqual(many.tasks.map(item => item.id), ['T1', 'T2', 'T10'])
  assert.match(reportMarkdown(report), /\| T1: [^\n]*\n\| T2: [^\n]*\n\| T3: [^\n]*\n\| T4: /)
})

test('#43 a study that did not ask the SUS never says nobody answered it', () => {
  const umux = ['P1', 'P2'].map(participant => moderated(participant, [task('T1', 'success')], { umuxLite: { raw: 75, sus: 71.7 } }))
  const asked = buildReport(umux, { post: 'umux-lite' })
  assert.equal(asked.noAnswers, null)
  const markdown = reportMarkdown(asked)
  assert.doesNotMatch(markdown, /SUS questionnaire|System Usability Scale/)
  assert.match(markdown, /^## Post-test questionnaire\n\nMean UMUX-Lite 75\.0/m)
  // Not known (research.html) with UMUX-Lite answers: no SUS line either.
  assert.equal(buildReport(umux).noAnswers, null)
  // A study that asked nothing has no post-test section.
  const none = buildReport([moderated('P1', [task('T1', 'success')])], { post: 'none' })
  assert.equal(none.noAnswers, null)
  assert.doesNotMatch(reportMarkdown(none), /Post-test questionnaire|SUS/)
  // Asked and unanswered, or not known and nothing answered.
  assert.equal(buildReport([moderated('P1', [task('T1', 'success')])], { post: 'sus' }).noAnswers, 'sus')
  assert.match(reportMarkdown(buildReport([moderated('P1', [task('T1', 'success')])], { post: 'sus' })), /No participant completed the SUS questionnaire\./)
  assert.equal(buildReport([moderated('P1', [task('T1', 'success')])], { post: 'umux-lite' }).noAnswers, 'umux-lite')
  const unknown = buildReport([moderated('P1', [task('T1', 'success')])])
  assert.equal(unknown.noAnswers, 'any')
  assert.match(reportMarkdown(unknown), /The files hold no post-test questionnaire answers\./)
  // The files may name the questionnaire themselves.
  assert.equal(buildReport([moderated('P1', [task('T1', 'success')], { study: { ...LAB, questionnaire: { seq: true, post: 'none' } } })]).noAnswers, null)
})
