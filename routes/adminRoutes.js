const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const { requireAdmin } = require('../middleware/auth');
const { csvUpload } = require('../middleware/upload');
const { parseQuestionsCsv } = require('../utils/parseQuestionsCsv');

// Shared by both the "create exam" and "bulk add questions" routes: checks
// every question has real text, at least 2 non-blank options, and an answer
// that matches one of those options exactly. Returns an error message
// string for the first bad question found, or null if everything is valid.
function validateQuestions(questions) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.questionText || !q.questionText.trim()) {
      return `Question ${i + 1} is missing its text`;
    }
    if (!Array.isArray(q.options) || q.options.filter(o => o && o.trim()).length < 2) {
      return `Question ${i + 1} needs at least 2 options`;
    }
    if (!q.answer || !q.options.includes(q.answer)) {
      return `Question ${i + 1}'s answer must match one of its options exactly`;
    }
  }
  return null;
}

/* ---------------- LOGIN ---------------- */
// There is no /logout route here because a JWT token is stateless — the
// frontend "logs out" simply by deleting the token from localStorage.

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const admin = await Admin.findOne({ username: username.trim() });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }

    // Create a signed token that proves this user is admin with this id.
    // The frontend will store this token and send it back on every request.
    const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '4h' });

    res.json({ message: 'Login successful', token });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/* ---------------- STUDENT MANAGEMENT ---------------- */

// GET /api/admin/students  (list all students)
router.get('/students', requireAdmin, async (req, res) => {
  const students = await Student.find().select('-password').sort({ fullName: 1 });
  res.json(students);
});

// POST /api/admin/students  (add student)
router.post('/students', requireAdmin, async (req, res) => {
  try {
    const { fullName, regNumber, password, studentClass } = req.body;

    if (!fullName || !regNumber || !password || !studentClass) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await Student.findOne({ regNumber: regNumber.trim() });
    if (existing) {
      return res.status(400).json({ message: 'A student with this registration number already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const student = await Student.create({
      fullName: fullName.trim(),
      regNumber: regNumber.trim(),
      password: hashedPassword,
      studentClass: studentClass.trim()
    });

    res.status(201).json({ message: 'Student added', student: { ...student.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/admin/students/:id  (edit student)
router.put('/students/:id', requireAdmin, async (req, res) => {
  try {
    const { fullName, regNumber, studentClass, password } = req.body;

    if (!fullName || !regNumber || !studentClass) {
      return res.status(400).json({ message: 'Full name, registration number and class are required' });
    }

    const updateData = {
      fullName: fullName.trim(),
      regNumber: regNumber.trim(),
      studentClass: studentClass.trim()
    };

    // Only update password if a new one was provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const student = await Student.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({ message: 'Student updated', student });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/admin/students/:id
router.delete('/students/:id', requireAdmin, async (req, res) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }
  res.json({ message: 'Student deleted' });
});

/* ---------------- EXAM MANAGEMENT ---------------- */

// POST /api/admin/exams  (add exam with questions)
//
// Supports two ways of supplying questions, so the admin frontend can offer
// either workflow:
//   1. JSON request, e.g. { title, subject, ..., questions: [ {...}, {...} ] }
//      — used for typing in one question (or a handful) by hand.
//   2. multipart/form-data request with the exam's fields as text fields
//      plus a CSV file attached as "questionsCsv" — used for bulk-adding
//      many questions at once. When a file is attached it always wins over
//      any `questions` field, since the CSV is the bulk-import path.
router.post('/exams', requireAdmin, csvUpload('questionsCsv'), async (req, res) => {
  try {
    const { title, subject, examClass, durationMinutes } = req.body;

    if (!title || !subject || !examClass) {
      return res.status(400).json({ message: 'Title, subject and class are required' });
    }

    const duration = parseInt(durationMinutes, 10);
    if (!duration || duration < 1) {
      return res.status(400).json({ message: 'Duration must be a number of minutes, at least 1' });
    }

    let questions;

    if (req.file) {
      // Bulk path: questions came from an uploaded CSV.
      const { questions: parsedQuestions, errors } = parseQuestionsCsv(req.file.buffer);
      if (errors.length > 0) {
        return res.status(400).json({ message: 'The CSV file has errors', errors });
      }
      if (parsedQuestions.length === 0) {
        return res.status(400).json({ message: 'The CSV file has no valid questions' });
      }
      questions = parsedQuestions;
    } else {
      // Single/manual path: questions came as JSON in the request body.
      // (When the request is multipart without a file, express.json() never
      // ran, but multer still parses text fields into req.body as strings —
      // there's no "questions" array to receive in that case.)
      questions = req.body.questions;
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'Add at least one question, or attach a CSV file' });
    }

    const validationError = validateQuestions(questions);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const exam = await Exam.create({
      title: title.trim(),
      subject: subject.trim(),
      examClass: examClass.trim(),
      durationMinutes: duration,
      questions
    });

    res.status(201).json({ message: 'Exam created', exam });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/admin/exams/:id/questions/bulk  (add more questions to an
// existing exam in bulk, via CSV)
//
// Send a multipart/form-data request with the CSV attached as
// "questionsCsv". The whole file is validated before anything is saved —
// if any row has a problem, nothing is added, so the exam never ends up
// with only half of an intended batch of questions.
router.post('/exams/:id/questions/bulk', requireAdmin, csvUpload('questionsCsv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Attach a CSV file as "questionsCsv"' });
    }

    const { questions, errors } = parseQuestionsCsv(req.file.buffer);
    if (errors.length > 0) {
      return res.status(400).json({ message: 'The CSV file has errors', errors });
    }
    if (questions.length === 0) {
      return res.status(400).json({ message: 'The CSV file has no valid questions' });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    exam.questions.push(...questions);
    await exam.save();

    res.status(200).json({
      message: `${questions.length} question(s) added`,
      addedCount: questions.length,
      exam
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/admin/exams  (list exams, for the admin dashboard)
router.get('/exams', requireAdmin, async (req, res) => {
  const exams = await Exam.find().sort({ createdAt: -1 });
  res.json(exams);
});

/* ---------------- RESULTS ---------------- */

// GET /api/admin/results  (view all results, optionally filter by ?examId=)
router.get('/results', requireAdmin, async (req, res) => {
  const filter = {};
  if (req.query.examId) {
    filter.exam = req.query.examId;
  }

  const results = await Result.find(filter)
    .populate('student', 'fullName regNumber studentClass')
    .populate('exam', 'title subject examClass')
    .sort({ submittedAt: -1 });

  res.json(results);
});

module.exports = router;
