import assert from 'node:assert/strict'
import test from 'node:test'
import { susGrade, susScore } from '../src/research/questionnaire.js'
import { completion, meanInterval, tCritical, timeInterval } from '../src/research/stats.js'
import { buildReport, reportCsv, reportMarkdown } from '../src/research/studyReport.js'

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
  assert.equal(problem.title, 'No response to a click on “Submit return”')
  assert.equal(problem.participants, 2)
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
  assert.match(reportCsv(report), /^section,task,item,value,low,high,n,confirmed,severity\n/)
})
