import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ViewToggles } from '../ThemeToggle'
import { ResearcherNav } from './ResearcherNav'
import { FIGMA_ORIGIN, embedUrl, figmaTranslator, parseFigmaLink } from './figma'
import { checkStudy, studyLink } from './studyLink'
import { HTML_LANG, LANGS, NATIVE, TextError, errorText } from '../i18n/index.js'
import { useT } from '../i18n/react.jsx'

// Researcher screen (research.html#setup): turns a Figma prototype link and a
// few tasks into a participant link. Nothing is uploaded; the study travels in
// the link itself.

const newTask = () => ({ prompt: '', start: '', success: '', minutes: 3 })
const nodeOf = text => parseFigmaLink(text)?.nodeId || null
// An address, the same in every language.
const LINK_PLACEHOLDER = 'https://www.figma.com/proto/…'
// The form's labels stack their control under the name; the language choice
// is a group of radios, each beside its name.
const LANG_GROUP = { display: 'grid', gap: 8, border: 0, margin: 0, padding: 0, minWidth: 0 }
const LANG_OPTION = { display: 'flex', alignItems: 'center', fontWeight: 400 }
const FLUSH = { padding: 0, margin: 0 }

function buildStudy({ title, link, clientId, lang, tasks }) {
  const prototype = parseFigmaLink(link)
  if (!prototype?.fileKey) throw new TextError('researcher.setup.needLink')
  return checkStudy({
    kind: 'figma',
    lang,
    title,
    figma: { fileKey: prototype.fileKey, name: prototype.name, startNodeId: prototype.startNodeId || prototype.nodeId, clientId: clientId.trim() },
    tasks: tasks.map((task, index) => {
      if (task.start.trim() && !nodeOf(task.start)) throw new TextError('researcher.setup.badStart', { number: index + 1 })
      if (task.success.trim() && !nodeOf(task.success)) throw new TextError('researcher.setup.badGoal', { number: index + 1 })
      return { id: `T${index + 1}`, prompt: task.prompt, start: nodeOf(task.start), successPage: nodeOf(task.success), limitSec: Math.round(Number(task.minutes) * 60) }
    }),
  })
}

