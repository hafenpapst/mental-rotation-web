'use client';
import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { genShape, type V3, rotateEuler } from '../lib/shapes3d';
import PolyCube from './PolyCube';

type EulerDeg = [number, number, number];

type Option = {
  blocksBase: V3[];       // unrotierte Basisblöcke
  rotation: EulerDeg;     // wird NUR im Renderer angewandt
  mirrorX: boolean;       // Spiegelung an X im Renderer
  correct: boolean;
};

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle<T>(arr: T[]): T[] { return arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v); }

// --- Hilfen für Logik & Eindeutigkeit ---
function allowedAngles(lvl:number): number[] {
  return lvl < 3 ? [0,90,180,270] : Array.from({length:12}, (_,i)=> i*30);
}
function randomEuler(lvl:number): EulerDeg {
  const A = allowedAngles(lvl);
  return [rand(A), rand(A), rand(A)];
}
function blocksEqual(a: V3[], b: V3[]): boolean {
  if (a.length !== b.length) return false;
  const key = (v:V3)=>`${Math.round(v[0]*1e6)}|${Math.round(v[1]*1e6)}|${Math.round(v[2]*1e6)}`;
  const seta = new Set(a.map(key));
  for (const v of b) if (!seta.has(key(v))) return false;
  return true;
}
// Shape mit Rotationssymmetrie für grobe 90°-Schritte vermeiden
function isRotationallySymmetricForCoarse(shape: V3[]): boolean {
  const coarse = [0,90,180,270];
  for (const x of coarse) for (const y of coarse) for (const z of coarse) {
    if (x===0 && y===0 && z===0) continue;
    const r = rotateEuler(shape, [x,y,z]);
    if (blocksEqual(shape, r)) return true;
  }
  return false;
}
function genAsymmetricShape(): V3[] {
  // Versuche ein paar Mal, ein asymmetrisches zu bekommen
  for (let i=0;i<20;i++){
    const s = genShape();
    if (!isRotationallySymmetricForCoarse(s)) return s;
  }
  return genShape(); // Fallback
}

