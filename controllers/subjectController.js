// controllers/subjectController.js
const SubjectData = require('../models/SubjectData');
const ConstraintData = require('../models/ConstraintData');
const Timetable = require('../models/Timetable'); // Assuming you want to keep timetable generation here
const { runGeneticAlgorithm } = require('../utils/geneticAlgorithm'); // Import the GA

// Helper to convert time strings to minutes for comparison
const timeToMinutes = (timeStr) => {
    if (!timeStr) return -1; // Indicate no specific time
    const match = timeStr.match(/(\d+):(\d+)(AM|PM)/i); // Added /i for case-insensitive AM/PM
    if (!match) {
        console.warn(`Invalid time format for conversion: ${timeStr}`);
        return -1; // Or throw an error, depending on desired strictness
    }
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const period = match[3].toUpperCase();

    if (period === 'PM' && hours !== 12) {
        hours += 12;
    }
    if (period === 'AM' && hours === 12) { // Midnight case (12:xx AM is 0 hours)
        hours = 0;
    }
    return hours * 60 + minutes;
};


exports.saveSubjects = async (req, res) => {
    const { email, subjects } = req.body; // 'subjects' will now be an array of { subjectName, teacher, hours }
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
    const { email, constraints } = req.body; // 'constraints' will now be an array of { teacher, day, startTime, endTime }
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
    const { email } = req.body; // Assuming email comes from authenticated user
    try {
        const subjectData = await SubjectData.findOne({ email });
        const constraintData = await ConstraintData.findOne({ email });

        if (!subjectData || !subjectData.subjects || subjectData.subjects.length === 0) {
            console.log('Backend: No subject data or empty subjects array found for email:', email);
            return res.status(404).json({ message: 'No subject data found for this user.' });
        }
        console.log('Backend: Fetched subjectData:', JSON.stringify(subjectData.subjects, null, 2));

        const constraints = constraintData ? constraintData.constraints : [];
        console.log('Backend: Fetched constraints:', JSON.stringify(constraints, null, 2));

        // Prepare requiredLectures array with subject, teacher, and duration (hours)
        const requiredLectures = [];
        subjectData.subjects.forEach(sub => {
            // Ensure sub.subjectName is used as per the schema
            // Add validation to ensure sub.hours is a valid number
            // Exclude "LUNCH BREAK" from requiredLectures
            if (sub.subjectName && sub.subjectName.toUpperCase() !== 'LUNCH BREAK' && sub.teacher && typeof sub.hours === 'number' && sub.hours > 0) {
                // CRITICAL FIX: Handle 'Lab' subjects for 2-hour continuous blocks
                if (sub.subjectName.toLowerCase().endsWith('lab') && sub.hours === 2) {
                    requiredLectures.push({
                        subject: sub.subjectName,
                        teacher: sub.teacher,
                        duration: 2, // Mark as 2-hour block
                    });
                } else {
                    // For other subjects or labs not requiring 2-hour continuous blocks
                    for (let i = 0; i < sub.hours; i++) {
                        requiredLectures.push({
                            subject: sub.subjectName,
                            teacher: sub.teacher,
                            duration: 1, // Default 1-hour session
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

        // CRITICAL FIX: Updated schedulableSlots to include ALL 7 slots from your image
        // This array should match the time slots from your Excel file's header row.
        const schedulableSlots = [
            '10:00AM-10:55AM',
            '11:00AM-11:55AM',
            '12:00PM-12:55PM',
            '1:00PM-1:55PM', // Lunch slot
            '2:00PM-3:00PM',
            '3:00PM-4:00PM', // Corrected slot
            '4:00PM-5:00PM'  // Added this slot
        ];
        const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']; // Define days here if not global
        console.log('Backend: Schedulable Slots:', schedulableSlots);
        console.log('Backend: Days:', DAYS);

        // Transform constraints into a format usable by your GA's fitness function
        const teacherUnavailability = {};
        constraints.forEach(con => {
            if (con.isUnavailable && con.teacher && con.day) {
                if (!teacherUnavailability[con.teacher]) {
                    teacherUnavailability[con.teacher] = {};
                }
                if (!teacherUnavailability[con.teacher][con.day]) {
                    teacherUnavailability[con.teacher][con.day] = [];
                }
                // Store unavailability in minutes for easier comparison
                teacherUnavailability[con.teacher][con.day].push({
                    start: timeToMinutes(con.startTime),
                    end: timeToMinutes(con.endTime)
                });
            } else {
                console.warn('Backend: Skipping malformed or unavailable constraint entry:', con);
            }
        });
        console.log('Backend: Preprocessed Teacher Unavailability for GA:', JSON.stringify(teacherUnavailability, null, 2));


        // Pass arguments to runGeneticAlgorithm correctly
        const generatedSchedule = runGeneticAlgorithm(requiredLectures, teacherUnavailability, schedulableSlots, DAYS);

        console.log('Backend: Raw Timetable Array from GA:', JSON.stringify(generatedSchedule, null, 2));

        // Check if a valid timetable was generated (it's an object, not an array)
        if (!generatedSchedule || Object.keys(generatedSchedule).length === 0) {
            console.log('Backend: Genetic algorithm failed to generate a valid timetable or returned an empty object.');
            return res.status(500).json({ message: 'Failed to generate a valid timetable. Try adjusting inputs or constraints.' });
        }

        // The generatedSchedule is already the daySchedule object, so no need for further transformation
        const daySchedule = generatedSchedule;
        console.log('Backend: Final daySchedule object before saving:', JSON.stringify(daySchedule, null, 2));


        // Save generated timetable
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
        console.error('Backend: Error in generateTimetable:', error.message, error.stack); // Log full error stack
        return res.status(500).json({ message: 'Server error during timetable generation', error: error.message });
    }
};

exports.getTimetable = async (req, res) => {
    // Assuming the admin generates the "master" timetable,
    // we'll fetch the timetable associated with the admin's email.
    // You might want to make this configurable or fetch the actual admin email from DB.
    const adminEmail = 'admin@email.com'; // <<<--- IMPORTANT: Replace with your actual admin email
    const userEmail = req.user.email; // The email of the currently logged-in user

    console.log(`Backend: getTimetable called.`);
    console.log(`Backend: Logged-in user's email: ${userEmail}`);
    console.log(`Backend: Admin email configured: ${adminEmail}`);

    try {
        let timetableData;
        // Always fetch the timetable associated with the admin's email for all users
        timetableData = await Timetable.findOne({ email: adminEmail });
        console.log(`Backend: Attempting to fetch timetable for email: ${adminEmail}`);


        if (!timetableData) {
            console.log('Backend: No timetable found for admin email:', adminEmail);
            return res.status(404).json({ message: "No timetable found. Please ensure it has been generated by the admin." });
        }
        console.log('Backend: Successfully fetched timetable from DB for admin email.');
        // console.log('Backend: Fetched timetable data:', JSON.stringify(timetableData.timetable, null, 2)); // Uncomment for full data log

        res.json({ timetable: timetableData.timetable });
    } catch (err) {
        console.error('Backend: Error in getTimetable:', err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
};

// You might also need a getSubjects and getConstraints if your frontend needs to pre-populate existing data
exports.getSubjects = async (req, res) => {
    // Assuming email from query param or req.user.email
    const email = req.user.email; // Use req.user.email if protected route
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
    // Assuming email from query param or req.user.email
    const email = req.user.email; // Use req.user.email if protected route
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
