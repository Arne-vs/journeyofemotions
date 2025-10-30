// /pages/index.js
import { useEffect, useRef, useState } from "react";
import { playTrack } from "../lib/musicPlayer";

// === THEME TOKENS (koppel hier je Figma-styling) ===
const THEME = {
  bg: "#0A0D14",                     // achtergrond
  fg: "#E6ECFF",                     // hoofdtekst
  accent: "#5EA1FF",                 // accenten
  muted: "rgba(255,255,255,.55)",    // subtiele tekst
  error: "#EF4444",
  ok: "#10B981",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  titleSize: 48,          // Idle/Recording headline
  subtitleSize: 18,       // subteksten
  ctaSize: 18,            // knoppen/CTA
};

// === Beeldinstellingen (beamer) ===
// GPT-Image-1 → "1536x1024"  •  DALL·E 3 → "1792x1024"
const IMAGE_SIZE = "1344×768";
const IMAGE_QUALITY = "low"; // "low" | "medium" | "high"

// Auto-restart in ms
const AUTO_RESTART_MS = 45_000;

// Volledig scherm “hit area” gedrag per slide
// - idle: tap => start
// - recording: tap => stop
// - processing/done: tap disabled (optioneel veranderen)
export default function Home() {
  const [status, setStatus] = useState("idle"); // idle | recording | processing | done | error
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [promptJson, setPromptJson] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [prevImageUrl, setPrevImageUrl] = useState("");
  const [nowPlaying, setNowPlaying] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [fade, setFade] = useState(false); // fade-to-black tussen cycli

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopMusicRef = useRef(null);
  const autoRestartRef = useRef(null);

  // ====== iPad/Safari wake lock (voorkomt dat scherm slaapt) ======
  useEffect(() => {
    let lock;
    async function keepAwake() {
      try {
        lock = await navigator.wakeLock?.request?.("screen");
      } catch {}
    }
    keepAwake();
    return () => {
      try { lock?.release?.(); } catch {}
    };
  }, []);

  // ====== Feature detect ======
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = !!(navigator.mediaDevices && window.MediaRecorder);
    setIsSupported(ok);
  }, []);

  // ====== Cleanup muziek bij unmount ======
  useEffect(() => {
    return () => {
      if (stopMusicRef.current) {
        try { stopMusicRef.current(); } catch {}
        stopMusicRef.current = null;
      }
      if (autoRestartRef.current) {
        clearTimeout(autoRestartRef.current);
        autoRestartRef.current = null;
      }
    };
  }, []);

  // ====== Fullscreen tap handler ======
  function onFullTap() {
    if (!isSupported) return;

    if (status === "idle") {
      startRecording();
      return;
    }
    if (status === "recording") {
      stopRecording();
      return;
    }
    // processing/done: tappen doet niets (kan je aanpassen)
  }

  // ====== Reset helper ======
  function handleReset() {
    setStatus("idle");
    setError("");
    setTranscript("");
    setPromptJson(null);
    setPrevImageUrl(imageUrl);
    setImageUrl("");
    setNowPlaying("");

    if (stopMusicRef.current) {
      try { stopMusicRef.current(); } catch {}
      stopMusicRef.current = null;
    }
  }

  // ====== Start/Stop opname ======
  async function startRecording() {
    setError("");
    setTranscript("");
    setPromptJson(null);
    setImageUrl("");
    setNowPlaying("");
    setStatus("recording");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
          sampleRate: 44100,
        },
      });

      // iOS-friendly mime fallback
      let mime = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mime)) {
        mime = "audio/mp4;codecs=mp4a";
        if (!MediaRecorder.isTypeSupported(mime)) {
          mime = "audio/webm";
        }
      }

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

  // ====== Pipeline ======
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
    if (!transcribeRes.ok) throw new Error(`Transcribe faalde: ${await safeTxt(transcribeRes)}`);
    const { text } = await transcribeRes.json();
    setTranscript(text || "");

    // 2) Prompt → parameters
    const promptRes = await fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: text || "" }),
    });
    if (!promptRes.ok) throw new Error(`Prompt-generatie faalde: ${await safeTxt(promptRes)}`);
    const prompt = await promptRes.json();
    setPromptJson(prompt);

    // 3) Image (eerst beeld genereren)
    const imgRes = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        art_prompt: prompt.art_prompt,
        palette: prompt.palette,
        style: prompt.style,
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
      }),
    });
    if (!imgRes.ok) throw new Error(`Afbeeldingsgeneratie faalde: ${await safeTxt(imgRes)}`);
    const { imageBase64 } = await imgRes.json();
    const url = "data:image/png;base64," + imageBase64;
    setImageUrl(url);

    // 4) Dan muziek kiezen & starten (kleine delay voor impact)
    try {
      const musicRes = await fetch("/api/choose-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text || "" }),
      });
      if (!musicRes.ok) throw new Error(`Track-selectie faalde: ${await musicRes.text()}`);
      const pick = await musicRes.json();

      setTimeout(async () => {
        stopMusicRef.current = await playTrack(pick.url, { fadeIn: 1, fadeOut: 0.9 });
        setNowPlaying(`🎵 ${pick.title}${pick.reason ? " — " + pick.reason : ""}`);
      }, 600);
    } catch (e) {
      console.warn("Muziek kon niet starten:", e);
      setNowPlaying("Muziek kon niet starten (tik 1x op het scherm en probeer opnieuw).");
    }

    setStatus("done");

   // 5) Auto-restart na X seconden met fade-to-black
    if (autoRestartRef.current) clearTimeout(autoRestartRef.current);
    autoRestartRef.current = setTimeout(() => {
      setFade(true);
      setTimeout(() => {
        try {
          if (stopMusicRef.current) {
            stopMusicRef.current();
            stopMusicRef.current = null;
          }
        } catch {}
        // Ga terug naar het startscherm (Idle), wacht op tik
        handleReset();
        setFade(false);
        // NIET opnieuw automatisch starten
      }, 700); // fade-duur
    }, AUTO_RESTART_MS);
  }

  return (
    <div
      onClick={onFullTap}
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: THEME.bg,
        color: THEME.fg,
        fontFamily: THEME.fontFamily,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* SLIDES */}
      {status === "idle" && <SlideIdle supported={isSupported} />}
      {status === "recording" && <SlideRecording />}
      {status === "processing" && <SlideProcessing prevImageUrl={prevImageUrl} />}
      {(status === "done" || imageUrl) && <SlideArtwork imageUrl={imageUrl} />}

      {/* NOW PLAYING OVERLAY */}
      {nowPlaying && (
        <div style={{
          position: "fixed", left: 12, bottom: 12, zIndex: 3,
          background: "rgba(0,0,0,.45)", color: THEME.fg,
          padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)",
          backdropFilter: "blur(6px)", fontSize: 14
        }}>
          {nowPlaying}
        </div>
      )}

      {/* ERROR OVERLAY */}
      {error && (
        <div style={{
          position: "fixed", top: 12, right: 12, zIndex: 4,
          background: "rgba(239,68,68,.14)", color: "#fecaca",
          padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(239,68,68,.5)",
          fontSize: 14, maxWidth: 420
        }}>
          {error}
        </div>
      )}

      {/* FADE TO BLACK tussen cycli */}
      {fade && (
        <div style={{
          position: "fixed", inset: 0, background: "#000",
          opacity: 1, transition: "opacity .7s ease", zIndex: 5
        }} />
      )}
    </div>
  );
}

