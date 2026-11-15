import React, { Fragment, useEffect, useRef, useState } from 'react'
import { averageVectors, createLeaderTracker, EXPRESSION_KEYS, expressionDelta, expressionStrength, expressionVector, rankMatches } from './lookalike'
import { MEME_LIBRARY, memeText } from './meme-library'
import { useT } from './i18n/react.jsx'

const ASSET_BASE = import.meta.env.BASE_URL
const CHALLENGE_MS = 5000
const CAPTURE_MS = 1200
const UPDATE_MS = 100
// Below this (calibrated) expression strength the face is effectively neutral.
const NEUTRAL_STRENGTH = 0.25

const imageUrl = meme => `${ASSET_BASE}${meme.image}`
const percent = score => `${Math.round(Math.max(0, score) * 100)}%`
const vectorOf = reference => reference?.you || reference?.photo || null
const noLiveFace = { face: false, ranking: [], leader: null, strength: 0, calibrated: false }
const memeById = id => MEME_LIBRARY.find(meme => meme.id === id)
// The faces with no reference vector yet.
function missingFaces(references) {
  return MEME_LIBRARY.filter(meme => !vectorOf(references[meme.id]))
}

// A message on several lines: each "\n" in it becomes a line break.
export function Lines({ text }) {
  return <>{String(text).split('\n').map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>)}</>
}

// Shared state for the lookalike panel and library: reference vectors per meme,
// the live ranking, the record-your-own capture, and the timed challenge.
export function useLookalike({ active, cameraState, subscribeFrames, analyzeImages }) {
  const [references, setReferences] = useState({})
  const [analysis, setAnalysis] = useState('idle')
  const [live, setLive] = useState(noLiveFace)
  const [capture, setCapture] = useState(null)
  const [challenge, setChallenge] = useState(null)
  const session = useRef({ references, capture: null, challenge: null, analysis: 'idle' })
  const tracker = useRef(createLeaderTracker()).current
  session.current.references = references

  useEffect(() => {
    if (cameraState !== 'live') setLive(noLiveFace)
  }, [cameraState])

  // Meme photos are analysed once per page visit; a failed attempt (e.g. the
  // camera stopped mid-way) retries the next time the camera goes live.
  useEffect(() => {
    if (!active || cameraState !== 'live' || session.current.analysis === 'running' || session.current.analysis === 'done') return
    session.current.analysis = 'running'
    setAnalysis('running')
    const images = MEME_LIBRARY.map(meme => ({ id: meme.id, url: new URL(imageUrl(meme), location.href).href }))
    analyzeImages(images)
      .then(results => {
        setReferences(current => {
          const next = { ...current }
          results.forEach(({ id, categories, error }) => {
            next[id] = { ...next[id], photo: categories ? expressionVector(categories) : null, error: categories ? null : error || 'No face found' }
          })
          return next
        })
        session.current.analysis = 'done'
        setAnalysis('done')
      })
      .catch(error => {
        console.warn('Meme photo analysis failed', error)
        session.current.analysis = 'failed'
        setAnalysis('failed')
      })
  }, [active, cameraState, analyzeImages])

  useEffect(() => {
    if (!active) return undefined
    let lastUpdate = 0
    return subscribeFrames(frame => {
      const state = session.current
      const now = frame.timestamp
      const categories = frame.faceResult?.faceBlendshapes?.[0]?.categories
      const vector = categories?.length ? expressionVector(categories) : null
      const rest = frame.baseline?.blendshapes ? expressionVector(frame.baseline.blendshapes) : null

      if (state.capture) {
        if (vector) state.capture.samples.push(vector)
        const progress = Math.min(1, (now - state.capture.startedAt) / CAPTURE_MS)
        if (progress >= 1) {
          const { id, samples } = state.capture
          state.capture = null
          if (samples.length >= 3) setReferences(current => ({ ...current, [id]: { ...current[id], you: averageVectors(samples) } }))
          // error is the key of the message shown on the card.
          setCapture(samples.length >= 3 ? null : { id, progress: 0, error: 'studio.library.noFaceSeen' })
        } else setCapture({ id: state.capture.id, progress })
      }

      const pool = MEME_LIBRARY.filter(meme => vectorOf(state.references[meme.id])).map(meme => ({ id: meme.id, vector: vectorOf(state.references[meme.id]) }))
      const ranking = vector ? rankMatches(vector, pool, rest) : []
      const leader = tracker(ranking)

      let challengeChanged = false
      if (state.challenge && !state.challenge.done) {
        const current = ranking.find(match => match.id === state.challenge.id)?.score || 0
        state.challenge.current = current
        state.challenge.best = Math.max(state.challenge.best, current)
        state.challenge.remaining = Math.max(0, state.challenge.endsAt - now)
        if (now >= state.challenge.endsAt) { state.challenge.done = true; challengeChanged = true }
      }

      if (now - lastUpdate < UPDATE_MS && !challengeChanged) return
      lastUpdate = now
      setLive(vector ? { face: true, ranking, leader, strength: expressionStrength(expressionDelta(vector, rest)), calibrated: Boolean(rest) } : noLiveFace)
      if (state.challenge) setChallenge({ ...state.challenge })
    })
  }, [active, subscribeFrames, tracker])

  const startChallenge = () => {
    const ready = MEME_LIBRARY.filter(meme => vectorOf(session.current.references[meme.id]))
    if (!ready.length) return
    const options = ready.length > 1 ? ready.filter(meme => meme.id !== session.current.challenge?.id) : ready
    const target = options[Math.floor(Math.random() * options.length)]
    const now = performance.now()
    session.current.challenge = { id: target.id, endsAt: now + CHALLENGE_MS, remaining: CHALLENGE_MS, best: 0, current: 0, done: false }
    setChallenge({ ...session.current.challenge })
  }
  const endChallenge = () => {
    session.current.challenge = null
    setChallenge(null)
  }
  const captureReference = id => {
    session.current.capture = { id, startedAt: performance.now(), samples: [] }
    setCapture({ id, progress: 0 })
  }
  const resetReference = id => setReferences(current => ({ ...current, [id]: { ...current[id], you: null } }))

  return { references, analysis, live, capture, challenge, startChallenge, endChallenge, captureReference, resetReference }
}

