const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const Student = require('../models/Student');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const { requireStudent } = require('../middleware/auth');

/* ---------------- LOGIN ---------------- */
// There is no /logout route here because a JWT token is stateless — the
// frontend "logs out" simply by deleting the token from localStorage.

// POST /api/student/login
router.post('/login', async (req, res) => {
  try {
    const { regNumber, password } = req.body;
    if (!regNumber || !password) {
      return res.status(400).json({ message: 'Registration number and password are required' });
    }

    const student = await Student.findOne({ regNumber: regNumber.trim() });
    if (!student) {
      return res.status(400).json({ message: 'Invalid registration number or password' });
    }

    const match = await bcrypt.compare(password, student.password);
    if (!match) {
      return res.status(400).json({ message: 'Invalid registration number or password' });
    }

    // Create a signed token that proves this user is a student with this id.
    // The frontend will store this token and send it back on every request.
    const token = jwt.sign({ id: student._id, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '4h' });

    res.json({
      message: 'Login successful',
      token,
      student: { fullName: student.fullName, regNumber: student.regNumber, studentClass: student.studentClass }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/student/me  (basic info for the logged-in student, used by the frontend)
router.get('/me', requireStudent, async (req, res) => {
  const student = await Student.findById(req.studentId).select('-password');
  if (!student) return res.status(404).json({ message: 'Student not found' });
  res.json(student);
});

/* ---------------- EXAMS ---------------- */

// GET /api/student/exams  (exams available for this student's class)
router.get('/exams', requireStudent, async (req, res) => {
  const student = await Student.findById(req.studentId);
  if (!student) return res.status(404).json({ message: 'Student not found' });

  const exams = await Exam.find({ examClass: student.studentClass }).select('title subject examClass createdAt');

  // Mark which of these exams the student has already submitted
  const results = await Result.find({ student: student._id }).select('exam');
  const submittedExamIds = new Set(results.map(r => r.exam.toString()));

  const examsWithStatus = exams.map(exam => ({
    _id: exam._id,
    title: exam.title,
    subject: exam.subject,
    examClass: exam.examClass,
    alreadySubmitted: submittedExamIds.has(exam._id.toString())
  }));

  res.json(examsWithStatus);
});

// GET /api/student/exams/:id  (get one exam's questions to take it — answers are stripped out)
router.get('/exams/:id', requireStudent, async (req, res) => {
  const student = await Student.findById(req.studentId);
  const exam = await Exam.findById(req.params.id);

  if (!exam) return res.status(404).json({ message: 'Exam not found' });

  if (exam.examClass !== student.studentClass) {
    return res.status(403).json({ message: 'This exam is not available for your class' });
  }

  const alreadySubmitted = await Result.findOne({ student: student._id, exam: exam._id });
  if (alreadySubmitted) {
    return res.status(400).json({ message: 'You have already submitted this exam' });
  }

  // Strip answers before sending to the student
  const safeQuestions = exam.questions.map(q => ({
    _id: q._id,
    passage: q.passage,
    questionText: q.questionText,
    options: q.options
  }));

  res.json({
    _id: exam._id,
    title: exam.title,
    subject: exam.subject,
    examClass: exam.examClass,
    durationMinutes: exam.durationMinutes,
    questions: safeQuestions
  });
});

// POST /api/student/exams/:id/submit  (submit answers, get score back)
// Expected body: { answers: [ { questionId, selectedOption }, ... ] }
router.post('/exams/:id/submit', requireStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.studentId);
    const exam = await Exam.findById(req.params.id);

    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    if (exam.examClass !== student.studentClass) {
      return res.status(403).json({ message: 'This exam is not available for your class' });
    }

    const alreadySubmitted = await Result.findOne({ student: student._id, exam: exam._id });
    if (alreadySubmitted) {
      return res.status(400).json({ message: 'You have already submitted this exam' });
    }

    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers are required' });
    }

    // Build a quick lookup of questionId -> selected option
    const answerMap = {};
    answers.forEach(a => {
      if (a && a.questionId) answerMap[a.questionId] = a.selectedOption;
    });

    let score = 0;
    exam.questions.forEach(q => {
      const selected = answerMap[q._id.toString()];
      if (selected && selected === q.answer) {
        score += 1;
      }
    });

    const result = await Result.create({
      student: student._id,
      exam: exam._id,
      score,
      totalQuestions: exam.questions.length
    });

    res.status(201).json({
      message: 'Exam submitted',
      score,
      totalQuestions: exam.questions.length
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'You have already submitted this exam' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
