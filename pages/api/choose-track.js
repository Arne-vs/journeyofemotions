// /pages/api/choose-track.js
import fs from "fs";
import path from "path";
import { openai } from "../../lib/openai";

const TRACKS_DIR = path.join(process.cwd(), "public", "audio", "tracks");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const transcript = String(body?.transcript || "").trim();
    if (!transcript) return res.status(400).json({ error: "missing_transcript" });

    // 1) scan map
    let files = [];
    try {
      files = fs.readdirSync(TRACKS_DIR);
    } catch (e) {
      return res.status(500).json({ error: "tracks_dir_unreadable", message: e.message });
    }

    // 2) bouw kandidatenlijst
    const mp3s = files.filter(f => f.toLowerCase().endsWith(".mp3"));
    if (!mp3s.length) return res.status(404).json({ error: "no_tracks_found" });

    const candidates = [];
    for (const f of mp3s) {
      const base = f.replace(/\.mp3$/i, "");
      const metaPath = path.join(TRACKS_DIR, base + ".json");
      let meta = {};
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch {}
      }
      candidates.push({
        id: base,
        file: f,
        title: meta.title || base,
        tags: meta.tags || [],
        mood: meta.mood || [],
        tempo: meta.tempo || null,
        key: meta.key || null,
        url: `/audio/tracks/${encodeURIComponent(f)}`
      });
    }

    // Beperk lengte (tokenbesparing)
    const MAX = 80;
    const shortlist = candidates.slice(0, MAX);

    // 3) Vraag AI om beste match (compacte instructie + JSON output)
    const system = `Je krijgt een transcript en een lijst met muziek-kandidaten (met eenvoudige metadata).
Kies precies 1 kandidaat die het best past bij de sfeer/inhoud.
Geef ALLEEN JSON: {"id":"<kandidaten-id>","reason":"korte motivatie (<=30 woorden)"}.`;

    const user = {
      transcript,
      candidates: shortlist.map(c => ({
        id: c.id,
        title: c.title,
        tags: c.tags,
        mood: c.mood,
        tempo: c.tempo,
        key: c.key
      }))
    };

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ],
      max_tokens: 200
    });

    let content = resp?.choices?.[0]?.message?.content || "";
    let pick;
    try { pick = JSON.parse(content); } catch {
      return res.status(502).json({ error: "invalid_model_json", raw: content });
    }

    const chosen = shortlist.find(c => c.id === pick.id) || shortlist[0];
    return res.json({
      id: chosen.id,
      title: chosen.title,
      url: chosen.url,
      reason: pick.reason || "auto"
    });
  } catch (e) {
    console.error("CHOOSE_TRACK_ERROR:", e);
    return res.status(500).json({ error: "choose_track_failed", message: e?.message || "unknown" });
  }
}
