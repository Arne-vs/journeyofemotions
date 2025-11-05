// /pages/api/ping.js
export default function handler(req, res) {
  res.setHeader("Allow", "POST, GET, OPTIONS, HEAD");
  if (req.method === "OPTIONS" || req.method === "HEAD") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  // echo minimal info so we know POST is allowed
  res.status(200).json({ ok: true, method: req.method, length: Number(req.headers["content-length"] || 0) });
}
