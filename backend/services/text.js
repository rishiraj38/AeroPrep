// Small text helpers shared by the routes and services.

// Removes characters that a database cannot store or a screen cannot show: the control range,
// apart from line breaks and tabs. A single stray NUL makes PostgreSQL refuse the whole row.
function stripControl(text) {
  return String(text ?? '').replace(/[^\P{Cc}\n\t]/gu, '');
}

// The interviewer is told that bracketed text starting "Interview system:" comes from the
// interview software. Nothing a candidate supplies may be able to pass for that.
function cleanCandidateText(text) {
  return stripControl(text).replace(/\[(\s*interview system)/gi, '($1');
}

module.exports = { stripControl, cleanCandidateText };
