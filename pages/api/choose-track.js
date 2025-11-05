// pages/api/choose-track.js
import { openai } from "../../lib/openai";
import tracks from "../../data/tracks.json";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const transcript = String(body?.transcript || "").trim();
    if (!transcript) return res.status(400).json({ error: "missing_transcript" });

    // Kandidaten uit manifest → public URL
    const candidates = (tracks || []).map(t => ({
      ...t,
      url: `/audio/tracks/${encodeURIComponent(t.file)}`
    }));

    if (!candidates.length) return res.status(404).json({ error: "no_tracks_found" });

    const shortlist = candidates.slice(0, 80);

    const system = `Je krijgt een transcript en een lijst met muziek-kandidaten.
Kies exact 1 kandidaat die het best past bij sfeer/inhoud.
Antwoord ALLEEN als JSON: {"id":"<file>","reason":"<=30 woorden"}.`;

    const user = {
      transcript,
      candidates: shortlist.map(c => ({
        id: c.file, title: c.title, tags: c.tags, mood: c.mood, tempo: c.tempo, key: c.key
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

    let pick;
    try { pick = JSON.parse(resp?.choices?.[0]?.message?.content || "{}"); } catch {}
    const chosen = shortlist.find(c => c.file === pick?.id) || shortlist[0];

    return res.json({
      id: chosen.file,
      title: chosen.title,
      url: chosen.url,
      reason: pick?.reason || "auto"
    });
  } catch (e) {
    console.error("CHOOSE_TRACK_ERROR:", e);
    return res.status(500).json({ error: "choose_track_failed", message: e?.message || "unknown" });
  }
}