export default function MentalRotation3D() {
  const [round, setRound]   = React.useState(0);
  const [score, setScore]   = React.useState(0);
  const [level, setLevel]   = React.useState(1);
  const [mirrorOn, setMirrorOn] = React.useState(true);

  const [participant, setParticipant] = React.useState('P001');
  const [askPid, setAskPid] = React.useState(true);

  const [targetBlocks, setTargetBlocks] = React.useState<V3[]>(genAsymmetricShape());
  const [options, setOptions] = React.useState<Option[]>([]);
  const [correctIndex, setCorrectIndex] = React.useState(0);
  const [clickedIndex, setClickedIndex] = React.useState<number|null>(null);
  const startRef = React.useRef<number>(performance.now());
  const [lastAngles, setLastAngles] = React.useState<EulerDeg>([0,0,0]);

  React.useEffect(() => { nextRound(); }, []);

  function pickNonTrivialEuler(shape: V3[], lvl:number): EulerDeg {
    // Vermeide Euler = (0,0,0) und vermeide Rotationen, die das Shape invariabel lassen
    for (let tries=0; tries<50; tries++){
      const e = randomEuler(lvl);
      if (e[0]===0 && e[1]===0 && e[2]===0) continue;
      const rotated = rotateEuler(shape, e);
      if (!blocksEqual(shape, rotated)) return e;
    }
    return [0,90,0]; // Fallback
  }

  function nextRound() {
    const newRound = round + 1;
    const newLevel = (newRound % 5 === 0) ? level + 1 : level;

    const base = genAsymmetricShape();
    const euler = pickNonTrivialEuler(base, newLevel);

    // korrekt: gleiche Blöcke, nur Rotation (keine Datenrotation, NUR Renderer)
    const correct: Option = { blocksBase: base, rotation: euler, mirrorX:false, correct:true };

    const distractors: Option[] = [];

    // Distraktor 1: gleiche Blöcke, andere Rotation
    let otherEuler = euler;
    for (let i=0;i<50;i++){
      const cand = randomEuler(newLevel);
      if (cand[0]!==euler[0] || cand[1]!==euler[1] || cand[2]!==euler[2]) {
        // Vermeide auch Rotationen, die zufällig identisch zum Original wären
        const rotCand = rotateEuler(base, cand);
        if (!blocksEqual(base, rotCand)) { otherEuler = cand; break; }
      }
    }
    distractors.push({ blocksBase: base, rotation: otherEuler, mirrorX:false, correct:false });

    // Distraktor 2: Spiegelung an X (nur wenn aktiv)
    if (mirrorOn) {
      distractors.push({ blocksBase: base, rotation: euler, mirrorX:true, correct:false });
    }

    // Distraktor 3: anderes Shape, gleiche Rotation
    let otherShape = genAsymmetricShape();
    // zur Sicherheit: anderes als base
    for (let i=0;i<20 && blocksEqual(otherShape, base); i++) otherShape = genAsymmetricShape();
    distractors.push({ blocksBase: otherShape, rotation: euler, mirrorX:false, correct:false });

    // Notfalls auffüllen
    while (distractors.length < 3) {
      const extraEuler = randomEuler(newLevel);
      distractors.push({ blocksBase: base, rotation: extraEuler, mirrorX:false, correct:false });
    }

    const candidates = shuffle([correct, distractors[0], distractors[1], distractors[2]]);
    setTargetBlocks(base);
    setOptions(candidates);
    setCorrectIndex(candidates.findIndex(c => c.correct));
    setRound(newRound);
    setLevel(newLevel);
    setClickedIndex(null);
    setLastAngles(euler);
    startRef.current = performance.now();
  }

  function handleClick(i:number) {
    if (clickedIndex !== null) return;
    const correct = i === correctIndex;
    setClickedIndex(i);
    setScore(s => s + (correct ? 10 : -2));
    // Hier könntest du Reaktionszeit/CSV loggen (analog 2D)
  }

  const card = { background:'#111A2E', borderRadius:16, padding:12 } as React.CSSProperties;
  const btn  = { background:'#1F6FEB', color:'#fff', border:'none', padding:'10px 12px', borderRadius:8, cursor:'pointer', fontWeight:600 } as React.CSSProperties;

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:12}}>
        <div>Score: <b>{score}</b></div>
        <div style={{opacity:.5}}>|</div>
        <div>Runde: <b>{round}</b></div>
        <div style={{opacity:.5}}>|</div>
        <div>Level: <b>{level}</b></div>
        <div style={{opacity:.5}}>|</div>
        <label style={{display:'flex', gap:8, alignItems:'center'}}>
          <input type="checkbox" checked={mirrorOn} onChange={e => setMirrorOn(e.target.checked)} />
          Spiegel-Distraktor aktiv
        </label>
        <div style={{flex:1}} />
        <button onClick={nextRound} style={btn}>Nächste Runde</button>
      </div>

      {/* Spielfeld */}
      <div style={{display:'grid', gridTemplateColumns:'2fr 3fr', gap:16}}>
        {/* Zielobjekt (ungedreht) */}
        <div style={card}>
          <div style={{color:'#7C8DA8', margin:'4px 0'}}>Ziel (ungedreht)</div>
          <div style={{width:'100%', aspectRatio:'1 / 1', background:'#0F1626', borderRadius:8, overflow:'hidden'}}>
            <Canvas camera={{ position:[6,6,6], fov:40 }}>
              <ambientLight intensity={0.7}/>
              <directionalLight position={[5,10,5]} intensity={0.8}/>
              <Stage adjustCamera={false} intensity={0.5} environment={null}>
                <group>
                  <PolyCube blocks={targetBlocks} color="#87B0FF"/>
                </group>
              </Stage>
              <OrbitControls enablePan={false} enableZoom={false} enableRotate={false}/>
            </Canvas>
          </div>
        </div>

        {/* Optionen */}
        <div style={card}>
          <div style={{color:'#7C8DA8', margin:'4px 0'}}>Welche Option ist nur gedreht (nicht gespiegelt)?</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            {options.map((opt, idx) => {
              const chosen = clickedIndex !== null;
              const isCorrect = idx === correctIndex;
              const border = chosen ? (isCorrect ? '2px solid #23B560' : '2px solid #C04848') : '2px solid transparent';
              return (
                <button key={idx} onClick={() => handleClick(idx)} style={{background:'#0F1626', border, borderRadius:8, padding:0, cursor:'pointer'}}>
                  <div style={{width:'100%', aspectRatio:'1 / 1'}}>
                    <Canvas camera={{ position:[6,6,6], fov:40 }}>
                      <ambientLight intensity={0.7}/>
                      <directionalLight position={[5,10,5]} intensity={0.8}/>
                      <group
                        scale={[ opt.mirrorX ? -1 : 1, 1, 1 ]}
                        rotation={[
                          (opt.rotation[0] * Math.PI)/180,
                          (opt.rotation[1] * Math.PI)/180,
                          (opt.rotation[2] * Math.PI)/180
                        ]}
                      >
                        <PolyCube blocks={opt.blocksBase} color="#B6D2FF"/>
                      </group>
                      <OrbitControls enablePan={false} enableZoom={false} enableRotate={false}/>
                    </Canvas>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{marginTop:8, fontSize:12, opacity:0.7}}>
            Zielrotation: X:{lastAngles[0]}° Y:{lastAngles[1]}° Z:{lastAngles[2]}°
          </div>
        </div>
      </div>

      {/* Teilnehmer-ID Modal */}
      {askPid && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'grid', placeItems:'center'}}>
          <div style={{background:'#111A2E', borderRadius:12, padding:20, width:360, boxShadow:'0 10px 30px rgba(0,0,0,.4)'}}>
            <h2 style={{marginTop:0}}>Teilnehmer-ID</h2>
            <p style={{opacity:.8, fontSize:14}}>Bitte gib eine ID ein (z. B. P001). Später für CSV-Export nutzbar.</p>
            <input value={participant} onChange={e=>setParticipant(e.target.value)} placeholder="P001" autoFocus
                   style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #2D3A52', background:'#0F1626', color:'#E6EDF3'}}/>
            <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>
              <button onClick={()=>setAskPid(false)} style={btn}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
