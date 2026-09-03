import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   STORAGE HELPERS — localStorage with safe fallback
   ═══════════════════════════════════════════════════════════════ */

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const LS_AP   = "ear_trainer_ap_v1";
const LS_INT  = "ear_trainer_intervals_v1";
const LS_CHORD = "ear_trainer_chord_v1";

/* ═══════════════════════════════════════════════════════════════
   THEORY ENGINE
   ═══════════════════════════════════════════════════════════════ */

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

const DEGREE_SEMITONES = {
  1:0,b2:1,2:2,"#2":3,b3:3,3:4,4:5,"#4":6,b5:6,5:7,
  "#5":8,b6:8,6:9,bb7:9,b7:10,7:11,
  b9:13,9:14,"#9":15,11:17,"#11":18,b13:20,13:21,
};

const CHORD_TYPES = [
  {id:"maj",label:"maj",degrees:[1,3,5]},
  {id:"min",label:"min",degrees:[1,"b3",5]},
  {id:"dim",label:"dim",degrees:[1,"b3","b5"]},
  {id:"aug",label:"aug",degrees:[1,3,"#5"]},
  {id:"maj7",label:"maj7",degrees:[1,3,5,7]},
  {id:"min7",label:"min7",degrees:[1,"b3",5,"b7"]},
  {id:"dom7",label:"7",degrees:[1,3,5,"b7"]},
  {id:"min7b5",label:"min7b5",degrees:[1,"b3","b5","b7"]},
  {id:"dim7",label:"dim7",degrees:[1,"b3","b5","bb7"]},
  {id:"minMaj7",label:"min(maj7)",degrees:[1,"b3",5,7]},
  {id:"maj9",label:"maj9",degrees:[1,3,5,7,9]},
  {id:"min9",label:"min9",degrees:[1,"b3",5,"b7",9]},
  {id:"dom9",label:"9",degrees:[1,3,5,"b7",9]},
  {id:"dom7sharp9",label:"7#9",degrees:[1,3,5,"b7","#9"]},
  {id:"dom7flat9",label:"7b9",degrees:[1,3,5,"b7","b9"]},
  {id:"maj11",label:"maj11",degrees:[1,3,5,7,9,11]},
  {id:"min11",label:"min11",degrees:[1,"b3",5,"b7",9,11]},
  {id:"dom11",label:"11",degrees:[1,3,5,"b7",9,11]},
  {id:"dom7sharp11",label:"7#11",degrees:[1,3,5,"b7","#11"]},
  {id:"domsharp11",label:"dom7#11",degrees:[1,3,5,"b7",9,"#11"]},
  {id:"maj13",label:"maj13",degrees:[1,3,5,7,9,13]},
  {id:"min13",label:"min13",degrees:[1,"b3",5,"b7",9,13]},
  {id:"dom13",label:"13",degrees:[1,3,5,"b7",9,13]},
  {id:"dom13sharp11",label:"13#11",degrees:[1,3,5,"b7",9,"#11",13]},
  {id:"altDom",label:"7alt",degrees:[1,3,"b5","b7","b9","#9"]},
  {id:"sus4",label:"sus4",degrees:[1,4,5]},
  {id:"sus2",label:"sus2",degrees:[1,2,5]},
  {id:"dom7sus4",label:"7sus4",degrees:[1,4,5,"b7"]},
  {id:"add9",label:"add9",degrees:[1,3,5,9]},
  {id:"six",label:"6",degrees:[1,3,5,6]},
  {id:"min6",label:"min6",degrees:[1,"b3",5,6]},
];

const ALL_DEGREES = [1,2,"b3",3,4,"b5",5,"#5","bb7",6,"b7",7,"b9",9,"#9",11,"#11",13];

/* ─── Absolute Pitch: note sets unlocked per stage ─────────────
   Research-backed: start with max-contrast tritone pairs,
   progressively fill in chromatically. Stage 7 adds octave
   variation to force true chroma (not pitch-height) learning. */
const AP_STAGES = [
  { id:1, label:"Stage 1", notes:["C","F#"],                   desc:"Tritone pair — maximum contrast" },
  { id:2, label:"Stage 2", notes:["C","F#","G","C#"],          desc:"+ another tritone pair" },
  { id:3, label:"Stage 3", notes:["C","F#","G","C#","D","Ab"], desc:"+ diminished skeleton" },
  { id:4, label:"Stage 4", notes:["C","F#","G","C#","D","Ab","E","Bb"], desc:"+ 4 more" },
  { id:5, label:"Stage 5", notes:["C","F#","G","C#","D","Ab","E","Bb","A","Eb"], desc:"+ 2 more" },
  { id:6, label:"Stage 6", notes:NOTE_NAMES.map(n=>n),         desc:"All 12 pitch classes" },
  { id:7, label:"Stage 7", notes:NOTE_NAMES.map(n=>n),         desc:"All 12 — multiple octaves", multiOctave:true },
];

/* ─── Intervals ────────────────────────────────────────────────
   Name, semitones, classic mnemonic song, and a difficulty rank
   for progressive unlocking. */
const INTERVALS = [
  { id:"m2",  semis:1,  label:"Minor 2nd",   short:"m2",  mnemonic:"Jaws theme",              dir:"both" },
  { id:"M2",  semis:2,  label:"Major 2nd",   short:"M2",  mnemonic:"Happy Birthday",           dir:"both" },
  { id:"m3",  semis:3,  label:"Minor 3rd",   short:"m3",  mnemonic:"Smoke on the Water",       dir:"both" },
  { id:"M3",  semis:4,  label:"Major 3rd",   short:"M3",  mnemonic:"When the Saints Go Marching In", dir:"both" },
  { id:"P4",  semis:5,  label:"Perfect 4th", short:"P4",  mnemonic:"Here Comes the Bride",     dir:"both" },
  { id:"TT",  semis:6,  label:"Tritone",     short:"TT",  mnemonic:"The Simpsons theme",        dir:"both" },
  { id:"P5",  semis:7,  label:"Perfect 5th", short:"P5",  mnemonic:"Twinkle Twinkle",           dir:"both" },
  { id:"m6",  semis:8,  label:"Minor 6th",   short:"m6",  mnemonic:"The Entertainer",           dir:"both" },
  { id:"M6",  semis:9,  label:"Major 6th",   short:"M6",  mnemonic:"My Bonnie Lies Over the Ocean", dir:"both" },
  { id:"m7",  semis:10, label:"Minor 7th",   short:"m7",  mnemonic:"Somewhere (West Side Story)", dir:"both" },
  { id:"M7",  semis:11, label:"Major 7th",   short:"M7",  mnemonic:"Take On Me",                dir:"both" },
  { id:"P8",  semis:12, label:"Octave",      short:"P8",  mnemonic:"Somewhere Over the Rainbow", dir:"both" },
];

