import React, { useState, useRef, useCallback, useEffect } from "react";

/* ---------------------------------------------------------------
   THEORY ENGINE
   --------------------------------------------------------------- */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const DEGREE_SEMITONES = {
  1: 0, b2: 1, 2: 2, "#2": 3, b3: 3, 3: 4, 4: 5, "#4": 6, b5: 6, 5: 7,
  "#5": 8, b6: 8, 6: 9, bb7: 9, b7: 10, 7: 11,
  b9: 13, 9: 14, "#9": 15, 11: 17, "#11": 18, b13: 20, 13: 21,
};

const CHORD_TYPES = [
  { id: "maj",          label: "maj",       degrees: [1, 3, 5] },
  { id: "min",          label: "min",       degrees: [1, "b3", 5] },
  { id: "dim",          label: "dim",       degrees: [1, "b3", "b5"] },
  { id: "aug",          label: "aug",       degrees: [1, 3, "#5"] },
  { id: "maj7",         label: "maj7",      degrees: [1, 3, 5, 7] },
  { id: "min7",         label: "min7",      degrees: [1, "b3", 5, "b7"] },
  { id: "dom7",         label: "7",         degrees: [1, 3, 5, "b7"] },
  { id: "min7b5",       label: "min7b5",    degrees: [1, "b3", "b5", "b7"] },
  { id: "dim7",         label: "dim7",      degrees: [1, "b3", "b5", "bb7"] },
  { id: "minMaj7",      label: "min(maj7)", degrees: [1, "b3", 5, 7] },
  { id: "maj9",         label: "maj9",      degrees: [1, 3, 5, 7, 9] },
  { id: "min9",         label: "min9",      degrees: [1, "b3", 5, "b7", 9] },
  { id: "dom9",         label: "9",         degrees: [1, 3, 5, "b7", 9] },
  { id: "dom7sharp9",   label: "7#9",       degrees: [1, 3, 5, "b7", "#9"] },
  { id: "dom7flat9",    label: "7b9",       degrees: [1, 3, 5, "b7", "b9"] },
  { id: "maj11",        label: "maj11",     degrees: [1, 3, 5, 7, 9, 11] },
  { id: "min11",        label: "min11",     degrees: [1, "b3", 5, "b7", 9, 11] },
  { id: "dom11",        label: "11",        degrees: [1, 3, 5, "b7", 9, 11] },
  { id: "dom7sharp11",  label: "7#11",      degrees: [1, 3, 5, "b7", "#11"] },
  { id: "domsharp11",   label: "dom7#11",   degrees: [1, 3, 5, "b7", 9, "#11"] },
  { id: "maj13",        label: "maj13",     degrees: [1, 3, 5, 7, 9, 13] },
  { id: "min13",        label: "min13",     degrees: [1, "b3", 5, "b7", 9, 13] },
  { id: "dom13",        label: "13",        degrees: [1, 3, 5, "b7", 9, 13] },
  { id: "dom13sharp11", label: "13#11",     degrees: [1, 3, 5, "b7", 9, "#11", 13] },
  { id: "altDom",       label: "7alt",      degrees: [1, 3, "b5", "b7", "b9", "#9"] },
  { id: "sus4",         label: "sus4",      degrees: [1, 4, 5] },
  { id: "sus2",         label: "sus2",      degrees: [1, 2, 5] },
  { id: "dom7sus4",     label: "7sus4",     degrees: [1, 4, 5, "b7"] },
  { id: "add9",         label: "add9",      degrees: [1, 3, 5, 9] },
  { id: "six",          label: "6",         degrees: [1, 3, 5, 6] },
  { id: "min6",         label: "min6",      degrees: [1, "b3", 5, 6] },
];

const ALL_DEGREES = [1, 2, "b3", 3, 4, "b5", 5, "#5", "bb7", 6, "b7", 7,
                     "b9", 9, "#9", 11, "#11", 13];

