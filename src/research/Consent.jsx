import React, { useState } from 'react'
import { ViewToggles } from '../ThemeToggle'
import { Rich, useT } from '../i18n/react.jsx'
import { questionsAsked } from './questionnaire'

const FIGMA_PRIVACY = 'https://www.figma.com/privacy/'

export function Consent({ study, participant, onBegin }) {
  const t = useT()
  const figma = study.kind === 'figma'
  const { ask, answers } = questionsAsked(study)
  const [camera, setCamera] = useState(true)
  const [agreed, setAgreed] = useState({ read: false, withdraw: false })
  const ready = agreed.read && agreed.withdraw
  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>{t('participant.studyLine', { title: study.title, participant })}</small></div></div><div className="actions"><span className="chip live"><span className="dot" />{t(figma ? 'participant.processedFigma' : 'participant.processedHere')}</span><ViewToggles pinnedLang /></div></header>
    <main className="consent">
      <section>
        <span className="kicker">{t('participant.consent.kicker')}</span>
        <h1>{t('participant.consent.title')}</h1>
        <p className="lede">{t(figma ? 'participant.consent.ledeFigma' : 'participant.consent.ledeSite', { count: study.tasks.length, ask: ask ? t(`participant.consent.ask.${ask}`) : '' })}</p>
        <div className="rows">
          <div className="row"><span className="ic rec">{t('participant.consent.recordsIcon')}</span><div><b>{t('participant.consent.recordsTitle')}</b><p>{t('participant.consent.records', { what: t(figma ? 'participant.consent.recordsFigma' : 'participant.consent.recordsSite'), answers: answers ? t(`participant.consent.answers.${answers}`) : '' })}</p></div></div>
          <div className="row"><span className="ic local">{t('participant.consent.localIcon')}</span><div><b>{t('participant.consent.localTitle')}</b><p>{t('participant.consent.local')}</p></div></div>
          <div className="row"><span className="ic send">{t('participant.consent.sendIcon')}</span><div><b>{t('participant.consent.sendTitle')}</b><p>{t('participant.consent.send')}</p></div></div>
          {figma && <div className="row"><span className="ic third">{t('participant.consent.figmaIcon')}</span><div><b>{t('participant.consent.figmaTitle')}</b><p><Rich text={t('participant.consent.figma')} tags={{ link: text => <a href={FIGMA_PRIVACY} target="_blank" rel="noopener noreferrer">{text}</a> }} /></p></div></div>}
        </div>
      </section>
      <section className="side">
        <div className="panel">
          <label className="toggle" htmlFor="camera-signals"><div><b>{t('participant.consent.camera')}</b><small>{t('participant.consent.cameraHint')}</small></div><input id="camera-signals" type="checkbox" role="switch" checked={camera} onChange={event => setCamera(event.target.checked)} /></label>
        </div>
        <label className="check" htmlFor="agree-read"><input id="agree-read" type="checkbox" checked={agreed.read} onChange={event => setAgreed(current => ({ ...current, read: event.target.checked }))} />{t('participant.consent.agreeRead')}</label>
        <label className="check" htmlFor="agree-withdraw"><input id="agree-withdraw" type="checkbox" checked={agreed.withdraw} onChange={event => setAgreed(current => ({ ...current, withdraw: event.target.checked }))} />{t('participant.consent.agreeWithdraw')}</label>
        <div className="actions">
          <button className="btn primary" disabled={!ready} onClick={() => onBegin(camera)}>{camera ? t('participant.consent.startCalibration') : t('participant.startTasks')}</button>
        </div>
        {!ready && <p className="muted small">{t('participant.consent.tickBoth')}</p>}
      </section>
    </main>
  </div>
}
