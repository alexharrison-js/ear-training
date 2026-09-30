import React, { useState, useEffect } from "react";
import "./colors.css";

// ── Local Storage Helpers ───────────────────────────────────────────────
const LS_TAB = "ear_trainer_active_tab";

function lsGet<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Failed to save to localStorage", e);
  }
}

// ── Audio Engine Hook ───────────────────────────────────────────────────
export function useAudioEngine() {
  const [isPlaying, setIsPlaying] = useState(false);

  const playNote = (note: string) => {
    setIsPlaying(true);
    console.log(`[AudioEngine] Playing note: ${note}`);
    setTimeout(() => setIsPlaying(false), 800);
  };

  const playChord = (notes: string[]) => {
    setIsPlaying(true);
    console.log(`[AudioEngine] Playing chord: ${notes.join(", ")}`);
    setTimeout(() => setIsPlaying(false), 1200);
  };

  const playInterval = (root: string, interval: string) => {
    setIsPlaying(true);
    console.log(`[AudioEngine] Playing interval: ${root} -> ${interval}`);
    setTimeout(() => setIsPlaying(false), 1000);
  };

  return { isPlaying, playNote, playChord, playInterval };
}

type AudioEngine = ReturnType<typeof useAudioEngine>;

// ── UI Components ───────────────────────────────────────────────────────
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <div
    className={`p-4 rounded-2xl ${className}`}
    style={{
      background: "var(--surface)",
      border: "1.5px solid var(--border)",
      color: "var(--text-primary)",
    }}
  >
    {children}
  </div>
);

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <button
    {...props}
    className={`w-full py-3 px-4 rounded-xl font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${className}`}
    style={{
      background: "var(--cta)",
      color: "var(--cta-text)",
      border: "2px solid var(--ink)",
      boxShadow: "var(--shadow-cta)",
    }}
  >
    {children}
  </button>
);

