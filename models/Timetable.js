const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  timetable: { type: Object, required: true }
});

module.exports = mongoose.model('Timetable', timetableSchema);
