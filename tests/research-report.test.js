import assert from 'node:assert/strict'
import test from 'node:test'
import { susGrade, susScore } from '../src/research/questionnaire.js'
import { completion, meanInterval, tCritical, timeInterval } from '../src/research/stats.js'
import { describeSignal } from '../src/research/signals.js'
import { buildReport, issueTitle, reportCsv, reportMarkdown, reportTitle, reviewCount, sessionKey } from '../src/research/studyReport.js'

test('SUS scores follow Brooke\'s rule and the Sauro–Lewis grades', () => {
  assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100)
  assert.equal(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), 0)
  assert.equal(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), 50)
  assert.equal(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 3]), 72.5)
  assert.equal(susScore([4, 2, 4]), null)
  assert.equal(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 6]), null)
  assert.equal(susGrade(68), 'C')
  assert.equal(susGrade(85), 'A+')
  assert.equal(susGrade(40), 'F')
})

test('completion uses the adjusted Wald interval, sensible even at 5 of 5', () => {
  // Adjusted Wald (Agresti–Coull): 5/5 gives about 51%–100%, 0/5 about 0%–49%,
  // and 4/5 about 36%–98%.
  const all = completion(5, 5)
  assert.equal(all.rate, 1)
  assert.ok(Math.abs(all.low - 0.511) < 0.005 && all.high === 1)
  const none = completion(0, 5)
  assert.ok(none.low === 0 && Math.abs(none.high - 0.489) < 0.005)
  const most = completion(4, 5)
  assert.ok(Math.abs(most.low - 0.359) < 0.005 && Math.abs(most.high - 0.983) < 0.005)
  assert.equal(completion(0, 0), null)
})

test('time on task uses the geometric mean; ratings use a t interval', () => {
  const time = timeInterval([30000, 60000, 120000])
  assert.ok(Math.abs(time.geo - 60000) < 1)
  assert.ok(time.low < time.geo && time.high > time.geo)
  assert.equal(timeInterval([40000]).low, null)
  assert.equal(tCritical(4), 2.776)
  const seq = meanInterval([6, 7, 5, 6], { min: 1, max: 7 })
  assert.equal(seq.mean, 6)
  assert.ok(seq.high <= 7 && seq.low > 4)
})

const session = (participant, { outcomes, times, seq, sus, reviews = {}, deadOn = null }) => {
  let t = 1000
  const tasks = outcomes.map((outcome, index) => {
    const start = t
    t += times[index]
    return { id: `T${index + 1}`, prompt: `Task ${index + 1}`, start, end: t, outcome, seq: seq[index] }
  })
  const events = []
  // An unanswered press on the disabled submit button in T2.
  if (deadOn) events.push({ type: 'click', t: tasks[1].start + 500, taskId: 'T2', page: 'returns', x: 100, y: 100, target: { selector: 'button#submit-return', label: deadOn, interactive: true, formField: false, aoi: null } })
  return { version: 1, study: { id: 's', title: 'Returns flow', siteBase: 'site/' }, participant, startedAt: participant, quality: { gazeEnabled: false, frames: 0, faceFrames: 0 }, tasks, events, gaze: [], face: [], aois: {}, sus: sus && { answers: sus, score: susScore(sus) }, reviews }
}

