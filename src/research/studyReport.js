import { describeSignal, detectSignals, findCandidates } from './signals.js'
import { completion, meanInterval, timeInterval } from './stats.js'
import { isSeq, susGrade } from './questionnaire.js'

// Combines several participants' session files into one study report: per
// task completion, time and ease, the SUS score, and the problems ranked by
// how many participants hit them and how severe the researcher rated them.

const COMPLETED = ['success', 'self-reported']
const SEVERITY = ['not a problem', 'cosmetic', 'minor', 'major', 'catastrophe']

// The signal a moment was opened by (its id is `${taskId}-${kind}-${start}`).
const anchorOf = candidate => candidate.signals.find(signal => `${candidate.taskId}-${signal.kind}-${signal.start}` === candidate.id) || candidate.signals[0]

// A name for a problem that stays the same across participants: what kind of
// moment it was and where, without counts or times.
function problemOf(signal) {
  const place = signal.detail?.label || signal.detail?.aoi || signal.detail?.page || ''
  const where = signal.detail?.label ? ` on “${signal.detail.label}”` : signal.detail?.aoi ? ` in the ${signal.detail.aoi} area` : ''
  const title = {
    'dead-click': `No response to a click${where}`,
    'rage-click': `Rapid repeated clicks${where}`,
    'page-loop': `Kept returning to ${signal.detail?.page}`,
    timeout: 'Ran out of time',
    idle: 'Long pause with no input',
    'visual-search': 'Searched the screen without clicking',
  }[signal.kind] || describeSignal(signal)
  return { key: `${signal.kind}|${place}`, kind: signal.kind, title }
}

export function buildReport(sessions) {
  const studies = [...new Set(sessions.map(session => session.study?.id))]
  const taskIds = []
  sessions.forEach(session => session.tasks.forEach(task => { if (!taskIds.includes(task.id)) taskIds.push(task.id) }))
  const problems = new Map()

  const tasks = taskIds.map(id => {
    const attempts = sessions.map(session => ({ session, task: session.tasks.find(task => task.id === id) })).filter(item => item.task && item.task.end != null)
    const done = attempts.filter(item => COMPLETED.includes(item.task.outcome))
    const outcomes = {}
    attempts.forEach(item => { outcomes[item.task.outcome] = (outcomes[item.task.outcome] || 0) + 1 })
    const seq = attempts.map(item => item.task.seq).filter(isSeq)
    return {
      id,
      prompt: attempts.find(item => item.task.prompt)?.task.prompt || '',
      attempts: attempts.length,
      outcomes,
      completion: completion(done.length, attempts.length),
      // Time on task counts completed attempts only: a skip or timeout is not
      // the time the task takes.
      time: timeInterval(done.map(item => item.task.end - item.task.start)),
      seq: meanInterval(seq, { min: 1, max: 7 }),
      flagged: 0,
    }
  })

  sessions.forEach(session => {
    const candidates = findCandidates(detectSignals(session))
    const reviews = session.reviews || {}
    const seen = new Set()
    candidates.forEach(candidate => {
      const task = tasks.find(item => item.id === candidate.taskId)
      if (task && !seen.has(candidate.taskId)) { task.flagged += 1; seen.add(candidate.taskId) }
      const problem = problemOf(anchorOf(candidate))
      const key = `${candidate.taskId}|${problem.key}`
      const entry = problems.get(key) || { ...problem, taskId: candidate.taskId, participants: new Set(), moments: 0, confirmed: 0, rejected: 0, severities: [] }
      const review = reviews[candidate.id]
      entry.participants.add(session.participant)
      entry.moments += 1
      if (review?.status === 'confirmed') {
        entry.confirmed += 1
        if (review.severity != null) entry.severities.push(review.severity)
      } else if (review?.status === 'rejected') entry.rejected += 1
      problems.set(key, entry)
    })
  })

  const issues = [...problems.values()]
    // A problem every review rejected is dropped from the list.
    .filter(entry => entry.rejected < entry.moments)
    .map(({ participants, severities, ...entry }) => ({
      ...entry,
      participants: participants.size,
      severity: severities.length ? Math.max(...severities) : null,
      open: entry.moments - entry.confirmed - entry.rejected,
    }))
    // Confirmed and severe first, then by how many people hit it.
    .sort((a, b) => (b.severity ?? -1) - (a.severity ?? -1) || b.confirmed - a.confirmed || b.participants - a.participants || a.taskId.localeCompare(b.taskId))

  const susScores = sessions.map(session => session.sus?.score).filter(score => typeof score === 'number')
  const sus = meanInterval(susScores, { min: 0, max: 100 })
  return {
    participants: sessions.map(session => session.participant),
    mixedStudies: studies.length > 1,
    title: sessions[0]?.study?.title || 'Study',
    tasks,
    sus: sus && { ...sus, grade: susGrade(sus.mean) },
    issues,
  }
}

