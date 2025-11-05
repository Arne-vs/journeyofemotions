// /pages/api/transcribe.js
import { openai } from "../../lib/openai";
import { toFile } from "openai/uploads";

// Heel belangrijk: raw binary toelaten (geen bodyParser)
export const config = { api: { bodyParser: false } };

// Lees ruwe bytes van de request
async function readBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const buf = await readBuffer(req);
    if (!buf || buf.length === 0) {
      return res.status(400).json({ error: "empty_audio" });
    }

    const ct = String(req.headers["content-type"] || "application/octet-stream").toLowerCase();

    // Bepaal bestands-extensie op basis van content-type (fallback = webm)
    let ext = "webm";
    if (ct.includes("mp4") || ct.includes("m4a")) ext = "m4a";
    else if (ct.includes("ogg")) ext = "ogg";
    else if (ct.includes("wav")) ext = "wav";

    // OpenAI SDK v4 helper – maakt er een File van voor de API
    const file = await toFile(buf, `input.${ext}`, { type: ct });

    // Whisper (snel + goedkoop). Je kan ook 'gpt-4o-transcribe' gebruiken.
    const resp = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      // temperature: 0,
      // language: "nl", // optioneel forceren (nl/en/es …)
    });

    return res.status(200).json({ text: resp.text || "" });
  } catch (e) {
    console.error("TRANSCRIBE_ERROR", e);
    return res.status(500).json({ error: "transcribe_failed", message: e?.message || "unknown" });
  }
}
