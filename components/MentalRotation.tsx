'use client';
import React from 'react';
import { deepCopy, mirrorY, normalizeToCanvas, rotate, toSvgPoints, Point } from '../lib/geometry';

const BASE_SHAPES: Point[][] = [
  // L-Form
  [ {x:0,y:0},{x:.6,y:0},{x:.6,y:.2},{x:.2,y:.2},{x:.2,y:.8},{x:0,y:.8} ],
  // T-Form
  [ {x:0,y:0},{x:1,y:0},{x:1,y:.2},{x:.6,y:.2},{x:.6,y:.8},{x:.4,y:.8},{x:.4,y:.2},{x:0,y:.2} ],
  // Zickzack
  [ {x:0,y:.2},{x:.6,y:.2},{x:.6,y:0},{x:1,y:.4},{x:.6,y:.8},{x:.6,y:.6},{x:0,y:.6} ],
  // U-Form
  [ {x:0,y:0},{x:.2,y:0},{x:.2,y:.6},{x:.8,y:.6},{x:.8,y:0},{x:1,y:0},{x:1,y:.8},{x:0,y:.8} ],
  // Pfeil
  [ {x:0,y:.4},{x:.6,y:.4},{x:.6,y:.2},{x:1,y:.5},{x:.6,y:.8},{x:.6,y:.6},{x:0,y:.6} ]
];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle<T>(arr: T[]): T[] { return arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v); }

type LogRow = {
  participant: string;
  round: number;
  level: number;
  angle_deg: number;
  mirror: boolean;
  correct: boolean;
  rt_ms: number;
};

