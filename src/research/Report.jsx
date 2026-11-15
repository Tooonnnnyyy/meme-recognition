import React, { useMemo, useRef, useState } from 'react'
import { ViewToggles } from '../ThemeToggle'
import { ResearcherNav } from './ResearcherNav'
import { readSession } from './Review'
import { buildReport, reportCsv, reportMarkdown, reviewCount, sessionKey } from './studyReport'

// Researcher screen (research.html#report): load several participants' files
// and see the study as a whole. Files are read in this browser only.

const percent = value => `${Math.round(value * 100)}%`
// Rounded to whole seconds first, so 119.6 s reads 2 min 0 s, not 1 min 60 s.
const seconds = ms => {
  const whole = Math.round(ms / 1000)
  return whole >= 60 ? `${Math.floor(whole / 60)} min ${whole % 60} s` : `${whole} s`
}
const SEVERITY = ['not a problem', 'cosmetic', 'minor', 'major', 'catastrophe']
const OUTCOME_NAMES = { success: 'completed', 'self-reported': 'done (said so)', partial: 'partial success', failed: 'failed or gave up', unverified: 'stopped early', skipped: 'skipped', timeout: 'timed out' }

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

const interval = (item, format) => (item.low != null ? `95% CI ${format(item.low)}–${format(item.high)}` : item.noSpread ? 'all values equal, no interval' : 'one value, no interval')

