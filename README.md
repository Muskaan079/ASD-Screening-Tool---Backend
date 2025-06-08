# ASD Screening Tool Backend

Backend server for the ASD Screening Tool application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with:
```env
PORT=3001
JWT_SECRET=your_jwt_secret_here
OPENAI_API_KEY=your_openai_api_key
FRONTEND_URL=https://your-frontend-url.vercel.app
```

3. Start the server:
```bash
npm start
```

For development:
```bash
npm run dev
```

## API Endpoints

- `GET /api/health` - Health check endpoint
- `GET /api/tests/emotion-data` - Get emotion recognition test data
- `GET /api/tests/pattern-data` - Get pattern recognition test data
- `POST /api/generate-report` - Generate clinical report (requires authentication)

## Environment Variables

- `PORT`: Server port (default: 3001)
- `JWT_SECRET`: Secret key for JWT token generation
- `OPENAI_API_KEY`: OpenAI API key for report generation
- `FRONTEND_URL`: Frontend application URL for CORS 