// Suggested unlock order — start with the most perceptually distinct
const INTERVAL_UNLOCK_ORDER = ["P5","P4","P8","M2","M3","m3","M6","m6","m7","m2","M7","TT"];

/* ─── Helpers ─────────────────────────────────────────────────── */
function midiFromRootAndDegree(rootMidi,degree){ return rootMidi+DEGREE_SEMITONES[degree]; }
function noteNameFromMidi(midi){ return {name:NOTE_NAMES[((midi%12)+12)%12],octave:Math.floor(midi/12)-1}; }
function freqFromMidi(midi){ return 440*Math.pow(2,(midi-69)/12); }
function degreeLabel(d){ return String(d); }
function randItem(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function resolveChordAndDegree(chordFilter,degreeFilter,allowNonChordTones){
  let pool=chordFilter==="random"?CHORD_TYPES:CHORD_TYPES.filter(c=>c.id===chordFilter);
  if(degreeFilter!=="random"&&!allowNonChordTones)
    pool=pool.filter(c=>c.degrees.some(d=>String(d)===String(degreeFilter)));
  if(pool.length===0) return null;
  const chord=randItem(pool);
  let targetDegree;
  if(degreeFilter!=="random") targetDegree=degreeFilter;
  else if(allowNonChordTones) targetDegree=randItem(ALL_DEGREES);
  else targetDegree=randItem(chord.degrees);
  return {chord,targetDegree};
}

const VOICING_STYLES=["close","inverted","spread","drop2"];
function buildVoicedChord(degrees,rootMidi,style,rng){
  const base=degrees.map((d,i)=>({midi:midiFromRootAndDegree(rootMidi,d),i}));
  let tagged=base.map(t=>({...t}));
  const n=tagged.length;
  if(style==="inverted"&&n>1){const inv=1+Math.floor(rng()*(n-1));tagged=tagged.map((t,idx)=>idx<inv?{...t,midi:t.midi+12}:t);}
  else if(style==="spread"&&n>2) tagged=tagged.map((t,idx)=>idx%2===1?{...t,midi:t.midi+12}:t);
  else if(style==="drop2"&&n>2) tagged[n-2]={...tagged[n-2],midi:tagged[n-2].midi-12};
  tagged.sort((a,b)=>a.midi-b.midi);
  return tagged;
}

/* ═══════════════════════════════════════════════════════════════
   AUDIO ENGINE
   ═══════════════════════════════════════════════════════════════ */

function useAudioEngine(){
  const ctxRef=useRef(null);
  const sustainVoicesRef=useRef([]);
  const getCtx=useCallback(()=>{
    if(!ctxRef.current) ctxRef.current=new(window.AudioContext||window.webkitAudioContext)();
    if(ctxRef.current.state==="suspended") ctxRef.current.resume();
    return ctxRef.current;
  },[]);

  const PARTIALS=[
    {ratio:1,type:"sine",level:1.0},
    {ratio:1,type:"triangle",level:0.35,detune:4},
    {ratio:2,type:"sine",level:0.12},
    {ratio:3,type:"sine",level:0.05},
  ];

  const playNote=useCallback((midi,{duration=1.4,delay=0,gain=0.22}={})=>{
    const ctx=getCtx();
    const startAt=ctx.currentTime+delay;
    const freq=freqFromMidi(midi);
    const master=ctx.createGain();
    master.gain.value=0;
    master.connect(ctx.destination);
    PARTIALS.forEach(p=>{
      const osc=ctx.createOscillator();
      osc.type=p.type; osc.frequency.value=freq*p.ratio;
      if(p.detune) osc.detune.value=p.detune;
      const g=ctx.createGain(); g.gain.value=p.level;
      osc.connect(g); g.connect(master);
      osc.start(startAt); osc.stop(startAt+duration+0.1);
    });
    master.gain.setValueAtTime(0,startAt);
    master.gain.linearRampToValueAtTime(gain,startAt+0.015);
    master.gain.exponentialRampToValueAtTime(gain*0.55,startAt+0.25);
    master.gain.setValueAtTime(gain*0.55,startAt+Math.max(0.25,duration-0.35));
    master.gain.exponentialRampToValueAtTime(0.0001,startAt+duration);
  },[getCtx]);

  const playChord=useCallback((midiNotes,{stagger=0,...opts}={})=>{
    let t=0; midiNotes.forEach(midi=>{playNote(midi,{...opts,delay:t});t+=stagger;});
  },[playNote]);

  const stopSustain=useCallback((fadeSeconds=0.25)=>{
    const ctx=getCtx(); const now=ctx.currentTime;
    sustainVoicesRef.current.forEach(({oscs,gainNode})=>{
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value,now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001,now+fadeSeconds);
      oscs.forEach(osc=>osc.stop(now+fadeSeconds+0.05));
    });
    sustainVoicesRef.current=[];
  },[getCtx]);

  const sustainChord=useCallback((midiNotes,{gain=0.18,stagger=0}={})=>{
    const ctx=getCtx(); stopSustain(0.05); let t=0;
    midiNotes.forEach(midi=>{
      const startAt=ctx.currentTime+t;
      const freq=freqFromMidi(midi);
      const master=ctx.createGain(); master.gain.value=0; master.connect(ctx.destination);
      const oscs=PARTIALS.map(p=>{
        const osc=ctx.createOscillator(); osc.type=p.type; osc.frequency.value=freq*p.ratio;
        if(p.detune) osc.detune.value=p.detune;
        const g=ctx.createGain(); g.gain.value=p.level; osc.connect(g); g.connect(master);
        osc.start(startAt); return osc;
      });
      master.gain.setValueAtTime(0,startAt);
      master.gain.linearRampToValueAtTime(gain,startAt+0.02);
      sustainVoicesRef.current.push({oscs,gainNode:master});
      t+=stagger;
    });
  },[getCtx,stopSustain]);

  return {playNote,playChord,sustainChord,stopSustain};
}

