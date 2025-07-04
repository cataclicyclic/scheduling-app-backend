// models/ConstraintData.js
const mongoose = require('mongoose');

const constraintItemSchema = new mongoose.Schema({
    teacher: { type: String, required: true },
    day: { type: String, required: true },
    startTime: { type: String }, // Optional start time (e.g., "10:00AM")
    endTime: { type: String },   // Optional end time (e.g., "11:00AM")
    isUnavailable: { type: Boolean, default: true } // True for unavailability, can be extended for availability if needed
});

const ConstraintSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
    },
    constraints: [constraintItemSchema],
});

module.exports = mongoose.model('ConstraintData', ConstraintSchema);