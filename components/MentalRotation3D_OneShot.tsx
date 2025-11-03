'use client';
import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { genComplexShape, equalUnderAnyRotation, rotate90, type V3 } from '../lib/shapes3d';
import PolyCube from './PolyCube';

function randInt(n:number){ return Math.floor(Math.random()*n); }
function choice<T>(arr:T[]) { return arr[Math.floor(Math.random()*arr.length)]; }
const DIRS: V3[] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

type LogRow = {
  round: number;
  level: number;
  cubes: number;
  nearMiss: boolean;
  same: boolean;
  correct: boolean;
  rt_ms: number;      // Timeouts zählen als 5000ms
  timeout: boolean;
};

export default function MentalRotation3D_OneShot(){
  // Core state
  const MAX_LEVEL = 25;
  const TIME_LIMIT_S = 5;
  const SAME_PROB = 0.5; // fix: 50%

  const [round, setRound] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [level, setLevel] = React.useState(1);
  const [gameOver, setGameOver] = React.useState(false);

  // Startbildschirm
  const [started, setStarted] = React.useState(false);

  // Shapes
  const [target, setTarget] = React.useState<V3[]>(genComplexShape(10,14));
  const [probe, setProbe]   = React.useState<V3[]>(genComplexShape(10,14));
  const [isSameTruth, setIsSameTruth] = React.useState<boolean>(false);

  // Antwort / Timer
  const [clicked, setClicked] = React.useState<null | boolean>(null);
  const [timeLeft, setTimeLeft] = React.useState<number>(TIME_LIMIT_S);
  const timerIdRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number>(performance.now());

  // Trial-Metadaten für Logging
  const trialMetaRef = React.useRef<{cubes:number; nearMiss:boolean; same:boolean}>({cubes:0, nearMiss:false, same:false});

  // Sounds (WebAudio)
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  function ensureAudio(){ if(!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); return audioCtxRef.current!; }
  function beep(freq:number, durMs:number, vol=0.1, when=0){
    const ctx = ensureAudio();
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + durMs/1000);
  }
  function playCorrect(){ beep(660,120,0.12,0); beep(880,120,0.12,0.13); beep(990,160,0.12,0.27); }
  function playWrong(){ beep(180,250,0.14,0); beep(120,250,0.12,0.05); }

  // Logging
  const [log, setLog] = React.useState<LogRow[]>([]);

  function clearTimer(){
    if (timerIdRef.current !== null) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  }
  function startTimer(){
    clearTimer();
    setTimeLeft(TIME_LIMIT_S);
    startRef.current = performance.now();
    timerIdRef.current = window.setInterval(()=>{
      const elapsed = (performance.now() - startRef.current)/1000;
      const remaining = Math.max(0, TIME_LIMIT_S - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0){
        clearTimer();
        if (clicked === null) answer(null); // Timeout => falsch
      }
    }, 100);
  }

  // --- Schwierigkeitsprofil pro Level ---
  function difficultyForLevel(lvl:number){
    // Mehr Würfel mit steigendem Level
    // 1–5: 8–12, 6–10: 10–14, 11–15: 12–16, 16–20: 14–18, 21–25: 16–22
    let minCubes=8, maxCubes=12;
    if (lvl>=6 && lvl<=10) { minCubes=10; maxCubes=14; }
    else if (lvl>=11 && lvl<=15) { minCubes=12; maxCubes=16; }
    else if (lvl>=16 && lvl<=20) { minCubes=14; maxCubes=18; }
    else if (lvl>=21) { minCubes=16; maxCubes=22; }

    // Ab L8 „near-miss“ möglich, ab L14 meist, ab L20 fast ausschließlich
    const nearMissChance =
      (lvl<8) ? 0 :
      (lvl<14)? 0.4 :
      (lvl<20)? 0.7 : 0.9;

    return { minCubes, maxCubes, nearMissChance };
  }

  // Near-miss erzeugen: verschiebe 1 Voxel; sorge dafür, dass es nicht unter 90°-Rotation gleich ist
  function makeNearMiss(base: V3[], maxTries=200): V3[] {
    const set = new Set(base.map(([x,y,z])=>`${x}|${y}|${z}`));
    for (let t=0; t<maxTries; t++){
      const idx = randInt(base.length);
      const from = base[idx];
      const dir = choice(DIRS);
      const dest: V3 = [from[0]+dir[0], from[1]+dir[1], from[2]+dir[2]];
      const k = `${dest[0]}|${dest[1]}|${dest[2]}`;
      if (set.has(k)) continue; // bereits belegt
      const candidate = base.map((v,i)=> i===idx ? dest : v);
      if (!equalUnderAnyRotation(base, candidate)) return candidate;
    }
    // Fallback: ganz andere Form
    let other = genComplexShape(12,18);
    let guard = 0;
    while (equalUnderAnyRotation(base, other) && guard++ < 200){
      other = genComplexShape(12,18);
    }
    return other;
  }

  function nextRound(increment=false){
    // Level-Logik: erste Runde ist Level 1; danach +1 pro Runde, bis 25
    const newRound = increment ? round+1 : round;
    const newLevel = newRound === 0 ? 1 : Math.min(MAX_LEVEL, level + 1);

    // Wenn wir bereits Level 25 gespielt haben und die letzte Antwort geloggt wurde:
    if (gameOver) return;

    const { minCubes, maxCubes, nearMissChance } = difficultyForLevel(newLevel);

    const base = genComplexShape(minCubes, maxCubes);
    const same = Math.random() < SAME_PROB;

    let candidate: V3[];
    let usedNearMiss = false;
    if (same){
      // Zufällige 90°-Rotation ≠ (0,0,0)
      const rx = 1 + randInt(3); // 1..3
      const ry = randInt(4);
      const rz = randInt(4);
      candidate = rotate90(base, [rx,ry,rz]);
    } else {
      usedNearMiss = Math.random() < nearMissChance;
      candidate = usedNearMiss ? makeNearMiss(base)
                               : (() => {
                                   let other = genComplexShape(minCubes, maxCubes);
                                   let guard = 0;
                                   while (equalUnderAnyRotation(base, other) && guard++ < 200){
                                     other = genComplexShape(minCubes, maxCubes);
                                   }
                                   return other;
                                 })();
    }

    // Trial-Metadaten für Logging merken
    trialMetaRef.current = { cubes: base.length, nearMiss: usedNearMiss, same };

    setRound(newRound);
    setLevel(newLevel);
    setTarget(base);
    setProbe(candidate);
    setIsSameTruth(same);
    setClicked(null);
    startTimer(); // Timer startet mit neuer Runde
  }

  function answer(choice:boolean | null){
    if (clicked !== null || gameOver) return; // schon geantwortet / fertig
    clearTimer();

    const timeout = choice === null;
    const rt = timeout ? TIME_LIMIT_S*1000 : Math.round(performance.now() - startRef.current);
    const correct = timeout ? false : (choice === isSameTruth);

    setClicked(choice ?? false);
    setScore(s => s + (correct ? 10 : -2));

    // Log aktualisieren
    setLog(rows => rows.concat([{
      round,
      level,
      cubes: trialMetaRef.current.cubes,
      nearMiss: trialMetaRef.current.nearMiss,
      same: trialMetaRef.current.same,
      correct,
      rt_ms: rt,
      timeout
    }]));

    if (correct) playCorrect(); else playWrong();

    // Falls Level 25 abgeschlossen → Auswertung
    if (level >= MAX_LEVEL) {
      setGameOver(true);
    }
  }

  // Styles – deine Farben
  const bg = '#35a78aff';
  const card = { background:'#436be6ff', borderRadius:16, padding:12 } as React.CSSProperties;
  const btn  = { background:'#32C48D', color:'#152fc0ff', border:'none', padding:'10px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 } as React.CSSProperties;
  const btnRed  = { ...btn, background:'#FF6B6B' };
  const btnBlue = { ...btn, background:'#6E8BFF' };
  const timerStyle: React.CSSProperties = {
    fontSize:28, fontWeight:900, padding:'4px 12px', borderRadius:12,
    background: timeLeft <= 1.5 ? '#FFB703' : '#2BD4BD', color: '#7e2463ff', minWidth:88, textAlign:'center'
  };
  // Canvas-Box: passt sich der Bildschirmhöhe an → kein Scroll
  const canvasBoxStyle: React.CSSProperties = {
    width: '100%',
    height: 'clamp(220px, 40vh, 460px)',
    background: '#1834b3ff',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)'
  };

  // --- Auswertung ---
  const total = log.length; // sollte 25 sein, wenn fertig
  const correctN = log.filter(r => r.correct).length;
  const avgRtMs = total ? Math.round(log.reduce((a,b)=>a+b.rt_ms,0)/total) : 0;

  const near = log.filter(r => r.nearMiss);
  const norm = log.filter(r => !r.nearMiss);
  const nearAcc = near.length ? Math.round(100 * near.filter(r=>r.correct).length / near.length) : 0;
  const normAcc = norm.length ? Math.round(100 * norm.filter(r=>r.correct).length / norm.length) : 0;
  const nearRt = near.length ? (near.reduce((a,b)=>a+b.rt_ms,0)/near.length/1000).toFixed(2) : '–';
  const normRt = norm.length ? (norm.reduce((a,b)=>a+b.rt_ms,0)/norm.length/1000).toFixed(2) : '–';

  function resetAll(){
    clearTimer();
    setRound(0);
    setLevel(1);
    setScore(0);
    setLog([]);
    setGameOver(false);
    setStarted(false);   // zurück zum Startbildschirm
  }

  return (
    <div style={{minHeight:'100dvh', background:bg, color:'#EEF4FF', display:'flex', flexDirection:'column'}}>
      {!started ? (
        // -------- Startbildschirm --------
        <div style={{flex:1, display:'grid', placeItems:'center', padding:24}}>
          <div style={{textAlign:'center', maxWidth:700, background:'#ffffff22', padding:36, borderRadius:20, boxShadow:'0 8px 30px rgba(0,0,0,.2)'}}>
            <h1 style={{fontSize:30, fontWeight:800, marginBottom:16}}>Wie gut ist Ihr räumliches Denken?</h1>
            <p style={{fontSize:18, lineHeight:1.5, marginBottom:28}}>
              Drehen Sie die Objekte in Gedanken – erkennen Sie,
              ob sie trotz unterschiedlicher Ansicht <b>identisch</b> sind oder <b>verschieden</b>!
            </p>
            <button
              onClick={() => { setStarted(true); nextRound(true); }}
              style={{
                background:'#32C48D',
                color:'#0A1022',
                fontSize:18,
                fontWeight:800,
                padding:'12px 28px',
                border:'none',
                borderRadius:12,
                cursor:'pointer',
                boxShadow:'0 4px 12px rgba(0,0,0,.2)',
                transition:'transform .15s',
              }}
              onMouseDown={(e)=> (e.currentTarget.style.transform='scale(0.96)')}
              onMouseUp={(e)=> (e.currentTarget.style.transform='scale(1)')}
            >
              Bereit? Los geht’s!
            </button>
          </div>
        </div>
      ) : gameOver ? (
        // -------- Auswertung nach 25 Levels --------
        <div style={{flex:1, display:'grid', placeItems:'center', padding:24}}>
          <div style={{background:'#ffffff22', padding:24, borderRadius:16, width:'min(840px, 94vw)'}}>
            <h2 style={{marginTop:0}}>Auswertung</h2>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16}}>
              <div style={{background:'#00000024', padding:12, borderRadius:12}}>
                <div style={{opacity:.8, fontSize:12}}>Gesamt-Score</div>
                <div style={{fontSize:24, fontWeight:900}}>{score}</div>
              </div>
              <div style={{background:'#00000024', padding:12, borderRadius:12}}>
                <div style={{opacity:.8, fontSize:12}}>Trefferquote</div>
                <div style={{fontSize:24, fontWeight:900}}>{Math.round(100*correctN/Math.max(1,total))}%</div>
              </div>
              <div style={{background:'#00000024', padding:12, borderRadius:12}}>
                <div style={{opacity:.8, fontSize:12}}>Ø Reaktionszeit</div>
                <div style={{fontSize:24, fontWeight:900}}>{(avgRtMs/1000).toFixed(2)} s</div>
              </div>
            </div>

            <h3 style={{margin:'8px 0'}}>Nach Schwierigkeitsgrad</h3>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div style={{background:'#00000024', padding:12, borderRadius:12}}>
                <div style={{fontWeight:700, marginBottom:6}}>Near-Miss</div>
                <div style={{fontSize:14, opacity:.9}}>Anteil: {near.length}/{total}</div>
                <div style={{fontSize:14, opacity:.9}}>Trefferquote: {nearAcc}%</div>
                <div style={{fontSize:14, opacity:.9}}>Ø Zeit: {nearRt} s</div>
              </div>
              <div style={{background:'#00000024', padding:12, borderRadius:12}}>
                <div style={{fontWeight:700, marginBottom:6}}>Normal</div>
                <div style={{fontSize:14, opacity:.9}}>Anteil: {norm.length}/{total}</div>
                <div style={{fontSize:14, opacity:.9}}>Trefferquote: {normAcc}%</div>
                <div style={{fontSize:14, opacity:.9}}>Ø Zeit: {normRt} s</div>
              </div>
            </div>

            <div style={{display:'flex', justifyContent:'flex-end', marginTop:16, gap:8}}>
              <button onClick={resetAll} style={{...btnBlue}}>Neue Sitzung</button>
            </div>
          </div>
        </div>
      ) : (
        // -------- Hauptspiel --------
        <>
          {/* Header */}
          <div style={{display:'flex', gap:12, alignItems:'center', padding:'12px 16px 6px'}}>
            <h1 style={{margin:0, fontSize:18, fontWeight:800}}>Mentale Rotation – 3D</h1>
            <div style={{flex:1}} />
            <div style={{fontSize:13, opacity:.8}}>Level: <b>{level}</b> / {MAX_LEVEL}</div>
            <div style={timerStyle}>{timeLeft.toFixed(1)}s</div>
            <button onClick={()=>nextRound(true)} style={btnBlue}>Nächste Runde</button>
          </div>

          {/* Controls row (aufgeräumt, ohne Gleich-Rate) */}
          <div style={{display:'flex', gap:16, alignItems:'center', padding:'0 16px 8px', fontSize:12, opacity:.9}}>
            <div>Score: <b>{score}</b></div>
            <div style={{opacity:.5}}>|</div>
            <div>Runde: <b>{round}</b></div>
          </div>

          {/* Spielfeld */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:'0 16px 80px', flex:1}}>
            {/* Ziel */}
            <div style={card}>
              <div style={{color:'#A7B7FF', margin:'4px 0 8px'}}>Zielobjekt (ungedreht)</div>
              <div style={canvasBoxStyle}>
                <Canvas camera={{ position:[7.2,7.2,7.2], fov:40 }}>
                  <ambientLight intensity={0.9}/>
                  <directionalLight position={[6,12,6]} intensity={1.0}/>
                  <Stage adjustCamera={false} intensity={0.6} environment={null}>
                    <group rotation={[0.35, 0.55, 0]}>
                      <PolyCube blocks={target} color="#8EE3D7" edge="#FFFFFF" unit={0.95} />
                    </group>
                  </Stage>
                  <OrbitControls enablePan={false} enableZoom={false} enableRotate={false}/>
                </Canvas>
              </div>
            </div>

            {/* Prüfobjekt */}
            <div style={card}>
              <div style={{color:'#A7B7FF', margin:'4px 0 8px'}}>Prüfobjekt</div>
              <div style={canvasBoxStyle}>
                <Canvas camera={{ position:[7.2,7.2,7.2], fov:40 }}>
                  <ambientLight intensity={0.9}/>
                  <directionalLight position={[6,12,6]} intensity={1.0}/>
                  <Stage adjustCamera={false} intensity={0.6} environment={null}>
                    <group rotation={[0.35, 0.55, 0]}>
                      <PolyCube blocks={probe} color="#FFD166" edge="#FFFFFF" unit={0.95} />
                    </group>
                  </Stage>
                  <OrbitControls enablePan={false} enableZoom={false} enableRotate={false}/>
                </Canvas>
              </div>
            </div>
          </div>

          {/* Fixierte Antwortleiste unten */}
          <div style={{
            position:'fixed', left:'50%', transform:'translateX(-50%)',
            bottom:16, display:'flex', gap:12, alignItems:'center',
            background:'#00000033', backdropFilter:'blur(6px)',
            padding:'10px 12px', borderRadius:12, boxShadow:'0 6px 20px rgba(0,0,0,.25)', zIndex:1000
          }}>
            <button onClick={()=>answer(true)}  style={{...btn}}>Gleich ✔</button>
            <button onClick={()=>answer(false)} style={{...btnRed}}>Verschieden ✖</button>
            <div style={{marginLeft:8, ...timerStyle}}>{timeLeft.toFixed(1)}s</div>
          </div>
        </>
      )}
    </div>
  );
}
