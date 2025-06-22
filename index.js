require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const reportRoutes = require('./routes/report');
const { validateToken } = require('./middleware/auth');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

// OpenAI integration
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({ 
  apiKey: process.env.OPENAI_API_KEY 
});
const openai = new OpenAIApi(configuration);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      'https://asd-screening-tool-anks.vercel.app',
      'https://asd-screening-tool-anks-pz39vrv0i-muskaan-ss-projects.vercel.app',
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// CORS middleware
app.use(cors({
  origin: [
    'https://asd-screening-tool-anks.vercel.app',
    'https://asd-screening-tool-anks-pz39vrv0i-muskaan-ss-projects.vercel.app',
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Session management
  socket.on('session:start', (sessionData) => {
    console.log('Session started:', sessionData);
    socket.join(`session_${sessionData.id}`);
    socket.emit('session:started', { sessionId: sessionData.id });
  });

  socket.on('session:update', (updateData) => {
    console.log('Session updated:', updateData);
    socket.to(`session_${updateData.id}`).emit('session:updated', updateData);
  });

  socket.on('session:end', (sessionData) => {
    console.log('Session ended:', sessionData);
    socket.leave(`session_${sessionData.id}`);
    socket.emit('session:ended', { sessionId: sessionData.id });
  });

  // Adaptive questioning
  socket.on('adaptive:question', (response) => {
    console.log('Question response received:', response);
    // Process adaptive response and emit analysis
    const analysis = processAdaptiveResponse(response);
    socket.emit('llm:analysis', analysis);
  });

  // Multimodal data
  socket.on('multimodal:data', (data) => {
    console.log('Multimodal data received:', data);
    // Process multimodal data and emit analysis
    const analysis = processMultimodalData(data);
    socket.emit('llm:analysis', analysis);
  });

  // Explainability updates
  socket.on('explainability:request', (data) => {
    console.log('Explainability requested:', data);
    const explainabilityData = generateExplainabilityData(data);
    socket.emit('explainability:update', explainabilityData);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Helper functions for WebSocket events
function processAdaptiveResponse(response) {
  // Analyze response and suggest next action
  const analysis = {
    response: 'Response analyzed successfully',
    confidence: 0.8,
    nextAction: 'continue',
    reasoning: 'Response indicates good understanding',
    suggestedQuestion: null
  };

  // Adjust based on response characteristics
  if (response.responseTime > 10000) {
    analysis.nextAction = 'adjust_difficulty';
    analysis.reasoning = 'Slow response time suggests difficulty adjustment needed';
  }

  if (response.accuracy < 0.5) {
    analysis.nextAction = 'repeat';
    analysis.reasoning = 'Low accuracy suggests question repetition';
  }

  return analysis;
}

function processMultimodalData(data) {
  // Process multimodal context and generate analysis
  const analysis = {
    response: 'Multimodal analysis completed',
    confidence: 0.7,
    nextAction: 'continue',
    reasoning: 'All modalities within normal ranges',
    suggestedQuestion: null
  };

  // Analyze speech patterns
  if (data.speech && data.speech.confidence < 0.5) {
    analysis.nextAction = 'repeat';
    analysis.reasoning = 'Low speech confidence detected';
  }

  // Analyze facial expressions
  if (data.facial && data.facial.expressions) {
    const confusion = data.facial.expressions.surprised + data.facial.expressions.fearful;
    if (confusion > 0.7) {
      analysis.nextAction = 'adjust_difficulty';
      analysis.reasoning = 'High confusion detected in facial expressions';
    }
  }

  return analysis;
}

function generateExplainabilityData(data) {
  return {
    featureImportance: {
      'response_time': 0.3,
      'accuracy': 0.4,
      'voice_tone': 0.2,
      'facial_expression': 0.1
    },
    attentionWeights: [0.3, 0.4, 0.2, 0.1],
    confidenceHeatmap: [[0.8, 0.6], [0.4, 0.9]],
    decisionPath: ['Input processing', 'Feature extraction', 'Model prediction'],
    modelVersion: '1.0.0'
  };
}

// Routes
app.use('/api/generate-report', validateToken, reportRoutes);

// Real LLM API endpoints with OpenAI integration
app.post('/api/llm/analyze', validateToken, async (req, res) => {
  try {
    const { context } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      // Fallback to mock data if no API key
      const analysis = processMultimodalData(context);
      return res.json({ success: true, analysis });
    }
    
    // Create prompt for OpenAI
    const prompt = `Analyze the following ASD screening context and provide a clinical analysis:

Context: ${JSON.stringify(context, null, 2)}

Please provide:
1. A brief summary of the assessment
2. Key observations
3. Potential risk factors
4. Recommendations for next steps
5. Confidence level (0-1)

Format the response as JSON with these fields: summary, observations, riskFactors, recommendations, confidence`;

    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a clinical psychologist specializing in ASD screening and assessment. Provide professional, evidence-based analysis.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const aiResponse = response.data.choices[0].message.content;
    
    // Try to parse JSON response, fallback to text if needed
    let analysis;
    try {
      analysis = JSON.parse(aiResponse);
    } catch (parseError) {
      analysis = {
        summary: aiResponse,
        observations: ['AI analysis completed'],
        riskFactors: ['Analysis provided'],
        recommendations: ['Review with specialist'],
        confidence: 0.7
      };
    }
    
    res.json({ 
      success: true, 
      analysis,
      aiResponse: aiResponse
    });
  } catch (error) {
    console.error('Error analyzing multimodal context:', error);
    
    // Fallback to mock data
    const analysis = processMultimodalData(req.body.context || {});
    res.json({ 
      success: true, 
      analysis,
      error: 'LLM service unavailable, using fallback analysis'
    });
  }
});

app.post('/api/llm/generate-report', validateToken, async (req, res) => {
  try {
    const { sessionData, criteria, format } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      // Fallback to mock data if no API key
      const report = await generateClinicalReport(sessionData, criteria, format);
      return res.json({ success: true, report });
    }
    
    // Create comprehensive prompt for clinical report
    const prompt = `Generate a professional clinical report for ASD screening based on the following data:

Session Data: ${JSON.stringify(sessionData, null, 2)}
Criteria: ${JSON.stringify(criteria, null, 2)}

Please create a comprehensive clinical report including:
1. Executive Summary
2. Test Results Analysis
3. DSM-5 Criteria Assessment
4. ICD-11 Criteria Assessment
5. Clinical Observations
6. Risk Factors
7. Recommendations
8. Confidence Level

Format as JSON with fields: summary, testResults, dsm5Criteria, icd11Criteria, observations, riskFactors, recommendations, confidence`;

    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a licensed clinical psychologist creating professional ASD screening reports. Use clinical terminology and evidence-based assessment criteria.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1500,
      temperature: 0.2,
    });

    const aiResponse = response.data.choices[0].message.content;
    
    // Try to parse JSON response, fallback to structured format if needed
    let report;
    try {
      const parsedReport = JSON.parse(aiResponse);
      report = {
        id: `report_${Date.now()}`,
        sessionId: sessionData.sessionId,
        patientId: sessionData.patientId,
        practitionerId: sessionData.practitionerId,
        date: new Date(),
        ...parsedReport,
        metadata: {
          totalDuration: sessionData.totalDuration || 180000,
          questionsAnswered: sessionData.questionsAnswered || 15,
          adaptiveAdjustments: sessionData.adaptiveAdjustments || 3,
          exportFormat: format || 'pdf',
          generatedBy: 'OpenAI GPT-3.5-turbo'
        }
      };
    } catch (parseError) {
      // Fallback to structured format
      report = {
        id: `report_${Date.now()}`,
        sessionId: sessionData.sessionId,
        patientId: sessionData.patientId,
        practitionerId: sessionData.practitionerId,
        date: new Date(),
        summary: aiResponse,
        testResults: sessionData.testResults || {},
        dsm5Criteria: sessionData.dsm5Criteria || {},
        icd11Criteria: sessionData.icd11Criteria || {},
        observations: ['AI-generated analysis completed'],
        riskFactors: ['Professional assessment recommended'],
        recommendations: ['Follow up with specialist'],
        confidence: 0.7,
        metadata: {
          totalDuration: sessionData.totalDuration || 180000,
          questionsAnswered: sessionData.questionsAnswered || 15,
          adaptiveAdjustments: sessionData.adaptiveAdjustments || 3,
          exportFormat: format || 'pdf',
          generatedBy: 'OpenAI GPT-3.5-turbo'
        }
      };
    }
    
    res.json({ 
      success: true, 
      report,
      aiResponse: aiResponse
    });
  } catch (error) {
    console.error('Error generating clinical report:', error);
    
    // Fallback to mock data
    const report = await generateClinicalReport(req.body.sessionData || {}, req.body.criteria || {}, req.body.format || 'pdf');
    res.json({ 
      success: true, 
      report,
      error: 'LLM service unavailable, using fallback report'
    });
  }
});

app.post('/api/llm/project-development', validateToken, async (req, res) => {
  try {
    const { testData, projectionYears, modelType } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      // Fallback to mock data if no API key
      const projection = await generateDevelopmentalProjection(testData, projectionYears, modelType);
      return res.json({ success: true, projection });
    }
    
    const prompt = `Generate a developmental projection for a child with ASD based on the following test data:

Test Data: ${JSON.stringify(testData, null, 2)}
Projection Years: ${projectionYears || 3}
Model Type: ${modelType || 'llm'}

Please provide:
1. Timeline of projected development
2. Expected skills and milestones
3. Potential risk factors
4. Recommended interventions
5. Confidence level

Format as JSON with fields: timeline, confidence, modelType`;

    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a developmental psychologist specializing in ASD. Provide evidence-based developmental projections and intervention recommendations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const aiResponse = response.data.choices[0].message.content;
    
    let projection;
    try {
      projection = JSON.parse(aiResponse);
    } catch (parseError) {
      projection = await generateDevelopmentalProjection(testData, projectionYears, modelType);
    }
    
    res.json({ 
      success: true, 
      projection,
      aiResponse: aiResponse
    });
  } catch (error) {
    console.error('Error generating developmental projection:', error);
    
    // Fallback to mock data
    const projection = await generateDevelopmentalProjection(req.body.testData || {}, req.body.projectionYears || 3, req.body.modelType || 'llm');
    res.json({ 
      success: true, 
      projection,
      error: 'LLM service unavailable, using fallback projection'
    });
  }
});

app.post('/api/llm/explain', validateToken, async (req, res) => {
  try {
    const { analysisData, explainabilityType } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      // Fallback to mock data if no API key
      const explainability = generateExplainabilityData(analysisData);
      return res.json({ success: true, explainability });
    }
    
    const prompt = `Explain the AI model's decision-making process for the following ASD screening analysis:

Analysis Data: ${JSON.stringify(analysisData, null, 2)}
Explainability Type: ${explainabilityType || 'feature_importance'}

Please provide:
1. Feature importance scores
2. Decision path explanation
3. Confidence factors
4. Model limitations

Format as JSON with fields: featureImportance, decisionPath, confidenceFactors, limitations`;

    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an AI explainability expert. Provide clear, understandable explanations of AI model decisions for clinical applications.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    const aiResponse = response.data.choices[0].message.content;
    
    let explainability;
    try {
      explainability = JSON.parse(aiResponse);
    } catch (parseError) {
      explainability = generateExplainabilityData(analysisData);
    }
    
    res.json({ 
      success: true, 
      explainability,
      aiResponse: aiResponse
    });
  } catch (error) {
    console.error('Error generating explainability data:', error);
    
    // Fallback to mock data
    const explainability = generateExplainabilityData(req.body.analysisData || {});
    res.json({ 
      success: true, 
      explainability,
      error: 'LLM service unavailable, using fallback explainability data'
    });
  }
});

