// models/SubjectData.js
const mongoose = require('mongoose');

const subjectItemSchema = new mongoose.Schema({
    subjectName: { type: String, required: true },
    teacher: { type: String, required: true },
    hours: { type: Number, required: true } // Total hours for the subject taught by this teacher
});

const subjectDataSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true }, // Or use userId if you're handling JWT
    subjects: [subjectItemSchema]
});

module.exports = mongoose.model('SubjectData', subjectDataSchema);