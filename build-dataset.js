/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(process.cwd(), 'public', 'data', 'PanoramasExterieur');
const TOTAL_STATIONS = 21; 
const rawStations = [];

for (let i = 1; i <= TOTAL_STATIONS; i++) {
  const stationStr = String(i).padStart(2, '0');
  const stationDir = path.join(BASE_DIR, `Station_${stationStr}`);

  if (fs.existsSync(stationDir)) {
    const files = fs.readdirSync(stationDir);
    const infFile = files.find(f => f.endsWith('.inf'));

    if (infFile) {
      const content = fs.readFileSync(path.join(stationDir, infFile), 'utf-8');
      
      const xMatch = content.match(/pose\.translation\.x\s*=\s*([-\d.eE]+)/);
      const yMatch = content.match(/pose\.translation\.y\s*=\s*([-\d.eE]+)/);
      const zMatch = content.match(/pose\.translation\.z\s*=\s*([-\d.eE]+)/);

      if (xMatch && yMatch && zMatch) {
        rawStations.push({
          id: i,
          name: `Station ${stationStr}`,
          panoramaUrl: `/data/PanoramasExterieur/Station_${stationStr}/pano_station_${stationStr}.jpg`,
          position: {
            x: parseFloat(xMatch[1]),
            y: parseFloat(yMatch[1]),
            z: parseFloat(zMatch[1])
          },
          yaw: 0
        });
      }
    }
  }
}

// Calculate neighbor connections (within ~14 meters or top 3 nearest)
const MAX_NEIGHBOR_DISTANCE = 14.0;

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

const outputPath = path.join(BASE_DIR, 'stations.json');
fs.writeFileSync(outputPath, JSON.stringify(stations, null, 2));
console.log(`✅ Dataset généré avec succès avec yaw = 0 et connexions propres : ${outputPath}`);
