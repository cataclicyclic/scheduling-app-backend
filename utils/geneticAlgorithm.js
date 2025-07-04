const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']; // Ensure this matches your backend controller's DAYS

// Updated parseTime to handle AM/PM and ensure robust parsing
function parseTime(timeStr) {
    if (!timeStr) return -1; // Indicate no specific time
    const match = timeStr.match(/(\d+):(\d+)(AM|PM)/i); // Added /i for case-insensitive AM/PM
    if (!match) {
        // Fallback for times without AM/PM or invalid format, e.g., "10:00"
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return parts[0] * 60 + parts[1];
        }
        console.warn(`GA: Invalid time format for parseTime: ${timeStr}`);
        return -1; // Or throw an error
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
}

// timeslotToNumeric is fine as it uses parseTime
function timeslotToNumeric(timeslotStr) {
    try {
        const [startStr, endStr] = timeslotStr.split('-');
        return [parseTime(startStr.trim()), parseTime(endStr.trim())];
    } catch (e) {
        console.error(`GA: Error parsing timeslot string "${timeslotStr}":`, e);
        return [0, 0];
    }
}

// CRITICAL FIX: Modified getFinalSchedule to return a structured timetable
// including empty slots and lunch breaks
function getFinalSchedule(individual, requiredLectures, constraints, schedulableSlots, days) {
    const allSlots = [];
    for (const day of days) {
        for (const timeslotStr of schedulableSlots) {
            allSlots.push({ day, timeslot: timeslotStr });
        }
    }

    allSlots.sort((s1, s2) => {
        const day1Idx = days.indexOf(s1.day);
        const day2Idx = days.indexOf(s2.day);
        if (day1Idx !== day2Idx) return day1Idx - day2Idx;
        const [time1Start] = timeslotToNumeric(s1.timeslot);
        const [time2Start] = timeslotToNumeric(s2.timeslot);
        return time1Start - time2Start;
    });

    const consecutiveMap = {};
    for (let i = 0; i < allSlots.length - 1; i++) {
        const s1 = allSlots[i];
        const s2 = allSlots[i + 1];
        if (s1.day === s2.day) {
            const [, s1End] = timeslotToNumeric(s1.timeslot);
            const [s2Start] = timeslotToNumeric(s2.timeslot);
            if (s1End === s2Start) {
                consecutiveMap[i] = i + 1;
            }
        }
    }

    // Initialize the final timetable structure with nulls or placeholders
    const finalTimetableStructured = {};
    days.forEach(day => {
        finalTimetableStructured[day] = new Array(schedulableSlots.length).fill(null);
    });

    const slotOccupancyTracker = new Array(allSlots.length).fill(false); // Tracks if a physical slot is occupied

    // Map lecture indices to actual lecture objects for easier lookup
    const lecturesToPlace = individual.map(idx => requiredLectures[idx]);

    // Attempt to place lectures based on the individual's order
    for (const lecture of lecturesToPlace) {
        if (!lecture || !lecture.subject || !lecture.teacher) {
            continue; // Skip malformed lectures
        }
        const duration = lecture.duration || 1;
        let placed = false;

        for (let i = 0; i < allSlots.length; i++) {
            const currentSlotMeta = allSlots[i]; // { day, timeslot }
            const currentSlotIndexInDay = schedulableSlots.indexOf(currentSlotMeta.timeslot);

            // CRITICAL FIX: Explicitly skip the lunch break slot for subject placement
            if (currentSlotMeta.timeslot === '1:00PM-1:55PM') {
                continue;
            }

            // Check if current slot is available and teacher is not constrained
            const isCurrentSlotAvailable = !slotOccupancyTracker[i] && !checkProfConstraint(lecture, currentSlotMeta, constraints);

            if (duration === 1 && isCurrentSlotAvailable) {
                finalTimetableStructured[currentSlotMeta.day][currentSlotIndexInDay] = {
                    subject: lecture.subject,
                    teacher: lecture.teacher,
                    timeslot: currentSlotMeta.timeslot,
                };
                slotOccupancyTracker[i] = true;
                placed = true;
                break;
            } else if (duration === 2 && i in consecutiveMap) {
                const j = consecutiveMap[i]; // Index of the next physical slot
                const nextSlotMeta = allSlots[j]; // { day, timeslot }
                const nextSlotIndexInDay = schedulableSlots.indexOf(nextSlotMeta.timeslot);

                // CRITICAL FIX: Ensure neither current nor next slot is the lunch break slot if duration is 2
                if (currentSlotMeta.timeslot === '1:00PM-1:55PM' || nextSlotMeta.timeslot === '1:00PM-1:55PM') {
                    continue; // Skip if any part of the 2-hour block overlaps with lunch
                }

                // Check if both physical slots are available and teacher is not constrained for either
                const isNextSlotAvailable = !slotOccupancyTracker[j] && !checkProfConstraint(lecture, nextSlotMeta, constraints);

                if (isCurrentSlotAvailable && isNextSlotAvailable) {
                    finalTimetableStructured[currentSlotMeta.day][currentSlotIndexInDay] = {
                        subject: lecture.subject,
                        teacher: lecture.teacher,
                        timeslot: currentSlotMeta.timeslot,
                    };
                    finalTimetableStructured[nextSlotMeta.day][nextSlotIndexInDay] = {
                        subject: lecture.subject, // Same subject for consecutive slot
                        teacher: lecture.teacher, // Same teacher for consecutive slot
                        timeslot: nextSlotMeta.timeslot,
                    };
                    slotOccupancyTracker[i] = true;
                    slotOccupancyTracker[j] = true;
                    placed = true;
                    break;
                }
            }
        }
        if (!placed) {
            return null; // If a lecture cannot be placed, this individual is invalid
        }
    }

    // After placing all lectures, fill in remaining empty slots and lunch breaks
    days.forEach(day => {
        schedulableSlots.forEach((timeslot, index) => {
            if (finalTimetableStructured[day][index] === null) {
                // CRITICAL FIX: Mark '1:00PM-1:55PM' as Lunch Break
                if (timeslot === '1:00PM-1:55PM') {
                    finalTimetableStructured[day][index] = {
                        subject: 'Lunch Break',
                        teacher: '',
                        timeslot: timeslot,
                    };
                } else {
                    finalTimetableStructured[day][index] = {
                        subject: 'Free',
                        teacher: '',
                        timeslot: timeslot,
                    };
                }
            }
        });
    });

    return finalTimetableStructured;
}