app.post('/api/llm/stream', validateToken, async (req, res) => {
  try {
    const { context } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Stream analysis updates
    const streamAnalysis = async () => {
      try {
        if (process.env.OPENAI_API_KEY) {
          const prompt = `Analyze this ASD screening context in real-time: ${JSON.stringify(context)}`;
          
          const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.3,
            stream: true
          });

          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              res.write(`data: ${JSON.stringify({ content, type: 'analysis' })}\n\n`);
            }
          }
        } else {
          // Fallback to mock streaming
          const analysis = processMultimodalData(context);
          res.write(`data: ${JSON.stringify({ analysis })}\n\n`);
          
          setTimeout(() => {
            const updatedAnalysis = { ...analysis, confidence: 0.9 };
            res.write(`data: ${JSON.stringify({ analysis: updatedAnalysis })}\n\n`);
            res.end();
          }, 2000);
        }
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        const analysis = processMultimodalData(context);
        res.write(`data: ${JSON.stringify({ analysis, error: 'Stream failed' })}\n\n`);
        res.end();
      }
    };
    
    streamAnalysis();
  } catch (error) {
    console.error('Error streaming analysis:', error);
    res.status(500).json({ error: 'Failed to stream analysis' });
  }
});

// Helper functions for new endpoints
async function generateClinicalReport(sessionData, criteria, format) {
  // This would integrate with OpenAI or other LLM service
  return {
    id: `report_${Date.now()}`,
    sessionId: sessionData.sessionId,
    patientId: sessionData.patientId,
    practitionerId: sessionData.practitionerId,
    date: new Date(),
    dsm5Criteria: {
      socialCommunication: {
        socialEmotionalReciprocity: 0.6,
        nonverbalCommunication: 0.7,
        relationships: 0.5
      },
      restrictedRepetitive: {
        stereotypedRepetitive: 0.4,
        insistenceOnSameness: 0.3,
        restrictedInterests: 0.5,
        sensoryHyperreactivity: 0.6
      }
    },
    icd11Criteria: {
      socialInteraction: 0.6,
      communication: 0.7,
      repetitiveBehaviors: 0.4,
      sensoryIssues: 0.6
    },
    testResults: sessionData.testResults,
    aiAnalysis: {
      summary: 'AI-generated clinical summary',
      observations: ['Observation 1', 'Observation 2'],
      riskFactors: ['Risk factor 1', 'Risk factor 2'],
      recommendations: ['Recommendation 1', 'Recommendation 2'],
      confidence: 0.8
    },
    metadata: {
      totalDuration: 180000,
      questionsAnswered: 15,
      adaptiveAdjustments: 3,
      exportFormat: format
    }
  };
}

async function generateDevelopmentalProjection(testData, projectionYears, modelType) {
  const currentAge = testData.age || 8;
  
  return {
    timeline: [
      {
        age: currentAge + 1,
        projectedSkills: ['Improved social communication', 'Better emotion recognition'],
        riskFactors: ['Continued social challenges', 'Academic difficulties'],
        interventions: ['Social skills group', 'Speech therapy']
      },
      {
        age: currentAge + 2,
        projectedSkills: ['Enhanced peer relationships', 'Better academic performance'],
        riskFactors: ['Anxiety in social situations'],
        interventions: ['Cognitive behavioral therapy', 'Continued support']
      }
    ],
    confidence: 0.7,
    modelType: modelType || 'llm'
  };
}

// Test endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date(),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    environment: process.env.NODE_ENV || 'development'
  });
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
      }
    ]
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

module.exports = app; 