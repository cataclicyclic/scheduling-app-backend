// backend/routes/subjectRoutes.js
const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController'); // ✅ this must exist
const { protect, requireAdmin } = require('../middleware/authMiddleware');

// ✅ These must point to real functions in your controller file
router.post('/subjects', protect, requireAdmin, subjectController.saveSubjects);
router.post('/constraints', protect, requireAdmin, subjectController.saveConstraints);
router.post('/generate-timetable', protect, requireAdmin, subjectController.generateTimetable);
router.get('/timetable', protect, subjectController.getTimetable);

module.exports = router;
