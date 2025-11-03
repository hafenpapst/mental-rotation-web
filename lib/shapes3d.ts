// Voxel-basierte Polykuben auf einem Ganzzahlgitter

export type V3 = [number, number, number];

const DIRS: V3[] = [
  [1,0,0], [-1,0,0],
  [0,1,0], [0,-1,0],
  [0,0,1], [0,0,-1],
];

function key(v:V3){ return `${v[0]}|${v[1]}|${v[2]}`; }
function add(a:V3,b:V3):V3{ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }

export function centroid(blocks: V3[]): [number,number,number] {
  const n = blocks.length;
  const s = blocks.reduce((acc,[x,y,z])=>[acc[0]+x,acc[1]+y,acc[2]+z] as [number,number,number],[0,0,0]);
  return [s[0]/n, s[1]/n, s[2]/n];
}

function normalize(blocks: V3[]): V3[] {
  // setze min-Koordinate auf 0 und zentriere grob
  const xs = blocks.map(b=>b[0]), ys = blocks.map(b=>b[1]), zs = blocks.map(b=>b[2]);
  const minX = Math.min(...xs), minY = Math.min(...ys), minZ = Math.min(...zs);
  const shifted = blocks.map(b=>[b[0]-minX, b[1]-minY, b[2]-minZ] as V3);
  // um den Schwerpunkt zentrieren (kann Bruchteile ergeben – ok für Rendering)
  const c = centroid(shifted);
  return shifted.map(([x,y,z]) => [x-c[0], y-c[1], z-c[2]] as V3);
}

// ---------- Rotationen um 90° (Gitter bleibt Gitter) ----------
// wir erzeugen viele Kombinationen (x,y,z ∈ {0,90,180,270}) und prüfen auf Gleichheit
function rotX90([x,y,z]:V3):V3{ return [x, -z, y]; }
function rotY90([x,y,z]:V3):V3{ return [z, y, -x]; }
function rotZ90([x,y,z]:V3):V3{ return [-y, x, z]; }

function applyRotations(b:V3[], rx:number, ry:number, rz:number):V3[] {
  let out = b.map(v=>v as V3);
  for(let i=0;i<rx;i++) out = out.map(rotX90);
  for(let i=0;i<ry;i++) out = out.map(rotY90);
  for(let i=0;i<rz;i++) out = out.map(rotZ90);
  return out;
}

export function rotate90(b:V3[], steps:[number,number,number]):V3[]{
  return applyRotations(b, steps[0]%4, steps[1]%4, steps[2]%4);
}

export function equalUnderAnyRotation(a:V3[], b:V3[]): boolean {
  // vergleiche Mengen (mit Rundung)
  const kset = (arr:V3[]) => {
    const s = new Set<string>();
    for (const [x,y,z] of arr) s.add(`${Math.round(x*1e6)}|${Math.round(y*1e6)}|${Math.round(z*1e6)}`);
    return s;
  };
  const kb = kset(b);
  for (let rx=0; rx<4; rx++){
    for (let ry=0; ry<4; ry++){
      for (let rz=0; rz<4; rz++){
        const ar = applyRotations(a, rx, ry, rz);
        const ka = kset(ar);
        if (ka.size !== kb.size) continue;
        let ok = true;
        for (const k of ka) if (!kb.has(k)) { ok=false; break; }
        if (ok) return true;
      }
    }
  }
  return false;
}

// ---------- Polykuben-Generator (zusammenhängend) ----------
export function genPolyCube(n: number): V3[] {
  const set = new Map<string,V3>();
  set.set('0|0|0',[0,0,0]);
  while (set.size < n) {
    const arr = Array.from(set.values());
    const seed = arr[Math.floor(Math.random()*arr.length)];
    const dir = DIRS[Math.floor(Math.random()*DIRS.length)];
    const nxt = add(seed, dir);
    const k = key(nxt);
    if (!set.has(k)) set.set(k, nxt);
  }
  return normalize(Array.from(set.values()));
}

// ---------- High-level: Shape erzeugen mit Eindeutigkeit ----------
export function genComplexShape(minCubes=8, maxCubes=12): V3[] {
  const target = Math.floor(Math.random()*(maxCubes-minCubes+1))+minCubes;
  return genPolyCube(target);
}
