// controllers/subjectController.js
const SubjectData = require('../models/SubjectData');
const ConstraintData = require('../models/ConstraintData'); // Still needed for saveConstraints, but not generateTimetable
const Timetable = require('../models/Timetable');
const { runGeneticAlgorithm } = require('../utils/geneticAlgorithm');

// Helper to convert time strings to minutes for comparison
const timeToMinutes = (timeStr) => {
    if (!timeStr) return -1;
    const match = timeStr.match(/(\d+):(\d+)(AM|PM)/i);
    if (!match) {
        console.warn(`Invalid time format for conversion: ${timeStr}`);
        return -1;
    }
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const period = match[3].toUpperCase();

    if (period === 'PM' && hours !== 12) {
        hours += 12;
    }
    if (period === 'AM' && hours === 12) {
        hours = 0;
    }
    return hours * 60 + minutes;
};


exports.saveSubjects = async (req, res) => {
    const { email, subjects } = req.body;
    try {
        const existingSubjectData = await SubjectData.findOne({ email });
        if (existingSubjectData) {
            existingSubjectData.subjects = subjects;
            await existingSubjectData.save();
            return res.status(200).json({ message: 'Subject data updated successfully.', subjectData: existingSubjectData });
        } else {
            const newSubjectData = new SubjectData({ email, subjects });
            await newSubjectData.save();
            return res.status(201).json({ message: 'Subject data saved successfully.', subjectData: newSubjectData });
        }
    } catch (error) {
        console.error('Error saving subject data:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.saveConstraints = async (req, res) => {
    const { email, constraints } = req.body;
    try {
        const existingConstraintData = await ConstraintData.findOne({ email });
        if (existingConstraintData) {
            existingConstraintData.constraints = constraints;
            await existingConstraintData.save();
            return res.status(200).json({ message: 'Constraint data updated successfully.', constraintData: existingConstraintData });
        } else {
            const newConstraintData = new ConstraintData({ email, constraints });
            await newConstraintData.save();
            return res.status(201).json({ message: 'Constraint data saved successfully.', constraintData: newConstraintData });
        }
    } catch (error) {
        console.error('Error saving constraint data:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.generateTimetable = async (req, res) => {
    // CRITICAL FIX: Get constraints directly from the request body
    const { email, constraints } = req.body; // 'constraints' is now expected in the payload

    try {
        const subjectData = await SubjectData.findOne({ email });

        if (!subjectData || !subjectData.subjects || subjectData.subjects.length === 0) {
            console.log('Backend: No subject data or empty subjects array found for email:', email);
            return res.status(404).json({ message: 'No subject data found for this user.' });
        }
        console.log('Backend: Fetched subjectData:', JSON.stringify(subjectData.subjects, null, 2));

        // CRITICAL FIX: Use the 'constraints' from the request body directly
        // Ensure 'constraints' is an array, default to empty if not provided or invalid
        const activeConstraints = (constraints && Array.isArray(constraints)) ? constraints : [];
        console.log('Backend: Using constraints from request body for generation:', JSON.stringify(activeConstraints, null, 2));

        // Prepare requiredLectures array with subject, teacher, and duration (hours)
        const requiredLectures = [];
        subjectData.subjects.forEach(sub => {
            if (sub.subjectName && sub.subjectName.toUpperCase() !== 'LUNCH BREAK' && sub.teacher && typeof sub.hours === 'number' && sub.hours > 0) {
                if (sub.subjectName.toLowerCase().endsWith('lab') && sub.hours === 2) {
                    requiredLectures.push({
                        subject: sub.subjectName,
                        teacher: sub.teacher,
                        duration: 2,
                    });
                } else {
                    for (let i = 0; i < sub.hours; i++) {
                        requiredLectures.push({
                            subject: sub.subjectName,
                            teacher: sub.teacher,
                            duration: 1,
                        });
                    }
                }
            } else if (sub.subjectName && sub.subjectName.toUpperCase() === 'LUNCH BREAK') {
                console.warn('Backend: Skipping "LUNCH BREAK" from requiredLectures as it is a fixed slot.');
            } else {
                console.warn('Backend: Skipping malformed or zero-hour subject entry:', sub);
            }
        });

        console.log('Backend: Prepared requiredLectures array for GA:', JSON.stringify(requiredLectures, null, 2));

        const schedulableSlots = [
            '10:00AM-10:55AM',
            '11:00AM-11:55AM',
            '12:00PM-12:55PM',
            '1:00PM-1:55PM', // Lunch slot
            '2:00PM-3:00PM',
            '3:00PM-4:00PM',
            '4:00PM-5:00PM'
        ];
        const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        console.log('Backend: Schedulable Slots:', schedulableSlots);
        console.log('Backend: Days:', DAYS);

        // Transform constraints into a format usable by your GA's fitness function
        const teacherUnavailability = {};
        activeConstraints.forEach(con => { // CRITICAL FIX: Use activeConstraints here
            if (con.isUnavailable && con.teacher && con.day) {
                if (!teacherUnavailability[con.teacher]) {
                    teacherUnavailability[con.teacher] = {};
                }
                if (!teacherUnavailability[con.teacher][con.day]) {
                    teacherUnavailability[con.teacher][con.day] = [];
                }
                teacherUnavailability[con.teacher][con.day].push({
                    start: timeToMinutes(con.startTime),
                    end: timeToMinutes(con.endTime)
                });
            } else {
                console.warn('Backend: Skipping malformed or unavailable constraint entry:', con);
            }
        });
        console.log('Backend: Preprocessed Teacher Unavailability for GA:', JSON.stringify(teacherUnavailability, null, 2));

        const generatedSchedule = runGeneticAlgorithm(requiredLectures, teacherUnavailability, schedulableSlots, DAYS);

        console.log('Backend: Raw Timetable Array from GA:', JSON.stringify(generatedSchedule, null, 2));

        if (!generatedSchedule || Object.keys(generatedSchedule).length === 0) {
            console.log('Backend: Genetic algorithm failed to generate a valid timetable or returned an empty object.');
            return res.status(500).json({ message: 'Failed to generate a valid timetable. Try adjusting inputs or constraints.' });
        }

        const daySchedule = generatedSchedule;
        console.log('Backend: Final daySchedule object before saving:', JSON.stringify(daySchedule, null, 2));

        const existingTimetable = await Timetable.findOne({ email });
        if (existingTimetable) {
            existingTimetable.timetable = daySchedule;
            await existingTimetable.save();
            console.log('Backend: Timetable updated in DB for email:', email);
            return res.status(200).json({ message: 'Timetable updated successfully.', timetable: existingTimetable.timetable });
        } else {
            const newTimetable = new Timetable({ email, timetable: daySchedule });
            await newTimetable.save();
            console.log('Backend: New timetable generated and saved in DB for email:', email);
            return res.status(201).json({ message: 'Timetable generated and saved successfully.', timetable: newTimetable.timetable });
        }

    } catch (error) {
        console.error('Backend: Error in generateTimetable:', error.message, error.stack);
        return res.status(500).json({ message: 'Server error during timetable generation', error: error.message });
    }
};

exports.getTimetable = async (req, res) => {
    const adminEmail = 'admin@email.com';
    const userEmail = req.user.email;

    console.log(`Backend: getTimetable called.`);
    console.log(`Backend: Logged-in user's email: ${userEmail}`);
    console.log(`Backend: Admin email configured: ${adminEmail}`);

    try {
        let timetableData;
        timetableData = await Timetable.findOne({ email: adminEmail });
        console.log(`Backend: Attempting to fetch timetable for email: ${adminEmail}`);

        if (!timetableData) {
            console.log('Backend: No timetable found for admin email:', adminEmail);
            return res.status(404).json({ message: "No timetable found. Please ensure it has been generated by the admin." });
        }
        console.log('Backend: Successfully fetched timetable from DB for admin email.');
        res.json({ timetable: timetableData.timetable });
    } catch (err) {
        console.error('Backend: Error in getTimetable:', err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
};

exports.getSubjects = async (req, res) => {
    const email = req.user.email;
    try {
        const subjectData = await SubjectData.findOne({ email });
        if (!subjectData) {
            return res.status(404).json({ message: 'No subject data found.' });
        }
        res.status(200).json(subjectData.subjects);
    } catch (error) {
        console.error('Error fetching subject data:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.getConstraints = async (req, res) => {
    const email = req.user.email;
    try {
        const constraintData = await ConstraintData.findOne({ email });
        if (!constraintData) {
            return res.status(404).json({ message: 'No constraint data found.' });
        }
        res.status(200).json(constraintData.constraints);
    } catch (error) {
        console.error('Error fetching constraint data:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};