/* ═══════════════════════════════════════════════════════════════
   UI PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

function Select({label,value,onChange,options}){
  return(
    <div className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.18em] text-amber-200/45 font-medium">{label}</span>
      <select value={value} onChange={e=>onChange(e.target.value)}
        className="bg-[#1a1410] border border-amber-900/40 text-amber-50 text-xs rounded-md px-2 py-1.5
                   focus:outline-none focus:ring-1 focus:ring-amber-500/40 cursor-pointer appearance-none">
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({label,sub,checked,onChange}){
  return(
    <div className="flex items-center justify-between py-2 px-3">
      <div>
        <div className="text-xs text-amber-100">{label}</div>
        {sub&&<div className="text-[10px] text-amber-200/35">{sub}</div>}
      </div>
      <button onClick={()=>onChange(!checked)} role="switch" aria-checked={checked}
        className={`relative flex-shrink-0 ml-3 w-9 h-5 rounded-full transition-colors duration-200 ${checked?"bg-amber-500":"bg-amber-900/50"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[#120d0a] transition-transform duration-200 ${checked?"translate-x-4":"translate-x-0"}`}/>
      </button>
    </div>
  );
}

function Checkbox({label,checked,onChange}){
  return(
    <label className="flex items-center gap-2 cursor-pointer select-none py-1" onClick={()=>onChange(!checked)}>
      <span className={`relative flex-shrink-0 w-3.5 h-3.5 rounded border transition-colors ${checked?"bg-amber-500 border-amber-500":"bg-transparent border-amber-700/60"}`}>
        {checked&&<svg className="absolute inset-0 w-full h-full" viewBox="0 0 14 14" fill="none">
          <polyline points="2.5,7 5.5,10 11.5,4" stroke="#1a1208" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>}
      </span>
      <span className="text-xs text-amber-100">{label}</span>
    </label>
  );
}

function ConfirmButton({label,confirmLabel="Are you sure?",onConfirm,className=""}){
  const [asking,setAsking]=useState(false);
  if(asking) return(
    <div className="flex gap-1">
      <button onClick={()=>{onConfirm();setAsking(false);}}
        className="flex-1 py-1 rounded text-[10px] bg-red-900/50 text-red-300 hover:bg-red-900/70 transition-all">{confirmLabel}</button>
      <button onClick={()=>setAsking(false)}
        className="px-2 py-1 rounded text-[10px] border border-amber-900/40 text-amber-200/50 hover:bg-amber-900/20">Cancel</button>
    </div>
  );
  return<button onClick={()=>setAsking(true)} className={`text-[10px] text-amber-200/40 hover:text-amber-200/70 transition-colors ${className}`}>{label}</button>;
}

/* ═══════════════════════════════════════════════════════════════
   TAB: CHORD TONES
   ═══════════════════════════════════════════════════════════════ */