// CRITICAL FIX: Modified checkProfConstraint to correctly use the teacherUnavailability object
function checkProfConstraint(lecture, slot, teacherUnavailability) {
    const teacherConstraintsForDay = teacherUnavailability[lecture.teacher]?.[slot.day];

    if (!teacherConstraintsForDay || teacherConstraintsForDay.length === 0) {
        return false; // No constraints for this teacher on this day
    }

    for (const constItem of teacherConstraintsForDay) {
        const [slotStart, slotEnd] = timeslotToNumeric(slot.timeslot);
        const constStart = constItem.start;
        const constEnd = constItem.end;

        // Check for overlap: [slotStart, slotEnd] overlaps with [constStart, constEnd]
        // Overlap exists if start1 < end2 AND end1 > start2
        if (Math.max(slotStart, constStart) < Math.min(slotEnd, constEnd)) {
            return true; // Professor is unavailable
        }
    }
    return false; // Professor is available
}


function evaluate(individual, requiredLectures, constraints, schedulableSlots, days) {
    const allSlots = [];
    for (const day of days) {
        for (const timeslotStr of schedulableSlots) {
            allSlots.push({ day, timeslot: timeslotStr });
        }
    }

    allSlots.sort((s1, s2) => {
        const day1Idx = days.indexOf(s1.day);
        const day2Idx = days.indexOf(s2.day);
        if (day1Idx !== day2Idx) return day1Idx - day2Idx;
        const [time1Start] = timeslotToNumeric(s1.timeslot);
        const [time2Start] = timeslotToNumeric(s2.timeslot);
        return time1Start - time2Start;
    });

    const consecutiveMap = {};
    for (let i = 0; i < allSlots.length - 1; i++) {
        const s1 = allSlots[i];
        const s2 = allSlots[i + 1];
        if (s1.day === s2.day) {
            const [, s1End] = timeslotToNumeric(s1.timeslot);
            const [s2Start] = timeslotToNumeric(s2.timeslot);
            if (s1End === s2Start) {
                consecutiveMap[i] = i + 1;
            }
        }
    }

    const slotOccupied = new Array(allSlots.length).fill(false);
    let lecturesPlaced = 0;
    let penalty = 0;
    const lecturesPerDayCount = {}; // To track distribution
    days.forEach(day => lecturesPerDayCount[day] = 0);

    for (const lectureIndex of individual) {
        const lecture = requiredLectures[lectureIndex];
        if (!lecture || !lecture.subject || !lecture.teacher) { // Basic validation
            penalty += 1000; // Heavy penalty for invalid lecture
            continue;
        }
        const duration = lecture.duration || 1;
        let placed = false;

        for (let i = 0; i < allSlots.length; i++) {
            const currentSlot = allSlots[i];
            const nextSlotIndex = consecutiveMap[i];

            // CRITICAL FIX: If the current slot is the lunch break, do NOT attempt to place a subject.
            // This makes the lunch slot a hard exclusion for subject placement.
            if (currentSlot.timeslot === '1:00PM-1:55PM') {
                // No penalty needed here, as we are simply skipping it as a valid placement option.
                continue;
            }

            // CRITICAL FIX: If a 2-hour subject would overlap with the lunch slot, skip it.
            if (duration === 2 && nextSlotIndex !== undefined && allSlots[nextSlotIndex]) {
                const nextSlot = allSlots[nextSlotIndex];
                if (nextSlot.timeslot === '1:00PM-1:55PM' || currentSlot.timeslot === '1:00PM-1:55PM') {
                    // No penalty needed here, as we are simply skipping it as a valid placement option.
                    continue;
                }
            }

            if (duration === 1 && !slotOccupied[i]) {
                if (!checkProfConstraint(lecture, currentSlot, constraints)) { // Pass constraints (teacherUnavailability)
                    slotOccupied[i] = true;
                    placed = true;
                    lecturesPlaced++;
                    lecturesPerDayCount[currentSlot.day]++; // Track for distribution
                    break;
                } else {
                    penalty += 5; // Small penalty for trying to place in a constrained slot
                }
            }
            else if (duration === 2 && nextSlotIndex !== undefined && allSlots[nextSlotIndex]) {
                const nextSlot = allSlots[nextSlotIndex];
                if (!slotOccupied[i] && !slotOccupied[nextSlotIndex]) {
                    // Check constraints for both slots
                    if (!checkProfConstraint(lecture, currentSlot, constraints) && !checkProfConstraint(lecture, nextSlot, constraints)) {
                        slotOccupied[i] = true;
                        slotOccupied[nextSlotIndex] = true;
                        placed = true;
                        lecturesPlaced += 2; // Count both hours
                        lecturesPerDayCount[currentSlot.day] += 2; // Track for distribution
                        break;
                    } else {
                        penalty += 10; // Small penalty for trying to place in a constrained 2-hour slot
                    }
                }
            }
        }

        if (!placed) {
            penalty += 100; // Heavy penalty if lecture cannot be placed at all
        }
    }

    // --- Soft Constraint for Even Distribution ---
    const activeDays = days.filter(day => schedulableSlots.length > 0); // Only consider days with slots
    if (activeDays.length > 0 && lecturesPlaced > 0) {
        const averageLecturesPerDay = lecturesPlaced / activeDays.length;
        let distributionPenalty = 0;
        activeDays.forEach(day => {
            distributionPenalty += Math.pow(lecturesPerDayCount[day] - averageLecturesPerDay, 2);
        });
        // CRITICAL FIX: Increased the multiplier for distribution penalty
        penalty += distributionPenalty * 5.0; // Increased soft penalty significantly
    }
    // ---------------------------------------------

    const score = (lecturesPlaced * 100) - (penalty * 10); // Adjust multipliers as needed for fitness
    return score;
}


