/*const express = require('express');
const router = express.Router();
const { generateTimetable, getTimetable } = require('../controllers/timetableController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const Timetable = require('../models/Timetable');

router.post('/generate-timetable', protect, requireAdmin, generateTimetable);
router.get('/timetable', protect, getTimetable); // accessible to all logged-in users

module.exports = router;
*/