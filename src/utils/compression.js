import { deflate, inflate } from 'pako';

function toBase64(bytes) {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function compressJsonPayload(value) {
  const json = JSON.stringify(value ?? null);
  const compressed = deflate(json);
  return {
    encoding: 'deflate-base64',
    data: toBase64(compressed),
    originalBytes: json.length,
    compressedBytes: compressed.length,
  };
}

export function decompressJsonPayload(payload) {
  if (!payload || payload.encoding !== 'deflate-base64' || !payload.data) return null;
  try {
    const bytes = fromBase64(payload.data);
    const json = inflate(bytes, { to: 'string' });
    return JSON.parse(json);
  } catch {
    return null;
  }
}
