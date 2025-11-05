import { openai } from "../../lib/openai";
import { toFile } from "openai/uploads";

export const config = { api: { bodyParser: false } };

async function readBuffer(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
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
    if (!buf?.length) return res.status(400).json({ error: "empty_audio" });

    const ct = String(req.headers["content-type"] || "application/octet-stream").toLowerCase();
    let ext = "webm";
    if (ct.includes("mp4") || ct.includes("m4a")) ext = "m4a";
    else if (ct.includes("ogg")) ext = "ogg";
    else if (ct.includes("wav")) ext = "wav";

    const file = await toFile(buf, `input.${ext}`, { type: ct });

    const resp = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file
    });

    return res.status(200).json({ text: resp.text || "" });
  } catch (e) {
    console.error("TRANSCRIBE_UPLOAD_ERROR:", e);
    return res.status(500).json({ error: "transcribe_failed", message: e?.message || "unknown" });
  }
}
