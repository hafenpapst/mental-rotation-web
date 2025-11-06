'use client';
import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { genComplexShape, equalUnderAnyRotation, rotate90, type V3 } from '../lib/shapes3d';
import PolyCube from './PolyCube';

function randInt(n:number){ return Math.floor(Math.random()*n); }
function choice<T>(arr:T[]) { return arr[Math.floor(Math.random()*arr.length)]; }
const DIRS: V3[] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

function useIsMobile(bp=768){
  const [m,setM] = React.useState(false);
  React.useEffect(()=>{
    const mq = window.matchMedia(`(max-width:${bp}px)`);
    const on = () => setM(mq.matches);
    on(); mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  },[bp]);
  return m;
}

type LogRow = {
  round: number; level: number; cubes: number;
  nearMiss: boolean; same: boolean; correct: boolean;
  rt_ms: number; timeout: boolean;
};

export default function MentalRotation3D_OneShot(){
  // --- Spiel-Parameter ---
  const MAX_LEVEL = 25;
  const TIME_LIMIT_S = 5;
  const SAME_PROB = 0.5;

  // --- State ---
  const [round, setRound] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [level, setLevel] = React.useState(1);
  const [gameOver, setGameOver] = React.useState(false);

  const [started, setStarted] = React.useState(false);            // Startbildschirm weg?
  const [awaitingStart, setAwaitingStart] = React.useState(false); // Vorstart-Phase je Runde aktiv?

  const [target, setTarget] = React.useState<V3[]>([]);
  const [probe, setProbe]   = React.useState<V3[]>([]);
  const [isSameTruth, setIsSameTruth] = React.useState<boolean>(false);

  const [clicked, setClicked] = React.useState<null | boolean>(null);

  const [timeLeft, setTimeLeft] = React.useState<number>(TIME_LIMIT_S);
  const timerIdRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number>(performance.now());
  const trialMetaRef = React.useRef<{cubes:number; nearMiss:boolean; same:boolean}>({cubes:0, nearMiss:false, same:false});

  // Sounds
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  function ensureAudio(){ if(!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); return audioCtxRef.current!; }
  function beep(freq:number, durMs:number, vol=0.1, when=0){
    const ctx = ensureAudio(); const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + durMs/1000);
  }
  function playCorrect(){ beep(660,120,0.12,0); beep(880,120,0.12,0.13); beep(990,160,0.12,0.27); }
  function playWrong(){ beep(180,250,0.14,0); beep(120,250,0.12,0.05); }

  // Logging
  const [log, setLog] = React.useState<LogRow[]>([]);

  function clearTimer(){ if (timerIdRef.current !== null) { window.clearInterval(timerIdRef.current); timerIdRef.current = null; } }
  function startTimer(){
    clearTimer(); setTimeLeft(TIME_LIMIT_S); startRef.current = performance.now();
    timerIdRef.current = window.setInterval(()=>{
      const elapsed = (performance.now()-startRef.current)/1000;
      const rem = Math.max(0, TIME_LIMIT_S - elapsed);
      setTimeLeft(rem);
      if (rem <= 0){ clearTimer(); if (clicked === null) answer(null); }
    }, 100);
  }

  function difficultyForLevel(lvl:number){
    let minCubes=8, maxCubes=12;
    if (lvl>=6 && lvl<=10) { minCubes=10; maxCubes=14; }
    else if (lvl>=11 && lvl<=15) { minCubes=12; maxCubes=16; }
    else if (lvl>=16 && lvl<=20) { minCubes=14; maxCubes=18; }
    else if (lvl>=21) { minCubes=16; maxCubes=22; }
    const nearMissChance = (lvl<8) ? 0 : (lvl<14)? 0.4 : (lvl<20)? 0.7 : 0.9;
    return { minCubes, maxCubes, nearMissChance };
  }

  function makeNearMiss(base: V3[], maxTries=200): V3[] {
    const set = new Set(base.map(([x,y,z])=>`${x}|${y}|${z}`));
    for (let t=0; t<maxTries; t++){
      const idx = randInt(base.length), from = base[idx], dir = choice(DIRS);
      const dest: V3 = [from[0]+dir[0], from[1]+dir[1], from[2]+dir[2]];
      const k = `${dest[0]}|${dest[1]}|${dest[2]}`; if (set.has(k)) continue;
      const cand = base.map((v,i)=> i===idx ? dest : v);
      if (!equalUnderAnyRotation(base, cand)) return cand;
    }
    let other = genComplexShape(12,18); let guard = 0;
    while (equalUnderAnyRotation(base, other) && guard++ < 200){ other = genComplexShape(12,18); }
    return other;
  }

  // --- Vorstart- & Rundenlogik ---
  function prepareNextRound(){
    if (gameOver) return;
    setClicked(null);
    setAwaitingStart(true);      // Vorstart aktiv (leere Boxen, nur "Start")
    clearTimer();
    setTimeLeft(TIME_LIMIT_S);   // Anzeige zurücksetzen
    setTarget([]); setProbe([]); // leere Boxen anzeigen
  }

  function startRound(){
    if (gameOver) return;

    const newRound = round + 1;
    const newLevel = newRound === 1 ? 1 : Math.min(MAX_LEVEL, level + 1);

    const { minCubes, maxCubes, nearMissChance } = difficultyForLevel(newLevel);
    const base = genComplexShape(minCubes, maxCubes);
    const same = Math.random() < SAME_PROB;

    let candidate: V3[]; let usedNearMiss = false;
    if (same){
      const rx = 1 + randInt(3), ry = randInt(4), rz = randInt(4);
      candidate = rotate90(base, [rx,ry,rz]);
    } else {
      usedNearMiss = Math.random() < nearMissChance;
      candidate = usedNearMiss ? makeNearMiss(base)
        : (()=>{ let other = genComplexShape(minCubes, maxCubes), guard=0;
                 while (equalUnderAnyRotation(base, other) && guard++ < 200){ other = genComplexShape(minCubes, maxCubes); }
                 return other; })();
    }

    trialMetaRef.current = { cubes: base.length, nearMiss: usedNearMiss, same };

    setRound(newRound);
    setLevel(newLevel);
    setTarget(base);
    setProbe(candidate);
    setIsSameTruth(same);
    setClicked(null);

    setAwaitingStart(false); // jetzt „live“
    startTimer();
  }

  function answer(choice:boolean | null){
    if (clicked !== null || gameOver || awaitingStart) return;
    clearTimer();
    const timeout = choice === null;
    const rt = timeout ? TIME_LIMIT_S*1000 : Math.round(performance.now() - startRef.current);
    const correct = timeout ? false : (choice === isSameTruth);
    setClicked(choice ?? false); setScore(s => s + (correct ? 10 : -2));
    setLog(rows => rows.concat([{
      round, level,
      cubes: trialMetaRef.current.cubes,
      nearMiss: trialMetaRef.current.nearMiss,
      same: trialMetaRef.current.same,
      correct, rt_ms: rt, timeout
    }]));
    if (correct) playCorrect(); else playWrong();

    // NEU: automatisch in Vorstart-Phase springen (statt "Nächste Runde"-Button)
    if (level >= MAX_LEVEL) {
      setGameOver(true);
    } else {
      prepareNextRound();
    }
  }

  // --- Styles (responsive) ---
  const isMobile = useIsMobile(768);

  const bg = '#35a78aff';
  const card = { background:'#436be6ff', borderRadius:16, padding: isMobile ? 10 : 12 } as React.CSSProperties;
  const btn  = { background:'#32C48D', color:'#152fc0ff', border:'none', padding: isMobile ? '12px 14px' : '10px 12px', borderRadius:12, cursor:'pointer', fontWeight:800, fontSize: isMobile ? 16 : 14 } as React.CSSProperties;
  const btnRed  = { ...btn, background:'#FF6B6B' };
  const btnBlue = { ...btn, background:'#6E8BFF' };
  const btnMuted = { ...btn, opacity:.6, cursor:'not-allowed' as const };
  const timerStyle: React.CSSProperties = {
    fontSize: isMobile ? 22 : 28, fontWeight:900, padding: isMobile ? '4px 10px' : '4px 12px', borderRadius:12,
    background: timeLeft <= 1.5 && !awaitingStart ? '#FFB703' : '#2BD4BD',
    color: '#7e2463ff', minWidth: isMobile ? 70 : 88, textAlign:'center'
  };
  const canvasBoxStyle: React.CSSProperties = {
    width: '100%',
    height: isMobile ? 'clamp(200px, 38dvh, 420px)' : 'clamp(220px, 40vh, 460px)',
    background: '#1834b3ff',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)',
    display:'grid', placeItems:'center', position:'relative'
  };

  // --- Auswertung ---
  const total = log.length;
  const correctN = log.filter(r => r.correct).length;
  const avgRtMs = total ? Math.round(log.reduce((a,b)=>a+b.rt_ms,0)/total) : 0;
  const near = log.filter(r => r.nearMiss), norm = log.filter(r => !r.nearMiss);
  const nearAcc = near.length ? Math.round(100 * near.filter(r=>r.correct).length / near.length) : 0;
  const normAcc = norm.length ? Math.round(100 * norm.filter(r=>r.correct).length / norm.length) : 0;
  const nearRt = near.length ? (near.reduce((a,b)=>a+b.rt_ms,0)/near.length/1000).toFixed(2) : '–';
  const normRt = norm.length ? (norm.reduce((a,b)=>a+b.rt_ms,0)/norm.length/1000).toFixed(2) : '–';

  function resetAll(){
    clearTimer(); setRound(0); setLevel(1); setScore(0); setLog([]); setGameOver(false);
    setStarted(false); setAwaitingStart(false); setTarget([]); setProbe([]);
  }

  return (
    <div style={{minHeight:'100dvh', background:bg, color:'#EEF4FF', display:'flex', flexDirection:'column'}}>
      {!started ? (
        // --- Startbildschirm ---
        <div style={{flex:1, display:'grid', placeItems:'center', padding:16}}>
          <div style={{textAlign:'center', maxWidth:700, background:'#ffffff22', padding:isMobile?24:36, borderRadius:20, boxShadow:'0 8px 30px rgba(0,0,0,.2)'}}>
            <h1 style={{fontSize:isMobile?24:30, fontWeight:800, marginBottom:16}}>Wie gut ist Ihr räumliches Denken?</h1>
            <p style={{fontSize:isMobile?16:18, lineHeight:1.5, marginBottom:24}}>
              Drehen Sie die Objekte in Gedanken – erkennen Sie,
              ob sie trotz unterschiedlicher Ansicht <b>identisch</b> sind oder <b>verschieden</b>!
            </p>
            <button
              onClick={() => { setStarted(true); setRound(0); setLevel(1); prepareNextRound(); }}
              style={{...btn, background:'#32C48D', color:'#0A1022', padding:isMobile?'12px 20px':'12px 28px'}}
            >
              Bereit? Los geht’s!
            </button>
          </div>
        </div>
      ) : gameOver ? (
        // --- Auswertung ---
        <div style={{flex:1, display:'grid', placeItems:'center', padding:isMobile?12:24}}>
          <div style={{background:'#ffffff22', padding:isMobile?16:24, borderRadius:16, width:'min(840px, 94vw)'}}>
            <h2 style={{marginTop:0, fontSize:isMobile?20:24}}>Auswertung</h2>
            <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:12, marginBottom:16}}>
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

            <h3 style={{margin:'8px 0', fontSize:isMobile?18:20}}>Nach Schwierigkeitsgrad</h3>
            <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12}}>
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
        // --- Hauptspiel ---
        <>
          {/* Header (ohne "Nächste Runde"-Button) */}
          <div style={{display:'flex', gap:12, alignItems:'center', padding:isMobile?'10px 12px 6px':'12px 16px 6px'}}>
            <h1 style={{margin:0, fontSize:isMobile?16:18, fontWeight:800}}>Mentale Rotation – 3D</h1>
            <div style={{flex:1}} />
            <div style={{fontSize:12, opacity:.8}}>Level: <b>{level}</b> / {MAX_LEVEL}</div>
            {!isMobile && (
              <div style={timerStyle}>
                {awaitingStart ? `${TIME_LIMIT_S.toFixed(1)}s` : `${timeLeft.toFixed(1)}s`}
              </div>
            )}
          </div>

          {/* Infozeile */}
          <div style={{display:'flex', gap:12, alignItems:'center', padding:isMobile?'0 12px 8px':'0 16px 8px', fontSize:12, opacity:.9}}>
            <div>Score: <b>{score}</b></div>
            <div style={{opacity:.5}}>|</div>
            <div>Runde: <b>{round}</b></div>
          </div>

          {/* Spielfeld */}
          <div style={{
            display:'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap:12,
            padding: isMobile ? '0 12px 96px' : '0 16px 96px',
            flex:1
          }}>
            {/* Ziel */}
            <div style={card}>
              <div style={{color:'#A7B7FF', margin:'4px 0 8px'}}>
                Zielobjekt {awaitingStart ? '(gleich erscheint)' : '(ungedreht)'}
              </div>
              <div style={canvasBoxStyle}>
                <Canvas camera={{ position:[7.2,7.2,7.2], fov:40 }}>
                  <ambientLight intensity={0.9}/>
                  <directionalLight position={[6,12,6]} intensity={1.0}/>
                  <Stage adjustCamera={false} intensity={0.6} environment={null}>
                    <group rotation={[0.35, 0.55, 0]}>
                      {!awaitingStart && target.length>0 ? (
                        <PolyCube blocks={target} color="#8EE3D7" edge="#FFFFFF" unit={0.95} />
                      ) : null}
                    </group>
                  </Stage>
                  <OrbitControls enablePan={false} enableZoom={false} enableRotate={false}/>
                </Canvas>
                {awaitingStart && <div style={{position:'absolute', color:'#ffffffcc', fontWeight:700}}>Bereit…</div>}
              </div>
            </div>

            {/* Prüfobjekt */}
            <div style={card}>
              <div style={{color:'#A7B7FF', margin:'4px 0 8px'}}>Prüfobjekt {awaitingStart ? '(gleich erscheint)' : ''}</div>
              <div style={canvasBoxStyle}>
                <Canvas camera={{ position:[7.2,7.2,7.2], fov:40 }}>
                  <ambientLight intensity={0.9}/>
                  <directionalLight position={[6,12,6]} intensity={1.0}/>
                  <Stage adjustCamera={false} intensity={0.6} environment={null}>
                    <group rotation={[0.35, 0.55, 0]}>
                      {!awaitingStart && probe.length>0 ? (
                        <PolyCube blocks={probe} color="#FFD166" edge="#FFFFFF" unit={0.95} />
                      ) : null}
                    </group>
                  </Stage>
                  <OrbitControls enablePan={false} enableZoom={false} enableRotate={false}/>
                </Canvas>
                {awaitingStart && <div style={{position:'absolute', color:'#ffffffcc', fontWeight:700}}>…und los</div>}
              </div>
            </div>
          </div>

          {/* Fixierte Leiste unten: ENTWEDER "Start" ODER Antwort-Buttons */}
          <div style={{
            position:'fixed', left:'50%', transform:'translateX(-50%)',
            bottom:0, width:'min(100%, 860px)',
            display:'flex', gap:12, alignItems:'center', justifyContent:'center',
            background:'#00000033', backdropFilter:'blur(6px)',
            padding:`12px 12px calc(12px + env(safe-area-inset-bottom))`,
            borderTopLeftRadius:12, borderTopRightRadius:12,
            boxShadow:'0 -6px 20px rgba(0,0,0,.25)', zIndex:1000
          }}>
            {awaitingStart ? (
              <>
                <button onClick={startRound} style={{...btn, flex:1}}>Start</button>
                <div style={{...timerStyle, marginLeft:8}}>{TIME_LIMIT_S.toFixed(1)}s</div>
              </>
            ) : (
              <>
                <button onClick={()=>answer(true)}  style={{...btn, flex:1}}>Gleich ✔</button>
                <button onClick={()=>answer(false)} style={{...btnRed, flex:1}}>Verschieden ✖</button>
                <div style={{...timerStyle, marginLeft:8}}>{timeLeft.toFixed(1)}s</div>
              </>
            )}
          </div>
        </>
      )}
     {/* --- Footer / Impressum --- */}
{/* --- Footer / Impressum & weitere Aufgaben --- */}
<footer
  style={{
    marginTop: 'auto',
    padding: '12px 12px calc(12px + env(safe-area-inset-bottom))',
    // Wenn Spiel läuft, etwas Platz unterhalb lassen, damit die fixierte Button-Leiste nichts überdeckt:
    marginBottom: started && !gameOver ? 72 : 0,
    color: '#eef4ffcc',
    fontSize: 12,
  }}
