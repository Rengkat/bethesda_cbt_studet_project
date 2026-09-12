// Handles CSV file uploads for bulk-adding exam questions. Files are kept
// in memory (never written to disk) since the request only needs the raw
// bytes briefly, to hand them to the CSV parser — nothing about the
// original upload needs to survive past that.

const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB is generous for a CSV of exam questions
  fileFilter: (req, file, cb) => {
    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' || // some browsers/Excel send this for .csv
      file.originalname.toLowerCase().endsWith('.csv');

    if (!isCsv) {
      return cb(new Error('Only .csv files are accepted'));
    }
    cb(null, true);
  }
});

// Wraps multer's single-file handler so upload problems (wrong file type,
// file too large, missing field name, etc.) come back as the same kind of
// JSON error response as the rest of the API, instead of multer throwing
// and Express falling through to its default HTML error page.
//
// If the request isn't multipart/form-data at all (e.g. a plain JSON
// request to create an exam by typing questions in one by one), multer
// simply does nothing and calls next() — req.file stays undefined and the
// route handler falls back to reading req.body.questions as normal.
function csvUpload(fieldName) {
  const middleware = upload.single(fieldName);

  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'CSV file is too large (2MB max)' });
        }
        return res.status(400).json({ message: `File upload error: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  };
}

module.exports = { csvUpload };
