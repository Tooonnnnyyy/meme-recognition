// Whether a session reached its end. The Lab console stamps finishedAt when
// the moderator ends the session, and the participant runtime stamps it on
// the finish screen. Older participant files have no stamp: they count as
// finished when every task they started ended.
export function isFinished(session) {
  if (!session || typeof session !== 'object') return false
  if (session.finishedAt) return true
  if (session.mode === 'moderated') return false
  return Array.isArray(session.tasks) && session.tasks.length > 0 && session.tasks.every(task => task && task.end != null)
}
