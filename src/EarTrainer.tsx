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
  { id: "maj",          label: "maj",        degrees: [1, 3, 5] },
  { id: "min",          label: "min",        degrees: [1, "b3", 5] },
  { id: "dim",          label: "dim",        degrees: [1, "b3", "b5"] },
  { id: "aug",          label: "aug",        degrees: [1, 3, "#5"] },
  { id: "maj7",         label: "maj7",       degrees: [1, 3, 5, 7] },
  { id: "min7",         label: "min7",       degrees: [1, "b3", 5, "b7"] },
  { id: "dom7",         label: "7",          degrees: [1, 3, 5, "b7"] },
  { id: "min7b5",       label: "min7b5",     degrees: [1, "b3", "b5", "b7"] },
  { id: "dim7",         label: "dim7",       degrees: [1, "b3", "b5", "bb7"] },
  { id: "minMaj7",      label: "min(maj7)",  degrees: [1, "b3", 5, 7] },
  { id: "maj9",         label: "maj9",       degrees: [1, 3, 5, 7, 9] },
  { id: "min9",         label: "min9",       degrees: [1, "b3", 5, "b7", 9] },
  { id: "dom9",         label: "9",          degrees: [1, 3, 5, "b7", 9] },
  { id: "dom7sharp9",   label: "7#9",        degrees: [1, 3, 5, "b7", "#9"] },
  { id: "dom7flat9",    label: "7b9",        degrees: [1, 3, 5, "b7", "b9"] },
  { id: "maj11",        label: "maj11",      degrees: [1, 3, 5, 7, 9, 11] },
  { id: "min11",        label: "min11",      degrees: [1, "b3", 5, "b7", 9, 11] },
  { id: "dom11",        label: "11",         degrees: [1, 3, 5, "b7", 9, 11] },
  { id: "dom7sharp11",  label: "7#11",       degrees: [1, 3, 5, "b7", "#11"] },
  { id: "domsharp11",   label: "dom7#11",    degrees: [1, 3, 5, "b7", 9, "#11"] },
  { id: "maj13",        label: "maj13",      degrees: [1, 3, 5, 7, 9, 13] },
  { id: "min13",        label: "min13",      degrees: [1, "b3", 5, "b7", 9, 13] },
  { id: "dom13",        label: "13",         degrees: [1, 3, 5, "b7", 9, 13] },
  { id: "dom13sharp11", label: "13#11",      degrees: [1, 3, 5, "b7", 9, "#11", 13] },
  { id: "altDom",       label: "7alt",       degrees: [1, 3, "b5", "b7", "b9", "#9"] },
  { id: "sus4",         label: "sus4",       degrees: [1, 4, 5] },
  { id: "sus2",         label: "sus2",       degrees: [1, 2, 5] },
  { id: "dom7sus4",     label: "7sus4",      degrees: [1, 4, 5, "b7"] },
  { id: "add9",         label: "add9",       degrees: [1, 3, 5, 9] },
  { id: "six",          label: "6",          degrees: [1, 3, 5, 6] },
  { id: "min6",         label: "min6",       degrees: [1, "b3", 5, 6] },
];

// Ordered union of every degree that appears in any chord formula.
const ALL_DEGREES = [1, 2, "b3", 3, 4, "b5", 5, "#5", "bb7", 6, "b7", 7,
                     "b9", 9, "#9", 11, "#11", 13];

function degreeLabel(d) { return String(d); }

function midiFromRootAndDegree(rootMidi, degree) {
  return rootMidi + DEGREE_SEMITONES[degree];
}

function noteNameFromMidi(midi) {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave };
}