const percent = value => `${Math.round(value * 100)}%`
const seconds = ms => `${Math.round(ms / 1000)} s`
const range = (low, high, format) => (low == null ? '' : ` (95% CI ${format(low)}–${format(high)})`)
const fixed = digits => value => value.toFixed(digits)

export function reportMarkdown(report) {
  const lines = [`# ${report.title}: usability test report`, '', `${report.participants.length} participants: ${report.participants.join(', ')}.`, '']
  if (report.mixedStudies) lines.push('> These files come from more than one study; tasks are matched by id.', '')
  lines.push('## Tasks', '', '| Task | Completion | Time on task (geometric mean) | Ease (SEQ, 1–7) | Participants with flagged moments |', '|---|---|---|---|---|')
  report.tasks.forEach(task => {
    lines.push(`| ${task.id}: ${task.prompt.replace(/\|/g, '/')} | ${task.completion ? `${task.completion.successes}/${task.completion.n}, ${percent(task.completion.rate)}${range(task.completion.low, task.completion.high, percent)}` : '–'} | ${task.time ? `${seconds(task.time.geo)}${range(task.time.low, task.time.high, seconds)}` : '–'} | ${task.seq ? `${task.seq.mean.toFixed(1)}${range(task.seq.low, task.seq.high, fixed(1))}` : '–'} | ${task.flagged}/${task.attempts} |`)
  })
  lines.push('', '## System Usability Scale', '')
  lines.push(report.sus ? `Mean SUS ${report.sus.mean.toFixed(1)}${range(report.sus.low, report.sus.high, fixed(1))}, grade ${report.sus.grade} on the Sauro–Lewis curve (68 is average), from ${report.sus.n} ${report.sus.n === 1 ? 'participant' : 'participants'}.` : 'No participant completed the SUS questionnaire.')
  lines.push('', '## Problems', '', '| Task | Problem | Participants | Confirmed | Severity (0–4) | Unreviewed |', '|---|---|---|---|---|---|')
  report.issues.forEach(issue => lines.push(`| ${issue.taskId} | ${issue.title.replace(/\|/g, '/')} | ${issue.participants}/${report.participants.length} | ${issue.confirmed} | ${issue.severity == null ? '–' : `${issue.severity} (${SEVERITY[issue.severity]})`} | ${issue.open} |`))
  if (!report.issues.length) lines.push('| – | Nothing was flagged | | | | |')
  lines.push('', 'Intervals are 95%: adjusted Wald for completion, t on log times for time on task, t for ratings. With small samples they are wide; read them as ranges, not exact values.')
  return lines.join('\n')
}

const csvCell = value => (/[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value))
export function reportCsv(report) {
  // value, low and high are the estimate and its 95% interval; for a problem,
  // value is the number of participants who hit it.
  const rows = [['section', 'task', 'item', 'value', 'low', 'high', 'n', 'confirmed', 'severity']]
  report.tasks.forEach(task => {
    if (task.completion) rows.push(['task', task.id, 'completion rate', task.completion.rate, task.completion.low, task.completion.high, task.completion.n])
    if (task.time) rows.push(['task', task.id, 'time on task (s, geometric mean)', task.time.geo / 1000, task.time.low == null ? '' : task.time.low / 1000, task.time.high == null ? '' : task.time.high / 1000, task.time.n])
    if (task.seq) rows.push(['task', task.id, 'SEQ mean', task.seq.mean, task.seq.low ?? '', task.seq.high ?? '', task.seq.n])
  })
  if (report.sus) rows.push(['sus', '', `SUS mean (grade ${report.sus.grade})`, report.sus.mean, report.sus.low ?? '', report.sus.high ?? '', report.sus.n])
  report.issues.forEach(issue => rows.push(['problem', issue.taskId, issue.title, issue.participants, '', '', issue.moments, issue.confirmed, issue.severity ?? '']))
  return rows.map(row => row.map(value => csvCell(typeof value === 'number' ? Math.round(value * 1000) / 1000 : value)).join(',')).join('\n')
}
