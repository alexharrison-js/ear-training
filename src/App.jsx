import React, { useState, useRef, useCallback, useEffect } from "react";

/* ---------------------------------------------------------------
   THEORY ENGINE
   --------------------------------------------------------------- */

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

// Scale-degree -> semitone offset from root, including alterations.
const DEGREE_SEMITONES = {
  1: 0,
  b2: 1,
  2: 2,
  "#2": 3,
  b3: 3,
  3: 4,
  4: 5,
  "#4": 6,
  b5: 6,
  5: 7,
  "#5": 8,
  b6: 8,
  6: 9,
  bb7: 9,
  b7: 10,
  7: 11,
  b9: 13,
  9: 14,
  "#9": 15,
  11: 17,
  "#11": 18,
  b13: 20,
  13: 21,
};

// Chord formulas as the degrees present (already designed to come out
// monotonically ascending in semitone order above the root).
const CHORD_TYPES = [
  { id: "maj", label: "maj", degrees: [1, 3, 5] },
  { id: "min", label: "min", degrees: [1, "b3", 5] },
  { id: "dim", label: "dim", degrees: [1, "b3", "b5"] },
  { id: "aug", label: "aug", degrees: [1, 3, "#5"] },
  { id: "maj7", label: "maj7", degrees: [1, 3, 5, 7] },
  { id: "min7", label: "min7", degrees: [1, "b3", 5, "b7"] },
  { id: "dom7", label: "7", degrees: [1, 3, 5, "b7"] },
  { id: "min7b5", label: "min7b5", degrees: [1, "b3", "b5", "b7"] },
  { id: "dim7", label: "dim7", degrees: [1, "b3", "b5", "bb7"] },
  { id: "minMaj7", label: "min(maj7)", degrees: [1, "b3", 5, 7] },
  { id: "maj9", label: "maj9", degrees: [1, 3, 5, 7, 9] },
  { id: "min9", label: "min9", degrees: [1, "b3", 5, "b7", 9] },
  { id: "dom9", label: "9", degrees: [1, 3, 5, "b7", 9] },
  { id: "dom7sharp9", label: "7#9", degrees: [1, 3, 5, "b7", "#9"] },
  { id: "dom7flat9", label: "7b9", degrees: [1, 3, 5, "b7", "b9"] },
  { id: "maj11", label: "maj11", degrees: [1, 3, 5, 7, 9, 11] },
  { id: "min11", label: "min11", degrees: [1, "b3", 5, "b7", 9, 11] },
  { id: "dom11", label: "11", degrees: [1, 3, 5, "b7", 9, 11] },
  { id: "dom7sharp11", label: "7#11", degrees: [1, 3, 5, "b7", "#11"] },
  { id: "domsharp11", label: "dom7#11", degrees: [1, 3, 5, "b7", 9, "#11"] },
  { id: "maj13", label: "maj13", degrees: [1, 3, 5, 7, 9, 13] },
  { id: "min13", label: "min13", degrees: [1, "b3", 5, "b7", 9, 13] },
  { id: "dom13", label: "13", degrees: [1, 3, 5, "b7", 9, 13] },
  {
    id: "dom13sharp11",
    label: "13#11",
    degrees: [1, 3, 5, "b7", 9, "#11", 13],
  },
  { id: "altDom", label: "7alt", degrees: [1, 3, "b5", "b7", "b9", "#9"] },
  { id: "sus4", label: "sus4", degrees: [1, 4, 5] },
  { id: "sus2", label: "sus2", degrees: [1, 2, 5] },
  { id: "dom7sus4", label: "7sus4", degrees: [1, 4, 5, "b7"] },
  { id: "add9", label: "add9", degrees: [1, 3, 5, 9] },
  { id: "six", label: "6", degrees: [1, 3, 5, 6] },
  { id: "min6", label: "min6", degrees: [1, "b3", 5, 6] },
];

function degreeLabel(d) {
  return String(d);
}

function midiFromRootAndDegree(rootMidi, degree) {
  const semis = DEGREE_SEMITONES[degree];
  return rootMidi + semis;
}

function noteNameFromMidi(midi) {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave, full: `${name}${octave}` };
}