function runGeneticAlgorithm(requiredLectures, constraints, schedulableSlots, days) {
    console.log('GA: runGeneticAlgorithm called with:');
    console.log('  requiredLectures count:', requiredLectures.length);
    console.log('  constraints (teacherUnavailability) keys:', Object.keys(constraints));
    console.log('  schedulableSlots count:', schedulableSlots.length);
    console.log('  days count:', days.length);

    // CRITICAL FIX: Increased populationSize and generations for better exploration
    const populationSize = 1000; // Increased from 500
    const generations = 2000;   // Increased from 1000
    const mutationRate = 0.05;  // Slightly reduced from 0.08
    const crossoverRate = 0.8;

    const lectureIndices = requiredLectures.map((_, i) => i);
    const population = [];

    if (lectureIndices.length === 0) {
        console.warn('GA: No lectures to schedule. Returning null.');
        return null;
    }

    for (let i = 0; i < populationSize; i++) {
        population.push(shuffleArray([...lectureIndices]));
    }

    let bestIndividual = null;
    let bestScore = -Infinity;

    for (let gen = 0; gen < generations; gen++) {
        const scoredPopulation = population.map(ind => ({
            individual: ind,
            score: evaluate(ind, requiredLectures, constraints, schedulableSlots, days),
        }));

        scoredPopulation.sort((a, b) => b.score - a.score);

        if (scoredPopulation[0].score > bestScore) {
            bestScore = scoredPopulation[0].score;
            bestIndividual = scoredPopulation[0].individual;
        }

        // CRITICAL FIX: Lowered the threshold for a "valid" timetable
        // This makes it more likely to return a timetable even if not perfectly optimal
        if (bestScore >= requiredLectures.length * 100 * 0.6) { // Still 0.6
            console.log(`GA: Optimal solution found at generation ${gen} with score ${bestScore}.`);
            break;
        }

        const selected = scoredPopulation.slice(0, Math.floor(populationSize * 0.5)).map(s => s.individual);

        const newPopulation = [];
        if (bestIndividual) {
            newPopulation.push(bestIndividual);
        }

        while (newPopulation.length < populationSize) {
            const parent1 = selected[Math.floor(Math.random() * selected.length)];
            const parent2 = selected[Math.floor(Math.random() * selected.length)];

            let offspring1 = [...parent1];
            let offspring2 = [...parent2];

            if (Math.random() < crossoverRate) {
                [offspring1, offspring2] = orderedCrossover(parent1, parent2);
            }

            if (Math.random() < mutationRate) {
                offspring1 = mutate(offspring1);
            }
            if (Math.random() < mutationRate) {
                offspring2 = mutate(offspring2);
            }

            newPopulation.push(offspring1, offspring2);
        }

        population.length = 0;
        population.push(...newPopulation.slice(0, populationSize));
    }

    console.log('GA: Final best score:', bestScore);
    console.log('GA: Required lectures count:', requiredLectures.length);

    // CRITICAL FIX: Lowered the final check threshold as well
    if (bestScore < requiredLectures.length * 100 * 0.6) { // Still 0.6
        console.warn('GA: Best score not sufficient to consider a valid timetable. Returning null.');
        return null;
    }

    // CRITICAL CHANGE: getFinalSchedule now returns the structured timetable directly
    return getFinalSchedule(bestIndividual, requiredLectures, constraints, schedulableSlots, days);
}

