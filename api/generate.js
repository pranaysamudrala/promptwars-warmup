/**
 * Vercel Serverless Function Proxy for Gemini API
 * This ensures the API key remains secret on the server-side.
 */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestLog = new Map();

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const clientId = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const now = Date.now();
  const recentRequests = (requestLog.get(clientId) || []).filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many meal-plan requests. Please try again in a few minutes.' });
  }
  recentRequests.push(now);
  requestLog.set(clientId, recentRequests);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY environment variable is not configured on Vercel.'
    });
  }

  try {
    const { prompt, schema } = req.body || {};
    if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > 12000) {
      return res.status(400).json({ error: 'Prompt must be a non-empty string up to 12,000 characters.' });
    }
    if (schema && JSON.stringify(schema).length > 30000) {
      return res.status(400).json({ error: 'Response schema is too large.' });
    }

    // Set up request body for Gemini API
    const geminiBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    };

    // If schema is provided, attach it to target structured JSON output
    if (schema) {
      geminiBody.generationConfig.responseSchema = schema;
    }

    const modelName = 'gemini-1.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(geminiBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API returned an error:', response.status, errorText);
      return res.status(502).json({ error: 'The meal-planning service could not complete this request.' });
    }

    const data = await response.json();
    
    // Extract text and parse it as JSON
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      return res.status(500).json({ error: 'Empty response from Gemini API.' });
    }

    // Validate if it is parseable JSON (which it should be since responseMimeType is set)
    let parsed;
    try {
      parsed = JSON.parse(textResponse.trim());
    } catch (parseError) {
      return res.status(500).json({ 
        error: 'Failed to parse Gemini response as JSON',
        rawText: textResponse 
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: `Serverless Function Error: ${error.message}` });
  }
}