function freqFromMidi(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ---------------------------------------------------------------
   VOICING ENGINE
   Randomizes how the chord tones are distributed across octaves —
   close (root position, tight stack), inverted (a non-root tone
   becomes the lowest voice), spread (alternating tones lifted an
   octave for an open sound), and drop2 (the second-from-top voice
   dropped an octave, a classic jazz piano voicing). The target
   tone's identity is tracked by its original formula index, so the
   "answer" always reflects whatever octave it actually sounds at
   in that particular voicing.
   --------------------------------------------------------------- */

const VOICING_STYLES = ["close", "inverted", "spread", "drop2"];

function buildVoicedChord(degrees, rootMidi, style, rng) {
  const base = degrees.map((d, i) => ({
    midi: midiFromRootAndDegree(rootMidi, d),
    i,
  }));
  let tagged = base.map((t) => ({ ...t }));
  const n = tagged.length;

  if (style === "inverted" && n > 1) {
    const inversion = 1 + Math.floor(rng() * (n - 1)); // how many low tones flip up an octave
    tagged = tagged.map((t, idx) =>
      idx < inversion ? { ...t, midi: t.midi + 12 } : t,
    );
  } else if (style === "spread" && n > 2) {
    tagged = tagged.map((t, idx) =>
      idx % 2 === 1 ? { ...t, midi: t.midi + 12 } : t,
    );
  } else if (style === "drop2" && n > 2) {
    const idx = n - 2;
    tagged[idx] = { ...tagged[idx], midi: tagged[idx].midi - 12 };
  }
  // "close" falls through unchanged: straightforward root-position stack.

  tagged.sort((a, b) => a.midi - b.midi);
  return tagged; // each entry: { midi, i } where i is the index into `degrees`
}

/* ---------------------------------------------------------------
   AUDIO ENGINE
   --------------------------------------------------------------- */

function useAudioEngine() {
  const ctxRef = useRef(null);
  const sustainedNodesRef = useRef([]);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  // Warm, slightly electric-piano-ish tone: a few detuned sine/triangle
  // partials with a soft envelope. Easy on the ear for long sessions.
  const playNote = useCallback(
    (midi, { duration = 1.4, delay = 0, gain = 0.22, pan = 0 } = {}) => {
      const ctx = getCtx();
      const startAt = ctx.currentTime + delay;
      const freq = freqFromMidi(midi);

      const master = ctx.createGain();
      master.gain.value = 0;
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = pan;
        master.connect(panner);
        panner.connect(ctx.destination);
      } else {
        master.connect(ctx.destination);
      }

      const partials = [
        { ratio: 1, type: "sine", level: 1.0 },
        { ratio: 1, type: "triangle", level: 0.35, detune: 4 },
        { ratio: 2, type: "sine", level: 0.12 },
        { ratio: 3, type: "sine", level: 0.05 },
      ];

      partials.forEach((p) => {
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
      master.gain.setValueAtTime(
        peak * 0.55,
        startAt + Math.max(0.25, duration - 0.35),
      );
      master.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

      return startAt + duration;
    },
    [getCtx],
  );

  const playChord = useCallback(
    (midiNotes, { stagger = 0, ...opts } = {}) => {
      let t = 0;
      midiNotes.forEach((midi) => {
        playNote(midi, { ...opts, delay: t });
        t += stagger;
      });
    },
    [playNote],
  );

  const stopSustainedChord = useCallback(() => {
    sustainedNodesRef.current.forEach((osc) => {
      try {
        osc.stop();
      } catch {}
    });

    sustainedNodesRef.current = [];
  }, []);

  const playSustainedChord = useCallback(
    (notes) => {
      stopSustainedChord();

      const ctx = getCtx();

      notes.forEach((midi) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.value = freqFromMidi(midi);

        gain.gain.value = 0.04;

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();

        sustainedNodesRef.current.push(osc);
      });
    },
    [getCtx, stopSustainedChord],
  );

  return {
    playNote,
    playChord,
    playSustainedChord,
    stopSustainedChord,
    getCtx,
  };
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
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
   --------------------------------------------------------------- */

export default function EarTrainer() {
  const { playChord, playNote, playSustainedChord, stopSustainedChord } =
    useAudioEngine();

  const [rootName, setRootName] = useState("random");
  const [octave, setOctave] = useState(3);
  const [chordTypeId, setChordTypeId] = useState("domsharp11");
  const [voicingStyle, setVoicingStyle] = useState("random");
  const [mode, setMode] = useState("ascending");
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(null);
  const [streak, setStreak] = useState(0);
  const [practiceView, setPracticeView] = useState(false);
  const [practiceMode, setPracticeMode] = useState("chordTypes");
  const [sustainMode, setSustainMode] = useState(false);
  const [missedItems, setMissedItems] = useState(() => {
    try {
      const saved = localStorage.getItem("eartrainer-missed");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const chordType = CHORD_TYPES.find((c) => c.id === chordTypeId);

  const missedChordTypes = [...new Set(missedItems.map((x) => x.chordTypeId))];

  const missedDegrees = [...new Set(missedItems.map((x) => x.targetDegree))];

  const missedVoicings = [
    ...new Set(missedItems.map((x) => x.voicingStyleUsed)),
  ];

  const newRound = useCallback(() => {
    stopSustainedChord();
    let selectedChordType = chordType;
    let selectedTargetDegree = null;

    if (practiceView && missedItems.length > 0) {
      if (practiceMode === "chordTypes" && missedChordTypes.length > 0) {
        const selectedId =
          missedChordTypes[Math.floor(Math.random() * missedChordTypes.length)];

        selectedChordType =
          CHORD_TYPES.find((c) => c.id === selectedId) ?? chordType;
      }

      if (practiceMode === "specific" && missedItems.length > 0) {
        const selectedMiss =
          missedItems[Math.floor(Math.random() * missedItems.length)];

        selectedChordType =
          CHORD_TYPES.find((c) => c.id === selectedMiss.chordTypeId) ??
          chordType;

        selectedTargetDegree = selectedMiss.targetDegree;
      }
    }

    let targetDegree = null;
    let targetIdx = null;

    if (practiceView && practiceMode === "tones" && missedDegrees.length > 0) {
      const eligibleChords = CHORD_TYPES.filter((chord) =>
        chord.degrees.some((d) => missedDegrees.includes(d)),
      );

      if (eligibleChords.length > 0) {
        selectedChordType =
          eligibleChords[Math.floor(Math.random() * eligibleChords.length)];

        const matchingDegrees = selectedChordType.degrees.filter((d) =>
          missedDegrees.includes(d),
        );

        targetDegree =
          matchingDegrees[Math.floor(Math.random() * matchingDegrees.length)];
      }
    }

    const degrees = selectedChordType.degrees;
    if (targetDegree === null || targetDegree === undefined) {
      if (practiceView && practiceMode === "specific" && selectedTargetDegree) {
        targetDegree = selectedTargetDegree;
        targetIdx = degrees.indexOf(targetDegree);

        if (targetIdx < 0) {
          targetIdx = Math.floor(Math.random() * degrees.length);
          targetDegree = degrees[targetIdx];
        }
      } else {
        targetIdx = Math.floor(Math.random() * degrees.length);
        targetDegree = degrees[targetIdx];
      }
    }
    if (targetIdx === null || targetIdx === undefined) {
      targetIdx = degrees.indexOf(targetDegree);

      if (targetIdx < 0) {
        targetIdx = Math.floor(Math.random() * degrees.length);
        targetDegree = degrees[targetIdx];
      }
    }

    const actualRootName =
      rootName === "random"
        ? NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)]
        : rootName;
    const rootMidi = NOTE_NAMES.indexOf(actualRootName) + (octave + 1) * 12;

    let actualStyle;

    if (
      practiceView &&
      practiceMode === "voicings" &&
      missedVoicings.length > 0
    ) {
      actualStyle =
        missedVoicings[Math.floor(Math.random() * missedVoicings.length)];
    } else {
      actualStyle =
        voicingStyle === "random"
          ? VOICING_STYLES[Math.floor(Math.random() * VOICING_STYLES.length)]
          : voicingStyle;
    }

    const tagged = buildVoicedChord(
      degrees,
      rootMidi,
      actualStyle,
      Math.random,
    );
    const voicing = tagged.map((t) => t.midi);
    const targetMidi = tagged.find((t) => t.i === targetIdx).midi;

    setRound({
      chordType: selectedChordType,
      rootMidi,
      rootName: actualRootName,
      voicingStyleUsed: actualStyle,
      degrees,
      voicing,
      targetIdx,
      targetDegree,
      targetMidi,
    });
    setRevealed(false);
  }, [
    chordType,
    rootName,
    octave,
    voicingStyle,
    practiceView,
    practiceMode,
    missedItems,
    missedChordTypes,
    missedDegrees,
    missedVoicings,
    stopSustainedChord,
  ]);

  useEffect(() => {
    newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordTypeId, rootName, octave, voicingStyle, practiceView, practiceMode]);

  useEffect(() => {
    localStorage.setItem("eartrainer-missed", JSON.stringify(missedItems));
  }, [missedItems]);

  const handlePlayChord = () => {
    if (!round) return;

    if (sustainMode) {
      playSustainedChord(round.voicing);
      return;
    }

    if (mode === "block") {
      playChord(round.voicing, {
        stagger: 0,
        duration: 2.2,
        gain: 0.16,
      });
    } else {
      playChord(round.voicing, {
        stagger: 0.34,
        duration: 1.1,
        gain: 0.22,
      });
    }
  };

  const handleReveal = () => {
    if (!round) return;
    setRevealed(true);
    playNote(round.targetMidi, { duration: 1.6, gain: 0.26 });
  };

  const handleNext = (wasCorrectSelfReport) => {
    if (wasCorrectSelfReport === true) setStreak((s) => s + 1);
    if (wasCorrectSelfReport === false) {
      setMissedItems((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          rootName: round.rootName,
          chordTypeId: round.chordType.id,
          chordTypeLabel: round.chordType.label,
          targetDegree: round.targetDegree,
          voicingStyleUsed: round.voicingStyleUsed,
          targetMidi: round.targetMidi,
          degrees: round.degrees,
        },
      ]);

      setStreak(0);
    }
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

  return (
    <div
      className="min-h-screen w-full bg-[#120d0a] text-amber-50 flex items-start justify-center px-4 py-8 sm:py-12"
      style={{ fontFamily: "'Iowan Old Style', Georgia, serif" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-amber-400/60 mb-1.5">
            By Ear
          </div>
          <h1 className="text-2xl font-semibold text-amber-50 tracking-tight">
            Chord Tone Trainer
          </h1>
          <p className="text-sm text-amber-200/40 mt-1">
            Hear the chord. Name the degree. Check the pitch.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`h-1 w-5 rounded-full transition-colors duration-300 ${
                i < streak % 8 && streak > 0
                  ? "bg-amber-400"
                  : "bg-amber-900/40"
              }`}
            />
          ))}
          <span className="text-xs text-amber-300/50 ml-2 tabular-nums">
            {streak}
          </span>
        </div>
        <button
          onClick={() => setMissedItems([])}
          className="px-3 py-2 rounded-lg border border-amber-700/40 text-sm"
        >
          Clear Missed
        </button>
        {practiceView && (
          <div className="mb-4">
            <Knob
              label="Practice"
              value={practiceMode}
              onChange={setPracticeMode}
              options={[
                {
                  value: "chordTypes",
                  label: "Chord Types",
                },
                {
                  value: "tones",
                  label: "Chord Tones",
                },
                {
                  value: "voicings",
                  label: "Voicings",
                },
                {
                  value: "specific",
                  label: "Specific Misses",
                },
              ]}
            />
          </div>
        )}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => setPracticeView((v) => !v)}
            className="px-3 py-2 rounded-lg border border-amber-700/40 text-sm"
          >
            {practiceView ? "Back To Training" : "Practice Missed"}
          </button>

          <span className="text-xs text-amber-300/50">
            Missed: {missedItems.length}
          </span>
        </div>

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

        <div className="grid grid-cols-2 gap-3 mb-5">
          <Knob
            label="Voicing"
            value={voicingStyle}
            onChange={setVoicingStyle}
            options={[
              { value: "random", label: "Random" },
              { value: "close", label: "Close" },
              { value: "inverted", label: "Inverted" },
              { value: "spread", label: "Spread" },
              { value: "drop2", label: "Drop 2" },
            ]}
          />
          <Knob
            label="Playback"
            value={mode}
            onChange={setMode}
            options={[
              { value: "ascending", label: "Arpeggio" },
              { value: "block", label: "Block" },
            ]}
          />
        </div>
        <div className="mb-5">
          <label className="flex items-center gap-2 text-sm text-amber-200">
            <input
              type="checkbox"
              checked={sustainMode}
              onChange={(e) => {
                if (!e.target.checked) {
                  stopSustainedChord();
                }

                setSustainMode(e.target.checked);
              }}
            />
            Sustained Chord
          </label>
        </div>

        <div className="mb-2">
          <Knob
            label="Chord type"
            value={chordTypeId}
            onChange={setChordTypeId}
            options={CHORD_TYPES.map((c) => ({
              value: c.id,
              label: rootName === "random" ? c.label : `${rootName}${c.label}`,
            }))}
          />
        </div>

        <div className="relative rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1c140f] to-[#160f0b] p-6 sm:p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="text-center mb-6">
            <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/50 mb-1">
              Now sounding
            </div>
            <div className="text-3xl font-semibold text-amber-50">
              {round ? round.rootName : rootName}
              {round ? round.chordType.label : chordType.label}
            </div>
            {round && (
              <div className="text-[11px] text-amber-200/30 mt-1 capitalize">
                {round.voicingStyleUsed} voicing
              </div>
            )}
          </div>

          <button
            onClick={handlePlayChord}
            className="w-full py-3.5 rounded-xl bg-amber-500 text-[#1a1208] font-semibold text-sm
                       tracking-wide hover:bg-amber-400 active:scale-[0.98] transition-all duration-150
                       shadow-[0_4px_14px_rgba(245,158,11,0.25)]"
          >
            ▸ Play the chord
          </button>

          <div className="mt-7 text-center">
            <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/50 mb-2">
              Your turn
            </div>
            <div className="text-xl text-amber-50">
              Play or sing the{" "}
              <span className="font-semibold text-amber-300">
                {round ? degreeLabel(round.targetDegree) : "…"}
              </span>
              {round ? ordinalSuffix(round.targetDegree) : ""}
            </div>
            <div className="text-xs text-amber-200/35 mt-1.5">
              by ear, before checking
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleReveal}
              className="flex-1 py-3 rounded-xl border border-amber-500/40 text-amber-200 font-medium text-sm
                         hover:bg-amber-500/10 active:scale-[0.98] transition-all duration-150"
            >
              ♪ Check my answer
            </button>
          </div>

          {revealed && targetNoteName && (
            <div className="mt-5 text-center animate-[fadeIn_0.3s_ease-out]">
              <div className="inline-flex flex-col items-center gap-2 px-5 py-3 rounded-xl bg-amber-950/40 border border-amber-800/30">
                <span className="text-xs text-amber-200/50">
                  That was the {degreeLabel(round.targetDegree)} — concert pitch
                </span>
                <span className="text-2xl font-semibold text-amber-300">
                  {targetNoteName.name}
                  <span className="text-amber-200/40 text-base ml-0.5">
                    {targetNoteName.octave}
                  </span>
                </span>
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => handleNext(false)}
                  className="flex-1 py-2.5 rounded-lg border border-amber-900/40 text-amber-200/60 text-sm
                             hover:bg-amber-900/20 active:scale-[0.98] transition-all"
                >
                  Missed it
                </button>
                <button
                  onClick={() => handleNext(true)}
                  className="flex-1 py-2.5 rounded-lg bg-amber-600/90 text-[#1a1208] font-medium text-sm
                             hover:bg-amber-500 active:scale-[0.98] transition-all"
                >
                  Got it →
                </button>
              </div>
            </div>
          )}

          {!revealed && (
            <button
              onClick={newRound}
              className="w-full mt-5 py-2 text-xs text-amber-200/30 hover:text-amber-200/60 transition-colors"
            >
              skip — new chord
            </button>
          )}
        </div>

        <p className="text-center text-[11px] text-amber-200/25 mt-6 leading-relaxed">
          Degrees are counted against the chord's own formula — the requested
          tone is always a real chord member, including altered 9ths, 11ths and
          13ths.
        </p>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
