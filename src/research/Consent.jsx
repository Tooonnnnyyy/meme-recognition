import React, { useState } from 'react'
import { ThemeToggle } from '../ThemeToggle'

export function Consent({ study, participant, onBegin }) {
  const [camera, setCamera] = useState(true)
  const [agreed, setAgreed] = useState({ read: false, withdraw: false })
  const ready = agreed.read && agreed.withdraw
  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>Study · {study.title} · participant {participant}</small></div></div><div className="actions"><span className="chip live"><span className="dot" />PROCESSED ON THIS DEVICE</span><ThemeToggle /></div></header>
    <main className="consent">
      <section>
        <span className="kicker">Step 1 of 3 · Consent</span>
        <h1>Before you start</h1>
        <p className="lede">You will try {study.tasks.length} short tasks on a website. Nothing here tests you; we are testing the website. You can skip a task, or stop and delete your data at any time.</p>
        <div className="rows">
          <div className="row"><span className="ic rec">REC</span><div><b>What this session records</b><p>Clicks, scrolling and page changes. With the camera on: roughly where on the screen you look, at the level of areas such as a menu or a button, and facial movement such as brow lowering, measured as numbers. We never label emotions.</p></div></div>
          <div className="row"><span className="ic local">LOC</span><div><b>What never leaves this computer</b><p>Camera video and any image of your face. Analysis runs in this browser tab, and the camera stops when you finish.</p></div></div>
          <div className="row"><span className="ic send">OUT</span><div><b>What you send at the end</b><p>One results file with timestamps, task times and signal counts. You choose whether to download and send it, or delete it.</p></div></div>
        </div>
      </section>
      <section className="side">
        <div className="panel">
          <label className="toggle" htmlFor="camera-signals"><div><b>Camera signals</b><small>Gaze areas and facial movement. Optional: the study works without them.</small></div><input id="camera-signals" type="checkbox" role="switch" checked={camera} onChange={event => setCamera(event.target.checked)} /></label>
        </div>
        <label className="check" htmlFor="agree-read"><input id="agree-read" type="checkbox" checked={agreed.read} onChange={event => setAgreed(current => ({ ...current, read: event.target.checked }))} />I have read what is recorded and agree to take part.</label>
        <label className="check" htmlFor="agree-withdraw"><input id="agree-withdraw" type="checkbox" checked={agreed.withdraw} onChange={event => setAgreed(current => ({ ...current, withdraw: event.target.checked }))} />I understand I can stop and delete my data at any time.</label>
        <div className="actions">
          <button className="btn primary" disabled={!ready} onClick={() => onBegin(camera)}>{camera ? 'Start calibration · 1 min' : 'Start the tasks'}</button>
        </div>
        {!ready && <p className="muted small">Tick both boxes to continue.</p>}
      </section>
    </main>
  </div>
}