// In the researcher workspace (lab.html) the report opens on a study's
// sessions (initialSessions) with the workspace's navigation (nav).
export function Report({ initialSessions = [], nav = <ResearcherNav current="#report" />, title }) {
  const [sessions, setSessions] = useState(initialSessions)
  const [includePilot, setIncludePilot] = useState(false)
  const [errors, setErrors] = useState([])
  const [notices, setNotices] = useState([])
  const inputRef = useRef(null)
  const report = useMemo(() => (sessions.length ? buildReport(sessions, { includePilot }) : null), [sessions, includePilot])
  const pilots = sessions.filter(session => session.pilot).length

  const load = async files => {
    const problems = []
    const read = await Promise.all([...files].map(async file => {
      try { return readSession(await file.text()) } catch (problem) {
        problems.push(`${file.name}: ${problem instanceof SyntaxError ? 'not valid JSON' : problem.message}`)
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
        if (at < 0) next.push(session)
        else if (reviewCount(session) > reviewCount(next[at])) {
          next[at] = session
          replaced.push(`${session.participant}: replaced by the copy with ${reviewCount(session)} reviewed moments`)
        } else replaced.push(`${session.participant}: already loaded, this copy was skipped`)
      })
      return next
    })
    setNotices(replaced)
  }

  const picker = <label className="btn ghost file-button" htmlFor="report-files">{sessions.length ? 'Add files' : 'Choose session files'}<input ref={inputRef} id="report-files" type="file" multiple accept="application/json,.json" onChange={event => { const files = [...event.target.files]; event.target.value = ''; if (files.length) load(files) }} /></label>
  const slug = report?.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'study'

  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>Study report{report ? ` · ${title || report.title}` : ''}</small></div></div>
      <div className="actions">{nav}{picker}
        {report && <><button className="btn secondary" onClick={() => save(reportMarkdown(report), `${slug}-report.md`, 'text/markdown')}>Export report (.md)</button><button className="btn ghost" onClick={() => save(reportCsv(report), `${slug}-report.csv`, 'text/csv')}>Export CSV</button></>}
        <ViewToggles /></div></header>
    {!report && <main className="center-note"><span className="kicker">Study report</span><h2>Combine participants' results</h2><p className="muted">Load the results files from every participant (you can choose several at once). Files reviewed on the review screen also bring their confirmed problems and severities. Nothing is uploaded.</p>{picker}{errors.map(error => <p key={error} className="warning" role="alert">{error}</p>)}</main>}
    {report && <main className="report">
      {errors.map(error => <p key={error} className="warning banner" role="alert">{error}</p>)}
      {notices.map(notice => <p key={notice} className="muted small banner-note" role="status">{notice}</p>)}
      {report.mixedStudies && <p className="warning banner">These files come from more than one study or version: their study ids or task instructions differ. Tasks are matched by their id (T1, T2…), which may not mean the same task.</p>}
      {report.silentFigma.length > 0 && <p className="warning banner">The Figma prototype sent no events for {report.silentFigma.join(', ')}, so their goal frames could not be checked. Those attempts are left out of completion and time and shown as unverifiable. Check that the study's client ID allows this site in Figma.</p>}
      <section className="report-files">
        <span className="kicker">{sessions.length} {sessions.length === 1 ? 'participant' : 'participants'}</span>
        {sessions.map(session => <span key={`${session.participant}|${session.startedAt}`} className="chip">{session.participant}<button className="chip-x" aria-label={`Remove ${session.participant}`} onClick={() => setSessions(current => current.filter(item => item !== session))}>×</button></span>)}
        {pilots > 0 && <label className="check inline-check" htmlFor="include-pilot"><input id="include-pilot" type="checkbox" checked={includePilot} onChange={event => setIncludePilot(event.target.checked)} />Include {pilots} pilot {pilots === 1 ? 'session' : 'sessions'}</label>}
        {report.participants.length < 5 && <span className="muted small">With fewer than 5 participants the intervals are very wide; treat numbers as hints.</span>}
      </section>

      <section className="report-cards">
        <div className="panel stat"><span className="kicker">SUS</span>{report.sus
          ? <><b className="big">{report.sus.mean.toFixed(1)}</b><span className="chip live">GRADE {report.sus.grade}</span><span className="muted small">{interval(report.sus, value => value.toFixed(1))} · {report.sus.n} answered · 68 is average</span><Bar value={report.sus.mean / 100} low={report.sus.low == null ? null : report.sus.low / 100} high={report.sus.high == null ? null : report.sus.high / 100} label={`SUS ${report.sus.mean.toFixed(1)} of 100`} /></>
          : <span className="muted">No participant answered the SUS questions.</span>}</div>
        {report.umuxLite && <div className="panel stat"><span className="kicker">UMUX-Lite</span><b className="big">{report.umuxLite.raw.mean.toFixed(1)}</b><span className="chip live">SUS-EQUIVALENT {report.umuxLite.sus.mean.toFixed(1)} · GRADE {report.umuxLite.grade}</span><span className="muted small">{interval(report.umuxLite.raw, value => value.toFixed(1))} · {report.umuxLite.raw.n} answered</span><Bar value={report.umuxLite.raw.mean / 100} low={report.umuxLite.raw.low == null ? null : report.umuxLite.raw.low / 100} high={report.umuxLite.raw.high == null ? null : report.umuxLite.raw.high / 100} label={`UMUX-Lite ${report.umuxLite.raw.mean.toFixed(1)} of 100`} /></div>}
        <div className="panel stat"><span className="kicker">Problems</span><b className="big">{report.issues.length + report.observations.length}</b><span className="muted small">{report.observations.length > 0 && `${report.observations.length} observed by you · `}{report.issues.length} detected: {report.issues.filter(issue => issue.confirmed).length} confirmed in review, {report.issues.filter(issue => !issue.confirmed).length} not reviewed yet</span></div>
      </section>

      <section className="panel report-panel">
        <span className="kicker">Tasks</span>
        <div className="report-table" role="table" aria-label="Task metrics">
          <div className="rt-row head" role="row"><span role="columnheader">Task</span><span role="columnheader">Completion</span><span role="columnheader">Time on task</span><span role="columnheader">Ease (SEQ)</span><span role="columnheader">Flagged</span></div>
          {report.tasks.map(task => <div key={task.id} className="rt-row" role="row">
            <span role="cell"><b className="mono">{task.id}</b> {task.prompt}<small className="muted">{Object.entries(task.outcomes).map(([outcome, count]) => `${count} ${OUTCOME_NAMES[outcome] || outcome}`).join(' · ')}</small></span>
            <span role="cell">{task.unverifiable > 0 && <small className="warn">{task.unverifiable} unverifiable (no Figma events)</small>}{task.completion ? <><b>{task.completion.successes}/{task.completion.n} · {percent(task.completion.rate)}</b><Bar value={task.completion.rate} low={task.completion.low} high={task.completion.high} label={`${percent(task.completion.rate)} completed`} /><small className="muted">{interval(task.completion, percent)}</small></> : '–'}</span>
            <span role="cell">{task.time ? <><b>{seconds(task.time.geo)}</b><small className="muted">geometric mean · {interval(task.time, seconds)}</small></> : <span className="muted">no completed attempts</span>}</span>
            <span role="cell">{task.seq ? <><b className={task.seq.mean < 5 ? 'warn' : ''}>{task.seq.mean.toFixed(1)} / 7</b><Bar value={(task.seq.mean - 1) / 6} low={task.seq.low == null ? null : (task.seq.low - 1) / 6} high={task.seq.high == null ? null : (task.seq.high - 1) / 6} label={`Ease ${task.seq.mean.toFixed(1)} of 7`} /><small className="muted">{interval(task.seq, value => value.toFixed(1))}{task.seq.mean < 5 ? ' · below the typical 5.5' : ''}</small></> : <span className="muted">not rated</span>}</span>
            <span role="cell"><b>{task.flagged}/{task.attempts + task.unverifiable}</b><small className="muted">participants</small></span>
          </div>)}
        </div>
      </section>

      {report.observations.length > 0 && <section className="panel report-panel">
        <span className="kicker">Observed problems, from observer notes</span>
        <ol className="issues">
          {report.observations.map(group => <li key={`${group.taskId}|${group.label}`}>
            <span className="mono">{group.taskId || '–'}</span>
            <b>{group.tagged ? group.label : `“${group.label}”`}</b>
            <span className="chip">{group.participants}/{report.participants.length} PARTICIPANTS</span>
            <span className="muted small">{Object.entries(group.kinds).map(([kind, count]) => `${count} ${kind}`).join(' · ')}</span>
            <ul className="evidence-list">{group.evidence.slice(0, 3).map((item, index) => <li key={index} className="muted small">{item.participant}: {item.kind === 'quote' ? `“${item.text}”` : item.text}</li>)}</ul>
          </li>)}
        </ol>
        <p className="muted small">Notes tagged the same way (for example #returns-link) are grouped across participants; untagged notes group only when their text is identical. Only groups with a problem, error or assist note are listed.</p>
      </section>}

      {report.quotes.length > 0 && <section className="panel report-panel">
        <span className="kicker">What participants said · {report.quotes.length}</span>
        <ul className="quotes">{report.quotes.map((quote, index) => <li key={index}><q>{quote.text}</q> <span className="muted small">{quote.participant}{quote.taskId ? ` · ${quote.taskId}` : ''}{quote.tags.map(tag => ` #${tag}`).join('')}</span></li>)}</ul>
      </section>}

      <section className="panel report-panel">
        <span className="kicker">{report.observations.length ? 'Detected problems, most severe and most common first' : 'Problems, most severe and most common first'}</span>
        {!report.issues.length && <p className="muted">Nothing was flagged in these sessions.</p>}
        <ol className="issues">
          {report.issues.map(issue => <li key={`${issue.taskId}|${issue.key}`} className={issue.confirmed ? 'confirmed' : ''}>
            <span className="mono">{issue.taskId}</span>
            <b>{issue.title}</b>
            <span className="chip" title="Participants with a moment of this problem that was not rejected in review">{issue.participants}/{report.participants.length} AFFECTED</span>
            {issue.confirmedParticipants > 0 && <span className="chip live">{issue.confirmedParticipants} CONFIRMED</span>}
            {issue.severity != null ? <span className={`chip ${issue.severity >= 3 ? 'strong' : 'live'}`}>SEVERITY {issue.severity} · {SEVERITY[issue.severity].toUpperCase()}</span> : <span className="chip">{issue.confirmed ? 'NO SEVERITY YET' : 'NOT REVIEWED'}</span>}
            {issue.open > 0 && issue.confirmed > 0 && <span className="muted small">{issue.open} more {issue.open === 1 ? 'moment' : 'moments'} not reviewed</span>}
          </li>)}
        </ol>
        <p className="muted small">Problems come from the flagged moments. "Affected" leaves out moments you rejected in review. Review each file on the review screen and export it, then add the reviewed file here: it replaces the raw copy. Problems rejected in every file are left out.</p>
      </section>
    </main>}
  </div>
}
