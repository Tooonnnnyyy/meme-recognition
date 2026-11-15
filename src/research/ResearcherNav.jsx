import React from 'react'

// Links between the researcher screens, which are hash routes of research.html.
const SCREENS = [['#setup', 'Set up'], ['#review', 'Review a session'], ['#report', 'Study report']]

export function ResearcherNav({ current }) {
  return <nav className="researcher-nav" aria-label="Researcher screens">
    <a href="lab.html">Usability Lab</a>
    {SCREENS.map(([hash, label]) => <a key={hash} href={hash} aria-current={current === hash ? 'page' : undefined}>{label}</a>)}
  </nav>
}
