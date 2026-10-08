// Which interview the session, coding and feedback pages are working on.
// Only the id is kept in the browser; everything else lives on the server,
// so a refresh on any of those pages picks the interview back up.

const KEY = 'interviewId';

export function getCurrentInterviewId(): number | null {
  if (typeof window === 'undefined') return null;
  const id = Number(localStorage.getItem(KEY));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function setCurrentInterviewId(id: number): void {
  localStorage.setItem(KEY, String(id));
}

export function clearCurrentInterview(): void {
  localStorage.removeItem(KEY);
}
