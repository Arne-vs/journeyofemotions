// /pages/index.js
import { useEffect, useRef, useState } from "react";

// === THEME TOKENS (koppel hier je Figma-styling) ===
const THEME = {
  bg: "#0A0D14",
  fg: "#E6ECFF",
  accent: "#5EA1FF",
  muted: "rgba(255,255,255,.55)",
  error: "#EF4444",
  ok: "#10B981",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  titleSize: 48,
  subtitleSize: 18,
  ctaSize: 18,
};

// === Beeldinstellingen (beamer) ===
// let op: kleine 'x' — geen '×'
const IMAGE_SIZE = "1344x768";
const IMAGE_QUALITY = "low"; // "low" | "medium" | "high"

// Auto-restart in ms
const AUTO_RESTART_MS = 45_000;

export default function Home() {
  const [status, setStatus] = useState("idle"); // idle | recording | processing | done | error
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [promptJson, setPromptJson] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [prevImageUrl, setPrevImageUrl] = useState("");
  const [nowPlaying, setNowPlaying] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [fade, setFade] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopMusicRef = useRef(null);
  const autoRestartRef = useRef(null);

  // iPad/Safari wake lock
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

  // Feature detect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = !!(navigator.mediaDevices && window.MediaRecorder);
    setIsSupported(ok);
  }, []);

  // Cleanup bij unmount
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

  // Volledig scherm tik-gedrag
  function onFullTap() {
    if (!isSupported) return;
    if (status === "idle") { startRecording(); return; }
    if (status === "recording") { stopRecording(); return; }
    // processing/done: tik doet niets
  }

  // Reset helper
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

 // Start/Stop opname
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

    // ⚠️ verlaag bitrate om payload klein te houden
    const options = {
      mimeType: mime,
      audioBitsPerSecond: 64_000, // 64 kbps ≈ ~0.5–1.2 MB per 10–15s
    };

    const mr = new MediaRecorder(stream, options);
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };

    // Hard cap op lengte om Vercel’s limiet te ontwijken
    const MAX_MS = 12_000; // 12s
    const safetyTimer = setTimeout(() => {
      try { if (mr.state !== "inactive") mr.stop(); } catch {}
    }, MAX_MS);

    mr.onstop = () => {
      clearTimeout(safetyTimer);
      // tracks meteen sluiten
      stream.getTracks().forEach((t) => t.stop());

      const blob = new Blob(chunksRef.current, { type: mime });
      runPipeline(blob).catch((e) => {
        console.error(e);
        setStatus("error");
        setError(String(e?.message || e));
      });
    };

    mediaRecorderRef.current = mr;

    // kleine timeslice zodat data sneller flushed wordt
    mr.start(250);
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

  // Pipeline
  async function runPipeline(blob) {
    setStatus("processing");
    setError("");

    // stop evt. vorige muziek
    if (stopMusicRef.current) {
      try { stopMusicRef.current(); } catch {}
      stopMusicRef.current = null;
    }

 // 1) Transcribe
const res = await fetch("/api/transcribeUpload", {
  method: "POST",
  headers: { "Content-Type": "application/octet-stream" }, // keep simple & robust
  body: blob,
});
const raw = await res.clone().text();
if (!res.ok) throw new Error("Transcribe faalde: " + raw);
const { text } = JSON.parse(raw);
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

    // 3) Image
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

    // 4) Muziek kiezen & starten (pas nadat het beeld er is)
    try {
      const musicRes = await fetch("/api/choose-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text || "" }),
      });
      if (!musicRes.ok) throw new Error(`Track-selectie faalde: ${await safeTxt(musicRes)}`);
      const pick = await musicRes.json();

      setTimeout(async () => {
        // dynamische import om SSR issues te vermijden
        const { playTrack } = await import("../lib/musicPlayer");
        stopMusicRef.current = await playTrack(pick.url, { fadeIn: 1, fadeOut: 0.9 });
        setNowPlaying(`🎵 ${pick.title}${pick.reason ? " — " + pick.reason : ""}`);
      }, 600);
    } catch (e) {
      console.warn("Muziek kon niet starten:", e);
      setNowPlaying("Muziek kon niet starten (tik 1x op het scherm en probeer opnieuw).");
    }

    setStatus("done");

    // 5) Auto-restart na X seconden met fade-to-black (terug naar startscherm)
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
        handleReset();
        setFade(false);
      }, 700);
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
      {status === "idle" && <SlideIdle />}
      {status === "recording" && <SlideRecording />}
      {status === "processing" && <SlideProcessing />}
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

      {/* FADE TO BLACK */}
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
      {/* WITTE BASISLAAG */}
      <div style={{ position:"absolute", inset:0, background:"#fff" }} />

      {/* ZWARTE LAAG MET GEKARTELDE RAND */}
      <div className="splitRight" style={{ position:"absolute", inset:0, background:"#000" }} />

      {/* LINKER TEKST (ENG) */}
      <div style={{
        position:"absolute",
        top:"50%", left:"6vw", transform:"translateY(-50%)",
        color:"#000", textAlign:"left", maxWidth:"38vw", pointerEvents:"none"
      }}>
        <h1 style={{ color:"#000", margin:0, fontWeight:800, letterSpacing:0.2 }}>
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

      {/* overlay (loader etc.) */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
        {children}
      </div>

      {/* CLIP-PATH SHAPE */}
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
      leftSub="Prem per començar"
      rightTitle="TresPassing"
      rightSub="Pulse para empezar"
    />
  );
}

function SlideRecording() {
  return (
    <SplitScreenSlide
      leftTitle="Explica’m què t’estàs imaginant"
      leftSub="Prem per aturar"
      rightTitle="Cuéntanos lo que te estás imaginando"
      rightSub="Pulse para parar"
    />
  );
}

function SlideProcessing() {
  return (
    <SplitScreenSlide
      leftTitle="processant..."
      leftSub="Per favor, espera"
      rightTitle="Procesando..."
      rightSub="Por favor espere"
    >
      {/* loader kan hier */}
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
            objectFit: "contain",
            opacity: 1,
            transition: "opacity .4s ease",
          }}
        />
      )}
    </div>
  );
}

async function safeTxt(r) {
  const c = r.clone();               // 👈 lees van een clone, body blijft intact
  try {
    // probeer JSON netjes te serializen
    const j = await c.json();
    return JSON.stringify(j);
  } catch {
    try {
      return await c.text();
    } catch {
      return "[unreadable body]";
    }
  }
}