function freqFromMidi(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ---------------------------------------------------------------
   FILTER RESOLUTION
   Both filters operate independently. If the combination is
   impossible (e.g. degree=#11 + chord=min7) we return null so
   the UI can show a warning rather than silently breaking.
   --------------------------------------------------------------- */

function resolveChordAndDegree(chordFilter, degreeFilter) {
  // 1. Build the pool of candidate chord types
  let pool = chordFilter === "random"
    ? CHORD_TYPES
    : CHORD_TYPES.filter((c) => c.id === chordFilter);

  // 2. If a specific degree is required, narrow to chords that contain it
  if (degreeFilter !== "random") {
    pool = pool.filter((c) =>
      c.degrees.some((d) => String(d) === String(degreeFilter))
    );
  }

  if (pool.length === 0) return null; // incompatible combination

  // 3. Pick a random chord from what remains
  const chord = pool[Math.floor(Math.random() * pool.length)];

  // 4. Pick the target degree
  const targetDegree = degreeFilter !== "random"
    ? chord.degrees.find((d) => String(d) === String(degreeFilter))
    : chord.degrees[Math.floor(Math.random() * chord.degrees.length)];

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
    const inversion = 1 + Math.floor(rng() * (n - 1));
    tagged = tagged.map((t, idx) => (idx < inversion ? { ...t, midi: t.midi + 12 } : t));
  } else if (style === "spread" && n > 2) {
    tagged = tagged.map((t, idx) => (idx % 2 === 1 ? { ...t, midi: t.midi + 12 } : t));
  } else if (style === "drop2" && n > 2) {
    const idx = n - 2;
    tagged[idx] = { ...tagged[idx], midi: tagged[idx].midi - 12 };
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
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const PARTIALS = [
    { ratio: 1, type: "sine",     level: 1.0  },
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
    const peak = gain;
    master.gain.setValueAtTime(0, startAt);
    master.gain.linearRampToValueAtTime(peak, startAt + 0.015);
    master.gain.exponentialRampToValueAtTime(peak * 0.55, startAt + 0.25);
    master.gain.setValueAtTime(peak * 0.55, startAt + Math.max(0.25, duration - 0.35));
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

function Knob({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.18em] text-amber-200/50 font-medium">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#1a1410] border border-amber-900/40 text-amber-50 text-sm rounded-md px-2.5 py-2
                   focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50
                   cursor-pointer appearance-none"
        style={{ minWidth: 0 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
   --------------------------------------------------------------- */

export default function EarTrainer() {
  const { playChord, playNote, sustainChord, stopSustain } = useAudioEngine();

  // Playback controls
  const [rootName,     setRootName]     = useState("random");
  const [octave,       setOctave]       = useState(3);
  const [voicingStyle, setVoicingStyle] = useState("random");
  const [mode,         setMode]         = useState("ascending");
  const [sustain,      setSustain]      = useState(false);
  const [hideNotes,    setHideNotes]    = useState(false);

  // Practice filters — independent of each other, both default to "random"
  const [chordFilter,  setChordFilter]  = useState("random"); // chord type to drill
  const [degreeFilter, setDegreeFilter] = useState("random"); // chord tone to target

  // Round state
  const [revealed, setRevealed] = useState(false);
  const [round,    setRound]    = useState(null);
  const [streak,   setStreak]   = useState(0);
  const [incompatible, setIncompatible] = useState(false);

  const newRound = useCallback(() => {
    stopSustain();

    const resolved = resolveChordAndDegree(chordFilter, degreeFilter);
    if (!resolved) {
      setIncompatible(true);
      setRound(null);
      setRevealed(false);
      return;
    }
    setIncompatible(false);

    const { chord, targetDegree } = resolved;
    const targetIdx = chord.degrees.findIndex((d) => String(d) === String(targetDegree));

    const actualRootName = rootName === "random"
      ? NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)]
      : rootName;
    const rootMidi = NOTE_NAMES.indexOf(actualRootName) + (octave + 1) * 12;

    const actualStyle = voicingStyle === "random"
      ? VOICING_STYLES[Math.floor(Math.random() * VOICING_STYLES.length)]
      : voicingStyle;

    const tagged   = buildVoicedChord(chord.degrees, rootMidi, actualStyle, Math.random);
    const voicing  = tagged.map((t) => t.midi);
    const targetMidi = tagged.find((t) => t.i === targetIdx).midi;

    setRound({
      chordType: chord,
      rootName: actualRootName,
      voicingStyleUsed: actualStyle,
      degrees: chord.degrees,
      voicing,
      targetDegree,
      targetMidi,
    });
    setRevealed(false);
  }, [chordFilter, degreeFilter, rootName, octave, voicingStyle, stopSustain]);

  useEffect(() => {
    newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordFilter, degreeFilter, rootName, octave, voicingStyle]);

  const handlePlayChord = () => {
    if (!round) return;
    if (sustain) {
      sustainChord(round.voicing, { gain: 0.16, stagger: mode === "ascending" ? 0.34 : 0 });
    } else if (mode === "block") {
      playChord(round.voicing, { stagger: 0, duration: 2.2, gain: 0.16 });
    } else {
      playChord(round.voicing, { stagger: 0.34, duration: 1.1, gain: 0.22 });
    }
  };

  const handleReveal = () => {
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

  const targetNoteName = round ? noteNameFromMidi(round.targetMidi) : null;

  const ordinalSuffix = (d) => {
    const s = String(d);
    if (s.endsWith("11") || s.endsWith("12") || s.endsWith("13")) return "th";
    if (s.endsWith("1")) return "st";
    if (s.endsWith("2")) return "nd";
    if (s.endsWith("3")) return "rd";
    return "th";
  };

  // For the chord type dropdown label: show root prefix only when root is fixed
  const chordLabel = (c) =>
    rootName === "random" ? c.label : `${rootName}${c.label}`;

  return (
    <div
      className="min-h-screen w-full bg-[#120d0a] text-amber-50 flex items-start justify-center px-4 py-8 sm:py-12"
      style={{ fontFamily: "'Iowan Old Style', Georgia, serif" }}
    >
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-7 text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-amber-400/60 mb-1.5">By Ear</div>
          <h1 className="text-2xl font-semibold tracking-tight">Chord Tone Trainer</h1>
          <p className="text-sm text-amber-200/40 mt-1">Hear the chord. Name the degree. Check the pitch.</p>
        </div>

        {/* Streak */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`h-1 w-5 rounded-full transition-colors duration-300 ${
              i < streak % 8 && streak > 0 ? "bg-amber-400" : "bg-amber-900/40"
            }`} />
          ))}
          <span className="text-xs text-amber-300/50 ml-2 tabular-nums">{streak}</span>
        </div>

        {/* ── PRACTICE FILTERS ── */}
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-950/30 p-3.5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-400/60 mb-3">
            Practice focus
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Knob
              label="Chord type"
              value={chordFilter}
              onChange={setChordFilter}
              options={[
                { value: "random", label: "Random" },
                ...CHORD_TYPES.map((c) => ({ value: c.id, label: chordLabel(c) })),
              ]}
            />
            <Knob
              label="Target degree"
              value={String(degreeFilter)}
              onChange={(v) => setDegreeFilter(v === "random" ? "random" : v)}
              options={[
                { value: "random", label: "Random" },
                ...ALL_DEGREES.map((d) => ({ value: String(d), label: degreeLabel(d) })),
              ]}
            />
          </div>

          {/* Incompatibility warning */}
          {incompatible && (
            <div className="mt-3 text-xs text-amber-400/80 bg-amber-900/30 rounded-lg px-3 py-2">
              ⚠ No chord in the list contains the {degreeLabel(degreeFilter)}.
              Change one of the filters above.
            </div>
          )}
        </div>

        {/* ── PLAYBACK SETTINGS ── */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Knob
            label="Root"
            value={rootName}
            onChange={setRootName}
            options={[
              { value: "random", label: "Random" },
              ...NOTE_NAMES.map((n) => ({ value: n, label: n })),
            ]}
          />
          <Knob
            label="Octave"
            value={octave}
            onChange={(v) => setOctave(Number(v))}
            options={[2, 3, 4, 5].map((o) => ({ value: o, label: `C${o}+` }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Knob
            label="Voicing"
            value={voicingStyle}
            onChange={setVoicingStyle}
            options={[
              { value: "random",   label: "Random"   },
              { value: "close",    label: "Close"    },
              { value: "inverted", label: "Inverted" },
              { value: "spread",   label: "Spread"   },
              { value: "drop2",    label: "Drop 2"   },
            ]}
          />
          <Knob
            label="Playback"
            value={mode}
            onChange={setMode}
            options={[
              { value: "ascending", label: "Arpeggio" },
              { value: "block",     label: "Block"    },
            ]}
          />
        </div>

        {/* Sustain + Hide Notes toggles */}
        <div className="mb-5 rounded-xl bg-[#1a1410] border border-amber-900/40 divide-y divide-amber-900/30">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-amber-100">Sustain chord</span>
            <button
              onClick={() => { const next = !sustain; setSustain(next); if (!next) stopSustain(); }}
              role="switch"
              aria-checked={sustain}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${sustain ? "bg-amber-500" : "bg-amber-900/50"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[#120d0a] transition-transform duration-200 ${sustain ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="text-sm text-amber-100">Hide note names</span>
              <p className="text-[11px] text-amber-200/35 mt-0.5">Chord shows type only · answer shows —</p>
            </div>
            <button
              onClick={() => setHideNotes((h) => !h)}
              role="switch"
              aria-checked={hideNotes}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ml-4 ${hideNotes ? "bg-amber-500" : "bg-amber-900/50"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[#120d0a] transition-transform duration-200 ${hideNotes ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>

        {/* ── ROUND CARD ── */}
        <div className="relative rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1c140f] to-[#160f0b] p-6 sm:p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">

          <div className="text-center mb-6">
            <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/50 mb-1">Now sounding</div>
            <div className="text-3xl font-semibold">
              {round ? (hideNotes ? "" : round.rootName) : "—"}{round ? round.chordType.label : ""}
            </div>
            {round && (
              <div className="text-[11px] text-amber-200/30 mt-1 capitalize">
                {round.voicingStyleUsed} voicing
              </div>
            )}
          </div>

          {/* Play button + stop */}
          <div className="flex gap-3">
            <button
              onClick={handlePlayChord}
              disabled={!round}
              className="flex-1 py-3.5 rounded-xl bg-amber-500 text-[#1a1208] font-semibold text-sm
                         tracking-wide hover:bg-amber-400 active:scale-[0.98] transition-all duration-150
                         shadow-[0_4px_14px_rgba(245,158,11,0.25)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ▸ {sustain ? "Play & hold" : "Play the chord"}
            </button>
            {sustain && (
              <button
                onClick={() => stopSustain()}
                className="px-5 py-3.5 rounded-xl border border-amber-500/40 text-amber-200 font-semibold text-sm
                           hover:bg-amber-500/10 active:scale-[0.98] transition-all"
                aria-label="Stop"
              >■</button>
            )}
          </div>

          {/* Prompt */}
          <div className="mt-7 text-center">
            <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/50 mb-2">Your turn</div>
            <div className="text-xl">
              Play or sing the{" "}
              <span className="font-semibold text-amber-300">
                {round ? degreeLabel(round.targetDegree) : "…"}
              </span>
              {round ? ordinalSuffix(round.targetDegree) : ""}
            </div>
            <div className="text-xs text-amber-200/35 mt-1.5">by ear, before checking</div>
          </div>

          {/* Check */}
          <div className="mt-6">
            <button
              onClick={handleReveal}
              disabled={!round}
              className="w-full py-3 rounded-xl border border-amber-500/40 text-amber-200 font-medium text-sm
                         hover:bg-amber-500/10 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ♪ Check my answer
            </button>
          </div>

          {/* Reveal */}
          {revealed && targetNoteName && (
            <div className="mt-5 text-center" style={{ animation: "fadeIn 0.3s ease-out" }}>
              <div className="inline-flex flex-col items-center gap-2 px-5 py-3 rounded-xl bg-amber-950/40 border border-amber-800/30">
                <span className="text-xs text-amber-200/50">
                  That was the {degreeLabel(round.targetDegree)} — concert pitch
                </span>
                <span className="text-2xl font-semibold text-amber-300">
                  {hideNotes ? (
                    <span className="tracking-widest text-amber-200/40">—</span>
                  ) : (
                    <>
                      {targetNoteName.name}
                      <span className="text-amber-200/40 text-base ml-0.5">{targetNoteName.octave}</span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => handleNext(false)}
                  className="flex-1 py-2.5 rounded-lg border border-amber-900/40 text-amber-200/60 text-sm
                             hover:bg-amber-900/20 active:scale-[0.98] transition-all"
                >Missed it</button>
                <button
                  onClick={() => handleNext(true)}
                  className="flex-1 py-2.5 rounded-lg bg-amber-600/90 text-[#1a1208] font-medium text-sm
                             hover:bg-amber-500 active:scale-[0.98] transition-all"
                >Got it →</button>
              </div>
            </div>
          )}

          {!revealed && round && (
            <button
              onClick={newRound}
              className="w-full mt-5 py-2 text-xs text-amber-200/30 hover:text-amber-200/60 transition-colors"
            >skip — new chord</button>
          )}
        </div>

        <p className="text-center text-[11px] text-amber-200/25 mt-6 leading-relaxed">
          Both filters are independent — combine any chord type with any degree it contains.
        </p>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
