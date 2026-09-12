// Turns an admin-uploaded CSV file of exam questions into the same shape
// the Exam model's questionSchema expects:
//   { passage, questionText, options, answer }
// and reports clear, row-numbered errors so an admin editing the file in
// Excel/Google Sheets knows exactly which row to fix.
//
// Expected CSV columns (header row required; any letter case; any order):
//   question, passage, answer, option1, option2, option3, option4, option5, option6
// - question, answer, option1 and option2 are required for every row
// - passage and option3-option6 are optional and may be left blank
// - answer must exactly match the text of one of that row's filled-in options

const { parse } = require('csv-parse/sync');

const OPTION_COLUMNS = ['option1', 'option2', 'option3', 'option4', 'option5', 'option6'];
const REQUIRED_COLUMNS = ['question', 'answer', 'option1', 'option2'];

/**
 * @param {Buffer|string} csvInput - raw CSV file contents (e.g. req.file.buffer)
 * @returns {{ questions: Array, errors: string[] }}
 *   When `errors` is non-empty something in the file needs fixing and
 *   `questions` should be discarded rather than partially saved — we want
 *   an admin to fix the whole sheet and re-upload, not end up with half an
 *   exam because row 14 had a typo.
 */
function parseQuestionsCsv(csvInput) {
  let records;

  try {
    records = parse(csvInput, {
      columns: header => header.map(h => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true // strips the UTF-8 BOM Excel adds when saving CSVs on Windows
    });
  } catch (err) {
    return { questions: [], errors: [`Could not read the CSV file: ${err.message}`] };
  }

  if (records.length === 0) {
    return { questions: [], errors: ['The CSV file has no question rows'] };
  }

  const headerColumns = Object.keys(records[0]);
  const missingColumns = REQUIRED_COLUMNS.filter(col => !headerColumns.includes(col));
  if (missingColumns.length > 0) {
    return {
      questions: [],
      errors: [`The CSV is missing required column(s): ${missingColumns.join(', ')}`]
    };
  }

  const errors = [];
  const questions = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2; // +1 for 0-index -> 1-index, +1 for the header row itself
    const questionText = (record.question || '').trim();
    const passage = (record.passage || '').trim();
    const answer = (record.answer || '').trim();
    const options = OPTION_COLUMNS
      .map(col => (record[col] || '').trim())
      .filter(opt => opt.length > 0);

    if (!questionText) {
      errors.push(`Row ${rowNumber}: missing question text`);
      return;
    }
    if (options.length < 2) {
      errors.push(`Row ${rowNumber}: needs at least 2 options filled in (option1, option2, ...)`);
      return;
    }
    if (!answer) {
      errors.push(`Row ${rowNumber}: missing answer`);
      return;
    }
    if (!options.includes(answer)) {
      errors.push(`Row ${rowNumber}: answer "${answer}" must match one of its options exactly`);
      return;
    }

    questions.push({ passage, questionText, options, answer });
  });

  return { questions, errors };
}

module.exports = { parseQuestionsCsv, OPTION_COLUMNS, REQUIRED_COLUMNS };