>
  {/* feine Trennlinie */}
  <div
    style={{
      height: 1,
      background: 'linear-gradient(to right, transparent, rgba(255,255,255,.25), transparent)',
      margin: '4px 0 12px',
    }}
  />

  {/* Impressum/Absender + Kontakt */}
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
    }}
  >
    <span>
      © 2025 <b>Dennis Eustermann</b> – Projekt im Rahmen des Seminars
      <i> „Gedächtnis und Aufmerksamkeit in Kindheit und Jugend“</i>
    </span>
    <span style={{ opacity: 0.4 }}>•</span>
    <a
      href="mailto:dennis.eustermann@mailbox.tu-dresden.de"
      style={{ color: '#fff', textDecoration: 'underline' }}
    >
      Kontakt
    </a>
  </div>

  {/* Link-Kacheln zu deinen weiteren Apps */}
  <div
    style={{
      marginTop: 10,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
    }}
  >
    <a
      href="https://corsi-app.vercel.app"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        background: '#00000024',
        border: '1px solid rgba(255,255,255,.25)',
        borderRadius: 10,
        padding: '8px 12px',
        color: '#EEF4FF',
        textDecoration: 'none',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        backdropFilter: 'blur(4px)',
      }}
    >
      🧩 Corsi-Block-Test
    </a>

    <a
      href="https://phon-loop-app.vercel.app"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        background: '#00000024',
        border: '1px solid rgba(255,255,255,.25)',
        borderRadius: 10,
        padding: '8px 12px',
        color: '#EEF4FF',
        textDecoration: 'none',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        backdropFilter: 'blur(4px)',
      }}
    >
      🔁 Phonologische Schleife
    </a>
  </div>
</footer>

 
    </div>
  );
}
