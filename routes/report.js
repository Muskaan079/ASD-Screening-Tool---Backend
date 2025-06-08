const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const { validateToken } = require('../middleware/auth');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware to validate request body
const validateReportData = (req, res, next) => {
  const { testResults, patientInfo } = req.body;

  if (!testResults || !patientInfo) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  if (!patientInfo.id || !patientInfo.name || !patientInfo.age) {
    return res.status(400).json({ error: 'Invalid patient information' });
  }

  next();
};

// Generate clinical report
router.post('/generate-report', validateToken, validateReportData, async (req, res) => {
  try {
    const { testResults, patientInfo } = req.body;

    // Prepare test scores summary
    const scores = {
      emotionScore: calculateEmotionScore(testResults.emotionTest),
      reactionScore: calculateReactionScore(testResults.reactionTest),
      patternScore: calculatePatternScore(testResults.patternTest),
    };

    // Generate report content using OpenAI
    const prompt = generateReportPrompt(patientInfo, scores, testResults);
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a clinical expert in ASD assessment. Generate a professional clinical report based on the provided screening data. Focus on observations, patterns, and evidence-based recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    // Parse the generated content
    const generatedReport = parseGeneratedReport(completion.choices[0].message.content);

    // Prepare the final report
    const report = {
      patientInfo,
      scores,
      observations: generatedReport.observations,
      interpretations: {
        emotionTest: interpretEmotionScore(scores.emotionScore),
        reactionTest: interpretReactionScore(scores.reactionScore),
        patternTest: interpretPatternScore(scores.patternScore),
      },
      recommendations: generatedReport.recommendations,
      redFlags: generatedReport.redFlags,
      timestamp: new Date().toISOString(),
    };

    res.json({ report });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Helper functions
function calculateEmotionScore(emotionTest) {
  if (!emotionTest || !emotionTest.length) return 0;
  const correct = emotionTest.filter(test => test.isCorrect).length;
  return Math.round((correct / emotionTest.length) * 100);
}

function calculateReactionScore(reactionTest) {
  if (!reactionTest || !reactionTest.length) return 0;
  const validTimes = reactionTest
    .filter(test => test.valid)
    .map(test => test.reactionTime);
  return Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length);
}

function calculatePatternScore(patternTest) {
  if (!patternTest || !patternTest.length) return 0;
  const correct = patternTest.filter(test => test.isCorrect).length;
  return Math.round((correct / patternTest.length) * 100);
}

function interpretEmotionScore(score) {
  if (score >= 80) return "Strong emotion recognition abilities";
  if (score >= 60) return "Moderate emotion recognition abilities";
  return "Difficulty with emotion recognition, further assessment recommended";
}

function interpretReactionScore(score) {
  if (score <= 300) return "Quick reaction time, within typical range";
  if (score <= 500) return "Moderate reaction time";
  return "Delayed reaction time, may indicate attention processing differences";
}

function interpretPatternScore(score) {
  if (score >= 80) return "Strong pattern recognition and memory abilities";
  if (score >= 60) return "Moderate pattern recognition abilities";
  return "Difficulty with pattern recognition, further assessment recommended";
}

function generateReportPrompt(patientInfo, scores, testResults) {
  return `
Generate a comprehensive clinical report for ASD screening assessment. Structure the report into the following sections:

1. EXECUTIVE SUMMARY
Provide a brief overview of the assessment results and key findings.

2. DETAILED OBSERVATIONS
Analyze the following test scores:

Emotion Recognition: ${scores.emotionScore}%
- Below 60%: Significant difficulty in emotion recognition
- 60-80%: Moderate ability, some challenges present
- Above 80%: Strong emotion recognition skills

Reaction Time: ${scores.reactionScore}ms
- Below 300ms: Typical response time
- 300-500ms: Moderate delay, possible attention differences
- Above 500ms: Significant delay, indicates processing differences

Pattern Recognition: ${scores.patternScore}%
- Below 60%: Difficulty with pattern recognition and sequencing
- 60-80%: Moderate pattern recognition abilities
- Above 80%: Strong pattern recognition and cognitive processing

3. COGNITIVE AND EMOTIONAL ASSESSMENT
Evaluate cognitive processing, emotional understanding, and behavioral patterns based on test performance.

4. RED FLAGS AND RISK INDICATORS
List any concerning patterns or indicators that warrant immediate attention:
- Emotion recognition score below 60%
- Reaction time consistently above 500ms
- Pattern recognition score below 60%
- Significant inconsistency across test performance

5. RECOMMENDATIONS
Provide specific, actionable recommendations for:
- Further clinical assessment if needed
- Therapeutic interventions
- Support strategies for caregivers
- Educational accommodations if applicable

6. CLINICAL DISCLAIMER
Include standard clinical disclaimer about:
- This being a screening tool, not a diagnostic assessment
- Need for comprehensive evaluation by qualified professionals
- Importance of considering developmental context

Patient Information:
Name: ${patientInfo.name}
Age: ${patientInfo.age}
Gender: ${patientInfo.gender}
Date of Assessment: ${new Date().toLocaleDateString()}

Format the response in clear sections using the above structure. Be specific, professional, and evidence-based in your observations and recommendations.
`;
}

function parseGeneratedReport(content) {
  const sections = content.split(/\d\.\s+(?:EXECUTIVE SUMMARY|DETAILED OBSERVATIONS|COGNITIVE AND EMOTIONAL ASSESSMENT|RED FLAGS AND RISK INDICATORS|RECOMMENDATIONS|CLINICAL DISCLAIMER)/i);
  
  // Remove empty sections and trim whitespace
  const cleanSections = sections.filter(section => section.trim());

  const observations = [];
  const recommendations = [];
  let redFlags = [];

  // Parse each section based on its content
  cleanSections.forEach((section, index) => {
    const sectionContent = section.trim();
    
    if (sectionContent.toLowerCase().includes('observation') || index === 1) {
      // Detailed Observations section
      const observationPoints = sectionContent.split('\n').filter(line => line.trim());
      observationPoints.forEach(point => {
        if (point.trim()) {
          observations.push({
            category: 'Clinical Observation',
            details: point.trim(),
          });
        }
      });
    } else if (sectionContent.toLowerCase().includes('recommend') || index === 4) {
      // Recommendations section
      const recommendationPoints = sectionContent.split('\n').filter(line => line.trim());
      recommendationPoints.forEach(point => {
        if (point.trim()) {
          recommendations.push(point.trim());
        }
      });
    } else if (sectionContent.toLowerCase().includes('red flag') || index === 3) {
      // Red Flags section
      const flagPoints = sectionContent.split('\n').filter(line => line.trim());
      redFlags = flagPoints.map(flag => flag.trim());
    }
  });

  return {
    observations,
    recommendations,
    redFlags,
  };
}

module.exports = router; 