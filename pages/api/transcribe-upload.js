// /pages/api/transcribe-upload.js
import { openai } from "../../lib/openai";
import { toFile } from "openai/uploads";

// Force raw body (no JSON parsing)
export const config = { api: { bodyParser: false } };

// Read raw stream to Buffer
async function readBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  // allow OPTIONS/HEAD to avoid preflight 405s
  if (req.method === "OPTIONS" || req.method === "HEAD") {
    res.setHeader("Allow", "POST, OPTIONS, HEAD");
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS, HEAD");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const buf = await readBuffer(req);
    const size = buf?.length || 0;
    if (!size) {
      return res.status(400).json({ error: "empty_audio", message: "No audio bytes received" });
    }

    // keep well under Vercel Function body limits
    const MAX_BYTES = 6 * 1024 * 1024;
    if (size > MAX_BYTES) {
      return res.status(413).json({
        error: "payload_too_large",
        message: `Audio too large: ${(size / 1024 / 1024).toFixed(2)}MB`,
      });
    }

    // detect extension from content-type (fallback webm)
    const ct = String(req.headers["content-type"] || "application/octet-stream").toLowerCase();
    let ext = "webm";
    if (ct.includes("mp4") || ct.includes("m4a")) ext = "m4a";
    else if (ct.includes("ogg")) ext = "ogg";
    else if (ct.includes("wav")) ext = "wav";

    const file = await toFile(buf, `input.${ext}`, { type: ct });

    const resp = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      // language: "nl",
      // temperature: 0,
    });

    return res.status(200).json({ text: resp.text || "" });
  } catch (e) {
    console.error("TRANSCRIBE_UPLOAD_ERROR", e);
    return res.status(500).json({
      error: "transcribe_failed",
      message: e?.message || "unknown",
    });
  }
}
