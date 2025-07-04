const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv'); // If you're using dotenv for local env variables
const cors = require('cors'); // CRITICAL: Import cors middleware

// Load environment variables (if you have a .env file locally)
dotenv.config();

const app = express();

// Connect to MongoDB
const connectDB = async () => {
  try {
    // Use environment variable for production, fallback for local testing
    // IMPORTANT: Replace YOUR_PASSWORD with the actual password for Ishan4701 user in MongoDB Atlas
    const mongoURI = process.env.MONGO_URI || 'mongodb+srv://Ishan4701:Dexter1074_ishan@cluster0.ghwstnc.mongodb.net/timetable_db?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // useCreateIndex: true, // Deprecated in newer Mongoose versions
      // useFindAndModify: false // Deprecated in newer Mongoose versions
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error(err.message);
    process.exit(1); // Exit process with failure
  }
};
connectDB(); // Call the connectDB function to establish connection

// CRITICAL: Configure CORS middleware
// For development, you must allow your frontend's specific origins.
// Replace 192.168.126.1 with your actual local network IP if Expo uses a different one.
app.use(cors({
  origin: [
    'http://localhost:8081', // For web browser development
    'exp://192.168.29.47:8081',
    'exp://192.168.126.1:19000', // Common Expo development server URL
    'exp://192.168.126.1:8081',   // Another common Expo development server URL
    // Add other specific origins if your app runs on different local IPs or ports
    // For production mobile apps, you might need to allow 'null' origin or a specific domain if using webviews
    // For deployed frontend (if you deploy web version), add its URL here: 'https://your-deployed-frontend.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow Authorization header for JWTs
  credentials: true // Allow sending cookies/authorization headers
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Import Routes
const authRoutes = require('./routes/authRoutes'); // Ensure correct path
const subjectRoutes = require('./routes/subjectRoutes'); // Ensure correct path

// Use Routes
app.use('/api/auth', authRoutes); // Auth routes under /api/auth
app.use('/api', subjectRoutes); // Subject/Timetable routes directly under /api

// Basic route for testing server
app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000; // Use environment variable for PORT
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