// Shows what the embed sends, so the researcher can see the client ID works
// for this site before sending the link to anyone.
function EmbedTest({ study }) {
  const t = useT()
  const frameRef = useRef(null)
  const [log, setLog] = useState({ ready: false, frames: [], clicks: 0, hotspots: 0 })
  useEffect(() => {
    const translate = figmaTranslator()
    const onMessage = event => {
      if (event.origin !== FIGMA_ORIGIN || event.source !== frameRef.current?.contentWindow) return
      const action = translate(event.data, performance.now())
      if (!action) return
      setLog(current => ({
        ready: current.ready || action.type === 'ready',
        frames: action.type === 'navigate' ? [action.page, ...current.frames].slice(0, 5) : current.frames,
        clicks: current.clicks + (action.type === 'click' ? 1 : 0),
        hotspots: current.hotspots + ((action.type === 'click' && action.target.handled) || (action.type === 'release' && action.handled) ? 1 : 0),
      }))
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [])
  return <div className="panel setup-test">
    <div className="setup-frame"><iframe ref={frameRef} title={t('researcher.test.frameTitle')} src={embedUrl(study.figma, study.tasks[0].start || study.figma.startNodeId)} allow="fullscreen" /></div>
    <div className="setup-log" aria-live="polite">
      <span className={`chip ${log.ready ? 'live' : 'strong'}`}>{log.ready ? t('researcher.test.arriving') : t('researcher.test.waiting')}</span>
      <p className="muted small">{log.ready
        ? t('researcher.test.events', { clicks: log.clicks, hotspots: log.hotspots, frame: log.frames[0] || t('researcher.test.noFrame') })
        : t('researcher.test.waitingHint', { origin: location.origin })}</p>
    </div>
  </div>
}

// main.jsx keeps Setup mounted while hidden: the switches are left out then
// (they would keep a stale choice), and so is the Figma test embed.
export function Setup({ hidden = false }) {
  const t = useT()
  // Participants see the study in its language, which starts as the
  // researcher's interface language.
  const [form, setForm] = useState(() => ({ title: '', link: '', clientId: '', lang: t.lang, tasks: [newTask()] }))
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)
  const result = useMemo(() => {
    try { return { study: buildStudy(form) } } catch (problem) { return { error: problem } }
  }, [form])
  const set = change => { setForm(current => ({ ...current, ...change })); setCopied(false); setTesting(false) }
  const setTask = (index, change) => set({ tasks: form.tasks.map((task, at) => (at === index ? { ...task, ...change } : task)) })
  const link = result.study && studyLink(result.study)
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { setCopied(false) }
  }

  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>{t('researcher.setup.subtitle')}</small></div></div><div className="actions"><ResearcherNav current="#setup" />{hidden ? null : <ViewToggles />}</div></header>
    <main className="setup">
      <section>
        <span className="kicker">{t('researcher.setup.kicker')}</span>
        <h1>{t('researcher.setup.title')}</h1>
        <p className="lede">{t('researcher.setup.lede')}</p>
        <div className="panel setup-form">
          <label htmlFor="study-title">{t('researcher.setup.studyTitle')}<input id="study-title" value={form.title} maxLength={120} placeholder={t('researcher.setup.studyTitlePlaceholder')} onChange={event => set({ title: event.target.value })} /></label>
          <label htmlFor="study-link">{t('researcher.setup.link')}<input id="study-link" value={form.link} placeholder={LINK_PLACEHOLDER} onChange={event => set({ link: event.target.value })} /></label>
          <label htmlFor="study-client">{t('researcher.setup.clientId')}<input id="study-client" value={form.clientId} placeholder={t('researcher.setup.clientIdPlaceholder')} onChange={event => set({ clientId: event.target.value })} />
            <small className="muted">{t('researcher.setup.clientIdHint', { origin: location.origin })}</small></label>
          <fieldset style={LANG_GROUP}>
            <legend style={FLUSH}>{t('study.lang.label')}</legend>
            {LANGS.map(value => <label key={value} className="check" style={LANG_OPTION} lang={HTML_LANG[value]}><input type="radio" style={FLUSH} name="study-lang" checked={form.lang === value} onChange={() => set({ lang: value })} />{NATIVE[value]}</label>)}
            <small className="muted">{t('study.lang.hint')}</small>
          </fieldset>
        </div>
        {form.tasks.map((task, index) => <fieldset key={index} className="panel setup-form">
          <legend>{t('researcher.setup.task', { number: index + 1 })}</legend>
          <label htmlFor={`task-${index}-prompt`}>{t('researcher.setup.prompt')}<textarea id={`task-${index}-prompt`} value={task.prompt} maxLength={300} rows={2} placeholder={t('researcher.setup.promptPlaceholder')} onChange={event => setTask(index, { prompt: event.target.value })} /></label>
          <label htmlFor={`task-${index}-start`}>{t('researcher.setup.start')}<input id={`task-${index}-start`} value={task.start} placeholder={t('researcher.setup.startPlaceholder')} aria-describedby={`task-${index}-start-hint`} onChange={event => setTask(index, { start: event.target.value })} /><small id={`task-${index}-start-hint`} className="muted">{t('researcher.setup.startHint')}</small></label>
          <label htmlFor={`task-${index}-success`}>{t('researcher.setup.goal')}<input id={`task-${index}-success`} value={task.success} placeholder={t('researcher.setup.goalPlaceholder')} aria-describedby={`task-${index}-success-hint`} onChange={event => setTask(index, { success: event.target.value })} /><small id={`task-${index}-success-hint`} className="muted">{t('researcher.setup.goalHint')}</small></label>
          <label htmlFor={`task-${index}-minutes`}>{t('researcher.setup.limit')}<input id={`task-${index}-minutes`} type="number" min="0.5" max="30" step="0.5" value={task.minutes} onChange={event => setTask(index, { minutes: event.target.value })} /></label>
          {form.tasks.length > 1 && <button className="btn ghost small-btn" onClick={() => set({ tasks: form.tasks.filter((_, at) => at !== index) })}>{t('researcher.setup.removeTask', { number: index + 1 })}</button>}
        </fieldset>)}
        {form.tasks.length < 10 && <button className="btn secondary" onClick={() => set({ tasks: [...form.tasks, newTask()] })}>{t('researcher.setup.addTask')}</button>}
      </section>
      <section className="side">
        <div className="panel">
          <span className="kicker">{t('researcher.setup.participantLink')}</span>
          {result.error
            ? <p className="warning" role="status">{errorText(t, result.error)}</p>
            : <>
              <p className="mono small setup-url">{link}</p>
              <div className="actions">
                <button className="btn primary" onClick={copy}>{copied ? t('researcher.setup.copied') : t('researcher.setup.copy')}</button>
                <a className="btn ghost" href={link} target="_blank" rel="noopener">{t('researcher.setup.try')}</a>
                <button className="btn ghost" onClick={() => setTesting(true)}>{t('researcher.setup.test')}</button>
              </div>
            </>}
          <p className="muted small">{t('researcher.setup.reviewHint')}</p>
        </div>
        {testing && !hidden && result.study && <EmbedTest study={result.study} />}
      </section>
    </main>
  </div>
}