export const OptionButton: React.FC<{
  label: string;
  state?: "default" | "correct" | "wrong";
  disabled?: boolean;
  onClick: () => void;
}> = ({ label, state = "default", disabled, onClick }) => {
  const getStyle = () => {
    switch (state) {
      case "correct":
        return {
          background: "var(--correct)",
          border: "2px solid var(--ink)",
          color: "var(--text-on-lime)",
          boxShadow: "var(--shadow-correct)",
        };
      case "wrong":
        return {
          background: "var(--wrong-bg)",
          border: "1.5px solid var(--wrong-border)",
          color: "var(--wrong)",
        };
      default:
        return {
          background: "var(--surface-raised)",
          border: "1.5px solid var(--border)",
          color: "var(--text-primary)",
        };
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 px-4 rounded-xl font-bold transition-all active:scale-95 cursor-pointer text-sm"
      style={getStyle()}
    >
      {label}
    </button>
  );
};

export const StreakIndicator: React.FC<{ count: number; max?: number }> = ({
  count,
  max = 5,
}) => (
  <div className="flex gap-1.5 items-center justify-center my-2">
    {Array.from({ length: max }).map((_, i) => (
      <span
        key={i}
        className="w-3 h-3 rounded-full transition-all duration-200"
        style={{
          background: i < count ? "var(--streak-active)" : "var(--streak-inactive)",
          border: i < count ? "1px solid var(--ink)" : "1px solid transparent",
        }}
      />
    ))}
  </div>
);

// ── Tab 1: Chord Tones ──────────────────────────────────────────────────
export const ChordToneTab: React.FC<{ audio: AudioEngine }> = ({ audio }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [streak, setStreak] = useState(2);
  const targetChord = "Major 7th (Root: C)";
  const options = ["3rd (E)", "5th (G)", "7th (B)", "9th (D)"];
  const correctAnswer = "7th (B)";

  const handleGuess = (opt: string) => {
    setSelected(opt);
    if (opt === correctAnswer) {
      setStreak((prev) => Math.min(prev + 1, 5));
    } else {
      setStreak(0);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider"
            style={{
              background: "var(--lavender)",
              color: "var(--ink)",
              border: "1px solid var(--ink)",
            }}
          >
            Chord Identification
          </span>
          <h2 className="text-lg font-bold mt-2">{targetChord}</h2>
        </div>
        <StreakIndicator count={streak} />
      </div>

      <PrimaryButton onClick={() => audio.playChord(["C4", "E4", "G4", "B4"])}>
        {audio.isPlaying ? "Playing..." : "🔊 Play Target Chord"}
      </PrimaryButton>

      <div className="grid grid-cols-2 gap-2 mt-2">
        {options.map((opt) => {
          let state: "default" | "correct" | "wrong" = "default";
          if (selected) {
            if (opt === correctAnswer) state = "correct";
            else if (opt === selected) state = "wrong";
          }
          return (
            <OptionButton
              key={opt}
              label={opt}
              state={state}
              onClick={() => handleGuess(opt)}
            />
          );
        })}
      </div>
    </Card>
  );
};

// ── Tab 2: Absolute Pitch ───────────────────────────────────────────────
export const AbsolutePitchTab: React.FC<{ audio: AudioEngine }> = ({ audio }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [streak, setStreak] = useState(4);
  const notes = ["C", "D", "E", "F", "G", "A", "B"];
  const correctNote = "F";

  const handleGuess = (note: string) => {
    setSelected(note);
    if (note === correctNote) {
      setStreak((prev) => Math.min(prev + 1, 5));
    } else {
      setStreak(0);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider"
            style={{
              background: "var(--pink)",
              color: "var(--ink)",
              border: "1px solid var(--ink)",
            }}
          >
            Pitch Training
          </span>
          <h2 className="text-lg font-bold mt-2">Identify Tone</h2>
        </div>
        <StreakIndicator count={streak} />
      </div>

      <PrimaryButton onClick={() => audio.playNote("F4")}>
        {audio.isPlaying ? "Playing..." : "🎵 Hear Note"}
      </PrimaryButton>

      <div className="grid grid-cols-4 gap-2 mt-2">
        {notes.map((note) => {
          let state: "default" | "correct" | "wrong" = "default";
          if (selected) {
            if (note === correctNote) state = "correct";
            else if (note === selected) state = "wrong";
          }
          return (
            <OptionButton
              key={note}
              label={note}
              state={state}
              onClick={() => handleGuess(note)}
            />
          );
        })}
      </div>
    </Card>
  );
};

// ── Tab 3: Intervals ────────────────────────────────────────────────────
export const IntervalsTab: React.FC<{ audio: AudioEngine }> = ({ audio }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [streak, setStreak] = useState(1);
  const intervals = ["m3 (Minor 3rd)", "M3 (Major 3rd)", "P5 (Perfect 5th)", "m7 (Minor 7th)"];
  const correctInterval = "M3 (Major 3rd)";

  const handleGuess = (int: string) => {
    setSelected(int);
    if (int === correctInterval) {
      setStreak((prev) => Math.min(prev + 1, 5));
    } else {
      setStreak(0);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider"
            style={{
              background: "var(--sky)",
              color: "var(--ink)",
              border: "1px solid var(--ink)",
            }}
          >
            Intervals
          </span>
          <h2 className="text-lg font-bold mt-2">Ascending Interval</h2>
        </div>
        <StreakIndicator count={streak} />
      </div>

      <PrimaryButton onClick={() => audio.playInterval("C4", "E4")}>
        {audio.isPlaying ? "Playing..." : "🎧 Play Interval"}
      </PrimaryButton>

      <div className="grid grid-cols-2 gap-2 mt-2">
        {intervals.map((int) => {
          let state: "default" | "correct" | "wrong" = "default";
          if (selected) {
            if (int === correctInterval) state = "correct";
            else if (int === selected) state = "wrong";
          }
          return (
            <OptionButton
              key={int}
              label={int}
              state={state}
              onClick={() => handleGuess(int)}
            />
          );
        })}
      </div>
    </Card>
  );
};

// ── Main EarTrainer App Component ──────────────────────────────────────
export default function EarTrainer() {
  const audio = useAudioEngine();
  const [tab, setTab] = useState<"chord" | "ap" | "intervals">(() =>
    lsGet(LS_TAB, "ap")
  );

  useEffect(() => {
    lsSet(LS_TAB, tab);
  }, [tab]);

  const tabs: { id: "chord" | "ap" | "intervals"; label: string }[] = [
    { id: "chord", label: "Chord Tones" },
    { id: "ap", label: "Abs. Pitch" },
    { id: "intervals", label: "Intervals" },
  ];

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-3 pt-4 pb-8"
      style={{
        background: "var(--bg)",
        color: "var(--text-primary)",
      }}
    >
      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Navigation Bar */}
        <div
          className="flex gap-1 p-1.5 rounded-xl"
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--border)",
          }}
        >
          {tabs.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: isActive ? "var(--cta)" : "transparent",
                  color: isActive ? "var(--cta-text)" : "var(--text-secondary)",
                  border: isActive ? "1.5px solid var(--ink)" : "1.5px solid transparent",
                  boxShadow: isActive ? "var(--shadow-cta)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Views */}
        {tab === "chord" && <ChordToneTab audio={audio} />}
        {tab === "ap" && <AbsolutePitchTab audio={audio} />}
        {tab === "intervals" && <IntervalsTab audio={audio} />}
      </div>
    </div>
  );
}
