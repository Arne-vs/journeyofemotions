// /pages/api/image.js
import { openai } from "../../lib/openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    // ✅ body kan string of object zijn; beide ondersteunen
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const art_prompt = (body.art_prompt || "").toString().trim();
    const palette = (body.palette || "warm").toString();
    const style = (body.style || "geometric").toString();

    if (!art_prompt) {
      return res.status(400).json({ error: "missing_art_prompt" });
    }

    const styleHint = `abstract ${style} style, ${palette} palette, high contrast, gallery lighting`;
    const prompt = `${art_prompt}. ${styleHint}`;

    const result = await openai.images.generate({
      model: "gpt-image-1",   // of "dall-e-3"
      prompt,
      size: "1024x1024",
    });

    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: "no_image_in_response" });

    return res.json({ imageBase64: b64 });
  } catch (e) {
    console.error("IMAGE_ERROR:", e);
    const status = typeof e?.status === "number" ? e.status : 500;
    return res.status(status).json({ error: "image_generation_failed", message: e?.message || "unknown_error" });
  }
}
