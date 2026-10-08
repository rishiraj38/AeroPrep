const pdf = require('pdf-extraction');

const MAX_PDF_BYTES = 6 * 1024 * 1024; // uploads are capped at 5MB

/**
 * Downloads a PDF from a URL and extracts its text content using pdf-extraction.
 * @param {string} url - The URL of the PDF to download.
 * @returns {Promise<string>} - The extracted text from the PDF.
 */
async function extractTextFromPdf(url) {
  try {
    // "error" on redirect: the caller has checked this URL's host, and a redirect could leave it
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_PDF_BYTES) throw new Error('PDF is too large');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_PDF_BYTES) throw new Error('PDF is too large');

    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    throw new Error('Failed to extract text from PDF');
  }
}

module.exports = {
  extractTextFromPdf
};