function RankedList({ ranking, references }) {
  const t = useT()
  const missing = missingFaces(references)
  return <ol className="lookalike-ranking">
    {ranking.map(match => {
      const meme = memeById(match.id)
      return <li key={match.id}><img src={imageUrl(meme)} alt="" /><span>{memeText(meme, 'title', t.lang)}</span><span className="match-bar"><i style={{ width: percent(match.score) }} /></span><b>{percent(match.score)}</b></li>
    })}
    {missing.map(meme => <li key={meme.id} className="is-missing"><img src={imageUrl(meme)} alt="" /><span>{memeText(meme, 'title', t.lang)}</span><span className="match-bar" /><b>{t('studio.lookalike.record')}</b></li>)}
  </ol>
}

function ChallengeView({ challenge, onNext, onEnd }) {
  const t = useT()
  const meme = memeById(challenge.id)
  const title = memeText(meme, 'title', t.lang)
  return <div className="lookalike-match is-challenge">
    <img src={imageUrl(meme)} alt={title} />
    <div className="lookalike-copy">
      <span className="panel-kicker">{t(challenge.done ? 'studio.lookalike.challengeDone' : 'studio.lookalike.copyFace')}</span>
      <strong>{title}</strong>
      <p>{memeText(meme, 'hint', t.lang)}</p>
      {challenge.done
        ? <><div className="lookalike-score">{percent(challenge.best)}</div><small>{t('studio.lookalike.bestIn5')}</small><div className="lookalike-actions"><button className="primary-button" onClick={onNext}>{t('studio.lookalike.nextFace')}</button><button className="secondary-button" onClick={onEnd}>{t('studio.lookalike.done')}</button></div></>
        : <><div className="lookalike-score">{t('studio.lookalike.seconds', { seconds: Math.ceil(challenge.remaining / 1000) })}</div><small>{t('studio.lookalike.nowBest', { current: percent(challenge.current), best: percent(challenge.best) })}</small><span className="match-bar is-large"><i style={{ width: percent(challenge.current) }} /></span></>}
    </div>
  </div>
}

