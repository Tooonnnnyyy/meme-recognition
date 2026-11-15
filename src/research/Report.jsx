import React, { useMemo, useRef, useState } from 'react'
import { ViewToggles } from '../ThemeToggle'
import { ResearcherNav } from './ResearcherNav'
import { readSession } from './Review'
import { isFinished } from './sessionStatus'
import { buildReport, issueTitle, languageList, noteCount, outcomeSummary, reportCsv, reportMarkdown, reportTitle, reviewCount, sessionKey } from './studyReport'
import { errorText } from '../i18n/index.js'
import { useT } from '../i18n/react.jsx'

// Researcher screen (research.html#report): load several participants' files
// and see the study as a whole. Files are read in this browser only.

const percent = value => `${Math.round(value * 100)}%`
// Rounded to whole seconds first, so 119.6 s reads 2 min 0 s, not 1 min 60 s.
const secondsIn = t => ms => {
  const whole = Math.round(ms / 1000)
  return whole >= 60 ? t('report.minSec', { min: Math.floor(whole / 60), sec: whole % 60 }) : t('report.sec', { sec: whole })
}

const save = (text, name, type) => {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

// A 0–1 bar with its interval drawn as a whisker.
function Bar({ value, low, high, label }) {
  return <div className="bar" role="img" aria-label={label}>
    <i className="bar-fill" style={{ width: `${value * 100}%` }} />
    {low != null && <i className="bar-ci" style={{ left: `${low * 100}%`, width: `${(high - low) * 100}%` }} />}
  </div>
}

const interval = (t, item, format) => (item.low != null ? t('report.ci', { low: format(item.low), high: format(item.high) }) : item.noSpread ? t('report.noSpread') : t('report.oneValue'))

// What a report of no participants says: why every loaded session was left out.
const onlyLeftOut = report => (report.pilotsLeftOut && report.unfinishedLeftOut ? 'report.onlyLeftOut' : report.pilotsLeftOut ? 'report.onlyPilots' : report.unfinishedLeftOut ? 'report.onlyUnfinished' : 'report.onlyLeftOut')

// In the researcher workspace (lab.html) the report opens on a study's saved
// sessions (initialSessions) and lab is set: there is no file picker, since
// files added here would not be saved (results files go in on Run), and
// reviews are saved as they are made. header(actions) draws the workspace's
// header around the report's actions, empty is what shows when the study has
// no sessions, and post is the study's post-test questionnaire. On
// research.html the report has its own header with the researcher
// navigation (nav) and a file picker.
export function Report({ initialSessions = [], nav = <ResearcherNav current="#report" />, title, header, empty, post = null, lab = false, hidden = false }) {
  const t = useT()
  const seconds = secondsIn(t)
  const [sessions, setSessions] = useState(initialSessions)
  const [includePilot, setIncludePilot] = useState(false)
  const [includeUnfinished, setIncludeUnfinished] = useState(false)
  const [errors, setErrors] = useState([])
  const [notices, setNotices] = useState([])
  const inputRef = useRef(null)
  const report = useMemo(() => (sessions.length ? buildReport(sessions, { includePilot, includeUnfinished, post }) : null), [sessions, includePilot, includeUnfinished, post])
  const pilots = sessions.filter(session => session.pilot).length
  const counted = report ? report.participants.length : 0
  const few = Boolean(counted) && counted < 5

  const load = async files => {
    const problems = []
    const read = await Promise.all([...files].map(async file => {
      try { return readSession(await file.text()) } catch (problem) {
        problems.push({ file: file.name, problem })
        return null
      }
    }))
    setErrors(problems)
    // The same session loaded twice counts once. The copy with more reviews
    // wins, so a file exported from the review screen replaces its raw copy.
    const replaced = []
    setSessions(current => {
      const next = [...current]
      read.filter(Boolean).forEach(session => {
        const at = next.findIndex(item => sessionKey(item) === sessionKey(session))
        if (at === -1) next.push(session)
        else if (reviewCount(session) > reviewCount(next[at])) {
          next[at] = session
          replaced.push({ key: 'report.replaced', vars: { participant: session.participant, count: reviewCount(session) } })
        } else replaced.push({ key: 'report.duplicate', vars: { participant: session.participant } })
      })
      return next
    })
    setNotices(replaced)
  }

  const picker = !lab && <label className="btn ghost file-button" htmlFor="report-files">{sessions.length ? t('report.addFiles') : t('report.chooseFiles')}<input ref={inputRef} id="report-files" type="file" multiple accept="application/json,.json" onChange={event => { const files = [...event.target.files]; event.target.value = ''; if (files.length) load(files) }} /></label>
  const slug = report?.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'study'
  // Load problems and notices are kept as data, so they follow a language
  // switch. A file is not JSON, or readSession refused it (its own message),
  // or something else failed (the browser's English message, or a plain
  // "could not be read" in other languages).
  const why = problem => (problem instanceof SyntaxError ? t('report.notJson') : problem?.key || t.lang === 'en' ? errorText(t, problem) : t('report.unreadable'))
  const noticeLines = notices.map(({ key, vars }) => t(key, vars))
  const errorLines = errors.map(({ file, problem }) => t('report.fileError', { file, error: why(problem) }))
  // A small label over each value, shown when the table is narrow and its
  // header row is visually hidden (screen readers keep the column headers).
  const cellLabel = key => <small className="cell-label" aria-hidden="true">{t(key)}</small>

  const actions = counted > 0 && <><button className="btn secondary" onClick={() => save(reportMarkdown(report, t.lang), `${slug}-report.md`, 'text/markdown')}>{t('report.exportMd')}</button><button className="btn ghost" onClick={() => save(reportCsv(report), `${slug}-report.csv`, 'text/csv')}>{t('report.exportCsv')}</button></>
  const list = items => items.join(t('report.listSeparator'))
  // A loaded pilot or unfinished session says so on its chip, and whether it
  // is left out of the numbers.
  const chipTag = session => {
    const kind = [session.pilot && t('report.chipPilot'), !isFinished(session) && t('report.chipUnfinished')].filter(Boolean).join(' · ')
    const leftOut = (session.pilot && !includePilot) || (!isFinished(session) && !includeUnfinished)
    return kind ? { text: leftOut ? t('report.chipLeftOut', { kind }) : kind, leftOut } : null
  }

  return <div className="screen">
    {header ? header(actions) : <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>{report ? t('report.subtitleWith', { title: title || reportTitle(report, t.lang) }) : t('report.subtitle')}</small></div></div>
      <div className="actions">{nav}{picker}{actions}{hidden ? null : <ViewToggles />}</div></header>}
    {!report && (empty || <main className="center-note"><span className="kicker">{t('report.subtitle')}</span><h2>{t('report.empty.title')}</h2><p className="muted">{t('report.empty.lede')}</p>{picker}{errorLines.map((error, index) => <p key={index} className="warning" role="alert">{error}</p>)}</main>)}
    {report && <main className="report">
      <h1 className="report-title">{title || reportTitle(report, t.lang)}</h1>
      {errorLines.map((error, index) => <p key={index} className="warning banner" role="alert">{error}</p>)}
      {noticeLines.map((notice, index) => <p key={index} className="muted small banner-note" role="status">{notice}</p>)}
      {report.mixedStudies && <p className="warning banner">{t('report.mixedStudies')}</p>}
      {report.silentFigma.length > 0 && <p className="warning banner">{t('report.silentFigma', { participants: list(report.silentFigma) })}</p>}
      {report.figmaNoEvents.length > 0 && <p className="muted small banner-note">{t('report.figmaNoEvents', { participants: list(report.figmaNoEvents) })}{report.figmaCheckClientId ? `${t.lang === 'zh' ? '' : ' '}${t('report.checkClientId')}` : ''}</p>}
      {report.mixedLanguages && <p className="warning banner">{t('report.mixedLanguages', { languages: languageList(report, t.lang) })}</p>}
      <section className="report-files">
        <h2 className="kicker">{t('report.participants', { count: counted })}</h2>
        {sessions.map(session => {
          const tag = chipTag(session)
          return <span key={`${session.participant}|${session.startedAt}`} className={`chip${tag?.leftOut ? ' left-out' : ''}`}>{session.participant}{tag && <small className="chip-tag">{tag.text}</small>}{/* In the Lab the sessions are the study's, deleted on Results. */}{!lab && <button className="chip-x" aria-label={t('report.remove', { participant: session.participant })} onClick={() => setSessions(current => current.filter(item => item !== session))}>×</button>}</span>
        })}
        {pilots > 0 && <label className="check inline-check" htmlFor="include-pilot"><input id="include-pilot" type="checkbox" checked={includePilot} onChange={event => setIncludePilot(event.target.checked)} />{t('report.includePilot', { count: pilots })}</label>}
        {report.unfinished.length > 0 && <label className="check inline-check" htmlFor="include-unfinished"><input id="include-unfinished" type="checkbox" checked={includeUnfinished} onChange={event => setIncludeUnfinished(event.target.checked)} />{t('report.includeUnfinished', { count: report.unfinished.length })}</label>}
        {few && <span className="muted small">{t('report.fewParticipants')}</span>}
        {Boolean(counted) && report.unfinishedLeftOut > 0 && <span className="muted small files-note">{t('report.unfinishedLeftOut', { count: report.unfinishedLeftOut, list: list(report.unfinished) })}</span>}
      </section>

      {counted === 0 && <section className="panel report-panel"><p className="muted">{t(onlyLeftOut(report))}</p></section>}

      {counted > 0 && <>
        <section className="report-cards">
          {report.sus && <div className="panel stat"><h2 className="kicker">SUS</h2><b className="big">{report.sus.mean.toFixed(1)}</b><span className="chip live">{t('report.grade', { grade: report.sus.grade })}</span><span className="muted small">{t('report.susMeta', { interval: interval(t, report.sus, value => value.toFixed(1)), n: report.sus.n })}</span><Bar value={report.sus.mean / 100} low={report.sus.low == null ? null : report.sus.low / 100} high={report.sus.high == null ? null : report.sus.high / 100} label={t('report.susBar', { score: report.sus.mean.toFixed(1) })} /></div>}
          {report.umuxLite && <div className="panel stat"><h2 className="kicker">UMUX-Lite</h2><b className="big">{report.umuxLite.raw.mean.toFixed(1)}</b><span className="chip live">{t('report.umuxChip', { sus: report.umuxLite.sus.mean.toFixed(1), grade: report.umuxLite.grade })}</span><span className="muted small">{t('report.umuxMeta', { interval: interval(t, report.umuxLite.raw, value => value.toFixed(1)), n: report.umuxLite.raw.n })}</span><Bar value={report.umuxLite.raw.mean / 100} low={report.umuxLite.raw.low == null ? null : report.umuxLite.raw.low / 100} high={report.umuxLite.raw.high == null ? null : report.umuxLite.raw.high / 100} label={t('report.umuxBar', { score: report.umuxLite.raw.mean.toFixed(1) })} /></div>}
          {report.noAnswers && <div className="panel stat"><h2 className="kicker">{report.noAnswers === 'sus' ? 'SUS' : report.noAnswers === 'umux-lite' ? 'UMUX-Lite' : t('report.postKicker')}</h2><span className="muted">{t(`report.noAnswers.${report.noAnswers}`)}</span></div>}
          <div className="panel stat"><h2 className="kicker">{t('report.problemsKicker')}</h2><b className="big">{report.issues.length + report.observations.length}</b><span className="muted small">{report.observations.length > 0 && t('report.observedByYou', { count: report.observations.length })}{t('report.detectedSummary', { count: report.issues.length, confirmed: report.issues.filter(issue => issue.confirmed).length, open: report.issues.filter(issue => !issue.confirmed).length })}</span></div>
        </section>

        <section className="panel report-panel">
          <h2 className="kicker">{t('report.tasksKicker')}</h2>
          <div className="report-table" role="table" aria-label={t('report.taskMetrics')}>
            <div className="rt-row head" role="row"><span role="columnheader">{t('report.col.task')}</span><span role="columnheader">{t('report.col.completion')}</span><span role="columnheader">{t('report.col.time')}</span><span role="columnheader">{t('report.col.ease')}</span><span role="columnheader">{t('report.col.flagged')}</span></div>
            {report.tasks.map(task => <div key={task.id} className="rt-row" role="row">
              <span role="cell"><b className="mono">{task.id}</b> {task.prompt}<small className="muted">{outcomeSummary(task, t.lang)}</small></span>
              <span role="cell">{cellLabel('report.col.completion')}{task.unverifiable > 0 && <small className="warn">{t('report.unverifiable', { count: task.unverifiable })}</small>}{task.completion ? <><b>{task.completion.successes}/{task.completion.n} · {percent(task.completion.rate)}</b><Bar value={task.completion.rate} low={task.completion.low} high={task.completion.high} label={t('report.completedBar', { percent: percent(task.completion.rate) })} /><small className="muted">{interval(t, task.completion, percent)}</small></> : '–'}</span>
              <span role="cell">{cellLabel('report.col.time')}{task.time ? <><b>{seconds(task.time.geo)}</b><small className="muted">{t('report.geoMean', { interval: interval(t, task.time, seconds) })}</small></> : <span className="muted">{t('report.noCompleted')}</span>}</span>
              <span role="cell">{cellLabel('report.col.ease')}{task.seq ? <><b className={task.seq.mean < 5 ? 'warn' : ''}>{task.seq.mean.toFixed(1)} / 7</b><Bar value={(task.seq.mean - 1) / 6} low={task.seq.low == null ? null : (task.seq.low - 1) / 6} high={task.seq.high == null ? null : (task.seq.high - 1) / 6} label={t('report.easeBar', { mean: task.seq.mean.toFixed(1) })} /><small className="muted">{interval(t, task.seq, value => value.toFixed(1))}{task.seq.mean < 5 ? t('report.belowTypical') : ''}</small></> : <span className="muted">{t('report.notRated')}</span>}</span>
              <span role="cell">{cellLabel('report.col.flagged')}<b>{task.flagged}/{task.attempts + task.unverifiable}</b><small className="muted">{t('report.flaggedParticipants')}</small></span>
            </div>)}
          </div>
        </section>

        {report.observations.length > 0 && <section className="panel report-panel">
          <h2 className="kicker">{t('report.observedKicker')}</h2>
          <ol className="issues">
            {report.observations.map(group => <li key={`${group.taskId}|${group.label}`}>
              <span className="mono">{group.taskId || '–'}</span>
              <b>{group.tagged ? group.label : `“${group.label}”`}</b>
              <span className="chip">{t('report.chipParticipants', { count: group.participants, total: counted })}</span>
              <span className="muted small">{Object.entries(group.kinds).map(([kind, count]) => noteCount(t.lang, kind, count)).join(' · ')}</span>
              <ul className="evidence-list">{group.evidence.slice(0, 3).map((item, index) => <li key={index} className="muted small">{t('report.evidence', { participant: item.participant, text: item.kind === 'quote' ? `“${item.text}”` : item.text })}</li>)}</ul>
            </li>)}
          </ol>
          <p className="muted small">{t('report.observedNote')}</p>
        </section>}

        {report.quotes.length > 0 && <section className="panel report-panel">
          <h2 className="kicker">{t('report.quotesKicker', { count: report.quotes.length })}</h2>
          <ul className="quotes">{report.quotes.map((quote, index) => <li key={index}><q>{quote.text}</q> <span className="muted small">{quote.participant}{quote.taskId ? ` · ${quote.taskId}` : ''}{quote.tags.map(tag => ` #${tag}`).join('')}</span></li>)}</ul>
        </section>}

        <section className="panel report-panel">
          <h2 className="kicker">{report.observations.length ? t('report.detectedKicker') : t('report.problemsRanked')}</h2>
          {!report.issues.length && <p className="muted">{t('report.nothingFlagged')}</p>}
          <ol className="issues">
            {report.issues.map(issue => <li key={`${issue.taskId}|${issue.key}`} className={issue.confirmed ? 'confirmed' : ''}>
              <span className="mono">{issue.taskId}</span>
              <b>{issueTitle(issue, t.lang)}</b>
              <span className="chip" title={t('report.affectedTitle')}>{t('report.chipAffected', { count: issue.participants, total: counted })}</span>
              {issue.confirmedParticipants > 0 && <span className="chip live">{t('report.chipConfirmed', { count: issue.confirmedParticipants })}</span>}
              {issue.severity != null ? <span className={`chip ${issue.severity >= 3 ? 'strong' : 'live'}`}>{t('report.chipSeverity', { level: issue.severity, label: t(`report.severity.${issue.severity}`).toUpperCase() })}</span> : <span className="chip">{issue.confirmed ? t('report.noSeverity') : t('report.notReviewed')}</span>}
              {issue.open > 0 && issue.confirmed > 0 && <span className="muted small">{t('report.moreOpen', { count: issue.open })}</span>}
            </li>)}
          </ol>
          <p className="muted small">{t(lab ? 'report.problemsNoteLab' : 'report.problemsNote')}</p>
        </section>
      </>}
    </main>}
  </div>
}
