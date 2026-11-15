import { describeSignal, detectSignals, findCandidates, STRONG } from './signals.js'
import { LANGS, NATIVE, isLang, translate } from '../i18n/index.js'
import { completion, meanInterval, timeInterval } from './stats.js'
import { isSeq, susGrade } from './questionnaire.js'
import { isFinished } from './sessionStatus.js'

// Combines several participants' session files into one study report: per
// task completion, time and ease, the SUS score, and the problems ranked by
// how severe the researcher rated them and how many participants hit them.
// The report holds data; its text (problem titles, the Markdown export) is
// written in the reader's language, English by default. The CSV export stays
// English, so analysis scripts read it the same way in every language.

const COMPLETED = ['success', 'self-reported']
// Every task outcome, in the order the report lists them.
const OUTCOMES = ['success', 'self-reported', 'partial', 'failed', 'unverified', 'skipped', 'timeout']
// The post-test questionnaires a study can ask.
const POSTS = ['sus', 'umux-lite', 'none']

// Task ids in the study's order, T1, T2 … T10 (numbers compare as numbers),
// whatever order a counterbalanced participant ran them in.
const byTaskId = (a, b) => (a || '').localeCompare(b || '', 'en', { numeric: true })

// A mean as the report shows it (one decimal). A grade is read off this
// value, the resolution of the published table, so the grade printed next to
// "51.7" is the one the table gives 51.7.
const shown = value => Number(value.toFixed(1))
const gradeOf = mean => susGrade(shown(mean))

// The signal a moment was opened by (its id is `${taskId}-${kind}-${start}`).
const anchorOf = candidate => candidate.signals.find(signal => `${candidate.taskId}-${signal.kind}-${signal.start}` === candidate.id) || candidate.signals[0]

// A Figma node id in a click target ('figma:55:9' -> '55:9').
const figmaNode = selector => (selector?.startsWith('figma:') ? selector.slice(6) : null)

