# Chord Tone Trainer

A React-based ear training application for learning to identify chord tones. Hear a chord, identify the requested scale degree, and verify your answer.

## Features

- **30+ Chord Types** - From basic triads to complex extended chords (maj7, dom7, min11, 13#11, 7alt, etc.)
- **Voicing Variations** - Close, inverted, spread, and drop2 voicings
- **Playback Modes** - Arpeggio or block chord playback
- **Root Selection** - Choose a specific root note or randomize
- **Streak Tracking** - Monitor your consecutive correct answers
- **Web Audio API** - Warm, multi-partial synthesis engine

## Usage

1. Select chord parameters (root, octave, chord type, voicing)
2. Click "Play the chord" to hear it
3. Play or sing the requested scale degree
4. Click "Check my answer" to hear the target pitch
5. Mark whether you got it right or missed it
6. Streak resets on incorrect answers

## Local Development

```bash
npm install
npm run dev
```

## Build for Deployment

```bash
npm run build
npm run deploy
```

## Live Demo

https://alexharrison-js.github.io/ear-training/
