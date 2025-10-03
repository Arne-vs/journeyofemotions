// /pages/index.js
import { useEffect, useRef, useState } from "react";
import { playTrack } from "../lib/musicPlayer";

export default function Home() {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [promptJson, setPromptJson] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopMusicRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = !!(navigator.mediaDevices && window.MediaRecorder);
    setIsSupported(ok);
  }, []);

  useEffect(() => {
    return () => {
      if (stopMusicRef.current) {
        try { stopMusicRef.current(); } catch {}
        stopMusicRef.current = null;
      }
    };
  }, []);

  async function startRecording() {
    setError("");
    setTranscript("");
    setPromptJson(null);
    setImageUrl("");
    setStatus("recording");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        runPipeline(blob).catch((e) => {
          console.error(e);
          setStatus("error");
          setError(String(e?.message || e));
        });
      };
      mediaRecorderRef.current = mr;
      mr.start(100);
    } catch (e) {
      console.error(e);
      setStatus("error");
      setError("Kon de microfoon niet starten. Check permissies.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  async function runPipeline(blob) {
  setStatus("processing");
  setError("");

  // stop evt. vorige muziek
  if (stopMusicRef.current) {
    try { stopMusicRef.current(); } catch {}
    stopMusicRef.current = null;
  }

  // 1) Transcribe
  const transcribeRes = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!transcribeRes.ok) {
    let d = "";
    try { d = JSON.stringify(await transcribeRes.json()); } catch { d = await transcribeRes.text(); }
    throw new Error(`Transcribe faalde: ${d}`);
  }
  const { text } = await transcribeRes.json();
  setTranscript(text || "");

  // 2) Prompt → parameters
  const promptRes = await fetch("/api/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: text || "" }),
  });
  if (!promptRes.ok) {
    let d = "";
    try { d = JSON.stringify(await promptRes.json()); } catch { d = await promptRes.text(); }
    throw new Error(`Prompt-generatie faalde: ${d}`);
  }
  const prompt = await promptRes.json();
  setPromptJson(prompt);

  // === 3) Beeld en Muziek PARALLEL starten ===
  const imagePromise = fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      art_prompt: prompt.art_prompt,
      palette: prompt.palette,
      style: prompt.style,
      // gebruik dezelfde constants die je bovenaan definieerde
      size: "1536x1024",         // bv. "1536x1024" (GPT-image-1) of "1792x1024" (DALL·E 3)
      quality: "low",   // "low" | "medium" | "high"
    }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`Afbeeldingsgeneratie faalde: ${await r.text()}`);
    const { imageBase64 } = await r.json();
    const url = "data:image/png;base64," + imageBase64;
    setImageUrl(url);
  });

  const musicPromise = fetch("/api/choose-track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: text || "" }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`Track-selectie faalde: ${await r.text()}`);
    const pick = await r.json();

    // crossfade van vorige (al gestopt hierboven) en speel nieuwe
    stopMusicRef.current = await playTrack(pick.url, { fadeIn: 0.9, fadeOut: 0.9 });

    // optioneel: toon wat info
    setNowPlaying(`🎵 ${pick.title}${pick.reason ? " — " + pick.reason : ""}`);
  }).catch((e) => {
    console.warn("Muziek kon niet starten:", e);
    setNowPlaying("Muziek kon niet starten (klik in de pagina en probeer opnieuw).");
  });

  // wacht tot beide klaar zijn (of de langzaamste)
  await Promise.allSettled([imagePromise, musicPromise]);

  setStatus("done");
}


  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Journey of Emotions — v2</h1>
        <p>Spreek een korte tekst in. We genereren abstracte kunst én muziek op basis van jouw input.</p>

        <div style={styles.controls}>
          {status !== "recording" ? (
            <button style={styles.buttonPrimary} onClick={startRecording}>
              🎙️ Start opname
            </button>
          ) : (
            <button style={styles.buttonDanger} onClick={stopRecording}>
              ⏹️ Stop opname
            </button>
          )}
        </div>

        <StatusPill status={status} />
        {error && <div style={styles.error}>{error}</div>}

        <h3>Transcript</h3>
        <pre>{transcript || "— nog niets —"}</pre>

        <h3>Prompt JSON</h3>
        <pre>{promptJson ? JSON.stringify(promptJson, null, 2) : "— nog niets —"}</pre>

        <h3>Afbeelding</h3>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Generated art" style={{ maxWidth: "100%", borderRadius: 12 }} />
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    idle: { label: "Idle", bg: "#e5e7eb" },
    recording: { label: "Opnemen…", bg: "#fde68a" },
    processing: { label: "Verwerken…", bg: "#bfdbfe" },
    done: { label: "Klaar", bg: "#d1fae5" },
    error: { label: "Fout", bg: "#fecaca" },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{ background: s.bg, padding: "4px 8px", borderRadius: 6 }}>
      {s.label}
    </span>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" },
  card: { maxWidth: 800, padding: 24, borderRadius: 12, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,.1)" },
  controls: { margin: "12px 0" },
  buttonPrimary: { padding: "10px 14px", background: "#111827", color: "#fff", borderRadius: 8 },
  buttonDanger: { padding: "10px 14px", background: "#dc2626", color: "#fff", borderRadius: 8 },
  error: { color: "red", marginTop: 8 },
};
