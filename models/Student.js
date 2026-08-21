const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  regNumber: { type: String, required: true, unique: true, trim: true }, // used as login username
  password: { type: String, required: true }, // stored as a bcrypt hash
  studentClass: { type: String, required: true, trim: true } // e.g. "JSS1", "SS2"
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
