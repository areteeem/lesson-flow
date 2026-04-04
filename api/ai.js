const APIFREELLM_ENDPOINT = 'https://apifreellm.com/api/v1/chat';
const APIFREELLM_MODEL = 'apifreellm';

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
    return sendJson(response, 500, { success: false, error: 'AI token is not configured on the server.' });
  }

  const message = String(request.body?.message || '').trim();
  const model = String(request.body?.model || APIFREELLM_MODEL).trim() || APIFREELLM_MODEL;

  if (!message) {
    return sendJson(response, 400, { success: false, error: 'AI prompt is empty.' });
  }

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