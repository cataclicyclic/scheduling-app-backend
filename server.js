const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/authRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
// const timetableRoutes = require('./routes/timetableRoutes'); // This line is no longer needed

// Register routes under /api
app.use('/api', authRoutes);
app.use('/api', subjectRoutes);
// app.use('/api', timetableRoutes); // This line is no longer needed and was causing the error

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(5000, () => console.log('Server running on http://localhost:5000'));
  })
  .catch(err => console.error(err));