test('a study report combines participants per task, with SUS and ranked problems', () => {
  const sessions = [
    session('P1', { outcomes: ['success', 'success'], times: [30000, 90000], seq: [7, 3], sus: [4, 2, 4, 2, 4, 2, 4, 2, 4, 2], deadOn: 'Submit return' }),
    session('P2', { outcomes: ['success', 'timeout'], times: [45000, 240000], seq: [6, 2], sus: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], deadOn: 'Submit return' }),
    session('P3', { outcomes: ['skipped', 'success'], times: [10000, 120000], seq: [null, 4], sus: null }),
  ]
  const [first] = sessions
  const id = 'T2-dead-click-' + (first.tasks[1].start + 500)
  first.reviews = { [id]: { status: 'confirmed', severity: 3 } }
  const report = buildReport(sessions)
  const [t1, t2] = report.tasks
  assert.equal(t1.completion.successes, 2)
  assert.equal(t1.completion.n, 3)
  assert.equal(t1.time.n, 2)
  assert.equal(t1.seq.mean, 6.5)
  assert.equal(t2.completion.successes, 2)
  assert.equal(t2.flagged, 2)
  assert.equal(report.sus.n, 2)
  assert.equal(report.sus.mean, 62.5)
  const [problem] = report.issues
  assert.equal(problem.title, 'No response to a click on “Submit return” on returns')
  assert.equal(problem.participants, 2)
  assert.equal(problem.confirmedParticipants, 1)
  assert.equal(problem.confirmed, 1)
  assert.equal(problem.severity, 3)
  assert.equal(problem.open, 1)
  // Rejected everywhere: left out.
  sessions[1].reviews = { ['T2-dead-click-' + (sessions[1].tasks[1].start + 500)]: { status: 'rejected', severity: null } }
  first.reviews = { [id]: { status: 'rejected', severity: null } }
  assert.equal(buildReport(sessions).issues.filter(issue => issue.kind === 'dead-click').length, 0)
  const markdown = reportMarkdown(report)
  assert.match(markdown, /\| T1: Task 1 \| 2\/3, 67%/)
  assert.match(markdown, /Mean SUS 62\.5/)
  assert.match(reportCsv(report), /^section,task,item,value,low,high,n,moments,confirmed_participants,severity,note\n/)
})

// Sessions for the aggregation edge cases found in review.
const FIGMA = { id: 'figma-AbCdEfGhIj12-x', kind: 'figma', title: 'Checkout', figma: { fileKey: 'AbCdEfGhIj12', name: 'Shop', clientId: 'client123' } }
const SITE = { id: 'site', title: 'Returns flow', siteBase: 'site/' }
const raw = (participant, study, tasks, events, extra = {}) => ({ version: 1, study, participant, startedAt: participant, quality: { gazeEnabled: false, frames: 0, faceFrames: 0, figmaEvents: 10 }, tasks, events, gaze: [], face: [], aois: {}, sus: null, reviews: {}, ...extra })
const figmaClick = (t, page, node, x, y) => ({ type: 'click', t, taskId: 'T1', page, x, y, target: { selector: `figma:${node}`, label: '', interactive: false, formField: false, aoi: null, handled: false } })
const siteClick = (t, page, selector, label, x = 100, y = 100) => ({ type: 'click', t, taskId: 'T2', page, x, y, target: { selector, label, interactive: true, formField: false, aoi: null } })
const oneTask = (id, outcome, end, extra = {}) => [{ id, prompt: 'Do it', start: 0, end, outcome, ...extra }]

test('Figma clicks off hotspots on different layers stay separate problems', () => {
  const sessions = [['P1', '1:2', '10:1'], ['P2', '3:4', '55:9'], ['P3', '7:7', '99:3']].map(([participant, page, node], index) =>
    raw(participant, FIGMA, oneTask('T1', 'success', 60000), [{ type: 'navigate', t: 100, taskId: 'T1', page }, figmaClick(5000 + index * 1000, page, node, 10 + index * 200, 10)]))
  const titles = buildReport(sessions).issues.map(issue => `${issue.title} ${issue.participants}`)
  assert.deepEqual(titles.sort(), ['No response to a click on layer 10:1 in frame 1:2 1', 'No response to a click on layer 55:9 in frame 3:4 1', 'No response to a click on layer 99:3 in frame 7:7 1'])
})

test('every strong signal in a moment counts, not only the one that opened it', () => {
  const session = (participant, withClick) => raw(participant, SITE, oneTask('T2', 'timeout', 240000), [
    { type: 'navigate', t: 100, taskId: 'T2', page: 'orders' },
    ...(withClick ? [siteClick(234000, 'returns', 'button#submit-return', 'Submit return')] : []),
  ])
  const report = buildReport([session('P1', false), session('P2', true), session('P3', true)])
  assert.equal(report.issues.find(issue => issue.kind === 'timeout').participants, 3)
  assert.equal(report.issues.find(issue => issue.kind === 'dead-click').participants, 2)
})

