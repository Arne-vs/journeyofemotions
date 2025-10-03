// /lib/musicPlayer.js
let ctx;
let active = null;

function ensureCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx();
  }
  if (ctx.state === "suspended") ctx.resume().catch(()=>{});
  return ctx;
}

/** Speel een mp3-URL met fade-in en crossfade eventuele vorige. */
export async function playTrack(url, { fadeIn = 0.8, fadeOut = 0.8 } = {}) {
  const c = ensureCtx();
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.src = url;
  audio.loop = false;

  try { await audio.play(); } catch {}

  const src = c.createMediaElementSource(audio);
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(c.destination);

  // crossfade out vorige
  if (active) {
    try {
      const g = active.gain.gain;
      g.cancelScheduledValues(c.currentTime);
      g.setValueAtTime(g.value, c.currentTime);
      g.linearRampToValueAtTime(0, c.currentTime + fadeOut);
    } catch {}
    setTimeout(() => stopActive(true), fadeOut * 1000 + 120);
  }

  // fade-in
  try {
    gain.gain.cancelScheduledValues(c.currentTime);
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(1, c.currentTime + fadeIn);
  } catch {}

  const onEnded = () => stopActive(false);
  audio.addEventListener("ended", onEnded);

  active = { audio, srcNode: src, gain, onEnded, url };

  return () => crossfadeOut(fadeOut);
}

function crossfadeOut(dur = 0.6) {
  if (!active) return;
  const c = ensureCtx();
  try {
    const g = active.gain.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(g.value, c.currentTime);
    g.linearRampToValueAtTime(0, c.currentTime + dur);
  } catch {}
  setTimeout(() => stopActive(true), dur * 1000 + 120);
}

function stopActive(dispose = true) {
  if (!active) return;
  try { active.audio.pause(); } catch {}
  try { active.audio.removeEventListener("ended", active.onEnded); } catch {}
  if (dispose) {
    try { active.srcNode.disconnect(); } catch {}
    try { active.gain.disconnect(); } catch {}
  }
  active = null;
}

// optioneel: default export zodat `import mp from ...; mp.playTrack(...)` ook werkt
export default { playTrack };
