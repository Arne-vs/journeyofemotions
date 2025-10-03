// /pages/api/transcribe.js
import { openai } from "../../lib/openai";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

export const config = {
  api: { bodyParser: false }, // we lezen de stream zelf
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    // 1) Lees ruwe body
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buffer = Buffer.concat(chunks);
    const contentType = req.headers["content-type"] || "unknown";
    const bytes = buffer.length;

    if (!bytes) {
      return res.status(400).json({
        error: "empty_body",
        hint: "De opname leverde 0 bytes op. Wacht 1-2s met stoppen, of check MediaRecorder.",
      });
    }

    // 2) Bepaal extensie voor temp-bestand
    const ext =
      contentType.includes("webm") ? ".webm" :
      contentType.includes("ogg")  ? ".ogg"  :
      contentType.includes("wav")  ? ".wav"  :
      ".bin";

    const tmpDir = os.tmpdir();
    const filename = `speech_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    const tmpPath = path.join(tmpDir, filename);
    await fs.promises.writeFile(tmpPath, buffer);

    // 3) Transcribe (whisper-1 is stabiel; taal hint helpt NL)
    const fileStream = fs.createReadStream(tmpPath);
    let r;
    try {
      r = await openai.audio.transcriptions.create({
        file: fileStream,
        model: "whisper-1",
      });
    } finally {
      // 4) Opruimen
      try { await fs.promises.unlink(tmpPath); } catch {}
    }

    if (!r?.text) {
      return res.status(502).json({
        error: "no_text_from_model",
        info: { contentType, bytes },
      });
    }

    return res.json({ text: r.text });
  } catch (e) {
    console.error("TRANSCRIBE_ERROR:", e);
    // Probeer zoveel mogelijk detail terug te geven (zonder secrets te lekken)
    const message = e?.message || "unknown_error";
    const status = typeof e?.status === "number" ? e.status : 500;
    return res.status(status).json({
      error: "transcribe_failed",
      message,
    });
  }
}