test('moments rejected in review do not count as affected participants', () => {
  const sessions = ['P1', 'P2', 'P3', 'P4'].map(participant => raw(participant, SITE, oneTask('T2', 'success', 60000), [{ type: 'navigate', t: 100, taskId: 'T2', page: 'returns' }, siteClick(5000, 'returns', 'button#submit-return', 'Submit return')]))
  sessions.slice(0, 3).forEach(session => { session.reviews = { 'T2-dead-click-5000': { status: 'rejected', severity: null } } })
  const [issue] = buildReport(sessions).issues
  assert.equal(issue.participants, 1)
  assert.equal(issue.rejected, 3)
  assert.equal(issue.open, 1)
  assert.equal(buildReport(sessions.slice(0, 3)).issues.length, 0)
})

test('a reviewed copy outranks the raw copy of the same session', () => {
  const first = raw('P1', SITE, oneTask('T1', 'success', 1000), [])
  const reviewed = { ...first, reviews: { 'T1-x-1': { status: 'confirmed', severity: 3 } } }
  assert.equal(sessionKey(first), sessionKey(reviewed))
  assert.ok(reviewCount(reviewed) > reviewCount(first))
})

test('Figma sessions with no embed events are unverifiable, not failed', () => {
  const silent = raw('P1', FIGMA, oneTask('T1', 'unverified', 30000), [], { quality: { gazeEnabled: false, frames: 0, faceFrames: 0, figmaEvents: 0 } })
  const working = raw('P2', FIGMA, oneTask('T1', 'success', 20000), [{ type: 'navigate', t: 100, taskId: 'T1', page: '1:2' }])
  const report = buildReport([silent, working])
  assert.deepEqual(report.silentFigma, ['P1'])
  assert.equal(report.tasks[0].completion.n, 1)
  assert.equal(report.tasks[0].completion.successes, 1)
  assert.equal(report.tasks[0].unverifiable, 1)
  assert.match(reportMarkdown(report), /sent no events for P1/)
})

test('Figma time on task starts when the prototype first answers', () => {
  const session = raw('P1', FIGMA, oneTask('T1', 'success', 30000, { ready: 10000 }), [])
  assert.ok(Math.abs(buildReport([session]).tasks[0].time.geo - 20000) < 1)
})

test('different instructions under one task id are flagged as a mixed study', () => {
  const a = raw('P1', SITE, [{ id: 'T1', prompt: 'Find boots', start: 0, end: 1000, outcome: 'success' }], [])
  const b = raw('P2', SITE, [{ id: 'T1', prompt: 'Find a jacket', start: 0, end: 1000, outcome: 'success' }], [])
  assert.equal(buildReport([a, b]).mixedStudies, true)
  assert.equal(buildReport([a, { ...a, participant: 'P3', startedAt: 'P3' }]).mixedStudies, false)
})

test('a problem rated 0 ranks below unreviewed ones; ties go to the more common problem', () => {
  const sessions = ['P1', 'P2', 'P3'].map(participant => raw(participant, SITE, oneTask('T2', 'success', 60000), [
    { type: 'navigate', t: 100, taskId: 'T2', page: 'returns' },
    siteClick(5000, 'returns', 'button#help', 'Help', 500, 500),
    ...(participant === 'P1' ? [] : [siteClick(20000, 'returns', 'button#submit-return', 'Submit return')]),
  ]))
  const titles = () => buildReport(sessions).issues.map(issue => issue.title.replace(/No response to a click on “(.*)” on returns/, '$1'))
  // Unreviewed: Help (3 participants) before Submit return (2).
  assert.deepEqual(titles(), ['Help', 'Submit return'])
  // Help confirmed as "not a problem" everywhere drops below the unreviewed one.
  sessions.forEach(session => { session.reviews = { 'T2-dead-click-5000': { status: 'confirmed', severity: 0 } } })
  assert.deepEqual(titles(), ['Submit return', 'Help'])
})

