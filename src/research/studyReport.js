import { describeSignal, detectSignals, findCandidates, STRONG } from './signals.js'
import { completion, meanInterval, timeInterval } from './stats.js'
import { isSeq, susGrade } from './questionnaire.js'

// Combines several participants' session files into one study report: per
// task completion, time and ease, the SUS score, and the problems ranked by
// how severe the researcher rated them and how many participants hit them.

const COMPLETED = ['success', 'self-reported']
const SEVERITY = ['not a problem', 'cosmetic', 'minor', 'major', 'catastrophe']

// The signal a moment was opened by (its id is `${taskId}-${kind}-${start}`).
const anchorOf = candidate => candidate.signals.find(signal => `${candidate.taskId}-${signal.kind}-${signal.start}` === candidate.id) || candidate.signals[0]

// A Figma node id in a click target ('figma:55:9' -> '55:9').
const figmaNode = selector => (selector?.startsWith('figma:') ? selector.slice(6) : null)

// A name for a problem that stays the same across participants: what kind of
// moment it was and where (page and control), without counts or times. A
// control is named by its label, else its area, else its selector, so two
// unlabeled controls never merge into one problem.
function problemOf(signal) {
  const detail = signal.detail || {}
  const node = figmaNode(detail.selector)
  const control = detail.label || detail.aoi || detail.selector || ''
  const where = detail.label ? ` on “${detail.label}”`
    : detail.aoi ? ` in the ${detail.aoi} area`
      : node ? ` on layer ${node}`
        : detail.selector ? ` on an unlabeled ${detail.selector.split(/[#.]/)[0]}`
          : ''
  const screen = detail.page ? (node ? ` in frame ${detail.page}` : ` on ${detail.page}`) : ''
  const title = {
    'dead-click': `No response to a click${where}${screen}`,
    'rage-click': `Rapid repeated clicks${where}${screen}`,
    'page-loop': `Kept returning to ${detail.page}`,
    timeout: 'Ran out of time',
    idle: 'Long pause with no input',
    'visual-search': 'Searched the screen without clicking',
  }[signal.kind] || describeSignal(signal)
  const place = ['dead-click', 'rage-click'].includes(signal.kind) ? `${detail.page ?? ''}|${control}` : detail.page ?? ''
  return { key: `${signal.kind}|${place}`, kind: signal.kind, title }
}

// Every problem a moment shows: its opening signal and each strong signal in
// it, once each. Counting only the opener would undercount a problem that
// happened to fall inside another one's moment.
function problemsIn(candidate) {
  const found = new Map()
  ;[anchorOf(candidate), ...candidate.signals.filter(signal => signal.strength === STRONG)].forEach(signal => {
    const problem = problemOf(signal)
    if (!found.has(problem.key)) found.set(problem.key, problem)
  })
  return [...found.values()]
}

// A Figma session whose embed sent no events: goal frames could not be seen,
// so its "stopped before the goal" outcomes say nothing about the design.
export const figmaSilent = session => session.study?.kind === 'figma' && !session.quality?.figmaEvents

// The same participant session loaded twice: keep the copy with more
// reviews, so a file exported from the review screen replaces its raw copy.
export const sessionKey = session => `${session.participant}|${session.startedAt}`
export const reviewCount = session => Object.values(session.reviews || {}).filter(review => ['confirmed', 'rejected'].includes(review?.status)).length

// Observer notes (moderated sessions) that describe a problem, grouped across
// participants: by tag when the observer tagged the note (#tag), else by the
// note's text. Quotes and plain notes on the same task and tag are kept as
// evidence.
const PROBLEM_NOTES = ['problem', 'error', 'assist']
const normal = text => text.toLowerCase().replace(/\s+/g, ' ').trim()
function observationsOf(sessions) {
  const groups = new Map()
  sessions.forEach(session => (session.notes || []).forEach(note => {
    const keys = note.tags?.length ? note.tags.map(tag => `#${normal(tag)}`) : [normal(note.text)]
    keys.forEach(label => {
      const key = `${note.taskId || ''}|${label}`
      const group = groups.get(key) || { taskId: note.taskId || null, label: label.startsWith('#') ? label : note.text.trim(), tagged: label.startsWith('#'), participants: new Set(), kinds: {}, evidence: [] }
      if (PROBLEM_NOTES.includes(note.kind)) group.participants.add(session.participant)
      group.kinds[note.kind] = (group.kinds[note.kind] || 0) + 1
      if (group.evidence.length < 5) group.evidence.push({ participant: session.participant, kind: note.kind, text: note.text.trim() })
      groups.set(key, group)
    })
  }))
  return [...groups.values()]
    // Only groups with at least one problem, error or assist note.
    .filter(group => group.participants.size)
    .map(({ participants, ...group }) => ({ ...group, participants: participants.size, who: [...participants] }))
    .sort((a, b) => b.participants - a.participants || (a.taskId || '').localeCompare(b.taskId || '') || a.label.localeCompare(b.label))
}

