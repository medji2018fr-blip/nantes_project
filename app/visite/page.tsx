import Viewer3D from '@/components/Viewer3D';
import { promises as fs } from 'fs';
import path from 'path';

export default async function VisitePage() {
  const filePath = path.join(
    process.cwd(),
    'public',
    'data',
    'PanoramasExterieur',
    'stations.json'
  );
  const fileContents = await fs.readFile(filePath, 'utf-8');
  const stations = JSON.parse(fileContents);

  return (
    <main>
      <Viewer3D stations={stations} />
    </main>
  );
}