function ChordToneTab({audio}){
  const {playNote,playChord,sustainChord,stopSustain}=audio;

  const DEFAULTS={rootName:"random",octave:3,voicingStyle:"random",mode:"ascending",
    sustain:false,hideNotes:false,chordFilter:"random",degreeFilter:"random",
    allowNonChordTones:false,autoMode:false,autoChordsBeforeTone:"2",
    autoChordsAfterTone:"0",autoCycleRepeats:"1",autoBpm:"60"};

  const saved=useMemo(()=>lsGet(LS_CHORD,DEFAULTS),[]);

  const [rootName,setRootName]=useState(saved.rootName);
  const [octave,setOctave]=useState(saved.octave);
  const [voicingStyle,setVoicingStyle]=useState(saved.voicingStyle);
  const [mode,setMode]=useState(saved.mode);
  const [sustain,setSustain]=useState(saved.sustain);
  const [hideNotes,setHideNotes]=useState(saved.hideNotes);
  const [chordFilter,setChordFilter]=useState(saved.chordFilter);
  const [degreeFilter,setDegreeFilter]=useState(saved.degreeFilter);
  const [allowNonChordTones,setAllowNonChordTones]=useState(saved.allowNonChordTones);
  const [autoMode,setAutoMode]=useState(false);
  const [autoChordsBeforeTone,setAutoChordsBeforeTone]=useState(saved.autoChordsBeforeTone);
  const [autoChordsAfterTone,setAutoChordsAfterTone]=useState(saved.autoChordsAfterTone);
  const [autoCycleRepeats,setAutoCycleRepeats]=useState(saved.autoCycleRepeats);
  const [autoBpm,setAutoBpm]=useState(saved.autoBpm);
  const [autoPhase,setAutoPhase]=useState(null);
  const [autoStatus,setAutoStatus]=useState("");
  const autoTimerRef=useRef(null);

  const [revealed,setRevealed]=useState(false);
  const [round,setRound]=useState(null);
  const [streak,setStreak]=useState(0);
  const [incompatible,setIncompatible]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);

  // Persist prefs
  useEffect(()=>{
    lsSet(LS_CHORD,{rootName,octave,voicingStyle,mode,sustain,hideNotes,
      chordFilter,degreeFilter,allowNonChordTones,
      autoChordsBeforeTone,autoChordsAfterTone,autoCycleRepeats,autoBpm});
  },[rootName,octave,voicingStyle,mode,sustain,hideNotes,chordFilter,degreeFilter,
     allowNonChordTones,autoChordsBeforeTone,autoChordsAfterTone,autoCycleRepeats,autoBpm]);

  const buildRound=useCallback(()=>{
    const resolved=resolveChordAndDegree(chordFilter,degreeFilter,allowNonChordTones);
    if(!resolved) return null;
    const {chord,targetDegree}=resolved;
    const actualRoot=rootName==="random"?randItem(NOTE_NAMES):rootName;
    const rootMidi=NOTE_NAMES.indexOf(actualRoot)+(octave+1)*12;
    const actualStyle=voicingStyle==="random"?randItem(VOICING_STYLES):voicingStyle;
    const tagged=buildVoicedChord(chord.degrees,rootMidi,actualStyle,Math.random);
    const voicing=tagged.map(t=>t.midi);
    const targetMidi=midiFromRootAndDegree(rootMidi,targetDegree);
    const isChordTone=chord.degrees.some(d=>String(d)===String(targetDegree));
    return{chordType:chord,rootName:actualRoot,voicingStyleUsed:actualStyle,
           degrees:chord.degrees,voicing,targetDegree,targetMidi,isChordTone};
  },[chordFilter,degreeFilter,allowNonChordTones,rootName,octave,voicingStyle]);

  const newRound=useCallback(()=>{
    stopSustain();
    const r=buildRound();
    if(!r){setIncompatible(true);setRound(null);setRevealed(false);return;}
    setIncompatible(false);setRound(r);setRevealed(false);
  },[buildRound,stopSustain]);

  useEffect(()=>{newRound();},[chordFilter,degreeFilter,allowNonChordTones,rootName,octave,voicingStyle]);

  const triggerPlayChord=useCallback((r)=>{
    const target=r||round; if(!target) return;
    const beatMs=(60/Number(autoBpm))*1000;
    const duration=beatMs*4/1000;
    if(sustain) sustainChord(target.voicing,{gain:0.16,stagger:mode==="ascending"?0.34:0});
    else if(mode==="block") playChord(target.voicing,{stagger:0,duration,gain:0.16});
    else playChord(target.voicing,{stagger:0.34,duration,gain:0.22});
  },[round,autoBpm,sustain,mode,sustainChord,playChord]);

  const handleReveal=()=>{if(!round)return;stopSustain();setRevealed(true);playNote(round.targetMidi,{duration:1.6,gain:0.26});};
  const handleNext=(correct)=>{if(correct===true)setStreak(s=>s+1);if(correct===false)setStreak(0);newRound();};

  // Auto mode
  const stopAuto=useCallback(()=>{
    clearTimeout(autoTimerRef.current);autoTimerRef.current=null;setAutoPhase(null);setAutoStatus("");stopSustain();
  },[stopSustain]);

  const autoChordSlot=useCallback((roundData,label,phaseMs,next)=>{
    setAutoPhase("playing");setAutoStatus(label);triggerPlayChord(roundData);
    autoTimerRef.current=setTimeout(()=>{stopSustain();setAutoPhase("silence");autoTimerRef.current=setTimeout(next,phaseMs);},phaseMs);
  },[triggerPlayChord,stopSustain]);

  const runAutoSequence=useCallback((roundData,cyclesDone)=>{
    const beatMs=(60/Number(autoBpm))*1000;
    const phaseMs=beatMs*4;
    const X=Number(autoChordsBeforeTone),Y=Number(autoChordsAfterTone),Z=Number(autoCycleRepeats);
    function runSlots(count,label,after){
      if(count===0){after();return;}
      autoChordSlot(roundData,label,phaseMs,()=>runSlots(count-1,label,after));
    }
    function runCycle(n){
      if(n>Z){
        const next=buildRound();
        if(!next){stopAuto();return;}
        setRound(next);setRevealed(false);runAutoSequence(next,1);return;
      }
      const cl=Z>1?` (${n}/${Z})`:"";
      runSlots(X,`chord${cl}`,()=>{
        setAutoPhase("answer");setAutoStatus(`tone${cl}`);setRevealed(true);
        playNote(roundData.targetMidi,{duration:phaseMs/1000,gain:0.26});
        autoTimerRef.current=setTimeout(()=>{
          if(Y===0) runCycle(n+1);
          else runSlots(Y,`chord after tone${cl}`,()=>runCycle(n+1));
        },phaseMs);
      });
    }
    runCycle(cyclesDone);
  },[autoBpm,autoChordsBeforeTone,autoChordsAfterTone,autoCycleRepeats,autoChordSlot,playNote,buildRound,stopAuto]);

  const startAuto=useCallback(()=>{if(!round)return;setRevealed(false);runAutoSequence(round,1);},[round,runAutoSequence]);
  useEffect(()=>{if(!autoMode)stopAuto();},[autoMode,stopAuto]);
  useEffect(()=>()=>clearTimeout(autoTimerRef.current),[]);

  const targetNoteName=round?noteNameFromMidi(round.targetMidi):null;
  const chordLabel=(c)=>rootName==="random"?c.label:`${rootName}${c.label}`;
  const ordinalSuffix=(d)=>{
    const s=String(d);
    if(s.endsWith("11")||s.endsWith("12")||s.endsWith("13"))return"th";
    if(s.endsWith("1"))return"st"; if(s.endsWith("2"))return"nd"; if(s.endsWith("3"))return"rd"; return"th";
  };
  const isAutoRunning=autoPhase!==null;

  return(
    <div className="space-y-2">
      {/* Practice focus */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 p-2.5">
        <div className="text-[9px] uppercase tracking-[0.22em] text-amber-400/55 mb-2">Practice focus</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Select label="Chord type" value={chordFilter} onChange={setChordFilter}
            options={[{value:"random",label:"Random"},...CHORD_TYPES.map(c=>({value:c.id,label:chordLabel(c)}))]}/>
          <Select label="Target degree" value={String(degreeFilter)}
            onChange={v=>setDegreeFilter(v==="random"?"random":v)}
            options={[{value:"random",label:"Random"},...ALL_DEGREES.map(d=>({value:String(d),label:degreeLabel(d)}))]}/>
        </div>
        <Checkbox label="Allow non-chord tones" checked={allowNonChordTones} onChange={setAllowNonChordTones}/>
        {incompatible&&!allowNonChordTones&&(
          <div className="mt-1.5 text-[10px] text-amber-400/80 bg-amber-900/30 rounded px-2 py-1.5">
            ⚠ {degreeLabel(degreeFilter)} not in that chord type. Enable non-chord tones or change filters.
          </div>
        )}
      </div>

      {/* Playback settings (collapsible) */}
      <div className="rounded-xl border border-amber-900/30 bg-[#1a1410] overflow-hidden">
        <button onClick={()=>setSettingsOpen(o=>!o)}
          className="w-full flex items-center justify-between px-3 py-2 text-amber-200/60 hover:text-amber-200/80 transition-colors">
          <span className="text-[9px] uppercase tracking-[0.22em]">Playback settings</span>
          <span className="text-amber-500/60">{settingsOpen?"▴":"▾"}</span>
        </button>
        {settingsOpen&&(
          <div className="px-2.5 pb-2.5 border-t border-amber-900/30 pt-2.5 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Select label="Root" value={rootName} onChange={setRootName}
                options={[{value:"random",label:"Random"},...NOTE_NAMES.map(n=>({value:n,label:n}))]}/>
              <Select label="Octave" value={octave} onChange={v=>setOctave(Number(v))}
                options={[2,3,4,5].map(o=>({value:o,label:`C${o}+`}))}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Voicing" value={voicingStyle} onChange={setVoicingStyle}
                options={[{value:"random",label:"Random"},{value:"close",label:"Close"},
                          {value:"inverted",label:"Inverted"},{value:"spread",label:"Spread"},{value:"drop2",label:"Drop 2"}]}/>
              <Select label="Playback" value={mode} onChange={setMode}
                options={[{value:"ascending",label:"Arpeggio"},{value:"block",label:"Block"}]}/>
            </div>
            <div className="border-t border-amber-900/30 pt-1 divide-y divide-amber-900/30">
              <Toggle label="Sustain chord" checked={sustain} onChange={v=>{setSustain(v);if(!v)stopSustain();}}/>
              <Toggle label="Hide note names" sub="Chord type only · answer shows —" checked={hideNotes} onChange={setHideNotes}/>
            </div>
          </div>
        )}
      </div>

      {/* Auto mode */}
      <div className="rounded-xl border border-amber-900/30 bg-[#1a1410] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[9px] uppercase tracking-[0.22em] text-amber-200/60">Auto mode</span>
          <Toggle label="" checked={autoMode} onChange={v=>{setAutoMode(v);if(!v)stopAuto();}}/>
        </div>
        {autoMode&&(
          <div className="px-2.5 pb-2.5 border-t border-amber-900/30 pt-2.5 space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <Select label="BPM" value={autoBpm} onChange={setAutoBpm}
                options={[40,50,60,70,80,90,100,120].map(b=>({value:String(b),label:String(b)}))}/>
              <Select label="Chords" value={autoChordsBeforeTone} onChange={setAutoChordsBeforeTone}
                options={[0,1,2,3,4,6,8].map(n=>({value:String(n),label:String(n)}))}/>
              <Select label="After" value={autoChordsAfterTone} onChange={setAutoChordsAfterTone}
                options={[0,1,2,3,4,6,8].map(n=>({value:String(n),label:String(n)}))}/>
              <Select label="Cycles" value={autoCycleRepeats} onChange={setAutoCycleRepeats}
                options={[1,2,3,4,6,8].map(n=>({value:String(n),label:String(n)}))}/>
            </div>
            <div className="text-[10px] text-amber-200/35 leading-snug">
              {(()=>{const X=Number(autoChordsBeforeTone),Y=Number(autoChordsAfterTone),Z=Number(autoCycleRepeats);
               const p=[];if(X>0)p.push(`chord ×${X}`);p.push("tone");if(Y>0)p.push(`chord ×${Y}`);
               return`[${p.join(" → ")}] × ${Z} cycle${Z!==1?"s":""}, then next chord.`;})()}
            </div>
            {isAutoRunning?(
              <div className="flex gap-2">
                <div className="flex-1 text-center py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/30 text-xs text-amber-300">
                  {autoPhase==="playing"?"▸":autoPhase==="answer"?"♪":"—"} {autoStatus}
                </div>
                <button onClick={stopAuto}
                  className="px-3 py-1.5 rounded-lg border border-amber-900/40 text-amber-200/60 text-xs hover:bg-amber-900/20">Stop</button>
              </div>
            ):(
              <button onClick={startAuto} disabled={!round||incompatible}
                className="w-full py-2 rounded-lg bg-amber-500 text-[#1a1208] text-xs font-semibold hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-30">
                ▸ Start auto
              </button>
            )}
          </div>
        )}
      </div>

      {/* Round card */}
      <div className="rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1c140f] to-[#160f0b] p-4">
        <div className="text-center mb-3">
          <div className="text-[9px] uppercase tracking-[0.25em] text-amber-400/45 mb-0.5">Now sounding</div>
          <div className="text-2xl font-semibold leading-tight">
            {round?(hideNotes?"":round.rootName):"—"}{round?round.chordType.label:""}
          </div>
          {round&&<div className="text-[10px] text-amber-200/25 mt-0.5 capitalize">{round.voicingStyleUsed} voicing</div>}
        </div>
        {!isAutoRunning&&(
          <div className="flex gap-2 mb-3">
            <button onClick={()=>triggerPlayChord(round)} disabled={!round}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 text-[#1a1208] font-semibold text-xs hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-30">
              ▸ {sustain?"Play & hold":"Play chord"}
            </button>
            {sustain&&<button onClick={()=>stopSustain()}
              className="px-4 py-2.5 rounded-xl border border-amber-500/40 text-amber-200 text-xs font-semibold hover:bg-amber-500/10">■</button>}
          </div>
        )}
        <div className="text-center mb-3">
          <div className="text-[9px] uppercase tracking-[0.25em] text-amber-400/45 mb-1">Your turn — sing the</div>
          <div className="text-xl font-semibold text-amber-300">
            {round?degreeLabel(round.targetDegree):"…"}{round?ordinalSuffix(round.targetDegree):""}
          </div>
        </div>
        {!isAutoRunning&&!revealed&&(
          <button onClick={handleReveal} disabled={!round}
            className="w-full py-2.5 rounded-xl border border-amber-500/40 text-amber-200 font-medium text-xs hover:bg-amber-500/10 active:scale-[0.98] transition-all disabled:opacity-30">
            ♪ Check my answer
          </button>
        )}
        {(revealed||(autoPhase==="answer"||autoPhase==="answersilence"))&&targetNoteName&&(
          <div className="mt-3 text-center" style={{animation:"fadeIn 0.3s ease-out"}}>
            <div className="inline-flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl bg-amber-950/40 border border-amber-800/30">
              <span className="text-[10px] text-amber-200/45">
                {degreeLabel(round.targetDegree)}
                {!round.isChordTone&&<span className="ml-1 text-amber-500/70">· non-chord</span>}
                {" "}— concert pitch
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-xl font-semibold text-amber-300">
                  {hideNotes?<span className="tracking-widest text-amber-200/40">—</span>
                    :<>{targetNoteName.name}<span className="text-amber-200/40 text-sm ml-0.5">{targetNoteName.octave}</span></>}
                </span>
                <button onClick={()=>playNote(round.targetMidi,{duration:1.6,gain:0.26})}
                  className="text-amber-400/70 hover:text-amber-300 active:scale-90 transition-all text-base" aria-label="Play again">↺</button>
              </div>
            </div>
            {!isAutoRunning&&(
              <div className="flex gap-2 mt-3">
                <button onClick={()=>handleNext(false)}
                  className="flex-1 py-2 rounded-lg border border-amber-900/40 text-amber-200/55 text-xs hover:bg-amber-900/20">Missed it</button>
                <button onClick={()=>handleNext(true)}
                  className="flex-1 py-2 rounded-lg bg-amber-600/90 text-[#1a1208] font-medium text-xs hover:bg-amber-500">Got it →</button>
              </div>
            )}
          </div>
        )}
        {!revealed&&!isAutoRunning&&round&&(
          <button onClick={newRound} className="w-full mt-2 py-1.5 text-[10px] text-amber-200/25 hover:text-amber-200/55 transition-colors">skip</button>
        )}
      </div>

      {/* Streak */}
      <div className="flex items-center justify-center gap-1 pt-1">
        {Array.from({length:8}).map((_,i)=>(
          <div key={i} className={`h-0.5 w-3.5 rounded-full ${i<streak%8&&streak>0?"bg-amber-400":"bg-amber-900/50"}`}/>
        ))}
        <span className="text-[10px] text-amber-300/50 ml-1 tabular-nums">{streak}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB: ABSOLUTE PITCH
   ═══════════════════════════════════════════════════════════════ */

const AP_DEFAULT_PROGRESS={
  stageId:1,
  sessionCorrect:0,
  sessionTotal:0,
  noteStats:{},      // { "C": { correct:0, total:0 } }
  masteredStages:[], // [1,2,...] — stages passed
};

function AbsolutePitchTab({audio}){
  const {playNote}=audio;

  const [progress,setProgress]=useState(()=>lsGet(LS_AP,AP_DEFAULT_PROGRESS));
  const [currentNote,setCurrentNote]=useState(null);   // { name, midi }
  const [answered,setAnswered]=useState(false);
  const [lastCorrect,setLastCorrect]=useState(null);   // true|false|null
  const [confirmReset,setConfirmReset]=useState(false);
  const [showProgress,setShowProgress]=useState(false);
  const [jumpStage,setJumpStage]=useState(null);       // null or stage id to jump to

  const stage=AP_STAGES.find(s=>s.id===progress.stageId)||AP_STAGES[0];
  const activeNotes=stage.notes; // note name strings active this stage

  // Persist whenever progress changes
  useEffect(()=>lsSet(LS_AP,progress),[progress]);

  const generateNote=useCallback(()=>{
    const noteName=randItem(activeNotes);
    // In multi-octave stage, randomise octave 3-5; otherwise fix to octave 4
    const octave=stage.multiOctave?(3+Math.floor(Math.random()*3)):4;
    const midi=NOTE_NAMES.indexOf(noteName)+(octave+1)*12;
    setCurrentNote({name:noteName,midi,octave});
    setAnswered(false);setLastCorrect(null);
  },[activeNotes,stage]);

  useEffect(()=>{generateNote();},[stage.id]);

  const playCurrentNote=()=>{
    if(!currentNote)return;
    playNote(currentNote.midi,{duration:1.8,gain:0.24});
  };

  const handleGuess=(guessName)=>{
    if(answered||!currentNote)return;
    const correct=guessName===currentNote.name;
    setAnswered(true);setLastCorrect(correct);

    setProgress(prev=>{
      const noteStats={...prev.noteStats};
      const ns=noteStats[currentNote.name]||{correct:0,total:0};
      noteStats[currentNote.name]={correct:ns.correct+(correct?1:0),total:ns.total+1};
      const sc=prev.sessionCorrect+(correct?1:0);
      const st=prev.sessionTotal+1;

      // Check mastery: ≥90% over last 20 trials this stage, then unlock next stage
      let newStageId=prev.stageId;
      let masteredStages=[...prev.masteredStages];
      if(correct&&sc>=20&&(sc/st)>=0.9&&newStageId<AP_STAGES.length&&!masteredStages.includes(prev.stageId)){
        masteredStages=[...masteredStages,prev.stageId];
        newStageId=Math.min(prev.stageId+1,AP_STAGES.length);
      }
      return{...prev,noteStats,sessionCorrect:sc,sessionTotal:st,stageId:newStageId,masteredStages};
    });

    // Play the note again after guess so user re-hears the correct pitch
    setTimeout(()=>playNote(currentNote.midi,{duration:1.5,gain:0.22}),300);
  };

  const handleNext=()=>generateNote();

  const handleReset=()=>{
    const fresh={...AP_DEFAULT_PROGRESS};
    setProgress(fresh);setConfirmReset(false);generateNote();
  };

  const handleJumpToStage=(id)=>{
    setProgress(prev=>({...prev,stageId:id,sessionCorrect:0,sessionTotal:0}));
    setJumpStage(null);
  };

  const accuracy=progress.sessionTotal>0
    ?Math.round((progress.sessionCorrect/progress.sessionTotal)*100):null;

  // Button grid: show all 12 notes always (so user can pick any), highlight active ones
  const allNotesGrid=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

  return(
    <div className="space-y-3">
      {/* Stage banner */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 p-3">
        <div className="flex items-center justify-between mb-1">
          <div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-amber-400/55">{stage.label}</div>
            <div className="text-sm font-semibold text-amber-50">{stage.desc}</div>
          </div>
          <div className="text-right">
            {accuracy!==null&&<div className="text-lg font-semibold text-amber-300">{accuracy}%</div>}
            <div className="text-[10px] text-amber-200/35">{progress.sessionCorrect}/{progress.sessionTotal}</div>
          </div>
        </div>

        {/* Stage progress bar */}
        <div className="flex gap-1 mt-2">
          {AP_STAGES.map(s=>(
            <div key={s.id} className={`h-1 flex-1 rounded-full transition-colors ${
              s.id<progress.stageId?"bg-amber-400":
              s.id===progress.stageId?"bg-amber-500/60":"bg-amber-900/40"}`}/>
          ))}
        </div>

        <div className="flex gap-2 mt-2 flex-wrap">
          <button onClick={()=>setShowProgress(p=>!p)}
            className="text-[10px] text-amber-400/60 hover:text-amber-300 transition-colors">
            {showProgress?"Hide stats ▴":"Per-note stats ▾"}
          </button>
          <button onClick={()=>setJumpStage(j=>j?null:progress.stageId)}
            className="text-[10px] text-amber-400/60 hover:text-amber-300 transition-colors">
            Jump to stage ↗
          </button>
          <ConfirmButton label="Restart training" confirmLabel="Yes, reset all progress"
            onConfirm={handleReset} className="ml-auto"/>
        </div>

        {/* Jump to stage picker */}
        {jumpStage!==null&&(
          <div className="mt-2 p-2 rounded-lg bg-[#1a1410] border border-amber-900/40">
            <div className="text-[10px] text-amber-200/50 mb-2">
              Jump forward if you've already worked through earlier stages. Progress stats reset for the new stage.
            </div>
            <div className="grid grid-cols-4 gap-1">
              {AP_STAGES.map(s=>(
                <button key={s.id} onClick={()=>handleJumpToStage(s.id)}
                  className={`py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                    s.id===progress.stageId
                      ?"bg-amber-500 text-[#1a1208]"
                      :"border border-amber-900/40 text-amber-200/60 hover:bg-amber-900/20"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Per-note stats */}
        {showProgress&&(
          <div className="mt-2 grid grid-cols-6 gap-1">
            {allNotesGrid.map(n=>{
              const s=progress.noteStats[n];
              const pct=s&&s.total>0?Math.round((s.correct/s.total)*100):null;
              const isActive=activeNotes.includes(n);
              return(
                <div key={n} className={`rounded p-1 text-center ${isActive?"bg-amber-950/60 border border-amber-800/30":"opacity-30"}`}>
                  <div className="text-[9px] font-semibold text-amber-200">{n}</div>
                  <div className="text-[8px] text-amber-200/50">{pct!==null?`${pct}%`:"—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Round card */}
      <div className="rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1c140f] to-[#160f0b] p-4 text-center">
        <div className="text-[9px] uppercase tracking-[0.25em] text-amber-400/45 mb-3">What note is this?</div>

        <div className="flex justify-center gap-3 mb-4">
          <button onClick={playCurrentNote}
            className="py-3 px-6 rounded-xl bg-amber-500 text-[#1a1208] font-semibold text-sm hover:bg-amber-400 active:scale-[0.98] transition-all shadow-[0_3px_10px_rgba(245,158,11,0.25)]">
            ▸ Play note
          </button>
          {answered&&(
            <button onClick={()=>playNote(currentNote.midi,{duration:1.8,gain:0.24})}
              className="px-4 py-3 rounded-xl border border-amber-500/40 text-amber-300 text-sm hover:bg-amber-500/10">↺</button>
          )}
        </div>

        {/* Active-stage note grid */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {activeNotes.map(n=>{
            const isCorrect=answered&&n===currentNote?.name;
            const isWrong=answered&&n!==currentNote?.name;
            return(
              <button key={n} onClick={()=>handleGuess(n)} disabled={answered}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  isCorrect?"bg-green-600 text-white shadow-[0_0_12px_rgba(34,197,94,0.4)]":
                  isWrong?"bg-red-900/40 text-red-300 border border-red-800/40":
                  "bg-[#1a1410] border border-amber-900/40 text-amber-100 hover:border-amber-500/50 hover:bg-amber-900/20 disabled:cursor-default"}`}>
                {n}
              </button>
            );
          })}
        </div>

        {answered&&(
          <div style={{animation:"fadeIn 0.25s ease-out"}}>
            <div className={`text-sm font-semibold mb-3 ${lastCorrect?"text-green-400":"text-red-400"}`}>
              {lastCorrect?"✓ Correct!":"✗ That was "+currentNote?.name}
              {!lastCorrect&&<span className="text-[10px] text-amber-200/40 block mt-0.5">The note plays again — listen carefully</span>}
            </div>
            {accuracy!==null&&progress.sessionTotal>=5&&(
              <div className="text-[10px] text-amber-200/40 mb-2">
                Session: {accuracy}% over {progress.sessionTotal} trials
                {accuracy>=90&&progress.sessionTotal>=20&&progress.stageId<AP_STAGES.length&&" · 🎉 Stage unlocking soon!"}
              </div>
            )}
            <button onClick={handleNext}
              className="w-full py-2.5 rounded-xl bg-amber-600/90 text-[#1a1208] font-medium text-xs hover:bg-amber-500 active:scale-[0.98] transition-all">
              Next note →
            </button>
          </div>
        )}
      </div>

      <div className="text-[10px] text-amber-200/25 text-center leading-relaxed px-2">
        Identify each note without context clues. Stages unlock at ≥90% over 20 trials.
        Use "Jump to stage" if you've already done earlier work elsewhere.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB: INTERVALS
   ═══════════════════════════════════════════════════════════════ */

const INT_DEFAULT_PROGRESS={
  unlockedIntervals:["P5","P4","P8"], // start with the 3 most distinct
  sessionCorrect:0,
  sessionTotal:0,
  intervalStats:{},  // { "P5": { asc:{c,t}, desc:{c,t} } }
};

function IntervalsTab({audio}){
  const {playNote}=audio;

  const [progress,setProgress]=useState(()=>lsGet(LS_INT,INT_DEFAULT_PROGRESS));
  const [direction,setDirection]=useState("both");   // "asc"|"desc"|"both"|"harmonic"
  const [showMnemonics,setShowMnemonics]=useState(true);
  const [showProgress,setShowProgress]=useState(false);
  const [round,setRound]=useState(null);   // {interval, rootMidi, topMidi, dir}
  const [answered,setAnswered]=useState(false);
  const [lastCorrect,setLastCorrect]=useState(null);

  useEffect(()=>lsSet(LS_INT,progress),[progress]);

  const activeIntervals=useMemo(()=>
    INTERVALS.filter(i=>progress.unlockedIntervals.includes(i.id)),
    [progress.unlockedIntervals]);

  const generateRound=useCallback(()=>{
    if(activeIntervals.length===0)return;
    const interval=randItem(activeIntervals);
    const rootMidi=48+Math.floor(Math.random()*13); // C3 to C4 range
    const actualDir=direction==="both"?(Math.random()>0.5?"asc":"desc")
      :direction==="harmonic"?"harmonic":direction;
    const topMidi=actualDir==="desc"?rootMidi-interval.semis:rootMidi+interval.semis;
    setRound({interval,rootMidi,topMidi,dir:actualDir});
    setAnswered(false);setLastCorrect(null);
  },[activeIntervals,direction]);

  useEffect(()=>{generateRound();},[progress.unlockedIntervals,direction]);

  const playRound=(r)=>{
    const target=r||round; if(!target)return;
    if(target.dir==="harmonic"){
      playNote(target.rootMidi,{duration:2,gain:0.2});
      playNote(target.topMidi,{duration:2,gain:0.2,delay:0.02});
    } else if(target.dir==="desc"){
      playNote(target.rootMidi,{duration:1.2,gain:0.22});
      playNote(target.topMidi,{duration:1.2,gain:0.22,delay:0.8});
    } else {
      playNote(target.rootMidi,{duration:1.2,gain:0.22});
      playNote(target.topMidi,{duration:1.2,gain:0.22,delay:0.8});
    }
  };

  const handleGuess=(intervalId)=>{
    if(answered||!round)return;
    const correct=intervalId===round.interval.id;
    setAnswered(true);setLastCorrect(correct);

    setProgress(prev=>{
      const stats={...prev.intervalStats};
      const is=stats[round.interval.id]||{asc:{c:0,t:0},desc:{c:0,t:0},harmonic:{c:0,t:0}};
      const dk=round.dir==="harmonic"?"harmonic":round.dir==="desc"?"desc":"asc";
      stats[round.interval.id]={...is,[dk]:{c:is[dk].c+(correct?1:0),t:is[dk].t+1}};
      const sc=prev.sessionCorrect+(correct?1:0);
      const st=prev.sessionTotal+1;

      // Unlock next interval when ≥80% over 15 trials
      let unlocked=[...prev.unlockedIntervals];
      if(correct&&sc>=15&&(sc/st)>=0.8){
        const nextId=INTERVAL_UNLOCK_ORDER.find(id=>!unlocked.includes(id));
        if(nextId) unlocked=[...unlocked,nextId];
      }
      return{...prev,intervalStats:stats,sessionCorrect:sc,sessionTotal:st,unlockedIntervals:unlocked};
    });

    // Play the correct interval again
    setTimeout(()=>playRound(round),400);
  };

  const handleReset=()=>{
    const fresh={...INT_DEFAULT_PROGRESS};
    setProgress(fresh);generateRound();
  };

  const handleUnlockInterval=(id)=>{
    setProgress(prev=>({...prev,unlockedIntervals:[...new Set([...prev.unlockedIntervals,id])]}));
  };

  const accuracy=progress.sessionTotal>0?Math.round((progress.sessionCorrect/progress.sessionTotal)*100):null;
  const dirLabel={asc:"↑ Ascending",desc:"↓ Descending",harmonic:"Harmonic",both:"Both directions"};

  return(
    <div className="space-y-3">
      {/* Controls */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 p-2.5 space-y-2">
        <div className="text-[9px] uppercase tracking-[0.22em] text-amber-400/55 mb-1">Settings</div>
        <div className="grid grid-cols-2 gap-2">
          <Select label="Direction" value={direction} onChange={setDirection}
            options={[{value:"both",label:"Both"},{value:"asc",label:"↑ Ascending"},
                      {value:"desc",label:"↓ Descending"},{value:"harmonic",label:"Harmonic"}]}/>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-[0.18em] text-amber-200/45">Active</span>
            <div className="text-xs text-amber-100 py-1.5">{activeIntervals.length} of {INTERVALS.length} intervals</div>
          </div>
        </div>
        <Checkbox label="Show mnemonics" checked={showMnemonics} onChange={setShowMnemonics}/>
        <div className="flex gap-2 flex-wrap">
          <button onClick={()=>setShowProgress(p=>!p)}
            className="text-[10px] text-amber-400/60 hover:text-amber-300 transition-colors">
            {showProgress?"Hide stats ▴":"Per-interval stats ▾"}
          </button>
          <ConfirmButton label="Restart training" confirmLabel="Yes, reset"
            onConfirm={handleReset} className="ml-auto"/>
        </div>

        {/* Per-interval stats + manual unlock */}
        {showProgress&&(
          <div className="space-y-1 mt-1">
            {INTERVALS.map(iv=>{
              const s=progress.intervalStats[iv.id];
              const asc=s?.asc;const desc=s?.desc;
              const unlocked=progress.unlockedIntervals.includes(iv.id);
              return(
                <div key={iv.id} className={`flex items-center gap-2 py-1 px-2 rounded-lg ${unlocked?"bg-amber-950/40":"opacity-40"}`}>
                  <span className="text-[10px] font-semibold text-amber-300 w-7">{iv.short}</span>
                  <span className="text-[10px] text-amber-200/50 flex-1">{iv.label}</span>
                  <span className="text-[9px] text-amber-200/35">
                    ↑{asc?`${Math.round(asc.c/Math.max(asc.t,1)*100)}%`:"—"}{" "}
                    ↓{desc?`${Math.round(desc.c/Math.max(desc.t,1)*100)}%`:"—"}
                  </span>
                  {!unlocked&&(
                    <button onClick={()=>handleUnlockInterval(iv.id)}
                      className="text-[9px] text-amber-500/60 hover:text-amber-400 transition-colors">unlock</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Session accuracy */}
      {accuracy!==null&&(
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#1a1410] border border-amber-900/30">
          <span className="text-[10px] text-amber-200/40">Session</span>
          <span className="text-sm font-semibold text-amber-300">{accuracy}% <span className="text-[10px] text-amber-200/30 font-normal">({progress.sessionCorrect}/{progress.sessionTotal})</span></span>
        </div>
      )}

      {/* Round card */}
      {round&&(
        <div className="rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1c140f] to-[#160f0b] p-4 text-center">
          <div className="text-[9px] uppercase tracking-[0.25em] text-amber-400/45 mb-1">
            {dirLabel[round.dir]} interval — what is it?
          </div>

          <div className="flex justify-center gap-3 mb-4">
            <button onClick={()=>playRound(round)}
              className="py-3 px-6 rounded-xl bg-amber-500 text-[#1a1208] font-semibold text-sm hover:bg-amber-400 active:scale-[0.98] transition-all shadow-[0_3px_10px_rgba(245,158,11,0.25)]">
              ▸ Play interval
            </button>
            {answered&&(
              <button onClick={()=>playRound(round)}
                className="px-4 py-3 rounded-xl border border-amber-500/40 text-amber-300 text-sm hover:bg-amber-500/10">↺</button>
            )}
          </div>

          {/* Answer grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {activeIntervals.map(iv=>{
              const isCorrect=answered&&iv.id===round.interval.id;
              const isWrong=answered&&iv.id!==round.interval.id;
              return(
                <button key={iv.id} onClick={()=>handleGuess(iv.id)} disabled={answered}
                  className={`py-2 px-1 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                    isCorrect?"bg-green-600 text-white shadow-[0_0_12px_rgba(34,197,94,0.4)]":
                    isWrong?"bg-red-900/30 text-red-300/60 border border-red-900/30":
                    "bg-[#1a1410] border border-amber-900/40 text-amber-100 hover:border-amber-500/50 hover:bg-amber-900/20 disabled:cursor-default"}`}>
                  <div className="font-bold">{iv.short}</div>
                  <div className="text-[9px] opacity-70">{iv.label}</div>
                </button>
              );
            })}
          </div>

          {answered&&(
            <div style={{animation:"fadeIn 0.25s ease-out"}}>
              <div className={`text-sm font-semibold mb-1 ${lastCorrect?"text-green-400":"text-red-400"}`}>
                {lastCorrect?"✓ Correct!":"✗ That was a "+round.interval.label}
              </div>
              {showMnemonics&&(
                <div className="text-[10px] text-amber-200/40 mb-3 italic">
                  "{round.interval.mnemonic}"
                </div>
              )}
              <button onClick={generateRound}
                className="w-full py-2.5 rounded-xl bg-amber-600/90 text-[#1a1208] font-medium text-xs hover:bg-amber-500 active:scale-[0.98] transition-all">
                Next interval →
              </button>
            </div>
          )}
        </div>
      )}

      <div className="text-[10px] text-amber-200/25 text-center leading-relaxed px-2">
        Ascending and descending are distinct skills — train both.
        New intervals unlock at ≥80% over 15 trials. Use "unlock" in stats to jump ahead.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROOT APP — three-tab shell
   ═══════════════════════════════════════════════════════════════ */

export default function App(){
  const audio=useAudioEngine();
  const [tab,setTab]=useState("chord");

  const tabs=[
    {id:"chord",  label:"Chord Tones"},
    {id:"ap",     label:"Abs. Pitch"},
    {id:"intervals",label:"Intervals"},
  ];

  return(
    <div className="min-h-screen w-full bg-[#120d0a] text-amber-50 flex flex-col items-center px-3 pt-3 pb-6"
      style={{fontFamily:"'Iowan Old Style',Georgia,serif"}}>
      <div className="w-full max-w-sm">

        {/* Tab bar */}
        <div className="flex gap-1 mb-3 bg-[#1a1410] rounded-xl p-1 border border-amber-900/30">
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium tracking-wide transition-all ${
                tab===t.id?"bg-amber-500 text-[#1a1208] shadow-sm":"text-amber-200/50 hover:text-amber-200/80"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab==="chord"&&<ChordToneTab audio={audio}/>}
        {tab==="ap"&&<AbsolutePitchTab audio={audio}/>}
        {tab==="intervals"&&<IntervalsTab audio={audio}/>}
      </div>

      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  );
}