// includePilot: pilot sessions (a researcher's dry runs) are left out unless asked for.
export function buildReport(allSessions, { includePilot = false } = {}) {
  const sessions = includePilot ? allSessions : allSessions.filter(session => !session.pilot)
  const studies = [...new Set(sessions.map(session => session.study?.id))]
  const taskIds = []
  sessions.forEach(session => session.tasks.forEach(task => { if (!taskIds.includes(task.id)) taskIds.push(task.id) }))
  const problems = new Map()

  const tasks = taskIds.map(id => {
    const ended = sessions.map(session => ({ session, task: session.tasks.find(task => task.id === id) })).filter(item => item.task && item.task.end != null)
    // Unverifiable: a Figma goal that could not be seen because the embed sent nothing.
    const unverifiable = ended.filter(item => figmaSilent(item.session) && item.task.outcome === 'unverified')
    const attempts = ended.filter(item => !unverifiable.includes(item))
    const done = attempts.filter(item => COMPLETED.includes(item.task.outcome))
    const outcomes = {}
    ended.forEach(item => { outcomes[item.task.outcome] = (outcomes[item.task.outcome] || 0) + 1 })
    const seq = ended.map(item => item.task.seq).filter(isSeq)
    const prompts = [...new Set(ended.map(item => item.task.prompt).filter(Boolean))]
    return {
      id,
      prompt: prompts[0] || '',
      // Different instructions under one task id: the files may be from
      // different studies or versions, so the numbers may not be comparable.
      promptsDiffer: prompts.length > 1,
      attempts: attempts.length,
      unverifiable: unverifiable.length,
      outcomes,
      completion: completion(done.length, attempts.length),
      // Time on task counts completed attempts only: a skip or timeout is not
      // the time the task takes. A Figma task is timed from when the
      // prototype first answered (ready), so loading time is left out.
      time: timeInterval(done.map(item => item.task.end - (item.task.ready ?? item.task.start))),
      seq: meanInterval(seq, { min: 1, max: 7 }),
      flagged: 0,
    }
  })

  sessions.forEach(session => {
    const candidates = findCandidates(detectSignals(session))
    const reviews = session.reviews || {}
    const flaggedTasks = new Set()
    candidates.forEach(candidate => {
      const review = reviews[candidate.id]
      const rejected = review?.status === 'rejected'
      if (!rejected) flaggedTasks.add(candidate.taskId)
      problemsIn(candidate).forEach(problem => {
        const key = `${candidate.taskId}|${problem.key}`
        const entry = problems.get(key) || { ...problem, taskId: candidate.taskId, affected: new Set(), confirmedBy: new Set(), moments: 0, confirmed: 0, rejected: 0, severities: [] }
        entry.moments += 1
        // A moment the researcher rejected is not evidence of the problem.
        if (rejected) entry.rejected += 1
        else entry.affected.add(session.participant)
        if (review?.status === 'confirmed') {
          entry.confirmed += 1
          entry.confirmedBy.add(session.participant)
          if (review.severity != null) entry.severities.push(review.severity)
        }
        problems.set(key, entry)
      })
    })
    flaggedTasks.forEach(taskId => { const task = tasks.find(item => item.id === taskId); if (task) task.flagged += 1 })
  })

  // Severity 0 ("not a problem") ranks below unreviewed problems.
  const rank = severity => (severity == null ? -1 : severity === 0 ? -2 : severity)
  const issues = [...problems.values()]
    // A problem every review rejected is dropped from the list.
    .filter(entry => entry.affected.size > 0)
    .map(({ affected, confirmedBy, severities, ...entry }) => ({
      ...entry,
      participants: affected.size,
      confirmedParticipants: confirmedBy.size,
      severity: severities.length ? Math.max(...severities) : null,
      open: entry.moments - entry.confirmed - entry.rejected,
    }))
    // Most severe confirmed first, then by how many people hit it.
    .sort((a, b) => rank(b.severity) - rank(a.severity) || b.participants - a.participants || b.confirmedParticipants - a.confirmedParticipants || a.taskId.localeCompare(b.taskId))

  const susScores = sessions.map(session => session.sus?.score).filter(score => typeof score === 'number')
  const sus = meanInterval(susScores, { min: 0, max: 100 })
  // UMUX-Lite is reported on its own scale and as its SUS equivalent.
  const umuxRaw = meanInterval(sessions.map(session => session.umuxLite?.raw).filter(score => typeof score === 'number'), { min: 0, max: 100 })
  const umuxSus = meanInterval(sessions.map(session => session.umuxLite?.sus).filter(score => typeof score === 'number'), { min: 0, max: 100 })
  return {
    participants: sessions.map(session => session.participant),
    pilotsLeftOut: allSessions.length - sessions.length,
    observations: observationsOf(sessions),
    // Every quote, for the report's voice of the participant.
    quotes: sessions.flatMap(session => (session.notes || []).filter(note => note.kind === 'quote').map(note => ({ participant: session.participant, taskId: note.taskId || null, text: note.text.trim(), tags: note.tags || [] }))),
    umuxLite: umuxRaw && { raw: umuxRaw, sus: umuxSus, grade: susGrade(umuxSus.mean) },
    mixedStudies: studies.length > 1 || tasks.some(task => task.promptsDiffer),
    silentFigma: sessions.filter(figmaSilent).map(session => session.participant),
    title: sessions[0]?.study?.title || 'Study',
    tasks,
    sus: sus && { ...sus, grade: susGrade(sus.mean) },
    issues,
  }
}

