// Does the actual reading, in a worker thread of the reader process (see pdfReader.js),
// so that a slow or hostile PDF can be cut off while it is still being parsed.
const { parentPort, workerData } = require('worker_threads');

(async () => {
  // unpdf ships as an ES module
  const { getDocumentProxy } = await import('unpdf');
  const document = await getDocumentProxy(new Uint8Array(workerData.buffer));
  const pages = [];
  for (let number = 1; number <= Math.min(document.numPages, workerData.maxPages); number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join(''));
  }
  parentPort.postMessage({ text: pages.join('\n') });
})().catch((error) => parentPort.postMessage({ error: error.message || 'Could not read the PDF' }));
