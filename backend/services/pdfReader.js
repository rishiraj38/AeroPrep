// Runs as a separate, short-lived process (see pdfService.js): it reads one PDF and exits, so
// whatever memory the file cost goes back to the system, however badly the read went.
// The parsing happens in a worker thread, which leaves this thread free to watch the process's
// memory and stop a file that unpacks into far more than any resume could need.
const path = require('path');
const { Worker } = require('worker_threads');

const MEMORY_CHECK_MS = 10;

// The server went away (a restart, say): nobody is waiting for the answer any more
process.on('disconnect', () => process.exit(0));

process.once('message', ({ buffer, maxPages, memoryBudgetBytes }) => {
  const memoryAtStart = process.memoryUsage.rss();
  let memoryPeak = memoryAtStart;
  const worker = new Worker(path.join(__dirname, 'pdfWorker.js'), {
    workerData: { buffer, maxPages },
    resourceLimits: { maxOldGenerationSizeMb: 256 }
  });

  let finished = false;
  const finish = (result) => {
    if (finished) return;
    finished = true;
    clearInterval(memoryWatch);
    worker.terminate();
    // Leave at once, whether or not the answer could be delivered
    setTimeout(() => process.kill(process.pid, 'SIGKILL'), 500);
    process.send({ ...result, memoryUsedBytes: memoryPeak - memoryAtStart }, () => process.exit(0));
  };

  const memoryWatch = setInterval(() => {
    memoryPeak = Math.max(memoryPeak, process.memoryUsage.rss());
    if (memoryPeak - memoryAtStart > memoryBudgetBytes) finish({ error: 'The PDF needs too much memory to read' });
  }, MEMORY_CHECK_MS);
  worker.once('message', finish);
  worker.once('error', (error) => finish({ error: error.message || 'The PDF could not be read' }));
  worker.once('exit', () => finish({ error: 'The PDF could not be read' }));
});
