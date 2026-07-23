import Viewer3D, { ZoneData } from '@/components/Viewer3D';
import { promises as fs } from 'fs';
import path from 'path';

async function loadZones(): Promise<ZoneData[]> {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const entries = await fs.readdir(dataDir, { withFileTypes: true });

  const cuveDirs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('Cuve_'))
    .map((e) => e.name)
    .sort((a, b) => {
      const numA = parseInt(a.replace('Cuve_', ''), 10);
      const numB = parseInt(b.replace('Cuve_', ''), 10);
      return numA - numB;
    });

  const zones: ZoneData[] = [];

  // Load PanoramasExterieur
  try {
    const extJson = await fs.readFile(
      path.join(dataDir, 'PanoramasExterieur', 'stations.json'),
      'utf-8'
    );
    zones.push({
      id: 'PanoramasExterieur',
      name: 'Panoramas Extérieurs',
      level: 'Niveau 0 (Sol / Extérieur)',
      stations: JSON.parse(extJson),
    });
  } catch {
    // Ignore
  }

  // Load all Cuve directories dynamically
  for (const dirName of cuveDirs) {
    const jsonPath = path.join(dataDir, dirName, 'stations.json');
    const num = dirName.replace('Cuve_', '');
    try {
      const fileContents = await fs.readFile(jsonPath, 'utf-8');
      const stations = JSON.parse(fileContents);
      const firstStationPos = stations[0]?.position || { x: 0, y: 0 };
      zones.push({
        id: dirName,
        name: `Cuve ${num}`,
        level: 'Niveau -1 (Cuves)',
        stations,
        exteriorCoords: { x: firstStationPos.x, y: firstStationPos.y },
      });
    } catch {
      // Ignore
    }
  }

  return zones;
}


export default async function VisitePage() {
  const zones = await loadZones();

  return (
    <main className="w-full h-screen">
      <Viewer3D zones={zones} />
    </main>
  );
}


