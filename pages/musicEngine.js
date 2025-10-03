// /pages/musicEngine.js — Pure Web Audio fallback (geen Tone.js nodig)

let audioCtx = null;
let scheduler = null;

function ensureCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  // autoplay-policy: hervatten indien nodig
  if (audioCtx.state === "suspended") {
    // let op: dit moet na een user gesture gebeuren (click/press)
    audioCtx.resume()?.catch(() => {});
  }
  return audioCtx;
}

export async function playFromParams(params = {}) {
  const {
    tempo = 90,        // BPM
    scale = "minor",
    key = "C",
    density = 0.5,     // 0..1 (hogere = drukker)
    reverb = 0.3,      // 0..1 (we simuleren 'reverb' met langzame release)
  } = params;

  const ctx = ensureCtx();

  // basis-output
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // simpele pseudo-reverb: langere release + heel subtiele delay
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.18;
  const feedback = ctx.createGain();
  feedback.gain.value = Math.min(Math.max(reverb, 0), 0.8) * 0.4; // 0..0.32
  delay.connect(feedback);
  feedback.connect(delay);

  // reverb send/return
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = Math.min(Math.max(reverb, 0), 1) * 0.6; // 0..0.6
  reverbSend.connect(delay);
  delay.connect(master);

  // drie voices voor akkoorden
  function makeVoice() {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    // parallel naar 'reverb'
    const sendTap = ctx.createGain();
    sendTap.gain.value = 1;
    osc.connect(sendTap);
    sendTap.connect(reverbSend);
    osc.start();
    return { osc, gain };
  }

  const voices = [makeVoice(), makeVoice(), makeVoice()];

  // toonladder + noten
  const notes = makeScale(key, scale);
  const beatDur = 60 / tempo; // seconden per kwartnoot
  const step = Math.max(1, Math.round(8 - density * 6)); // 1..8
  let i = 0;

  function freqFromNote(note) {
    // note bv. "C#4"
    const A4 = 440;
    const map = { C:0,"C#":1,D:2,"D#":3,E:4,F:5,"F#":6,G:7,"G#":8,A:9,"A#":10,B:11 };
    const m = /^([A-G]#?)(\d)$/.exec(note);
    if (!m) return A4;
    const [, n, o] = m;
    const semis = (parseInt(o, 10) - 4) * 12 + (map[n] - 9);
    return A4 * Math.pow(2, semis / 12);
    // (map[n]-9) omdat A=9 in onze map en A4=440
  }

  function triggerVoice(v, note, atTime, durSec) {
    const f = freqFromNote(note);
    // zet frequentie net vóór de noot
    try {
      v.osc.frequency.setValueAtTime(f, atTime - 0.0005);
    } catch {}
    // simpele ADSR
    const g = v.gain.gain;
    const att = 0.02;
    const rel = Math.max(0.3, Math.min(2.5, 1.0 + reverb * 2)); // langere release = meer "ruimte"
    try {
      g.cancelScheduledValues(atTime);
      g.setValueAtTime(0.0, atTime);
      g.linearRampToValueAtTime(0.65, atTime + att);
      g.linearRampToValueAtTime(0.0, atTime + Math.max(durSec * 0.8, 0.2) + rel);
    } catch {}
  }

  // scheduler: elke 1/4de tel een event plannen net vooruit
  const scheduleAhead = 0.1; // 100ms
  let nextWhen = ctx.currentTime + 0.05;

  function tick() {
    const now = ctx.currentTime;
    while (nextWhen < now + scheduleAhead) {
      const chord = [
        notes[i % notes.length],
        notes[(i + 2) % notes.length],
        notes[(i + 4) % notes.length],
      ];
      // speel drie noten met onze drie voices
      const dur = beatDur * 2; // "2n"
      triggerVoice(voices[0], chord[0], nextWhen, dur);
      triggerVoice(voices[1], chord[1], nextWhen, dur);
      triggerVoice(voices[2], chord[2], nextWhen, dur);

      i += step;
      nextWhen += beatDur; // volgende kwartnoot
    }
  }

  scheduler = setInterval(tick, 25);

  // stop-functie
  return () => {
    try { clearInterval(scheduler); } catch {}
    scheduler = null;
    // fade master zacht uit
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    } catch {}
    setTimeout(() => {
      try { voices.forEach(v => { v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); }); } catch {}
      try { reverbSend.disconnect(); delay.disconnect(); feedback.disconnect(); master.disconnect(); } catch {}
    }, 300);
  };
}

export function makeScale(root = "C", type = "minor") {
  const ALL = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const idx = ALL.indexOf(String(root).toUpperCase());
  const wrap = (n) => ALL[(n + ALL.length) % ALL.length];

  const major = [0,2,4,5,7,9,11];
  const minor = [0,2,3,5,7,8,10];
  const ints = String(type).toLowerCase().includes("maj") ? major : minor;

  return ints.map(i => wrap(idx + i) + "4");
}