// Helper functions

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        // CRITICAL FIX: Corrected the array swap operation
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function orderedCrossover(parent1, parent2) {
    const size = parent1.length;
    const start = Math.floor(Math.random() * size);
    const end = Math.floor(Math.random() * size);

    const [l, r] = start < end ? [start, end] : [end, start];

    const offspring1 = new Array(size).fill(null);
    const offspring2 = new Array(size).fill(null);

    for (let i = l; i <= r; i++) {
        offspring1[i] = parent1[i];
        offspring2[i] = parent2[i];
    }

    let currentIndex1 = (r + 1) % size;
    let currentIndex2 = (r + 1) % size;

    for (let i = 0; i < size; i++) {
        const idx = (r + 1 + i) % size;

        if (!offspring1.includes(parent2[idx])) {
            offspring1[currentIndex1] = parent2[idx];
            currentIndex1 = (currentIndex1 + 1) % size;
        }

        if (!offspring2.includes(parent1[idx])) {
            offspring2[currentIndex2] = parent1[idx];
            currentIndex2 = (currentIndex2 + 1) % size;
        }
    }

    return [offspring1, offspring2];
}

function mutate(individual) {
    if (individual.length < 2) return individual;
    const idx1 = Math.floor(Math.random() * individual.length);
    let idx2 = Math.floor(Math.random() * individual.length);
    while (idx1 === idx2) {
        idx2 = Math.floor(Math.random() * individual.length);
    }
    const newInd = [...individual];
    [newInd[idx1], newInd[idx2]] = [newInd[idx2], newInd[idx1]];
    return newInd;
}

module.exports = {
    runGeneticAlgorithm,
};
