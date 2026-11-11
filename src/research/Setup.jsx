import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ThemeToggle } from '../ThemeToggle'
import { FIGMA_ORIGIN, embedUrl, figmaTranslator, parseFigmaLink } from './figma'
import { checkStudy, studyLink } from './studyLink'

// Researcher screen (research.html#setup): turns a Figma prototype link and a
// few tasks into a participant link. Nothing is uploaded; the study travels in
// the link itself.

const newTask = () => ({ prompt: '', start: '', success: '', minutes: 3 })
const nodeOf = text => parseFigmaLink(text)?.nodeId || null

function buildStudy({ title, link, clientId, tasks }) {
  const prototype = parseFigmaLink(link)
  if (!prototype?.fileKey) throw new Error('Paste the link to your Figma prototype (Share → Copy link, or the Present view address).')
  return checkStudy({
    kind: 'figma',
    title,
    figma: { fileKey: prototype.fileKey, name: prototype.name, startNodeId: prototype.startNodeId || prototype.nodeId, clientId: clientId.trim() },
    tasks: tasks.map((task, index) => {
      if (task.start.trim() && !nodeOf(task.start)) throw new Error(`Task ${index + 1}: the start frame is not a Figma frame link or node id.`)
      if (task.success.trim() && !nodeOf(task.success)) throw new Error(`Task ${index + 1}: the goal frame is not a Figma frame link or node id.`)
      return { id: `T${index + 1}`, prompt: task.prompt, start: nodeOf(task.start), successPage: nodeOf(task.success), limitSec: Math.round(Number(task.minutes) * 60) }
    }),
  })
}

// Shows what the embed sends, so the researcher can see the client ID works
// for this site before sending the link to anyone.
function EmbedTest({ study }) {
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
    <div className="setup-frame"><iframe ref={frameRef} title="Prototype test" src={embedUrl(study.figma, study.tasks[0].start || study.figma.startNodeId)} allow="fullscreen" /></div>
    <div className="setup-log" aria-live="polite">
      <span className={`chip ${log.ready ? 'live' : 'strong'}`}>{log.ready ? 'EVENTS ARRIVING' : 'WAITING FOR EVENTS'}</span>
      <p className="muted small">{log.ready
        ? `Click around the prototype: ${log.clicks} clicks, ${log.hotspots} on hotspots. Current frame: ${log.frames[0] || 'not reported yet'}.`
        : 'If this stays waiting after the prototype has loaded, the client ID does not allow this site. In Figma, add this address as an allowed origin for the app: ' + location.origin}</p>
    </div>
  </div>
}

export function Setup() {
  const [form, setForm] = useState({ title: '', link: '', clientId: '', tasks: [newTask()] })
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)
  const result = useMemo(() => {
    try { return { study: buildStudy(form) } } catch (problem) { return { error: problem.message } }
  }, [form])
  const set = change => { setForm(current => ({ ...current, ...change })); setCopied(false); setTesting(false) }
  const setTask = (index, change) => set({ tasks: form.tasks.map((task, at) => (at === index ? { ...task, ...change } : task)) })
  const link = result.study && studyLink(result.study)
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { setCopied(false) }
  }

  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>Study setup · Figma prototype</small></div></div><ThemeToggle /></header>
    <main className="setup">
      <section>
        <span className="kicker">Researcher</span>
        <h1>Set up a Figma study</h1>
        <p className="lede">Paste your prototype and write the tasks. You get a link to send to participants. Their results stay on their device until they download the file and send it to you.</p>
        <div className="panel setup-form">
          <label htmlFor="study-title">Study title<input id="study-title" value={form.title} maxLength={120} placeholder="Checkout redesign, round 1" onChange={event => set({ title: event.target.value })} /></label>
          <label htmlFor="study-link">Figma prototype link<input id="study-link" value={form.link} placeholder="https://www.figma.com/proto/…" onChange={event => set({ link: event.target.value })} /></label>
          <label htmlFor="study-client">Figma client ID<input id="study-client" value={form.clientId} placeholder="From your Figma app's Embed settings" onChange={event => set({ clientId: event.target.value })} />
            <small className="muted">Figma only sends click and screen events to sites its app allows. Create an app in Figma's developer settings, allow {location.origin} as an embed origin, and copy its client ID.</small></label>
        </div>
        {form.tasks.map((task, index) => <fieldset key={index} className="panel setup-form">
          <legend>Task {index + 1}</legend>
          <label htmlFor={`task-${index}-prompt`}>Instructions for the participant<textarea id={`task-${index}-prompt`} value={task.prompt} maxLength={300} rows={2} placeholder="Find the cheapest delivery option and choose it." onChange={event => setTask(index, { prompt: event.target.value })} /></label>
          <label htmlFor={`task-${index}-start`}>Start frame (optional)<input id={`task-${index}-start`} value={task.start} placeholder="Frame link or node id; empty starts at the prototype's start" onChange={event => setTask(index, { start: event.target.value })} /></label>
          <label htmlFor={`task-${index}-success`}>Goal frame (optional)<input id={`task-${index}-success`} value={task.success} placeholder="Reaching this frame completes the task; empty lets the participant say when" onChange={event => setTask(index, { success: event.target.value })} /></label>
          <label htmlFor={`task-${index}-minutes`}>Time limit (minutes)<input id={`task-${index}-minutes`} type="number" min="0.5" max="30" step="0.5" value={task.minutes} onChange={event => setTask(index, { minutes: event.target.value })} /></label>
          {form.tasks.length > 1 && <button className="btn ghost small-btn" onClick={() => set({ tasks: form.tasks.filter((_, at) => at !== index) })}>Remove task {index + 1}</button>}
        </fieldset>)}
        {form.tasks.length < 10 && <button className="btn secondary" onClick={() => set({ tasks: [...form.tasks, newTask()] })}>Add a task</button>}
      </section>
      <section className="side">
        <div className="panel">
          <span className="kicker">Participant link</span>
          {result.error
            ? <p className="warning" role="status">{result.error}</p>
            : <>
              <p className="mono small setup-url">{link}</p>
              <div className="actions">
                <button className="btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
                <a className="btn ghost" href={link} target="_blank" rel="noopener">Try it as a participant</a>
                <button className="btn ghost" onClick={() => setTesting(true)}>Test the embed</button>
              </div>
            </>}
          <p className="muted small">To review results, open research.html#review and load a participant's file.</p>
        </div>
        {testing && result.study && <EmbedTest study={result.study} />}
      </section>
    </main>
  </div>
}
