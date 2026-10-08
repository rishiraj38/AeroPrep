const axios = require('axios');
const pdf = require('pdf-extraction');

/**
 * Downloads a PDF from a URL and extracts its text content using pdf-extraction.
 * @param {string} url - The URL of the PDF to download.
 * @returns {Promise<string>} - The extracted text from the PDF.
 */
async function extractTextFromPdf(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 6 * 1024 * 1024 // uploads are capped at 5MB
    });
    const buffer = Buffer.from(response.data);
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

module.exports = {
  extractTextFromPdf
};
