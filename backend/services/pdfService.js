const path = require('path');
const { Worker } = require('worker_threads');

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 10;            // a resume is a few pages; never parse a whole book
const PARSE_TIMEOUT_MS = 10000;  // a PDF that takes longer than this is not a resume

/**
 * Extracts the text of a PDF held in memory. The parsing happens in a worker thread with a
 * time and memory limit, so a slow or malicious file cannot stall or crash the server.
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
function extractTextFromBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdfWorker.js'), {
      workerData: { buffer, maxPages: MAX_PAGES },
      resourceLimits: { maxOldGenerationSizeMb: 256 }
    });

    let settled = false;
    const settle = (action, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      action(value);
    };

    const timer = setTimeout(() => settle(reject, new Error('The PDF took too long to read')), PARSE_TIMEOUT_MS);
    worker.once('message', (message) => {
      if (message.error) settle(reject, new Error(message.error));
      else settle(resolve, message.text);
    });
    worker.once('error', (error) => settle(reject, error));
    worker.once('exit', () => settle(reject, new Error('The PDF could not be read')));
  });
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