function degreeLabel(d) { return String(d); }
function midiFromRootAndDegree(rootMidi, degree) { return rootMidi + DEGREE_SEMITONES[degree]; }
function noteNameFromMidi(midi) {
  return { name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1 };
}
function freqFromMidi(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

/* ---------------------------------------------------------------
   FILTER RESOLUTION
   --------------------------------------------------------------- */

function resolveChordAndDegree(chordFilter, degreeFilter, allowNonChordTones) {
  let pool = chordFilter === "random"
    ? CHORD_TYPES
    : CHORD_TYPES.filter((c) => c.id === chordFilter);

  if (degreeFilter !== "random" && !allowNonChordTones) {
    pool = pool.filter((c) => c.degrees.some((d) => String(d) === String(degreeFilter)));
  }
  if (pool.length === 0) return null;

  const chord = pool[Math.floor(Math.random() * pool.length)];
  let targetDegree;
  if (degreeFilter !== "random") {
    targetDegree = degreeFilter;
  } else if (allowNonChordTones) {
    targetDegree = ALL_DEGREES[Math.floor(Math.random() * ALL_DEGREES.length)];
  } else {
    targetDegree = chord.degrees[Math.floor(Math.random() * chord.degrees.length)];
  }
  return { chord, targetDegree };
}

/* ---------------------------------------------------------------
   VOICING ENGINE
   --------------------------------------------------------------- */

const VOICING_STYLES = ["close", "inverted", "spread", "drop2"];

function buildVoicedChord(degrees, rootMidi, style, rng) {
  const base = degrees.map((d, i) => ({ midi: midiFromRootAndDegree(rootMidi, d), i }));
  let tagged = base.map((t) => ({ ...t }));
  const n = tagged.length;
  if (style === "inverted" && n > 1) {
    const inv = 1 + Math.floor(rng() * (n - 1));
    tagged = tagged.map((t, idx) => (idx < inv ? { ...t, midi: t.midi + 12 } : t));
  } else if (style === "spread" && n > 2) {
    tagged = tagged.map((t, idx) => (idx % 2 === 1 ? { ...t, midi: t.midi + 12 } : t));
  } else if (style === "drop2" && n > 2) {
    tagged[n - 2] = { ...tagged[n - 2], midi: tagged[n - 2].midi - 12 };
  }
  tagged.sort((a, b) => a.midi - b.midi);
  return tagged;
}

/* ---------------------------------------------------------------
   AUDIO ENGINE
   --------------------------------------------------------------- */

function useAudioEngine() {
  const ctxRef = useRef(null);
  const sustainVoicesRef = useRef([]);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const PARTIALS = [
    { ratio: 1, type: "sine",     level: 1.0 },
    { ratio: 1, type: "triangle", level: 0.35, detune: 4 },
    { ratio: 2, type: "sine",     level: 0.12 },
    { ratio: 3, type: "sine",     level: 0.05 },
  ];

  const playNote = useCallback((midi, { duration = 1.4, delay = 0, gain = 0.22 } = {}) => {
    const ctx = getCtx();
    const startAt = ctx.currentTime + delay;
    const freq = freqFromMidi(midi);
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    PARTIALS.forEach((p) => {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = freq * p.ratio;
      if (p.detune) osc.detune.value = p.detune;
      const g = ctx.createGain();
      g.gain.value = p.level;
      osc.connect(g);
      g.connect(master);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.1);
    });
    master.gain.setValueAtTime(0, startAt);
    master.gain.linearRampToValueAtTime(gain, startAt + 0.015);
    master.gain.exponentialRampToValueAtTime(gain * 0.55, startAt + 0.25);
    master.gain.setValueAtTime(gain * 0.55, startAt + Math.max(0.25, duration - 0.35));
    master.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  }, [getCtx]);

  const playChord = useCallback((midiNotes, { stagger = 0, ...opts } = {}) => {
    let t = 0;
    midiNotes.forEach((midi) => { playNote(midi, { ...opts, delay: t }); t += stagger; });
  }, [playNote]);

  const stopSustain = useCallback((fadeSeconds = 0.25) => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    sustainVoicesRef.current.forEach(({ oscs, gainNode }) => {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
      oscs.forEach((osc) => osc.stop(now + fadeSeconds + 0.05));
    });
    sustainVoicesRef.current = [];
  }, [getCtx]);

  const sustainChord = useCallback((midiNotes, { gain = 0.18, stagger = 0 } = {}) => {
    const ctx = getCtx();
    stopSustain(0.05);
    let t = 0;
    midiNotes.forEach((midi) => {
      const startAt = ctx.currentTime + t;
      const freq = freqFromMidi(midi);
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const oscs = PARTIALS.map((p) => {
        const osc = ctx.createOscillator();
        osc.type = p.type;
        osc.frequency.value = freq * p.ratio;
        if (p.detune) osc.detune.value = p.detune;
        const g = ctx.createGain();
        g.gain.value = p.level;
        osc.connect(g);
        g.connect(master);
        osc.start(startAt);
        return osc;
      });
      master.gain.setValueAtTime(0, startAt);
      master.gain.linearRampToValueAtTime(gain, startAt + 0.02);
      sustainVoicesRef.current.push({ oscs, gainNode: master });
      t += stagger;
    });
  }, [getCtx, stopSustain]);

  return { playNote, playChord, sustainChord, stopSustain };
}

