/**
 * Speech-to-Text vía Groq Whisper (OpenAI-compatible /audio/transcriptions).
 * Recibe un Buffer de audio (wav/webm/mp3...) y devuelve el texto transcrito.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType = 'audio/wav',
): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || '';
  if (!apiKey) {
    throw new Error('STT requiere LLM_API_KEY (Groq) configurada');
  }
  const baseUrl = process.env.LLM_API_URL || 'https://api.groq.com/openai/v1';
  const model = process.env.STT_MODEL || 'whisper-large-v3';
  const url = `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`;

  const form = new FormData();
  const ext = mimeType.includes('wav') ? 'wav' : 'webm';
  const bytes = new Uint8Array(audioBuffer).slice();
  form.append('model', model);
  form.append('file', new Blob([bytes.buffer], { type: mimeType }), `recording.${ext}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}