require('dotenv').config();
const express = require('express');
const cors = require('cors');
const reportRoutes = require('./routes/report');
const { validateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'https://asd-screening-tool-anks.vercel.app',
    'https://asd-screening-tool-anks-pz39vrv0i-muskaan-ss-projects.vercel.app',
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ],
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
        image: 'https://example.com/images/happy.jpg',
        correctEmotion: 'happy',
        options: ['happy', 'sad', 'angry', 'surprised']
      },
      {
        id: 2,
        image: 'https://example.com/images/sad.jpg',
        correctEmotion: 'sad',
        options: ['happy', 'sad', 'angry', 'surprised']
      },
      {
        id: 3,
        image: 'https://example.com/images/angry.jpg',
        correctEmotion: 'angry',
        options: ['happy', 'sad', 'angry', 'surprised']
      },
      {
        id: 4,
        image: 'https://example.com/images/surprised.jpg',
        correctEmotion: 'surprised',
        options: ['happy', 'sad', 'angry', 'surprised']
      }
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
      {
        id: 2,
        sequence: [0, 2, 4, 6],
        difficulty: 'medium'
      },
      {
        id: 3,
        sequence: [1, 3, 6, 2, 5],
        difficulty: 'hard'
      },
      {
        id: 4,
        sequence: [0, 1, 1, 2, 3, 5],
        difficulty: 'hard'
      }
    ]
  });
});

// Save test results endpoint
app.post('/api/test-results', async (req, res) => {
  try {
    const { testType, score, answers, totalTime } = req.body;
    // For now, just acknowledge the save
    res.json({ 
      success: true, 
      message: 'Test results saved successfully',
      data: { testType, score, totalTime }
    });
  } catch (error) {
    console.error('Error saving test results:', error);
    res.status(500).json({ error: 'Failed to save test results' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 