export default function MentalRotation(){
  const [round, setRound] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [level, setLevel] = React.useState(1);
  const [mirrorOn, setMirrorOn] = React.useState(true);

  const [targetShape, setTargetShape] = React.useState<Point[]>(normalizeToCanvas(deepCopy(BASE_SHAPES[0]), 320));
  const [optionShapes, setOptionShapes] = React.useState<Point[][]>([]);
  const [correctIndex, setCorrectIndex] = React.useState<number>(0);
  const [targetAngle, setTargetAngle] = React.useState<number>(0);
  const [clickedIndex, setClickedIndex] = React.useState<number | null>(null);
  const startRef = React.useRef<number>(performance.now());

  const [participant, setParticipant] = React.useState<string>('P001');
  const [askPid, setAskPid] = React.useState<boolean>(true);
  const [log, setLog] = React.useState<LogRow[]>([]);

  React.useEffect(()=>{ nextRound(); },[]);

  function allowedAngles(lvl:number){
    return lvl < 3 ? [0,90,180,270] : Array.from({length:12}, (_,i)=> i*30);
  }

  function nextRound(){
    const newRound = round + 1;
    const newLevel = (newRound % 5 === 0) ? level + 1 : level;

    const base = deepCopy(rand(BASE_SHAPES));
    const angle = rand(allowedAngles(newLevel));

    setTargetAngle(angle);
    setTargetShape(normalizeToCanvas(base, 320));

    const correct = rotate(base, angle);
    const distractors: Point[][] = [];

    const altAngles = allowedAngles(newLevel).filter(a => Math.abs(a - angle) > 1e-6);
    distractors.push( rotate(base, rand(altAngles.length?altAngles:[(angle+90)%360])) );

    if (mirrorOn) distractors.push( mirrorY(rotate(base, angle)) );

    let other = rand(BASE_SHAPES.filter(s => s !== base));
    distractors.push( rotate(deepCopy(other), angle) );

    while (distractors.length < 3) distractors.push( rotate(base, rand(allowedAngles(newLevel))) );

    const options = shuffle([{pts:correct, ok:true}, {pts:distractors[0], ok:false}, {pts:distractors[1], ok:false}, {pts:distractors[2], ok:false}]);

    setOptionShapes(options.map(o => normalizeToCanvas(o.pts, 220)));
    setCorrectIndex(options.findIndex(o => o.ok));

    setRound(newRound);
    setLevel(newLevel);
    setClickedIndex(null);
    startRef.current = performance.now();
  }

  function handleClick(idx:number){
    if (clickedIndex !== null) return;
    const correct = idx === correctIndex;
    const rt = performance.now() - startRef.current;

    setClickedIndex(idx);
    setScore(s => s + (correct ? 10 : -2));

    setLog(rows => rows.concat([{ participant, round, level, angle_deg: targetAngle, mirror: mirrorOn, correct, rt_ms: Math.round(rt) }]));
  }

  function downloadCsv(){
    const header = 'participant,round,level,angle_deg,mirror,correct,rt_ms\\n';
    const body = log.map(r => `${r.participant},${r.round},${r.level},${r.angle_deg},${r.mirror},${r.correct},${r.rt_ms}`).join('\\n');
    const blob = new Blob([header+body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rotation_log_${participant}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cardStyle: React.CSSProperties = { background:'#111A2E', borderRadius:16, padding:12 };
  const btnStyle: React.CSSProperties = { background:'#1F6FEB', color:'#fff', border:'none', padding:'10px 12px', borderRadius:8, cursor:'pointer', fontWeight:600 };

  return (
    <div>
      <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:12}}>
        <div>Score: <b>{score}</b></div>
        <div style={{opacity:.5}}>|</div>
        <div>Runde: <b>{round}</b></div>
        <div style={{opacity:.5}}>|</div>
        <div>Level: <b>{level}</b></div>
        <div style={{opacity:.5}}>|</div>
        <label style={{display:'flex', gap:8, alignItems:'center'}}>
          <input type="checkbox" checked={mirrorOn} onChange={e=>setMirrorOn(e.target.checked)} />
          Spiegel-Distraktor aktiv
        </label>
        <div style={{flex:1}} />
        <button onClick={downloadCsv} style={btnStyle}>CSV exportieren</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'2fr 3fr', gap:16}}>
        <div style={cardStyle}>
          <div style={{color:'#7C8DA8', margin:'4px 0'}}>Ziel</div>
          <svg viewBox="0 0 320 320" width={320} height={320} style={{background:'#0F1626', borderRadius:8, width:'100%', height:'auto'}}>
            <polygon points={toSvgPoints(targetShape)} fill="rgba(120,170,255,0.35)" stroke="rgb(180,200,255)" strokeWidth={3} />
          </svg>
        </div>

        <div style={cardStyle}>
          <div style={{color:'#7C8DA8', margin:'4px 0'}}>Welche Option ist nur gedreht (nicht gespiegelt)?</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            {optionShapes.map((opt, i)=>{
              const isCorrect = i === correctIndex;
              const chosen = clickedIndex !== null;
              const border = chosen ? (isCorrect ? '2px solid #23B560' : '2px solid #C04848') : '2px solid transparent';
              return (
                <button key={i} onClick={()=>handleClick(i)} style={{background:'#0F1626', border, borderRadius:8, padding:6, cursor:'pointer'}}>
                  <svg viewBox="0 0 220 220" width={220} height={220} style={{width:'100%', height:'auto'}}>
                    <polygon points={toSvgPoints(opt)} fill="rgba(120,170,255,0.35)" stroke="rgb(180,200,255)" strokeWidth={3} />
                  </svg>
                </button>
              );
            })}
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', marginTop:12}}>
            <button onClick={nextRound} style={btnStyle}>Nächste Runde</button>
          </div>
        </div>
      </div>

      {askPid && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'grid', placeItems:'center'}}>
          <div style={{background:'#111A2E', borderRadius:12, padding:20, width:360, boxShadow:'0 10px 30px rgba(0,0,0,.4)'}}>
            <h2 style={{marginTop:0}}>Teilnehmer-ID</h2>
            <p style={{opacity:.8, fontSize:14}}>Bitte gib eine ID ein (z. B. P001). Diese ID erscheint später im CSV-Export.</p>
            <input value={participant} onChange={e=>setParticipant(e.target.value)} placeholder="P001" autoFocus
                   style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #2D3A52', background:'#0F1626', color:'#E6EDF3'}}/>
            <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>
              <button onClick={()=>setAskPid(false)} style={btnStyle}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