/* ============== Slides ============== */

/* --- SPLIT SCREEN (organische rand, geen midden-band) --- */
function SplitScreenSlide({ leftTitle, leftSub, rightTitle, rightSub, children }) {
  return (
    <div style={{ position:"fixed", inset:0, width:"100vw", height:"100vh", overflow:"hidden" }}>
      {/* WITTE BASISLAAG (volledig scherm) */}
      <div style={{ position:"absolute", inset:0, background:"#fff" }} />

      {/* ZWARTE LAAG MET GEKARTELDE RAND */}
      <div className="splitRight" style={{
        position:"absolute", inset:0, background:"#000"
      }} />

      {/* LINKER TEKST (ENG) */}
      <div style={{
        position:"absolute",
        top:"50%", left:"6vw", transform:"translateY(-50%)",
        color:"#000", textAlign:"left", maxWidth:"38vw", pointerEvents:"none"
      }}>
        <h1 style={{  color:"#000", margin:0, fontWeight:800, letterSpacing:0.2 }}>
          {leftTitle}
        </h1>
        {leftSub && (
          <p style={{ marginTop:12, fontSize:"clamp(14px,2vw,20px)" }}>
            {leftSub}
          </p>
        )}
      </div>

      {/* RECHTER TEKST (SPA) */}
      <div style={{
        position:"absolute",
        top:"50%", right:"6vw", transform:"translateY(-50%)",
        color:"#fff", textAlign:"right", maxWidth:"38vw", pointerEvents:"none"
      }}>
        <h1 style={{ margin:0, fontWeight:800, letterSpacing:0.2 }}>
          {rightTitle}
        </h1>
        {rightSub && (
          <p style={{ marginTop:12, fontSize:"clamp(14px,2vw,20px)", opacity:0.9 }}>
            {rightSub}
          </p>
        )}
      </div>

      {/* optionele overlay (loader etc.) */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
        {children}
      </div>

      {/* CLIP-PATH SHAPE (responsief, voelt als jouw Figma) */}
      <style jsx>{`
  .splitRight {
  clip-path: polygon(
    62% 0%,
    100% 0%,
    100% 100%,
    45% 100%,
    52% 82%,
    42% 82%,
    48% 68%,
    46% 60%,
    55% 54%,
    50% 40%,
    58% 28%,
    68% 18%,
    53% 14%
  );
}

@media (max-width: 1024px) {
  .splitRight {
    clip-path: polygon(
      55% 0%,
      100% 0%,
      100% 100%,
      48% 100%,
      56% 80%,
      76% 80%,
      50% 65%,
      60% 50%,
      52% 35%,
      63% 20%,
      55% 10%
    );
  }
}
`}</style>

    </div>
  );
}

function SlideIdle() {
  return (
    <SplitScreenSlide
      leftTitle="TresPassing"
      leftSub="press to start"
      rightTitle="TrasPasar"
      rightSub="Pulse para empezar"
    />
  );
}

function SlideRecording() {
  return (
    <SplitScreenSlide
      leftTitle="Tell us your imagination"
      leftSub="press to stop"
      rightTitle="Cuéntanos lo que te estas imaginando"
      rightSub="Pulse para parrar"
    />
  );
}

function SlideProcessing() {
  return (
    <SplitScreenSlide
      leftTitle="Processing..."
      leftSub="please wait"
      rightTitle="Procesando..."
      rightSub="Por favor, espere"
    >
      {/* eventueel een loader animatie hier */}
    </SplitScreenSlide>
  );
}

function SlideArtwork({ imageUrl }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{
            width: "100vw",
            height: "100vh",
            objectFit: "contain", // of "cover" voor edge-to-edge
            opacity: 1,
            transition: "opacity .4s ease",
          }}
        />
      )}
    </div>
  );
}

async function safeTxt(r) {
  try { return JSON.stringify(await r.json()); } catch { return await r.text(); }
}
