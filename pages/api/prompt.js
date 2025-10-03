// /pages/api/prompt.js
import { openai } from "../../lib/openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    // Kan string of object zijn, afhankelijk van je client headers
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";

    if (!transcript) {
      return res.status(400).json({ error: "missing_transcript" });
    }

    const system = `Je zet NL/EN spraak om in parameters voor abstracte kunst en muziek.
Antwoord ALLEEN geldige JSON met:
{
  "art_prompt": "korte beschrijving (<= 60 tokens)",
  "palette": "warm|koel|neon|pastel",
  "style": "kandinsky|rothko|geometric|fluid",
  "mood": { "valence": -1..1, "arousal": 0..1 },
  "music": { "tempo": 60..130, "scale": "major|minor", "key": "A..G#", "density": 0..1, "reverb": 0..1 }
}`;

    const user = `Verhaal:\n${transcript}\n\nConstraints:\n- art_prompt compact, zonder persoonsdata.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const content = resp?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "no_content_from_model" });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "invalid_json_from_model", raw: content.slice(0, 200) });
    }

    // sanitiseren met defaults
    const safe = {
      art_prompt: parsed.art_prompt || "vloeibare vormen, contrasterende vlakken, speelse texturen",
      palette: parsed.palette || "warm",
      style: parsed.style || "geometric",
      mood: {
        valence: clamp(num(parsed?.mood?.valence, 0), -1, 1),
        arousal: clamp(num(parsed?.mood?.arousal, 0.5), 0, 1),
      },
      music: {
        tempo: clamp(Math.round(num(parsed?.music?.tempo, 90)), 60, 130),
        scale: (parsed?.music?.scale || "minor").toLowerCase().includes("maj") ? "major" : "minor",
        key: normalizeKey(parsed?.music?.key || "C"),
        density: clamp(num(parsed?.music?.density, 0.5), 0, 1),
        reverb: clamp(num(parsed?.music?.reverb, 0.3), 0, 1),
      },
    };

    return res.json(safe);
  } catch (e) {
    console.error("PROMPT_ERROR:", e);
    return res.status(500).json({ error: "prompt_generation_failed", message: e?.message || "unknown" });
  }
}

function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function normalizeKey(k) {
  const keys = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const u = String(k || "").toUpperCase().replace(/MAJOR|MINOR|M/g, "");
  return keys.includes(u) ? u : "C";
}
