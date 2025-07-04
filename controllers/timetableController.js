const Timetable = require('../models/Timetable');
const SubjectData = require('../models/SubjectData');
const ConstraintData = require('../models/ConstraintData');
const { runGeneticAlgorithm } = require('../utils/geneticAlgorithm');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

exports.generateTimetable = async (req, res) => {
  const { email } = req.body;
  try {
    const subjectEntry = await SubjectData.findOne({ email });
    if (!subjectEntry) return res.status(404).json({ message: "No subject data found" });

    const constraintEntry = await ConstraintData.findOne({ email });
    const constraints = constraintEntry ? constraintEntry.constraints : [];

    // Prepare requiredLectures array with subject, teacher, and duration (hours)
    const requiredLectures = [];
    subjectEntry.subjects.forEach(sub => {
      for (let i = 0; i < sub.hours; i++) {
        requiredLectures.push({
          subject: sub.subject,
          teacher: sub.teacher,
          duration: 1, // Assuming 1 hour per session; adjust if needed
        });
      }
    });

    // Define schedulable slots (example: 5 slots per day)
    const schedulableSlots = ['9:00-10:00', '10:00-11:00', '11:00-12:00', '1:00-2:00', '2:00-3:00'];

    const timetableArray = runGeneticAlgorithm(requiredLectures, constraints, schedulableSlots, DAYS);

    if (!timetableArray) {
      return res.status(400).json({ message: "Could not generate a valid timetable with given constraints." });
    }

    // Convert timetableArray to daySchedule object
    const daySchedule = {};
    DAYS.forEach(day => daySchedule[day] = []);

    timetableArray.forEach(entry => {
      if (!daySchedule[entry.day]) daySchedule[entry.day] = [];
      daySchedule[entry.day].push({
        subject: entry.subject,
        teacher: entry.teacher,
        timeslot: entry.timeslot,
      });
    });

    await Timetable.findOneAndUpdate(
      { email },
      { email, timetable: daySchedule },
      { upsert: true, new: true }
    );

    res.json({ message: "Timetable generated", timetable: daySchedule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTimetable = async (req, res) => {
  const email = req.user.email;
  try {
    const timetable = await Timetable.findOne({ email });
    if (!timetable) {
      return res.status(404).json({ message: "No timetable found for this user" });
    }
    res.json({ timetable: timetable.timetable });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