// A name for a problem that stays the same across participants: what kind of
// moment it was and where (page and control), without counts or times. A
// control is named by its label, else its area, else its selector, so two
// unlabeled controls never merge into one problem.
function problemTitle(signal, lang) {
  const say = (key, vars) => translate(lang, `report.problem.${key}`, vars)
  const detail = signal.detail || {}
  const node = figmaNode(detail.selector)
  const where = detail.label ? say('where.label', { label: detail.label })
    : detail.aoi ? say('where.aoi', { aoi: detail.aoi })
      : node ? say('where.layer', { node })
        : detail.selector ? say('where.unlabeled', { tag: detail.selector.split(/[#.]/)[0] })
          : ''
  const screen = detail.page ? say(node ? 'screen.frame' : 'screen.page', { page: detail.page }) : ''
  switch (signal.kind) {
    case 'dead-click': return say('deadClick', { where, screen })
    case 'rage-click': return say('rageClick', { where, screen })
    case 'page-loop': return say('pageLoop', { page: detail.page })
    case 'timeout': return say('timeout')
    case 'idle': return say('idle')
    case 'visual-search': return say('visualSearch')
    default: return describeSignal(signal, lang)
  }
}

// title is English (the CSV and other English readers use it); titles holds
// it in every language, for issueTitle.
function problemOf(signal) {
  const detail = signal.detail || {}
  const control = detail.label || detail.aoi || detail.selector || ''
  const titles = Object.fromEntries(LANGS.map(lang => [lang, problemTitle(signal, lang)]))
  const place = ['dead-click', 'rage-click'].includes(signal.kind) ? `${detail.page ?? ''}|${control}` : detail.page ?? ''
  return { key: `${signal.kind}|${place}`, kind: signal.kind, title: titles.en, titles }
}

// A problem's title in lang.
export const issueTitle = (issue, lang = 'en') => issue.titles?.[lang] || issue.title

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
// A session with an attempt that stopped before a goal frame it could not see.
const unverifiedIn = session => session.tasks.some(task => task.end != null && task.outcome === 'unverified')

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
    .sort((a, b) => b.participants - a.participants || byTaskId(a.taskId, b.taskId) || a.label.localeCompare(b.label))
}

// Left out unless asked for: pilot sessions (a researcher's dry runs) and
// unfinished sessions (sessionStatus.isFinished: a moderated session that was
// never ended, a participant file whose tasks did not all end). post is the
// study's post-test questionnaire ('sus', 'umux-lite' or 'none') when the
// caller knows it; the session files may name it too.
export function buildReport(allSessions, { includePilot = false, includeUnfinished = false, post = null } = {}) {
  const pilotsIn = includePilot ? allSessions : allSessions.filter(session => !session.pilot)
  const unfinished = pilotsIn.filter(session => !isFinished(session))
  const sessions = includeUnfinished ? pilotsIn : pilotsIn.filter(isFinished)
  const studies = [...new Set(sessions.map(session => session.study?.id))]
  const taskIds = []
  sessions.forEach(session => session.tasks.forEach(task => { if (!taskIds.includes(task.id)) taskIds.push(task.id) }))
  taskIds.sort(byTaskId)
  const problems = new Map()

  const tasks = taskIds.map(id => {
    const ended = sessions.map(session => ({ session, task: session.tasks.find(task => task.id === id) })).filter(item => item.task && item.task.end != null)
    // Unverifiable: a Figma goal that could not be seen because the embed sent nothing.
    const unverifiable = ended.filter(item => figmaSilent(item.session) && item.task.outcome === 'unverified')
    const attempts = ended.filter(item => !unverifiable.includes(item))
    const done = attempts.filter(item => COMPLETED.includes(item.task.outcome))
    // Counted in a Map, so an outcome such as 'toString' in a stored session
    // counts as itself instead of reading Object.prototype.
    const counts = new Map()
    ended.forEach(item => counts.set(item.task.outcome, (counts.get(item.task.outcome) || 0) + 1))
    const outcomes = Object.fromEntries(counts)
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
    // A task counts as flagged only where it ended, as only ended tasks are
    // attempts: an open task (a tab closed mid-task) is in no denominator.
    const ended = new Set(session.tasks.filter(task => task.end != null).map(task => task.id))
    candidates.forEach(candidate => {
      const review = reviews[candidate.id]
      const rejected = review?.status === 'rejected'
      if (!rejected && ended.has(candidate.taskId)) flaggedTasks.add(candidate.taskId)
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
    .sort((a, b) => rank(b.severity) - rank(a.severity) || b.participants - a.participants || b.confirmedParticipants - a.confirmedParticipants || byTaskId(a.taskId, b.taskId))

  const susScores = sessions.map(session => session.sus?.score).filter(score => typeof score === 'number')
  const sus = meanInterval(susScores, { min: 0, max: 100 })
  // UMUX-Lite is reported on its own scale and as its SUS equivalent.
  const umuxRaw = meanInterval(sessions.map(session => session.umuxLite?.raw).filter(score => typeof score === 'number'), { min: 0, max: 100 })
  const umuxSus = meanInterval(sessions.map(session => session.umuxLite?.sus).filter(score => typeof score === 'number'), { min: 0, max: 100 })
  // Language versions of a scale are not interchangeable without validation,
  // so mixing them is flagged. Sessions from before this was recorded count
  // as unknown, not as mixed.
  const languages = [...new Set(sessions.flatMap(session => (Array.isArray(session.questionnaireLangs) ? session.questionnaireLangs.filter(isLang) : [])))].sort()
  const asked = [post, ...allSessions.map(session => session.study?.questionnaire?.post)].find(value => POSTS.includes(value)) || null
  const umuxLite = umuxRaw && { raw: umuxRaw, sus: umuxSus, grade: gradeOf(umuxSus.mean) }
  // Which "nobody answered" line the report shows: the questionnaire the
  // study asked when its answers are missing, 'any' when the study is not
  // known and the files hold no answers, else none. A study that asked
  // UMUX-Lite or nothing never says nobody answered the SUS.
  const noAnswers = (asked === 'sus' && !sus) || (asked === 'umux-lite' && !umuxLite) ? asked : !asked && !sus && !umuxLite ? 'any' : null
  // The study's title: from the files in the report, else from any loaded
  // file (a report of pilots only still has its study).
  const titled = sessions.find(session => session.study?.title) || allSessions.find(session => session.study?.title)
  return {
    participants: sessions.map(session => session.participant),
    languages,
    mixedLanguages: languages.length > 1,
    pilotsLeftOut: allSessions.length - pilotsIn.length,
    // Unfinished sessions among those not left out as pilots, and how many
    // of them are left out.
    unfinished: unfinished.map(session => session.participant),
    unfinishedLeftOut: includeUnfinished ? 0 : unfinished.length,
    post: asked,
    noAnswers,
    observations: observationsOf(sessions),
    // Every quote, for the report's voice of the participant.
    quotes: sessions.flatMap(session => (session.notes || []).filter(note => note.kind === 'quote').map(note => ({ participant: session.participant, taskId: note.taskId || null, text: note.text.trim(), tags: note.tags || [] }))),
    umuxLite,
    mixedStudies: studies.length > 1 || tasks.some(task => task.promptsDiffer),
    // Figma sessions whose embed sent no events. silentFigma: those with
    // attempts left out as unverifiable. figmaNoEvents: the others (a
    // moderated session, where the moderator records every outcome, or one
    // with no goal frames), whose numbers all count but where no clicks or
    // frames were recorded.
    silentFigma: sessions.filter(session => figmaSilent(session) && unverifiedIn(session)).map(session => session.participant),
    figmaNoEvents: sessions.filter(session => figmaSilent(session) && !unverifiedIn(session)).map(session => session.participant),
    // A participant-run session with no events usually means the client ID
    // does not allow this site.
    figmaCheckClientId: sessions.some(session => figmaSilent(session) && !unverifiedIn(session) && session.mode !== 'moderated'),
    title: titled?.study.title || 'Study',
    // False when the files name no study title, so 'Study' above is a stand-in.
    titled: Boolean(titled),
    tasks,
    sus: sus && { ...sus, grade: gradeOf(sus.mean) },
    issues,
  }
}

// The study's title in lang, or a stand-in when the files name none.
export const reportTitle = (report, lang = 'en') => (report.titled === false ? translate(lang, 'report.untitled') : report.title)
// The languages the questionnaires were answered in, each named in itself.
export const languageList = (report, lang = 'en') => report.languages.map(code => NATIVE[code]).join(translate(lang, 'report.listSeparator'))

// A task's outcomes in the report's order, as [outcome, count] pairs.
const outcomeRank = outcome => (OUTCOMES.includes(outcome) ? OUTCOMES.indexOf(outcome) : OUTCOMES.length)
export const outcomeList = task => Object.entries(task.outcomes).sort(([a], [b]) => outcomeRank(a) - outcomeRank(b) || a.localeCompare(b))
// "3 partial success": one outcome's count in lang; an unknown outcome shows its code.
export const outcomeCount = (lang, outcome, count) => translate(lang, `report.outcomes.${OUTCOMES.includes(outcome) ? outcome : 'other'}`, { count, outcome })
// "1 completed · 3 partial success · 1 failed or gave up"
export const outcomeSummary = (task, lang = 'en') => outcomeList(task).map(([outcome, count]) => outcomeCount(lang, outcome, count)).join(' · ')

const percent = value => `${Math.round(value * 100)}%`
const fixed = digits => value => value.toFixed(digits)
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
// A Markdown table cell: one line, no column breaks.
const cell = text => String(text).replace(/[\r\n]+/g, ' ').replace(/\|/g, '/')
const row = cells => `| ${cells.join(' | ')} |`

// The report as Markdown, in lang (English by default). Researcher-written
// text (title, task instructions, notes, quotes) stays as it was typed.
export function reportMarkdown(report, lang = 'en') {
  const t = (key, vars) => translate(lang, `report.${key}`, vars)
  const seconds = ms => t('sec', { sec: Math.round(ms / 1000) })
  const range = (item, low, high, format) => (low != null ? t('md.ci', { low: format(low), high: format(high) }) : item?.noSpread ? t('md.noSpread') : '')
  const total = report.participants.length
  const list = items => items.join(t('listSeparator'))
  const lines = [`# ${cell(t('md.title', { title: reportTitle(report, lang) }))}`, '', t('md.participants', { count: total, list: list(report.participants) }), '']
  if (report.mixedStudies) lines.push(`> ${t('md.mixedStudies')}`, '')
  if (report.pilotsLeftOut) lines.push(`> ${t('md.pilotsLeftOut', { count: report.pilotsLeftOut })}`, '')
  if (report.unfinishedLeftOut) lines.push(`> ${t('md.unfinishedLeftOut', { count: report.unfinishedLeftOut, list: list(report.unfinished) })}`, '')
  if (report.silentFigma.length) lines.push(`> ${t('md.silentFigma', { participants: list(report.silentFigma) })}`, '')
  if (report.figmaNoEvents?.length) lines.push(`> ${t('md.figmaNoEvents', { participants: list(report.figmaNoEvents) })}${report.figmaCheckClientId ? `${lang === 'zh' ? '' : ' '}${t('checkClientId')}` : ''}`, '')
  if (report.mixedLanguages) lines.push(`> ${t('md.mixedLanguages', { languages: languageList(report, lang) })}`, '')
  lines.push(`## ${t('md.tasks')}`, '', row([t('col.task'), t('col.completion'), t('md.col.outcomes'), t('md.col.time'), t('md.col.ease'), t('md.col.flagged')]), '|---|---|---|---|---|---|')
  report.tasks.forEach(task => {
    const completionText = task.completion ? t('md.completion', { successes: task.completion.successes, n: task.completion.n, percent: percent(task.completion.rate), range: range(task.completion, task.completion.low, task.completion.high, percent) }) : '–'
    const unverifiable = task.unverifiable ? t('md.unverifiable', { count: task.unverifiable }) : ''
    lines.push(row([cell(t('md.task', { id: task.id, prompt: task.prompt })), `${completionText}${unverifiable}`, cell(outcomeSummary(task, lang) || '–'), task.time ? `${seconds(task.time.geo)}${range(task.time, task.time.low, task.time.high, seconds)}` : '–', task.seq ? `${task.seq.mean.toFixed(1)}${range(task.seq, task.seq.low, task.seq.high, fixed(1))}` : '–', `${task.flagged}/${task.attempts + task.unverifiable}`]))
  })
  // The post-test questionnaire: the results there are, and a "nobody
  // answered" line only for a questionnaire the study asked (or when the
  // study is not known). A study that asked nothing has no section.
  const post = []
  if (report.sus) post.push(t('md.susMean', { mean: report.sus.mean.toFixed(1), range: range(report.sus, report.sus.low, report.sus.high, fixed(1)), grade: report.sus.grade, n: report.sus.n }))
  if (report.umuxLite) post.push(t('md.umux', { mean: report.umuxLite.raw.mean.toFixed(1), range: range(report.umuxLite.raw, report.umuxLite.raw.low, report.umuxLite.raw.high, fixed(1)), sus: report.umuxLite.sus.mean.toFixed(1), grade: report.umuxLite.grade, n: report.umuxLite.raw.n }))
  if (report.noAnswers) post.push(t(`md.noAnswers.${report.noAnswers}`))
  if (post.length) lines.push('', `## ${t('md.postTest')}`, '', post.join('\n\n'))
  const noteCounts = (kinds, separator) => Object.entries(kinds).map(([kind, count]) => noteCount(lang, kind, count)).join(separator)
  if (report.observations.length) {
    lines.push('', `## ${t('md.observed')}`, '', row([t('col.task'), t('md.col.observation'), t('md.col.participants'), t('md.col.notes'), t('md.col.evidence')]), '|---|---|---|---|---|')
    report.observations.forEach(group => lines.push(row([group.taskId || '–', cell(group.label), `${group.participants}/${total}`, cell(noteCounts(group.kinds, t('listSeparator'))), cell(group.evidence.slice(0, 3).map(item => t('evidence', { participant: item.participant, text: item.kind === 'quote' ? `“${item.text}”` : item.text })).join(t('md.evidenceSeparator')))])))
  }
  if (report.quotes.length) {
    lines.push('', `## ${t('md.quotes')}`, '')
    report.quotes.forEach(quote => lines.push(t(quote.taskId ? 'md.quoteTask' : 'md.quote', { text: cell(quote.text), participant: quote.participant, task: quote.taskId })))
  }
  lines.push('', `## ${t('md.problems')}`, '', row([t('col.task'), t('md.col.problem'), t('md.col.affected'), t('md.col.confirmedBy'), t('md.col.severity'), t('md.col.open')]), '|---|---|---|---|---|---|')
  report.issues.forEach(issue => lines.push(row([issue.taskId, cell(issueTitle(issue, lang)), `${issue.participants}/${total}`, issue.confirmedParticipants, issue.severity == null ? '–' : t('md.severity', { level: issue.severity, label: t(`severity.${issue.severity}`) }), issue.open])))
  if (!report.issues.length) lines.push(`| – | ${t('md.nothingFlagged')} | | | | |`)
  lines.push('', t('md.footnote'))
  return lines.join('\n')
}

// "3 problem": a count of observer notes of one kind, in lang.
const NOTE_KINDS = ['note', 'problem', 'quote', 'assist', 'error']
export const noteCount = (lang, kind, count) => translate(lang, `report.noteCount.${NOTE_KINDS.includes(kind) ? kind : 'other'}`, { count, kind })

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
    // The completion row is written whenever an attempt ended, so a task
    // whose attempts were all unverifiable still shows (value empty, n 0).
    // One row per outcome follows: value is its count, n the ended attempts.
    const ended = task.attempts + task.unverifiable
    if (ended) rows.push(['task', task.id, 'completion rate', task.completion ? task.completion.rate : '', ...(task.completion ? interval(task.completion) : ['', '']), task.completion ? task.completion.n : 0, '', '', '', task.unverifiable ? `${task.unverifiable} unverifiable` : ''])
    outcomeList(task).forEach(([outcome, count]) => rows.push(['task', task.id, `outcome: ${outcome}`, count, '', '', ended, '', '', '', '']))
    if (task.time) rows.push(['task', task.id, 'time on task (s, geometric mean)', task.time.geo / 1000, ...interval(task.time).map(value => (value === '' ? '' : value / 1000)), task.time.n, '', '', '', task.time.noSpread ? 'all values equal' : ''])
    if (task.seq) rows.push(['task', task.id, 'SEQ mean', task.seq.mean, ...interval(task.seq), task.seq.n, '', '', '', task.seq.noSpread ? 'all values equal' : ''])
  })
  if (report.sus) rows.push(['sus', '', `SUS mean (grade ${report.sus.grade})`, report.sus.mean, ...interval(report.sus), report.sus.n, '', '', '', report.sus.noSpread ? 'all values equal' : ''])
  if (report.umuxLite) rows.push(['umux-lite', '', `UMUX-Lite mean (SUS equivalent ${Math.round(report.umuxLite.sus.mean * 10) / 10}, grade ${report.umuxLite.grade})`, report.umuxLite.raw.mean, ...interval(report.umuxLite.raw), report.umuxLite.raw.n, '', '', '', ''])
  report.observations.forEach(group => rows.push(['observation', group.taskId || '', group.label, group.participants, '', '', report.participants.length, Object.values(group.kinds).reduce((sum, count) => sum + count, 0), '', '', Object.entries(group.kinds).map(([kind, count]) => `${count} ${kind}`).join('; ')]))
  report.issues.forEach(issue => rows.push(['problem', issue.taskId, issue.title, issue.participants, '', '', report.participants.length, issue.moments, issue.confirmedParticipants, issue.severity ?? '', issue.open ? `${plural(issue.open, 'moment')} not reviewed` : '']))
  return rows.map(row => CSV_HEADER.map((_, index) => csvCell(row[index] ?? '')).join(',')).join('\n')
}