export function LookalikePanel({ lookalike, cameraState }) {
  const { analysis, live, references, challenge } = lookalike
  const neutral = live.calibrated && live.strength < NEUTRAL_STRENGTH
  const t = useT()
  const ready = MEME_LIBRARY.some(meme => vectorOf(references[meme.id]))
  const leader = memeById(live.leader)
  const leaderMatch = live.ranking.find(match => match.id === live.leader)
  const leaderTitle = leader && memeText(leader, 'title', t.lang)

  let stage
  if (cameraState !== 'live') { stage = <div className="empty-reaction"><span>◎</span><p><Lines text={t('studio.lookalike.enableCamera')} /></p></div> }
  else if (analysis === 'running' || analysis === 'idle') { stage = <div className="empty-reaction"><span>◌</span><p>{t('studio.lookalike.reading')}</p></div> }
  else if (!ready) { stage = <div className="empty-reaction"><span>◎</span><p><Lines text={t('studio.lookalike.noneRead')} /></p></div> }
  else if (challenge) { stage = <ChallengeView challenge={challenge} onNext={lookalike.startChallenge} onEnd={lookalike.endChallenge} /> }
  else if (!live.face) { stage = <div className="empty-reaction"><span>◎</span><p>{t('studio.lookalike.looking')}</p></div> }
  else {
    stage = <div className="lookalike-match">
      {leader && <img src={imageUrl(leader)} alt={leaderTitle} />}
      <div className="lookalike-copy">
        <span className="panel-kicker">{t(neutral ? 'studio.lookalike.resting' : 'studio.lookalike.youLookLike')}</span>
        <strong>{neutral ? t('studio.lookalike.makeExpression') : leaderTitle}</strong>
        <p>{neutral ? t('studio.lookalike.restingHint') : leaderMatch?.mirrored ? t('studio.lookalike.mirrored') : leader && memeText(leader, 'hint', t.lang)}</p>
        {!neutral && leaderMatch && <div className="lookalike-score">{percent(leaderMatch.score)}</div>}
        <RankedList ranking={live.ranking} references={references} />
      </div>
    </div>
  }

  const badge = cameraState !== 'live' ? 'waiting' : challenge && !challenge.done ? 'challenge' : live.face ? 'matching' : 'searching'
  return <section className="reaction-panel lookalike-panel panel">
    <div className="panel-heading"><div><span className="panel-kicker">{t('studio.lookalike.kicker')}</span><h2>{t('studio.lookalike.title')}</h2></div><span className={`status-badge ${live.face ? 'fired' : ''}`}>{t(`studio.lookalike.badge.${badge}`)}</span></div>
    <div className="reaction-stage">{stage}</div>
    <div className="reaction-footer"><span>{t(live.calibrated ? 'studio.lookalike.calibrated' : 'studio.lookalike.tip')}</span>{challenge ? <button className="text-button" onClick={lookalike.endChallenge}>{t('studio.lookalike.endChallenge')}</button> : <button className="text-button" disabled={!ready || cameraState !== 'live'} onClick={lookalike.startChallenge}>{t('studio.lookalike.startChallenge')}</button>}</div>
  </section>
}

export function LookalikeLibrary({ lookalike, cameraState }) {
  const t = useT()
  const { references, analysis, capture, captureReference, resetReference } = lookalike
  const live = cameraState === 'live'
  const sourceLabel = reference => {
    if (reference?.you) return t('studio.library.yours')
    if (reference?.photo) return t('studio.library.photo')
    if (reference?.error) return t('studio.library.noFace')
    return t(analysis === 'running' ? 'studio.library.reading' : 'studio.library.waiting')
  }
  return <section className="lookalike-library panel">
    <div className="panel-heading"><div><span className="panel-kicker">{t('studio.library.kicker')}</span><h2>{t('studio.library.title')}</h2></div><span className="log-caption">{t('studio.library.caption', { count: EXPRESSION_KEYS.length })}</span></div>
    <div className="library-grid">{MEME_LIBRARY.map(meme => {
      const reference = references[meme.id]
      const capturing = capture?.id === meme.id
      const title = memeText(meme, 'title', t.lang)
      return <article className="library-card" key={meme.id}>
        <img src={imageUrl(meme)} alt={title} />
        <div>
          <strong>{title}</strong>
          <p>{memeText(meme, 'hint', t.lang)}</p>
          <small className={reference?.error && !reference?.you ? 'is-warning' : ''}>{capturing && capture.error ? t(capture.error) : sourceLabel(reference)}</small>
          <div className="library-actions">
            <button className="secondary-button" disabled={!live || Boolean(capture && !capture.error)} onClick={() => captureReference(meme.id)}>{capturing && !capture.error ? t('studio.library.hold', { percent: percent(capture.progress) }) : t('studio.library.useMyFace')}</button>
            {reference?.you && <button className="text-button" onClick={() => resetReference(meme.id)}>{t('studio.library.reset')}</button>}
          </div>
        </div>
      </article>
    })}</div>
    <p className="library-note">{t('studio.library.note', { count: EXPRESSION_KEYS.length })}</p>
  </section>
}