/* ---------------------------------------------------------------
   UI PRIMITIVES
   --------------------------------------------------------------- */

function Select({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.18em] text-amber-200/45 font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#1a1410] border border-amber-900/40 text-amber-50 text-xs rounded-md px-2 py-1.5
                   focus:outline-none focus:ring-1 focus:ring-amber-500/40 cursor-pointer appearance-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, sub, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-2 px-3">
      <div>
        <div className="text-xs text-amber-100">{label}</div>
        {sub && <div className="text-[10px] text-amber-200/35">{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        role="switch" aria-checked={checked}
        className={`relative flex-shrink-0 ml-3 w-9 h-5 rounded-full transition-colors duration-200 ${checked ? "bg-amber-500" : "bg-amber-900/50"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[#120d0a] transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none py-1" onClick={() => onChange(!checked)}>
      <span className={`relative flex-shrink-0 w-3.5 h-3.5 rounded border transition-colors ${checked ? "bg-amber-500 border-amber-500" : "bg-transparent border-amber-700/60"}`}>
        {checked && (
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 14 14" fill="none">
            <polyline points="2.5,7 5.5,10 11.5,4" stroke="#1a1208" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      <span className="text-xs text-amber-100">{label}</span>
    </label>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
   --------------------------------------------------------------- */

export default function EarTrainer() {
  const { playNote, playChord, sustainChord, stopSustain } = useAudioEngine();

  // Playback
  const [rootName,     setRootName]     = useState("random");
  const [octave,       setOctave]       = useState(3);
  const [voicingStyle, setVoicingStyle] = useState("random");
  const [mode,         setMode]         = useState("ascending");
  const [sustain,      setSustain]      = useState(false);
  const [hideNotes,    setHideNotes]    = useState(false);

  // Practice filters
  const [chordFilter,        setChordFilter]        = useState("random");
  const [degreeFilter,       setDegreeFilter]       = useState("random");
  const [allowNonChordTones, setAllowNonChordTones] = useState(false);

  // Auto mode
  const [autoMode,    setAutoMode]    = useState(false);
  const [autoRepeats, setAutoRepeats] = useState("2");
  const [autoBpm,     setAutoBpm]     = useState("60");
  const [autoPhase,   setAutoPhase]   = useState(null); // null|'playing'|'silence'|'answer'|'answersilence'
  const [autoRepeatN, setAutoRepeatN] = useState(0);    // which repeat we're on
  const autoTimerRef = useRef(null);

  // Round state
  const [revealed,     setRevealed]     = useState(false);
  const [round,        setRound]        = useState(null);
  const [streak,       setStreak]       = useState(0);
  const [incompatible, setIncompatible] = useState(false);

  // Settings panel open/closed
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Round building ──────────────────────────────────────────

  const buildRound = useCallback(() => {
    const resolved = resolveChordAndDegree(chordFilter, degreeFilter, allowNonChordTones);
    if (!resolved) return null;
    const { chord, targetDegree } = resolved;
    const actualRootName = rootName === "random"
      ? NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)]
      : rootName;
    const rootMidi = NOTE_NAMES.indexOf(actualRootName) + (octave + 1) * 12;
    const actualStyle = voicingStyle === "random"
      ? VOICING_STYLES[Math.floor(Math.random() * VOICING_STYLES.length)]
      : voicingStyle;
    const tagged     = buildVoicedChord(chord.degrees, rootMidi, actualStyle, Math.random);
    const voicing    = tagged.map((t) => t.midi);
    const targetMidi = midiFromRootAndDegree(rootMidi, targetDegree);
    const isChordTone = chord.degrees.some((d) => String(d) === String(targetDegree));
    return { chordType: chord, rootName: actualRootName, voicingStyleUsed: actualStyle,
             degrees: chord.degrees, voicing, targetDegree, targetMidi, isChordTone };
  }, [chordFilter, degreeFilter, allowNonChordTones, rootName, octave, voicingStyle]);

  const newRound = useCallback(() => {
    stopSustain();
    const r = buildRound();
    if (!r) { setIncompatible(true); setRound(null); setRevealed(false); return; }
    setIncompatible(false);
    setRound(r);
    setRevealed(false);
  }, [buildRound, stopSustain]);

  useEffect(() => {
    newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordFilter, degreeFilter, allowNonChordTones, rootName, octave, voicingStyle]);

  // ── Manual playback ─────────────────────────────────────────

  const triggerPlayChord = useCallback((r) => {
    const target = r || round;
    if (!target) return;
    const beatMs   = (60 / Number(autoBpm)) * 1000;
    const duration = beatMs * 4 / 1000;
    if (sustain) {
      sustainChord(target.voicing, { gain: 0.16, stagger: mode === "ascending" ? 0.34 : 0 });
    } else if (mode === "block") {
      playChord(target.voicing, { stagger: 0, duration, gain: 0.16 });
    } else {
      playChord(target.voicing, { stagger: 0.34, duration, gain: 0.22 });
    }
  }, [round, autoBpm, sustain, mode, sustainChord, playChord]);

  const handlePlayChord   = () => triggerPlayChord(round);
  const handleReveal      = () => {
    if (!round) return;
    stopSustain();
    setRevealed(true);
    playNote(round.targetMidi, { duration: 1.6, gain: 0.26 });
  };
  const handleNext = (correct) => {
    if (correct === true)  setStreak((s) => s + 1);
    if (correct === false) setStreak(0);
    newRound();
  };

  // ── Auto mode ────────────────────────────────────────────────
  // Sequence per round:
  //   repeat N times: [play 4 beats] → [silence 4 beats]
  //   then: [reveal answer / play target note 4 beats] → [silence 4 beats] → next round

  const stopAuto = useCallback(() => {
    clearTimeout(autoTimerRef.current);
    autoTimerRef.current = null;
    setAutoPhase(null);
    setAutoRepeatN(0);
    stopSustain();
  }, [stopSustain]);

  const runAutoSequence = useCallback((roundData, repeatsDone) => {
    const beatMs     = (60 / Number(autoBpm)) * 1000;
    const phaseMs    = beatMs * 4;
    const totalReps  = Number(autoRepeats);

    if (repeatsDone < totalReps) {
      // Play chord
      setAutoPhase("playing");
      setAutoRepeatN(repeatsDone + 1);
      triggerPlayChord(roundData);

      // After 4 beats → silence phase
      autoTimerRef.current = setTimeout(() => {
        stopSustain();
        setAutoPhase("silence");

        // After 4 beats silence → next repeat or answer
        autoTimerRef.current = setTimeout(() => {
          runAutoSequence(roundData, repeatsDone + 1);
        }, phaseMs);
      }, phaseMs);

    } else {
      // All repeats done → reveal answer
      setAutoPhase("answer");
      setRevealed(true);
      playNote(roundData.targetMidi, { duration: phaseMs / 1000, gain: 0.26 });

      autoTimerRef.current = setTimeout(() => {
        setAutoPhase("answersilence");

        autoTimerRef.current = setTimeout(() => {
          // Build and start the next round
          const nextRound = buildRound();
          if (!nextRound) { stopAuto(); return; }
          setRound(nextRound);
          setRevealed(false);
          runAutoSequence(nextRound, 0);
        }, phaseMs);
      }, phaseMs);
    }
  }, [autoBpm, autoRepeats, triggerPlayChord, stopSustain, playNote, buildRound, stopAuto]);

  const startAuto = useCallback(() => {
    if (!round) return;
    setAutoPhase("playing");
    setAutoRepeatN(0);
    setRevealed(false);
    runAutoSequence(round, 0);
  }, [round, runAutoSequence]);

  // Stop auto when it's toggled off
  useEffect(() => { if (!autoMode) stopAuto(); }, [autoMode, stopAuto]);

  // Clean up on unmount
  useEffect(() => () => clearTimeout(autoTimerRef.current), []);

  // ── Derived display ──────────────────────────────────────────

  const targetNoteName = round ? noteNameFromMidi(round.targetMidi) : null;
  const chordLabel     = (c) => rootName === "random" ? c.label : `${rootName}${c.label}`;
  const ordinalSuffix  = (d) => {
    const s = String(d);
    if (s.endsWith("11") || s.endsWith("12") || s.endsWith("13")) return "th";
    if (s.endsWith("1")) return "st";
    if (s.endsWith("2")) return "nd";
    if (s.endsWith("3")) return "rd";
    return "th";
  };

  const autoPhaseLabel = { playing: "▸ sounding", silence: "— listening", answer: "♪ answer", answersilence: "— next up…" };
  const isAutoRunning  = autoPhase !== null;

  return (
    <div className="min-h-screen w-full bg-[#120d0a] text-amber-50 flex flex-col items-center px-3 pt-4 pb-6"
      style={{ fontFamily: "'Iowan Old Style', Georgia, serif" }}>
      <div className="w-full max-w-sm">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[9px] uppercase tracking-[0.28em] text-amber-400/50">By Ear</div>
            <h1 className="text-base font-semibold tracking-tight leading-tight">Chord Tone Trainer</h1>
          </div>
          {/* Streak */}
          <div className="flex items-center gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`h-0.5 w-3.5 rounded-full transition-colors duration-300 ${i < streak % 8 && streak > 0 ? "bg-amber-400" : "bg-amber-900/50"}`} />
            ))}
            <span className="text-[10px] text-amber-300/50 ml-1 tabular-nums">{streak}</span>
          </div>
        </div>

        {/* ── PRACTICE FOCUS ── */}
        <div className="mb-2 rounded-xl border border-amber-500/20 bg-amber-950/30 p-2.5">
          <div className="text-[9px] uppercase tracking-[0.22em] text-amber-400/55 mb-2">Practice focus</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Select label="Chord type" value={chordFilter} onChange={setChordFilter}
              options={[{ value: "random", label: "Random" }, ...CHORD_TYPES.map((c) => ({ value: c.id, label: chordLabel(c) }))]} />
            <Select label="Target degree" value={String(degreeFilter)}
              onChange={(v) => setDegreeFilter(v === "random" ? "random" : v)}
              options={[{ value: "random", label: "Random" }, ...ALL_DEGREES.map((d) => ({ value: String(d), label: degreeLabel(d) }))]} />
          </div>
          <Checkbox label="Allow non-chord tones" checked={allowNonChordTones} onChange={setAllowNonChordTones} />
          {incompatible && !allowNonChordTones && (
            <div className="mt-1.5 text-[10px] text-amber-400/80 bg-amber-900/30 rounded px-2 py-1.5">
              ⚠ {degreeLabel(degreeFilter)} not found in that chord type. Enable non-chord tones or change filters.
            </div>
          )}
        </div>

        {/* ── SETTINGS COLLAPSIBLE ── */}
        <div className="mb-2 rounded-xl border border-amber-900/30 bg-[#1a1410] overflow-hidden">
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-amber-200/60 hover:text-amber-200/80 transition-colors"
          >
            <span className="text-[9px] uppercase tracking-[0.22em]">Playback settings</span>
            <span className="text-amber-500/60">{settingsOpen ? "▴" : "▾"}</span>
          </button>

          {settingsOpen && (
            <div className="px-2.5 pb-2.5 border-t border-amber-900/30 pt-2.5">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Select label="Root" value={rootName} onChange={setRootName}
                  options={[{ value: "random", label: "Random" }, ...NOTE_NAMES.map((n) => ({ value: n, label: n }))]} />
                <Select label="Octave" value={octave} onChange={(v) => setOctave(Number(v))}
                  options={[2, 3, 4, 5].map((o) => ({ value: o, label: `C${o}+` }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select label="Voicing" value={voicingStyle} onChange={setVoicingStyle}
                  options={[{ value: "random", label: "Random" }, { value: "close", label: "Close" },
                            { value: "inverted", label: "Inverted" }, { value: "spread", label: "Spread" },
                            { value: "drop2", label: "Drop 2" }]} />
                <Select label="Playback" value={mode} onChange={setMode}
                  options={[{ value: "ascending", label: "Arpeggio" }, { value: "block", label: "Block" }]} />
              </div>
              <div className="mt-1 divide-y divide-amber-900/30 border-t border-amber-900/30 pt-1">
                <Toggle label="Sustain chord" checked={sustain}
                  onChange={(v) => { setSustain(v); if (!v) stopSustain(); }} />
                <Toggle label="Hide note names" sub="Chord type only · answer shows —"
                  checked={hideNotes} onChange={setHideNotes} />
              </div>
            </div>
          )}
        </div>

        {/* ── AUTO MODE ── */}
        <div className="mb-2 rounded-xl border border-amber-900/30 bg-[#1a1410] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[9px] uppercase tracking-[0.22em] text-amber-200/60">Auto mode</span>
            <Toggle label="" checked={autoMode} onChange={(v) => { setAutoMode(v); if (!v) stopAuto(); }} />
          </div>
          {autoMode && (
            <div className="px-2.5 pb-2.5 border-t border-amber-900/30 pt-2.5">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Select label="BPM" value={autoBpm} onChange={setAutoBpm}
                  options={[40,50,60,70,80,90,100,120].map((b) => ({ value: String(b), label: String(b) }))} />
                <Select label="Chord repeats" value={autoRepeats} onChange={setAutoRepeats}
                  options={[1,2,3,4,6,8].map((n) => ({ value: String(n), label: String(n) }))} />
              </div>
              <div className="text-[10px] text-amber-200/35 mb-2 leading-snug">
                Plays chord {autoRepeats}× (4 beats on, 4 beats off), then sounds the answer note for 4 beats, then moves on.
              </div>
              {isAutoRunning ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-center py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/30 text-xs text-amber-300">
                    {autoPhaseLabel[autoPhase]} · rep {autoRepeatN}/{autoRepeats}
                  </div>
                  <button onClick={stopAuto}
                    className="px-3 py-1.5 rounded-lg border border-amber-900/40 text-amber-200/60 text-xs hover:bg-amber-900/20 transition-all">
                    Stop
                  </button>
                </div>
              ) : (
                <button onClick={startAuto} disabled={!round || incompatible}
                  className="w-full py-2 rounded-lg bg-amber-500 text-[#1a1208] text-xs font-semibold
                             hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-30">
                  ▸ Start auto
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── ROUND CARD ── */}
        <div className="rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1c140f] to-[#160f0b] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">

          {/* Chord name */}
          <div className="text-center mb-3">
            <div className="text-[9px] uppercase tracking-[0.25em] text-amber-400/45 mb-0.5">Now sounding</div>
            <div className="text-2xl font-semibold leading-tight">
              {round ? (hideNotes ? "" : round.rootName) : "—"}{round ? round.chordType.label : ""}
            </div>
            {round && <div className="text-[10px] text-amber-200/25 mt-0.5 capitalize">{round.voicingStyleUsed} voicing</div>}
          </div>

          {/* Play button */}
          {!isAutoRunning && (
            <div className="flex gap-2 mb-3">
              <button onClick={handlePlayChord} disabled={!round}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-[#1a1208] font-semibold text-xs
                           tracking-wide hover:bg-amber-400 active:scale-[0.98] transition-all
                           shadow-[0_3px_10px_rgba(245,158,11,0.25)] disabled:opacity-30">
                ▸ {sustain ? "Play & hold" : "Play chord"}
              </button>
              {sustain && (
                <button onClick={() => stopSustain()}
                  className="px-4 py-2.5 rounded-xl border border-amber-500/40 text-amber-200 text-xs font-semibold
                             hover:bg-amber-500/10 active:scale-[0.98] transition-all">■</button>
              )}
            </div>
          )}

          {/* Prompt */}
          <div className="text-center mb-3">
            <div className="text-[9px] uppercase tracking-[0.25em] text-amber-400/45 mb-1">Your turn — sing the</div>
            <div className="text-xl font-semibold text-amber-300">
              {round ? degreeLabel(round.targetDegree) : "…"}{round ? ordinalSuffix(round.targetDegree) : ""}
            </div>
          </div>

          {/* Check / reveal */}
          {!isAutoRunning && !revealed && (
            <button onClick={handleReveal} disabled={!round}
              className="w-full py-2.5 rounded-xl border border-amber-500/40 text-amber-200 font-medium text-xs
                         hover:bg-amber-500/10 active:scale-[0.98] transition-all disabled:opacity-30">
              ♪ Check my answer
            </button>
          )}

          {(revealed || autoPhase === "answer" || autoPhase === "answersilence") && targetNoteName && (
            <div className="mt-3 text-center" style={{ animation: "fadeIn 0.3s ease-out" }}>
              <div className="inline-flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl bg-amber-950/40 border border-amber-800/30">
                <span className="text-[10px] text-amber-200/45">
                  {degreeLabel(round.targetDegree)}
                  {!round.isChordTone && <span className="ml-1 text-amber-500/70">· non-chord</span>}
                  {" "}— concert pitch
                </span>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl font-semibold text-amber-300">
                    {hideNotes
                      ? <span className="tracking-widest text-amber-200/40">—</span>
                      : <>{targetNoteName.name}<span className="text-amber-200/40 text-sm ml-0.5">{targetNoteName.octave}</span></>
                    }
                  </span>
                  <button
                    onClick={() => playNote(round.targetMidi, { duration: 1.6, gain: 0.26 })}
                    className="text-amber-400/70 hover:text-amber-300 active:scale-90 transition-all text-base leading-none"
                    aria-label="Play again"
                    title="Play again"
                  >↺</button>
                </div>
              </div>

              {!isAutoRunning && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleNext(false)}
                    className="flex-1 py-2 rounded-lg border border-amber-900/40 text-amber-200/55 text-xs
                               hover:bg-amber-900/20 active:scale-[0.98] transition-all">Missed it</button>
                  <button onClick={() => handleNext(true)}
                    className="flex-1 py-2 rounded-lg bg-amber-600/90 text-[#1a1208] font-medium text-xs
                               hover:bg-amber-500 active:scale-[0.98] transition-all">Got it →</button>
                </div>
              )}
            </div>
          )}

          {!revealed && !isAutoRunning && round && (
            <button onClick={newRound}
              className="w-full mt-2 py-1.5 text-[10px] text-amber-200/25 hover:text-amber-200/55 transition-colors">
              skip
            </button>
          )}
        </div>

      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
