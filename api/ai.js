import process from 'node:process';

const APIFREELLM_ENDPOINT = 'https://apifreellm.com/api/v1/chat';
const APIFREELLM_MODEL = 'apifreellm';

import { validateAiPromptRequest } from '../src/utils/aiPromptValidation.js';

function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

function readServerToken() {
  return String(process.env.AI_TOKEN || process.env.VITE_AI_TOKEN || '').trim();
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { success: false, error: 'Method not allowed.' });
  }

  const apiKey = readServerToken();
  if (!apiKey) {
    return sendJson(response, 500, {
      success: false,
      error: 'AI token is not configured on the server. Add AI_TOKEN to your Vercel project environment variables (Settings > Environment Variables).',
    });
  }

  const validation = validateAiPromptRequest({
    message: request.body?.message,
    model: request.body?.model,
    defaultModel: APIFREELLM_MODEL,
  });

  if (!validation.ok) {
    return sendJson(response, 400, { success: false, error: validation.error });
  }

  const message = validation.message;
  const model = validation.model;

  try {
    const upstream = await fetch(APIFREELLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ message, model }),
    });

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const payloadText = await upstream.text();

    if (!upstream.ok) {
      const statusCode = upstream.status;
      if (statusCode === 401 || statusCode === 403) {
        return sendJson(response, statusCode, {
          success: false,
          error: 'The AI provider rejected the configured key. Verify your AI_TOKEN in Vercel environment variables (Settings > Environment Variables). The token may be expired or invalid.',
        });
      }
      if (statusCode === 429) {
        return sendJson(response, 429, {
          success: false,
          error: 'The AI provider rate-limited this key. Wait a minute and try again.',
        });
      }
    }

    response.status(upstream.status);
    response.setHeader('Content-Type', contentType);
    response.send(payloadText);
  } catch (error) {
    return sendJson(response, 502, {
      success: false,
      error: error?.message || 'Failed to reach the upstream AI provider.',
    });
  }
}