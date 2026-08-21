const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  passage: { type: String, default: '' }, // optional reading passage for this question
  questionText: { type: String, required: true },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: function (opts) {
        return Array.isArray(opts) && opts.length >= 2;
      },
      message: 'Each question needs at least 2 options'
    }
  },
  answer: { type: String, required: true } // must exactly match one of the options
});

const examSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  examClass: { type: String, required: true, trim: true }, // which class this exam is for
  durationMinutes: { type: Number, required: true, min: 1 }, // how long students get to complete it
  questions: {
    type: [questionSchema],
    required: true,
    validate: {
      validator: function (qs) {
        return Array.isArray(qs) && qs.length > 0;
      },
      message: 'An exam needs at least 1 question'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);