test('exports: one-line Markdown cells, even CSV rows, and no spreadsheet formulas', () => {
  const session = raw('P1', SITE, [{ id: 'T1', prompt: 'Line one\nline | two', start: 0, end: 10000, outcome: 'success' }], [{ type: 'navigate', t: 100, taskId: 'T1', page: 'p' }, { ...siteClick(500, 'p', 'button', '=HYPERLINK("x")'), taskId: 'T1' }])
  const report = buildReport([session])
  const markdown = reportMarkdown(report)
  assert.ok(markdown.includes('| T1: Line one line / two |'))
  assert.match(markdown, /^1 participant: P1\./m)
  // Fields per row, honouring quoted cells.
  const fields = row => { let count = 1; let quoted = false; for (const char of row) { if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) count += 1 } return count }
  const rows = reportCsv(report).split('\n').map(fields)
  assert.ok(rows.every(count => count === 11), `ragged rows: ${rows}`)
  // Labels from the tested site end up inside sentences; a crafted file can
  // still put a formula at the start of a cell, such as a task id.
  const crafted = reportCsv(buildReport([{ ...session, tasks: session.tasks.map(task => ({ ...task, id: '=SUM(A1)' })), events: [] }]))
  assert.ok(!/(^|,)"?[=+\-@]/m.test(crafted), crafted)
  assert.match(crafted, /'=SUM\(A1\)/)
})

test('t critical values continue past 30 degrees of freedom, and equal values give no interval', () => {
  assert.equal(tCritical(40), 2.021)
  assert.equal(tCritical(120), 1.98)
  assert.ok(tCritical(31) < 2.042 && tCritical(31) > 2.021)
  assert.ok(tCritical(10000) > 1.959 && tCritical(10000) < 1.962)
  const equal = meanInterval([7, 7, 7], { min: 1, max: 7 })
  assert.equal(equal.low, null)
  assert.equal(equal.noSpread, true)
  assert.equal(timeInterval([30000, 30000]).noSpread, true)
})

test('questionnaires answered in more than one language are flagged; unknown languages are not', () => {
  const answered = (participant, questionnaireLangs) => raw(participant, SITE, oneTask('T1', 'success', 1000, { seq: 6 }), [], questionnaireLangs ? { questionnaireLangs } : {})
  const mixed = buildReport([answered('P1', ['en']), answered('P2', ['zh'])])
  assert.deepEqual(mixed.languages, ['en', 'zh'])
  assert.equal(mixed.mixedLanguages, true)
  assert.match(reportMarkdown(mixed), /^> The questionnaires were answered in more than one language \(English, 中文\)\./m)
  assert.match(reportMarkdown(mixed, 'zh'), /^> 问卷以不止一种语言作答（English、中文）。/m)
  // A session from before languages were recorded counts as unknown, not as another language.
  const single = buildReport([answered('P1', ['zh']), answered('P2', null)])
  assert.deepEqual(single.languages, ['zh'])
  assert.equal(single.mixedLanguages, false)
  assert.doesNotMatch(reportMarkdown(single), /more than one language/)
})

test('the Markdown export and problem titles follow the reader\'s language; the CSV stays English', () => {
  const session = raw('P1', SITE, oneTask('T2', 'success', 60000), [{ type: 'navigate', t: 100, taskId: 'T2', page: 'returns' }, siteClick(5000, 'returns', 'button#submit-return', 'Submit return')])
  const report = buildReport([session])
  const [issue] = report.issues
  assert.equal(issueTitle(issue), 'No response to a click on “Submit return” on returns')
  assert.equal(issueTitle(issue, 'zh'), '在 returns 页面，对“Submit return”的点击无响应')
  const markdown = reportMarkdown(report, 'zh')
  assert.match(markdown, /^# Returns flow：可用性测试报告$/m)
  assert.match(markdown, /^1位参与者：P1。$/m)
  assert.ok(markdown.includes('| T2 | 在 returns 页面，对“Submit return”的点击无响应 | 1/1 |'))
  assert.doesNotMatch(markdown, /usability test report|Participants affected/)
  assert.equal(reportMarkdown(report, 'en'), reportMarkdown(report))
  assert.match(reportCsv(report), /^problem,T2,No response to a click on “Submit return” on returns,/m)
  // The evidence for a signal, as the review screen lists it.
  const signal = { kind: 'dead-click', count: 2, detail: { label: 'Submit return' } }
  assert.equal(describeSignal(signal), 'No response to a click ×2 on “Submit return”')
  assert.equal(describeSignal(signal, 'zh'), '点击“Submit return”无响应 ×2')
  assert.equal(describeSignal({ kind: 'idle', count: 1, detail: { seconds: 12 } }, 'zh'), '停顿12秒，没有任何输入')
  // A study with no title gets a stand-in in the reader's language.
  const untitled = buildReport([{ ...session, study: { id: 'x' } }])
  assert.equal(reportTitle(untitled), 'Study')
  assert.equal(reportTitle(untitled, 'zh'), '研究')
})
