/**
 * certificate.js
 *
 * Utility for generating deterministic verification IDs and
 * rendering course completion certificates as PDF buffers using PDFKit.
 */

const PDFDocument = require('pdfkit');
const crypto = require('crypto');

/**
 * Generates a deterministic 16-character verification code from:
 * enrollmentId + facultyId + courseId + completionDate.
 * Formatted as XXXX-XXXX-XXXX-XXXX.
 *
 * @param {object} params
 * @param {string} params.enrollmentId
 * @param {string} params.facultyId
 * @param {string} params.courseId
 * @param {Date|string} params.completionDate
 * @returns {string} Verification code
 */
const generateVerificationId = ({ enrollmentId, facultyId, courseId, completionDate }) => {
  const dateStr =
    completionDate instanceof Date
      ? completionDate.toISOString()
      : String(completionDate || '');
  const raw = `${enrollmentId}:${facultyId}:${courseId}:${dateStr}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
  const truncated = hash.slice(0, 16);
  return truncated.match(/.{1,4}/g)?.join('-') || truncated;
};

/**
 * Builds an A4 landscape certificate PDF buffer.
 *
 * @param {object} params
 * @param {string} params.facultyName
 * @param {string} params.courseTitle
 * @param {string} [params.provider]
 * @param {string} [params.instructor]
 * @param {number} [params.credits]
 * @param {Date|string} [params.completionDate]
 * @param {string} params.verificationId
 * @returns {Promise<Buffer>}
 */
const buildCertificatePdf = ({
  facultyName,
  courseTitle,
  provider,
  instructor,
  credits,
  completionDate,
  verificationId,
}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 40,
        info: {
          Title: `Certificate of Completion - ${courseTitle || 'Course'}`,
          Author: 'Faculty Upgradation Platform',
        },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // Outer border (slate)
      doc
        .lineWidth(3)
        .strokeColor('#0f172a')
        .rect(30, 30, pageWidth - 60, pageHeight - 60)
        .stroke();

      // Inner border (cyan accent)
      doc
        .lineWidth(1)
        .strokeColor('#06b6d4')
        .rect(36, 36, pageWidth - 72, pageHeight - 72)
        .stroke();

      // Platform header
      doc.moveDown(1.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#4f46e5')
        .text('FACULTY UPGRADATION PLATFORM', { align: 'center', characterSpacing: 2 });

      doc.moveDown(0.8);

      // Certificate Title
      doc
        .font('Helvetica-Bold')
        .fontSize(28)
        .fillColor('#0f172a')
        .text('Certificate of Completion', { align: 'center' });

      doc.moveDown(0.8);

      // Presentation line
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor('#475569')
        .text('This is proudly presented to', { align: 'center' });

      doc.moveDown(0.8);

      // Faculty Name (emphasized)
      const displayName = facultyName || 'Faculty Member';
      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor('#1e293b')
        .text(displayName, { align: 'center' });

      // Subtle underline for recipient
      const textWidth = doc.widthOfString(displayName);
      const startX = (pageWidth - textWidth) / 2;
      doc
        .lineWidth(1)
        .strokeColor('#cbd5e1')
        .moveTo(Math.max(startX - 20, 100), doc.y + 4)
        .lineTo(Math.min(startX + textWidth + 20, pageWidth - 100), doc.y + 4)
        .stroke();

      doc.moveDown(1.0);

      // Achievement line
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor('#475569')
        .text('for successfully completing all modules and requirements of', { align: 'center' });

      doc.moveDown(0.8);

      // Course Title
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#4f46e5')
        .text(courseTitle || 'Course Title', { align: 'center' });

      doc.moveDown(1.2);

      // Provider and Instructor details
      const providerParts = [];
      if (provider) providerParts.push(`Provider: ${provider}`);
      if (instructor) providerParts.push(`Instructor: ${instructor}`);
      const providerText =
        providerParts.length > 0
          ? providerParts.join('   |   ')
          : `Provider / Facilitator: ${provider || instructor || 'Faculty Upgradation Platform'}`;

      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#334155')
        .text(providerText, { align: 'center' });

      doc.moveDown(0.4);

      // Format date of completion
      let dateString = 'N/A';
      if (completionDate) {
        const d = new Date(completionDate);
        if (!isNaN(d.getTime())) {
          dateString = d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      }

      // Credits and Date
      const creditText = `Credits Awarded: ${credits ?? 0}   |   Date of Completion: ${dateString}`;
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#334155')
        .text(creditText, { align: 'center' });

      doc.moveDown(1.2);

      // Deterministic Verification ID
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#64748b')
        .text(`Certificate Verification ID: ${verificationId}`, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateVerificationId,
  buildCertificatePdf,
};
