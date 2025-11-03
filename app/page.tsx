'use client';
import dynamic from 'next/dynamic';

// SSR aus für Three.js Canvas
const MentalRotation3D_OneShot = dynamic(() => import('../components/MentalRotation3D_OneShot'), { ssr: false });

export default function Page() {
  return (
    <main style={{minHeight:'100vh', background:'#0B1220', color:'#E6EDF3', padding:'24px'}}>
      <h1 style={{fontSize:28, fontWeight:700, marginBottom:8}}>Mentale Rotation – 3D (Gleich/Verschieden)</h1>
      <p style={{opacity:.8, marginBottom:24}}>
        Beurteile, ob das Prüfobjekt rechts die <b>gleiche Form</b> ist wie das Ziel links (nur gedreht) – oder <b>verschieden</b>.
      </p>
      <MentalRotation3D_OneShot />
    </main>
  );
}
