// /pages/api/transcribe.js
import { openai } from "../../lib/openai";
import { toFile } from "openai/uploads";

// Force Node runtime (not Edge) + accept raw body
export const config = {
  api: { bodyParser: false },
  runtime: "nodejs",
};

// Read raw stream into a Buffer
async function readBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const buf = await readBuffer(req);
    const size = buf?.length || 0;

    if (!size) {
      return res.status(400).json({ error: "empty_audio", message: "No audio bytes received" });
    }

    // Vercel’s request body limit for Serverless Functions is ~4–6 MB.
    // If users talk too long, you’ll hit that limit — bail out early with a nice error.
    const MAX_BYTES = 6 * 1024 * 1024; // ~6MB
    if (size > MAX_BYTES) {
      return res.status(413).json({
        error: "payload_too_large",
        message: `Audio too large (${(size/1024/1024).toFixed(2)}MB). Please shorten the recording.`,
      });
    }

    const ct = String(req.headers["content-type"] || "application/octet-stream").toLowerCase();
    let ext = "webm";
    if (ct.includes("mp4") || ct.includes("m4a")) ext = "m4a";
    else if (ct.includes("ogg")) ext = "ogg";
    else if (ct.includes("wav")) ext = "wav";

    const file = await toFile(buf, `input.${ext}`, { type: ct });

    const resp = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      // language: "nl",       // optionally force
      // temperature: 0,
    });

    return res.status(200).json({ text: resp.text || "" });
  } catch (e) {
    // Always respond with JSON so the client can read it
    console.error("TRANSCRIBE_ERROR", e);
    return res.status(500).json({
      error: "transcribe_failed",
      message: e?.message || "unknown",
      note: "Ensure this route runs on Node (not Edge), and that audio payload < 6MB.",
    });
  }
}
