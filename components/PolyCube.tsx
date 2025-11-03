import * as React from 'react';
import * as THREE from 'three';
import { type V3 } from '../lib/shapes3d';
import { useMemo } from 'react';

type Props = {
  blocks: V3[];
  color?: string;     // Flächenfarbe
  edge?: string;      // Kantenfarbe
  unit?: number;
};

export default function PolyCube({ blocks, color='#87B0FF', edge='#ffffff', unit=1 }: Props){
  const geom = useMemo(()=> new THREE.BoxGeometry(unit,unit,unit), [unit]);
  const mat  = useMemo(()=> new THREE.MeshStandardMaterial({ color, metalness:0.1, roughness:0.45 }), [color]);
  const edges= useMemo(()=> new THREE.EdgesGeometry(geom), [geom]);
  const edgeMat = useMemo(()=> new THREE.LineBasicMaterial({ color: edge, linewidth: 1 }), [edge]);

  return (
    <group>
      {blocks.map((b,i)=>(
        <group key={i} position={[b[0]*unit, b[1]*unit, b[2]*unit]}>
          <mesh geometry={geom} material={mat} castShadow receiveShadow />
          <lineSegments geometry={edges} material={edgeMat} />
        </group>
      ))}
    </group>
  );
}
