// /pages/api/transcribe-upload.js
import { openai } from "../../lib/openai";
import { toFile } from "openai/uploads";

export const config = { api: { bodyParser: false } };

async function readBuffer(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  // allow preflight
  if (req.method === "OPTIONS" || req.method === "HEAD") {
    res.setHeader("Allow", "POST, OPTIONS, HEAD");
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS, HEAD");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // ✅ explicit env check gives clear error instead of opaque 500
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "missing_api_key",
      message: "OPENAI_API_KEY is not set on the server.",
    });
  }

  try {
    const buf = await readBuffer(req);
    const size = buf?.length || 0;
    const ct = String(req.headers["content-type"] || "application/octet-stream").toLowerCase();

    // 🔎 quick debug mode: send header x-debug: 1 to see what the server receives
    if (req.headers["x-debug"] === "1") {
      return res.status(200).json({ ok: true, size, contentType: ct });
    }

    if (!size) {
      return res.status(400).json({ error: "empty_audio", message: "No audio bytes received" });
    }
    const MAX_BYTES = 6 * 1024 * 1024; // ~6MB guard for Vercel
    if (size > MAX_BYTES) {
      return res.status(413).json({
        error: "payload_too_large",
        message: `Audio too large: ${(size / 1024 / 1024).toFixed(2)}MB`,
      });
    }

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
    console.error("TRANSCRIBE_UPLOAD_ERROR:", e);
    return res.status(500).json({
      error: "transcribe_failed",
      message: e?.message || "unknown",
    });
  }
}