const percent = value => `${Math.round(value * 100)}%`
const seconds = ms => `${Math.round(ms / 1000)} s`
const fixed = digits => value => value.toFixed(digits)
const range = (item, low, high, format) => (low != null ? ` (95% CI ${format(low)}–${format(high)})` : item?.noSpread ? ' (all values equal, no interval)' : '')
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
// A Markdown table cell: one line, no column breaks.
const cell = text => String(text).replace(/[\r\n]+/g, ' ').replace(/\|/g, '/')

export function reportMarkdown(report) {
  const total = report.participants.length
  const lines = [`# ${cell(report.title)}: usability test report`, '', `${plural(total, 'participant')}: ${report.participants.join(', ')}.`, '']
  if (report.mixedStudies) lines.push('> These files come from more than one study or version (different study ids or task instructions); tasks are matched by id.', '')
  if (report.pilotsLeftOut) lines.push(`> ${plural(report.pilotsLeftOut, 'pilot session')} left out.`, '')
  if (report.silentFigma.length) lines.push(`> The Figma prototype sent no events for ${report.silentFigma.join(', ')}, so their goal frames could not be checked. Those attempts are left out of completion and time and counted as unverifiable.`, '')
  lines.push('## Tasks', '', '| Task | Completion | Time on task (geometric mean) | Ease (SEQ, 1–7) | Participants with flagged moments |', '|---|---|---|---|---|')
  report.tasks.forEach(task => {
    const completionText = task.completion ? `${task.completion.successes}/${task.completion.n}, ${percent(task.completion.rate)}${range(task.completion, task.completion.low, task.completion.high, percent)}` : '–'
    const unverifiable = task.unverifiable ? ` (+${task.unverifiable} unverifiable)` : ''
    lines.push(`| ${cell(`${task.id}: ${task.prompt}`)} | ${completionText}${unverifiable} | ${task.time ? `${seconds(task.time.geo)}${range(task.time, task.time.low, task.time.high, seconds)}` : '–'} | ${task.seq ? `${task.seq.mean.toFixed(1)}${range(task.seq, task.seq.low, task.seq.high, fixed(1))}` : '–'} | ${task.flagged}/${task.attempts + task.unverifiable} |`)
  })
  lines.push('', '## System Usability Scale', '')
  lines.push(report.sus ? `Mean SUS ${report.sus.mean.toFixed(1)}${range(report.sus, report.sus.low, report.sus.high, fixed(1))}, grade ${report.sus.grade} on the Sauro–Lewis curve (68 is average), from ${plural(report.sus.n, 'participant')}.` : 'No participant completed the SUS questionnaire.')
  if (report.umuxLite) lines.push('', `Mean UMUX-Lite ${report.umuxLite.raw.mean.toFixed(1)}${range(report.umuxLite.raw, report.umuxLite.raw.low, report.umuxLite.raw.high, fixed(1))}, SUS equivalent ${report.umuxLite.sus.mean.toFixed(1)} (grade ${report.umuxLite.grade}), from ${plural(report.umuxLite.raw.n, 'participant')}.`)
  if (report.observations.length) {
    lines.push('', '## Observed problems (observer notes)', '', '| Task | Observation | Participants | Notes | Evidence |', '|---|---|---|---|---|')
    report.observations.forEach(group => lines.push(`| ${group.taskId || '–'} | ${cell(group.label)} | ${group.participants}/${total} | ${cell(Object.entries(group.kinds).map(([kind, count]) => `${count} ${kind}`).join(', '))} | ${cell(group.evidence.slice(0, 3).map(item => `${item.participant}: ${item.kind === 'quote' ? `“${item.text}”` : item.text}`).join('; '))} |`))
  }
  if (report.quotes.length) {
    lines.push('', '## What participants said', '')
    report.quotes.forEach(quote => lines.push(`- “${cell(quote.text)}” (${quote.participant}${quote.taskId ? `, ${quote.taskId}` : ''})`))
  }
  lines.push('', '## Problems', '', '| Task | Problem | Participants affected | Confirmed by | Severity (0–4) | Moments not reviewed |', '|---|---|---|---|---|---|')
  report.issues.forEach(issue => lines.push(`| ${issue.taskId} | ${cell(issue.title)} | ${issue.participants}/${total} | ${issue.confirmedParticipants} | ${issue.severity == null ? '–' : `${issue.severity} (${SEVERITY[issue.severity]})`} | ${issue.open} |`))
  if (!report.issues.length) lines.push('| – | Nothing was flagged | | | | |')
  lines.push('', 'Participants affected leaves out moments the researcher rejected. Intervals are 95%: adjusted Wald for completion, t on log times for time on task, t for ratings. With small samples they are wide; read them as ranges, not exact values.')
  return lines.join('\n')
}

