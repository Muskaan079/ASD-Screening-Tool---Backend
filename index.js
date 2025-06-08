require('dotenv').config();
const express = require('express');
const cors = require('cors');
const reportRoutes = require('./routes/report');
const { validateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/generate-report', validateToken, reportRoutes);

// Test endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Test data endpoints
app.get('/api/tests/emotion-data', (req, res) => {
  res.json({
    items: [
      {
        id: 1,
        image: 'happy_face.jpg',
        correctEmotion: 'happy',
        options: ['happy', 'sad', 'angry', 'surprised']
      },
      // Add more test items as needed
    ]
  });
});

app.get('/api/tests/pattern-data', (req, res) => {
  res.json({
    patterns: [
      {
        id: 1,
        sequence: [0, 1, 2, 3],
        difficulty: 'easy'
      },
      // Add more patterns as needed
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 