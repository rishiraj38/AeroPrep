// How the candidate spoke, worked out from the stored answers and the timings the browser sent
// with them. Plain counting: no model call, so it costs nothing and gives the same result every time.

// Phrases that pad an answer. Speech recognition drops many plain "um"s, so the count is a floor.
const FILLERS = ['um', 'uh', 'umm', 'uhh', 'er', 'erm', 'hmm', 'you know', 'i mean', 'basically', 'actually', 'literally', 'kind of', 'sort of', 'like'];
// "like" after these is a real word ("would like", "looks like"), not padding
const REAL_LIKE_AFTER = new Set(['would', "i'd", "we'd", "they'd", 'looks', 'look', 'looked', 'feel', 'feels', 'felt', 'seems', 'something', 'things', 'stuff', 'just', 'is', 'was', 'be', 'more', 'i', 'we', 'they', 'you', 'really', "don't", 'not']);

const MIN_WORDS_FOR_PACE = 8; // a pace measured over a few words means nothing

function wordsOf(text) {
  return text.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

function countFillers(words) {
  const counts = {};
  for (let i = 0; i < words.length; i++) {
    const pair = `${words[i]} ${words[i + 1] || ''}`;
    let found = null;
    if (FILLERS.includes(pair)) {
      found = pair;
      i++;
    } else if (words[i] === 'like') {
      if (!REAL_LIKE_AFTER.has(words[i - 1])) found = 'like';
    } else if (FILLERS.includes(words[i])) {
      found = words[i];
    }
    if (found) counts[found] = (counts[found] || 0) + 1;
  }
  return counts;
}

/**
 * @param {Array<{speaker: string, text: string, thinkMs: number|null, spokenMs: number|null, typed: boolean|null}>} messages
 * @returns {object|null} null when there is nothing to measure
 */
function speakingStats(messages) {
  const answers = messages.filter((m) => m.speaker === 'user');
  if (answers.length === 0) return null;

  let words = 0;
  let pacedWords = 0;
  let pacedMs = 0;
  let longest = null;
  const fillers = {};
  const thinkTimes = [];

  answers.forEach((answer, index) => {
    const list = wordsOf(answer.text);
    words += list.length;
    for (const [filler, count] of Object.entries(countFillers(list))) fillers[filler] = (fillers[filler] || 0) + count;
    if (!longest || list.length > longest.words) {
      longest = { answer: index + 1, words: list.length, seconds: answer.typed === false && answer.spokenMs ? Math.round(answer.spokenMs / 1000) : null };
    }
    // Pace only means something for answers that were spoken
    if (answer.typed === false && answer.spokenMs > 0 && list.length >= MIN_WORDS_FOR_PACE) {
      pacedWords += list.length;
      pacedMs += answer.spokenMs;
    }
    if (answer.thinkMs !== null && answer.thinkMs !== undefined) thinkTimes.push(answer.thinkMs);
  });

  const fillerTotal = Object.values(fillers).reduce((sum, count) => sum + count, 0);
  return {
    answers: answers.length,
    words,
    wordsPerMinute: pacedMs > 0 ? Math.round(pacedWords / (pacedMs / 60000)) : null,
    fillerCount: fillerTotal,
    fillersPer100Words: words > 0 ? Math.round((fillerTotal / words) * 1000) / 10 : 0,
    topFillers: Object.entries(fillers).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([phrase, count]) => ({ phrase, count })),
    averageSecondsToStart: thinkTimes.length ? Math.round(thinkTimes.reduce((a, b) => a + b, 0) / thinkTimes.length / 100) / 10 : null,
    longestAnswer: longest,
  };
}

module.exports = { speakingStats };