// Spreadsheet apps run a cell that starts with = + - @ (or a tab or carriage
// return) as a formula, so text cells starting that way get a leading quote.
const csvText = value => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)
const csvCell = value => {
  const text = typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : csvText(String(value ?? ''))
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
const CSV_HEADER = ['section', 'task', 'item', 'value', 'low', 'high', 'n', 'moments', 'confirmed_participants', 'severity', 'note']
export function reportCsv(report) {
  // value, low and high are the estimate and its 95% interval (low and high
  // empty when there is none). For a problem, value is the number of
  // participants affected and n the number of participants in the report.
  const rows = [CSV_HEADER]
  const interval = item => (item.low == null ? ['', ''] : [item.low, item.high])
  report.tasks.forEach(task => {
    if (task.completion) rows.push(['task', task.id, 'completion rate', task.completion.rate, ...interval(task.completion), task.completion.n, '', '', '', task.unverifiable ? `${task.unverifiable} unverifiable` : ''])
    if (task.time) rows.push(['task', task.id, 'time on task (s, geometric mean)', task.time.geo / 1000, ...interval(task.time).map(value => (value === '' ? '' : value / 1000)), task.time.n, '', '', '', task.time.noSpread ? 'all values equal' : ''])
    if (task.seq) rows.push(['task', task.id, 'SEQ mean', task.seq.mean, ...interval(task.seq), task.seq.n, '', '', '', task.seq.noSpread ? 'all values equal' : ''])
  })
  if (report.sus) rows.push(['sus', '', `SUS mean (grade ${report.sus.grade})`, report.sus.mean, ...interval(report.sus), report.sus.n, '', '', '', report.sus.noSpread ? 'all values equal' : ''])
  if (report.umuxLite) rows.push(['umux-lite', '', `UMUX-Lite mean (SUS equivalent ${Math.round(report.umuxLite.sus.mean * 10) / 10}, grade ${report.umuxLite.grade})`, report.umuxLite.raw.mean, ...interval(report.umuxLite.raw), report.umuxLite.raw.n, '', '', '', ''])
  report.observations.forEach(group => rows.push(['observation', group.taskId || '', group.label, group.participants, '', '', report.participants.length, Object.values(group.kinds).reduce((sum, count) => sum + count, 0), '', '', Object.entries(group.kinds).map(([kind, count]) => `${count} ${kind}`).join('; ')]))
  report.issues.forEach(issue => rows.push(['problem', issue.taskId, issue.title, issue.participants, '', '', report.participants.length, issue.moments, issue.confirmedParticipants, issue.severity ?? '', issue.open ? `${plural(issue.open, 'moment')} not reviewed` : '']))
  return rows.map(row => CSV_HEADER.map((_, index) => csvCell(row[index] ?? '')).join(',')).join('\n')
}
