/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const MAX_NEIGHBOR_DISTANCE = 14.0;

function buildDatasetForFolder(folderName) {
  const folderPath = path.join(DATA_DIR, folderName);
  if (!fs.existsSync(folderPath)) return;

  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const stationDirs = entries
    .filter(e => e.isDirectory() && e.name.startsWith('Station_'))
    .map(e => e.name)
    .sort((a, b) => {
      const numA = parseInt(a.replace('Station_', ''), 10);
      const numB = parseInt(b.replace('Station_', ''), 10);
      return numA - numB;
    });

  const rawStations = [];

  stationDirs.forEach((stationDirName) => {
    const stationId = parseInt(stationDirName.replace('Station_', ''), 10);
    const stationPath = path.join(folderPath, stationDirName);
    const files = fs.readdirSync(stationPath);
    const infFile = files.find(f => f.endsWith('.inf'));

    if (infFile) {
      const content = fs.readFileSync(path.join(stationPath, infFile), 'utf-8');
      
      const xMatch = content.match(/pose\.translation\.x\s*=\s*([-\d.eE]+)/);
      const yMatch = content.match(/pose\.translation\.y\s*=\s*([-\d.eE]+)/);
      const zMatch = content.match(/pose\.translation\.z\s*=\s*([-\d.eE]+)/);
      const rwMatch = content.match(/pose\.rotation\.w\s*=\s*([-\d.eE]+)/);
      const rxMatch = content.match(/pose\.rotation\.x\s*=\s*([-\d.eE]+)/);
      const ryMatch = content.match(/pose\.rotation\.y\s*=\s*([-\d.eE]+)/);
      const rzMatch = content.match(/pose\.rotation\.z\s*=\s*([-\d.eE]+)/);
      const nameMatch = content.match(/name\s*=\s*(.+)/);

      if (xMatch && yMatch && zMatch) {
        rawStations.push({
          id: stationId,
          name: `Station ${String(stationId).padStart(2, '0')}`,
          infFile: infFile,
          sensorName: nameMatch ? nameMatch[1].trim() : stationDirName,
          panoramaUrl: `/data/${folderName}/${stationDirName}/pano_station_${String(stationId).padStart(2, '0')}.jpg`,
          position: {
            x: parseFloat(xMatch[1]),
            y: parseFloat(yMatch[1]),
            z: parseFloat(zMatch[1])
          },
          rotation: {
            w: rwMatch ? parseFloat(rwMatch[1]) : 1,
            x: rxMatch ? parseFloat(rxMatch[1]) : 0,
            y: ryMatch ? parseFloat(ryMatch[1]) : 0,
            z: rzMatch ? parseFloat(rzMatch[1]) : 0,
          },
          yaw: 0
        });
      }
    }
  });

  const stations = rawStations.map(station => {
    const distances = rawStations
      .filter(other => other.id !== station.id)
      .map(other => {
        const dx = other.position.x - station.position.x;
        const dy = other.position.y - station.position.y;
        const dz = other.position.z - station.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return { id: other.id, dist };
      })
      .sort((a, b) => a.dist - b.dist);

    let nearby = distances.filter(d => d.dist <= MAX_NEIGHBOR_DISTANCE);
    if (nearby.length < 2) {
      nearby = distances.slice(0, 2);
    }
    nearby = nearby.slice(0, 4);

    return {
      ...station,
      connections: nearby.map(c => c.id).sort((a, b) => a - b)
    };
  });

  const outputPath = path.join(folderPath, 'stations.json');
  fs.writeFileSync(outputPath, JSON.stringify(stations, null, 2));
  console.log(`✅ Dataset '${folderName}' (${stations.length} stations) généré avec succès: ${outputPath}`);
}

function main() {
  const folders = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  folders.forEach(folder => {
    buildDatasetForFolder(folder);
  });
}

main();
