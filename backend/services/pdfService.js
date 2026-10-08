const path = require('path');
const { fork } = require('child_process');

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 10;            // a resume is a few pages; never parse a whole book
const PARSE_TIMEOUT_MS = 10000;  // a PDF that takes longer than this is not a resume

// A PDF can hold a few hundred kilobytes that unpack into gigabytes, enough to get the whole
// server killed for running out of memory. So each file is read in a process of its own, which
// stops as soon as reading has cost it more than this. An ordinary resume needs about a third.
const MEMORY_BUDGET_BYTES = 120 * 1024 * 1024;
// One file is read at a time, so that budget is the most reading can ever cost;
// a few more may wait their turn and the rest are asked to try again
const MAX_PENDING = 4;

// The reader gets what Node needs to run and nothing else: none of the server's settings or keys
const READER_ENV = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LD_LIBRARY_PATH', 'NODE_ENV']
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]])
);

let pending = 0;
let lastRead = Promise.resolve();

function readInOwnProcess(buffer) {
  return new Promise((resolve, reject) => {
    const reader = fork(path.join(__dirname, 'pdfReader.js'), [], {
      serialization: 'advanced', // the file travels as bytes, not as JSON
      env: READER_ENV,
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });

    // Decided as soon as the outcome is known, delivered once the process is really gone
    let outcome = null;
    const decide = (action, value) => {
      if (outcome) return;
      outcome = () => action(value);
      clearTimeout(timer);
      reader.kill('SIGKILL');
    };

    const timer = setTimeout(() => decide(reject, new Error('The PDF took too long to read')), PARSE_TIMEOUT_MS);
    reader.once('message', (message) => {
      if (typeof message?.text === 'string') decide(resolve, message.text);
      else decide(reject, new Error(message?.error || 'The PDF could not be read'));
    });
    reader.once('error', (error) => {
      decide(reject, error);
      outcome();
    });
    reader.once('close', () => {
      decide(reject, new Error('The PDF could not be read'));
      outcome();
    });
    reader.send({ buffer, maxPages: MAX_PAGES, memoryBudgetBytes: MEMORY_BUDGET_BYTES }, (error) => {
      if (error) decide(reject, error);
    });
  });
}

/**
 * Extracts the text of a PDF held in memory. Each file is read in a separate short-lived
 * process, one at a time, with a limit on time and on memory, so a slow or malicious file can
 * neither stall the server nor run it out of memory. Rejects with `busy: true` when too many
 * files are already waiting.
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
function extractTextFromBuffer(buffer) {
  if (pending >= MAX_PENDING) {
    return Promise.reject(Object.assign(new Error('Too many PDFs are waiting to be read'), { busy: true }));
  }
  pending++;
  const result = lastRead.then(() => readInOwnProcess(buffer));
  lastRead = result.then(() => {}, () => {}).then(() => { pending--; });
  return result;
}

// True when the bytes start like a PDF (the header may be preceded by a little junk)
function looksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 1024).includes('%PDF-');
}

/**
 * Downloads a PDF and extracts its text. Only for interviews created before resumes were
 * uploaded straight to this server, when they were stored on ImageKit; nothing else is fetched.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function extractTextFromPdf(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' || hostname !== 'ik.imagekit.io') throw new Error('Not a stored resume');

    // "error" on redirect: a redirect could lead somewhere else entirely
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_PDF_BYTES) throw new Error('PDF is too large');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_PDF_BYTES) throw new Error('PDF is too large');

    return await extractTextFromBuffer(buffer);
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    throw new Error('Failed to extract text from PDF');
  }
}

module.exports = {
  MAX_PDF_BYTES,
  extractTextFromPdf,
  extractTextFromBuffer,
  looksLikePdf
};
