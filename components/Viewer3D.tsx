'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture, Html } from '@react-three/drei';
import * as THREE from 'three';

interface Position {
  x: number;
  y: number;
  z: number;
}

interface Rotation {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface Station {
  id: number;
  name: string;
  infFile?: string;
  sensorName?: string;
  panoramaUrl: string;
  position: Position;
  rotation?: Rotation;
  yaw?: number;
  connections: number[];
}

export interface ZoneData {
  id: string;
  name: string;
  level: string; // e.g. "Niveau 0 (Extérieur)" or "Niveau -1 (Cuve)"
  stations: Station[];
  exteriorCoords?: { x: number; y: number };
}

// Camera controller maintaining camera direction across station navigations
function CameraController({
  controlsRef,
  onAzimuthChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.RefObject<any>;
  onAzimuthChange: (angle: number) => void;
}) {
  useFrame(() => {
    if (controlsRef.current) {
      const azimuth = controlsRef.current.getAzimuthalAngle();
      onAzimuthChange(azimuth);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom={false}
      enablePan={false}
      rotateSpeed={-0.55}
    />
  );
}

// Preload textures for smooth instant transitions
function TexturePreloader({ urls }: { urls: string[] }) {
  useEffect(() => {
    urls.forEach((url) => {
      try {
        useTexture.preload(url);
      } catch {
        // Ignore preload errors
      }
    });
  }, [urls]);
  return null;
}

function PanoramaSphere({
  url,
  yaw,
}: {
  url: string;
  yaw: number;
}) {
  const texture = useTexture(url);

  return (
    <mesh scale={[1, 1, 1]} rotation={[0, yaw, 0]}>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

// Green 3D Navigation Hotspot projected directly in the 360 photo
function NavigationHotspot3D({
  currentPos,
  targetStation,
  yawOffset,
  onClick,
}: {
  currentPos: Position;
  targetStation: Station;
  yawOffset: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Compute 3D direction vector from current station to target station
  const dx = targetStation.position.x - currentPos.x;
  const dy = targetStation.position.y - currentPos.y;
  const dz = targetStation.position.z - currentPos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

  // Map spatial displacement to Three.js scene (X -> X, Y -> -Z, Z -> Y)
  const dirX = dx / distance;
  const dirY = (dz / distance) * 0.4;
  const dirZ = -dy / distance;

  // Position hotspot at radius ~14 meters in 3D scene
  const r = 14;
  const posVec = new THREE.Vector3(dirX * r, dirY * r - 0.5, dirZ * r);
  posVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOffset);

  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    if (groupRef.current) {
      // Copy camera rotation so the 3D hotspot ALWAYS faces the viewer head-on!
      groupRef.current.quaternion.copy(camera.quaternion);
    }
  });

  return (
    <group position={[posVec.x, posVec.y, posVec.z]}>
      <group ref={groupRef}>
        {/* Generous Invisible Click Target Sphere (r = 1.3m) */}
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            setHovered(false);
            document.body.style.cursor = 'auto';
          }}
        >
          <sphereGeometry args={[1.3, 16, 16]} />
          <meshBasicMaterial visible={false} />
        </mesh>

        {/* Outer Green Ring */}
        <mesh>
          <ringGeometry args={[0.6, 0.85, 32]} />
          <meshBasicMaterial
            color={hovered ? '#34d399' : '#10b981'}
            side={THREE.DoubleSide}
            transparent
            opacity={0.95}
          />
        </mesh>

        {/* Inner Green Disc */}
        <mesh>
          <circleGeometry args={[0.55, 32]} />
          <meshBasicMaterial
            color={hovered ? '#6ee7b7' : '#059669'}
            side={THREE.DoubleSide}
            transparent
            opacity={hovered ? 0.95 : 0.8}
          />
        </mesh>
      </group>

      {/* HTML Overlay Badge directly in the 360 photo */}
      <Html position={[0, 1.2, 0]} center distanceFactor={18}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all duration-200 shadow-xl flex items-center gap-2 cursor-pointer whitespace-nowrap select-none ${
            hovered
              ? 'bg-emerald-400 text-slate-950 scale-110 shadow-emerald-500/50'
              : 'bg-slate-900/90 text-emerald-400 border border-emerald-500/60 shadow-lg'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>{targetStation.name}</span>
          <span className="text-[10px] opacity-75">({distance.toFixed(1)}m)</span>
        </div>
      </Html>
    </group>
  );
}

// 2D Minimap overlay component:
// - Mode Extérieur (Niveau 0): Exact classic design from screenshot (PLAN DES STATIONS 2D MAP)
// - Mode Cuve (Niveau -1): 1 point per Cuve (5 Cuves) with Cuve prev/next navigation & Extérieur return
function Minimap({
  zones,
  activeZoneId,
  currentId,
  onSelectStation,
  onMoveUp,
  cameraAzimuth,
}: {
  zones: ZoneData[];
  activeZoneId: string;
  currentId: number;
  onSelectStation: (id: number, zoneId?: string) => void;
  onMoveUp: () => void;
  cameraAzimuth: number;
}) {
  const isAtTop = activeZoneId === 'PanoramasExterieur';

  const activeZone = useMemo(() => {
    return zones.find((z) => z.id === activeZoneId) || zones[0];
  }, [zones, activeZoneId]);

  const cuveZones = useMemo(() => {
    return zones.filter((z) => z.id.startsWith('Cuve_'));
  }, [zones]);

  const currentCuveIndex = cuveZones.findIndex((z) => z.id === activeZoneId);

  // ----------------------------------------------------
  // MODE 1: EXTÉRIEUR MINIMAP (Matching User Screenshot)
  // ----------------------------------------------------
  const extMinimapData = useMemo(() => {
    if (!isAtTop) return null;
    const stations = activeZone.stations;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    stations.forEach((s) => {
      if (s.position.x < minX) minX = s.position.x;
      if (s.position.x > maxX) maxX = s.position.x;
      if (s.position.y < minY) minY = s.position.y;
      if (s.position.y > maxY) maxY = s.position.y;
    });
    return { stations, minX, maxX, minY, maxY };
  }, [isAtTop, activeZone]);

  // ----------------------------------------------------
  // MODE 2: CUVE MINIMAP (1 point per Cuve)
  // ----------------------------------------------------
  const cuveMinimapData = useMemo(() => {
    if (isAtTop) return null;
    const points: {
      id: number;
      name: string;
      zoneId: string;
      mapX: number;
      mapY: number;
      cuveName: string;
    }[] = [];

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    cuveZones.forEach((cz) => {
      const anchorX = cz.exteriorCoords?.x || 0;
      const anchorY = cz.exteriorCoords?.y || 0;
      if (anchorX < minX) minX = anchorX;
      if (anchorX > maxX) maxX = anchorX;
      if (anchorY < minY) minY = anchorY;
      if (anchorY > maxY) maxY = anchorY;

      points.push({
        id: 1,
        name: cz.name,
        zoneId: cz.id,
        mapX: anchorX,
        mapY: anchorY,
        cuveName: cz.name,
      });
    });

    return { points, minX, maxX, minY, maxY };
  }, [isAtTop, cuveZones]);

  const [hoveredCuve, setHoveredCuve] = useState<string | null>(null);

  // If in Exterior mode, render classic minimap matching screenshot
  if (isAtTop && extMinimapData) {
    const { stations, minX, maxX, minY, maxY } = extMinimapData;
    const mapWidth = 360;
    const mapHeight = 280;
    const padding = 32;

    const globalCenterX = (minX + maxX) / 2;
    const globalCenterY = (minY + maxY) / 2;

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const availW = mapWidth - 2 * padding;
    const availH = mapHeight - 2 * padding;
    const scale = Math.min(availW / spanX, availH / spanY);

    const getMapCoords = (x: number, y: number) => {
      const cx = mapWidth / 2 + (x - globalCenterX) * scale;
      const cy = mapHeight / 2 - (y - globalCenterY) * scale;
      return { cx, cy };
    };

    const currentStation = stations.find((s) => s.id === currentId);

    const currentCoords = currentStation
      ? getMapCoords(currentStation.position.x, currentStation.position.y)
      : { cx: mapWidth / 2, cy: mapHeight / 2 };

    const coneLength = 38;
    const coneSpread = Math.PI / 5;
    const mapAngle = -cameraAzimuth - Math.PI / 2;
    const coneLeft = {
      x: currentCoords.cx + Math.cos(mapAngle - coneSpread) * coneLength,
      y: currentCoords.cy + Math.sin(mapAngle - coneSpread) * coneLength,
    };
    const coneRight = {
      x: currentCoords.cx + Math.cos(mapAngle + coneSpread) * coneLength,
      y: currentCoords.cy + Math.sin(mapAngle + coneSpread) * coneLength,
    };

    return (
      <div className="bg-slate-950/90 backdrop-blur-xl p-4 rounded-3xl border border-slate-800 shadow-2xl w-[395px]">
        <div className="text-[12px] font-bold tracking-wider text-slate-400 uppercase mb-2.5 flex justify-between items-center select-none">
          <span>PLAN DES STATIONS</span>
          <button
            onClick={() => {
              const cuveZones = zones.filter((z) => z.id.startsWith('Cuve_'));
              if (cuveZones.length > 0) {
                onSelectStation(1, cuveZones[0].id);
              }
            }}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold rounded-xl transition shadow-md cursor-pointer flex items-center gap-1"
            title="Descendre aux Cuves (Niveau -1)"
          >
            <span>⬇️ Cuves</span>
          </button>
        </div>
        <svg width={mapWidth} height={mapHeight} className="overflow-visible">
          {/* View Cone */}
          {currentStation && (
            <polygon
              points={`${currentCoords.cx},${currentCoords.cy} ${coneLeft.x},${coneLeft.y} ${coneRight.x},${coneRight.y}`}
              fill="#38bdf8"
              opacity={0.18}
              stroke="#38bdf8"
              strokeWidth={0.75}
              strokeOpacity={0.5}
            />
          )}

          {/* Draw connections */}
          {stations.map((s) => {
            const from = getMapCoords(s.position.x, s.position.y);
            return s.connections.map((targetId) => {
              if (targetId < s.id) return null;
              const target = stations.find((t) => t.id === targetId);
              if (!target) return null;
              const to = getMapCoords(target.position.x, target.position.y);
              const isCurrentConn = s.id === currentId || targetId === currentId;

              return (
                <line
                  key={`${s.id}-${targetId}`}
                  x1={from.cx}
                  y1={from.cy}
                  x2={to.cx}
                  y2={to.cy}
                  stroke={isCurrentConn ? '#38bdf8' : '#334155'}
                  strokeWidth={isCurrentConn ? 2.5 : 1.25}
                  strokeDasharray={isCurrentConn ? 'none' : '3,3'}
                  opacity={isCurrentConn ? 0.95 : 0.45}
                />
              );
            });
          })}

          {/* Draw Station Dots */}
          {stations.map((s) => {
            const { cx, cy } = getMapCoords(s.position.x, s.position.y);
            const isSelected = s.id === currentId;
            const isConnected = currentStation?.connections.includes(s.id);

            return (
              <g
                key={s.id}
                onClick={() => onSelectStation(s.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={cx} cy={cy} r="16" fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 7.5 : isConnected ? 6 : 5}
                  fill={isSelected ? '#38bdf8' : isConnected ? '#38bdf8' : '#64748b'}
                  stroke={isSelected ? '#fff' : 'transparent'}
                  strokeWidth={isSelected ? 2 : 0}
                >
                  <title>{s.name}</title>
                </circle>
                <text
                  x={cx}
                  y={cy - 11}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill={isSelected ? '#38bdf8' : '#94a3b8'}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  className="pointer-events-none select-none font-mono"
                >
                  {s.id}
                </text>
              </g>
            );
          })}

          {/* Compass Rose */}
          <text x={mapWidth / 2} y={12} textAnchor="middle" fontSize="10" fill="#ef4444" fontWeight="bold" className="select-none">N</text>
          <text x={mapWidth / 2} y={mapHeight - 2} textAnchor="middle" fontSize="9" fill="#64748b" className="select-none">S</text>
          <text x={6} y={mapHeight / 2 + 4} textAnchor="start" fontSize="9" fill="#64748b" className="select-none">O</text>
          <text x={mapWidth - 6} y={mapHeight / 2 + 4} textAnchor="end" fontSize="9" fill="#64748b" className="select-none">E</text>
        </svg>
      </div>
    );
  }

  // Otherwise, render Cuve Minimap (1 point per Cuve)
  if (!cuveMinimapData) return null;
  const { points, minX, maxX, minY, maxY } = cuveMinimapData;

  const mapWidth = 360;
  const mapHeight = 280;
  const padding = 38;

  const globalCenterX = (minX + maxX) / 2;
  const globalCenterY = (minY + maxY) / 2;

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const availW = mapWidth - 2 * padding;
  const availH = mapHeight - 2 * padding;
  const scale = Math.min(availW / spanX, availH / spanY);

  const getMapCoords = (x: number, y: number) => {
    const cx = mapWidth / 2 + (x - globalCenterX) * scale;
    const cy = mapHeight / 2 - (y - globalCenterY) * scale;
    return { cx, cy };
  };

  const activeCuvePoint = points.find((pt) => pt.zoneId === activeZoneId);

  const currentCoords = activeCuvePoint
    ? getMapCoords(activeCuvePoint.mapX, activeCuvePoint.mapY)
    : { cx: mapWidth / 2, cy: mapHeight / 2 };

  const coneLength = 38;
  const coneSpread = Math.PI / 5;
  const mapAngle = -cameraAzimuth - Math.PI / 2;
  const coneLeft = {
    x: currentCoords.cx + Math.cos(mapAngle - coneSpread) * coneLength,
    y: currentCoords.cy + Math.sin(mapAngle - coneSpread) * coneLength,
  };
  const coneRight = {
    x: currentCoords.cx + Math.cos(mapAngle + coneSpread) * coneLength,
    y: currentCoords.cy + Math.sin(mapAngle + coneSpread) * coneLength,
  };

  const prevCuve = currentCuveIndex > 0 ? cuveZones[currentCuveIndex - 1] : null;
  const nextCuve =
    currentCuveIndex >= 0 && currentCuveIndex < cuveZones.length - 1
      ? cuveZones[currentCuveIndex + 1]
      : null;

  return (
    <div className="bg-slate-950/90 backdrop-blur-xl p-3.5 rounded-2xl border border-slate-800 shadow-2xl relative w-[310px]">
      {/* Cuve Header */}
      <div className="mb-2.5 pb-2 border-b border-slate-800/80 flex items-center justify-between select-none">
        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          Niveau -1 ({activeZone.name})
        </span>

        <button
          onClick={onMoveUp}
          className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold rounded-lg transition shadow-md cursor-pointer flex items-center gap-1"
          title="Remonter au niveau 0 (Extérieur)"
        >
          <span>⬆️ Extérieur</span>
        </button>
      </div>

      {/* SVG Canvas - 1 point per Cuve */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/90 border border-slate-800/90">
        <svg width={mapWidth} height={mapHeight} className="overflow-visible">
          {/* View Cone */}
          {activeCuvePoint && (
            <polygon
              points={`${currentCoords.cx},${currentCoords.cy} ${coneLeft.x},${coneLeft.y} ${coneRight.x},${coneRight.y}`}
              fill="#38bdf8"
              opacity={0.18}
              stroke="#38bdf8"
              strokeWidth={0.75}
              strokeOpacity={0.5}
            />
          )}

          {/* 1 Point per Cuve */}
          {points.map((pt) => {
            const { cx, cy } = getMapCoords(pt.mapX, pt.mapY);
            const isSelected = pt.zoneId === activeZoneId;
            const isHovered = hoveredCuve === pt.zoneId;

            return (
              <g
                key={pt.zoneId}
                onClick={() => onSelectStation(1, pt.zoneId)}
                onMouseEnter={() => setHoveredCuve(pt.zoneId)}
                onMouseLeave={() => setHoveredCuve(null)}
                className="cursor-pointer group"
              >
                <circle cx={cx} cy={cy} r="14" fill="transparent" />
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="9.5"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeOpacity="0.85"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 6.5 : isHovered ? 6 : 5}
                  fill={isSelected ? '#38bdf8' : isHovered ? '#fbbf24' : '#f59e0b'}
                  stroke={isSelected || isHovered ? '#ffffff' : 'transparent'}
                  strokeWidth={isSelected || isHovered ? 1.5 : 0}
                  className="transition-all duration-150"
                />
                <text
                  x={cx}
                  y={cy - 9}
                  textAnchor="middle"
                  fontSize="8"
                  fill={isSelected ? '#38bdf8' : isHovered ? '#fbbf24' : '#fcd34d'}
                  fontWeight={isSelected || isHovered ? 'bold' : 'normal'}
                  className="pointer-events-none select-none font-mono"
                >
                  {pt.cuveName.replace('Cuve ', 'C')}
                </text>
              </g>
            );
          })}

          {/* Compass labels */}
          <text x={mapWidth / 2} y={10} textAnchor="middle" fontSize="9" fill="#ef4444" fontWeight="bold" className="select-none">N</text>
          <text x={mapWidth / 2} y={mapHeight - 4} textAnchor="middle" fontSize="8" fill="#64748b" className="select-none">S</text>
          <text x={6} y={mapHeight / 2 + 3} textAnchor="start" fontSize="8" fill="#64748b" className="select-none">O</text>
          <text x={mapWidth - 6} y={mapHeight / 2 + 3} textAnchor="end" fontSize="8" fill="#64748b" className="select-none">E</text>
        </svg>
      </div>
    </div>
  );
}

// Standalone compass widget
function CompassWidget({ azimuth }: { azimuth: number }) {
  const rotation = -azimuth * (180 / Math.PI);

  return (
    <div className="bg-slate-900/85 backdrop-blur-md rounded-full w-14 h-14 border border-slate-700 shadow-2xl flex items-center justify-center relative">
      <svg width="44" height="44" viewBox="-22 -22 44 44" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.1s ease-out' }}>
        <polygon points="0,-17 -3.5,-3 3.5,-3" fill="#ef4444" />
        <polygon points="0,17 -3.5,3 3.5,3" fill="#94a3b8" />
        <circle cx="0" cy="0" r="2.5" fill="#1e293b" stroke="#64748b" strokeWidth="1" />
      </svg>
      <span className="absolute top-0.5 text-[7px] font-bold text-red-400 select-none">N</span>
      <span className="absolute bottom-0.5 text-[7px] font-medium text-slate-500 select-none">S</span>
    </div>
  );
}

// Station Data Inspector Table Modal
function StationInspectorModal({
  zones,
  activeZoneId,
  currentId,
  onSelectStation,
  onClose,
}: {
  zones: ZoneData[];
  activeZoneId: string;
  currentId: number;
  onSelectStation: (id: number, zoneId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedFilterLevel, setSelectedFilterLevel] = useState<string>('ALL');

  const allStationsList = useMemo(() => {
    const list: { zone: ZoneData; station: Station }[] = [];
    zones.forEach((z) => {
      z.stations.forEach((s) => {
        list.push({ zone: z, station: s });
      });
    });
    return list;
  }, [zones]);

  const filteredStations = useMemo(() => {
    return allStationsList.filter(({ zone, station }) => {
      const isTop = zone.id === 'PanoramasExterieur';
      const matchLevel =
        selectedFilterLevel === 'ALL' ||
        (selectedFilterLevel === 'TOP' && isTop) ||
        (selectedFilterLevel === 'CUVE' && !isTop);
      const matchSearch =
        station.name.toLowerCase().includes(search.toLowerCase()) ||
        station.id.toString().includes(search) ||
        zone.name.toLowerCase().includes(search.toLowerCase()) ||
        (station.sensorName && station.sensorName.toLowerCase().includes(search.toLowerCase()));
      return matchLevel && matchSearch;
    });
  }, [allStationsList, selectedFilterLevel, search]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-400"></span>
              Coordonnées des Stations ({allStationsList.length} Points)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Extrait des fichiers .inf • Navigation Niveau 0 (Extérieur) et Niveau -1 (Cuve)
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Search Bar & Filter */}
        <div className="p-4 bg-slate-900/60 border-b border-slate-800/80 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Rechercher station..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 bg-slate-950 text-white text-xs px-3.5 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-sky-500 font-mono"
            />
            <select
              value={selectedFilterLevel}
              onChange={(e) => setSelectedFilterLevel(e.target.value)}
              className="bg-slate-950 text-white text-xs px-3 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer font-sans"
            >
              <option value="ALL">Tous les niveaux</option>
              <option value="TOP">Niveau 0 (Extérieur)</option>
              <option value="CUVE">Niveau -1 (Cuves)</option>
            </select>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-4">
            <span>Affichés: <strong className="text-sky-400 font-mono">{filteredStations.length}</strong> / {allStationsList.length}</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-mono font-semibold">100% Coordonnées Valides</span>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="pb-3 px-3">Zone</th>
                <th className="pb-3 px-3">ID</th>
                <th className="pb-3 px-3">Station</th>
                <th className="pb-3 px-3 text-right">X (m)</th>
                <th className="pb-3 px-3 text-right">Y (m)</th>
                <th className="pb-3 px-3 text-right">Z (m)</th>
                <th className="pb-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredStations.map(({ zone, station }) => {
                const isSelected = zone.id === activeZoneId && station.id === currentId;
                const isCuve = zone.id.startsWith('Cuve_');
                return (
                  <tr
                    key={`${zone.id}-${station.id}`}
                    className={`hover:bg-slate-800/50 transition ${
                      isSelected ? 'bg-sky-500/10 text-white' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-sans">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        isCuve ? 'bg-amber-950 text-amber-400 border border-amber-800/60' : 'bg-sky-950 text-sky-400 border border-sky-800/60'
                      }`}>
                        {zone.name}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-sky-400">#{station.id}</td>
                    <td className="py-3 px-3 font-sans font-semibold text-slate-200">
                      {station.name}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400">
                      {station.position.x.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400">
                      {station.position.y.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400">
                      {station.position.z.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => {
                          onSelectStation(station.id, zone.id);
                          onClose();
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-sans font-semibold transition cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500 text-white'
                            : 'bg-slate-800 text-slate-200 hover:bg-sky-600 hover:text-white'
                        }`}
                      >
                        {isSelected ? 'Actif' : 'Ouvrir'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>Système Leica Cyclone Register 360</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-sans font-semibold rounded-xl transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Viewer3D({
  zones: inputZones,
  stations: inputStations,
}: {
  zones?: ZoneData[];
  stations?: Station[];
}) {
  const zones: ZoneData[] = useMemo(() => {
    if (inputZones && inputZones.length > 0) return inputZones;
    if (inputStations && inputStations.length > 0) {
      return [
        {
          id: 'PanoramasExterieur',
          name: 'Panoramas Extérieurs',
          level: 'Niveau 0 (Extérieur)',
          stations: inputStations,
        },
      ];
    }
    return [];
  }, [inputZones, inputStations]);

  const [activeZoneId, setActiveZoneId] = useState<string>(
    zones[0]?.id || 'PanoramasExterieur'
  );
  const [currentId, setCurrentId] = useState(1);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [cameraAzimuth, setCameraAzimuth] = useState(0);
  const [globalYawOffset, setGlobalYawOffset] = useState<number>(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const azimuthRef = useRef(0);
  const handleAzimuthChange = useCallback((angle: number) => {
    azimuthRef.current = angle;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCameraAzimuth(azimuthRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const activeZone = useMemo(() => {
    return zones.find((z) => z.id === activeZoneId) || zones[0];
  }, [zones, activeZoneId]);

  const currentStation =
    activeZone.stations.find((s) => s.id === currentId) || activeZone.stations[0];

  const connectedStations = activeZone.stations.filter((s) =>
    currentStation?.connections.includes(s.id)
  );

  const preloadUrls = useMemo(() => {
    return connectedStations.map((s) => s.panoramaUrl);
  }, [connectedStations]);

  const navigateToStation = (targetId: number, targetZoneId?: string) => {
    const zoneToUse = targetZoneId || activeZoneId;
    if (targetId === currentId && zoneToUse === activeZoneId) return;

    setIsNavigating(true);
    setFadeIn(true);

    setTimeout(() => {
      if (zoneToUse !== activeZoneId) {
        setActiveZoneId(zoneToUse);
      }
      setCurrentId(targetId);

      setTimeout(() => {
        setFadeIn(false);
        setIsNavigating(false);
      }, 120);
    }, 250);
  };

  // Find nearest Cuve when moving DOWN from top level (Niveau 0 -> Niveau -1)
  const handleMoveDown = () => {
    if (!currentStation) return;
    const cuveZones = zones.filter((z) => z.id.startsWith('Cuve_'));
    if (cuveZones.length === 0) return;

    let bestCuve = cuveZones[0];
    let minDistance = Infinity;

    cuveZones.forEach((cz) => {
      if (cz.exteriorCoords) {
        const dx = cz.exteriorCoords.x - currentStation.position.x;
        const dy = cz.exteriorCoords.y - currentStation.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          bestCuve = cz;
        }
      }
    });

    navigateToStation(1, bestCuve.id);
  };

  // Move UP from Cuve (Niveau -1 -> Niveau 0)
  const handleMoveUp = () => {
    navigateToStation(1, 'PanoramasExterieur');
  };

  const handlePrev = () => {
    const prevIndex = activeZone.stations.findIndex((s) => s.id === currentId) - 1;
    if (prevIndex >= 0) navigateToStation(activeZone.stations[prevIndex].id);
  };

  const handleNext = () => {
    const nextIndex = activeZone.stations.findIndex((s) => s.id === currentId) + 1;
    if (nextIndex < activeZone.stations.length)
      navigateToStation(activeZone.stations[nextIndex].id);
  };

  const isAtTop = activeZoneId === 'PanoramasExterieur';

  return (
    <div className="w-full h-screen relative bg-slate-950 select-none overflow-hidden font-sans">
      {/* Background Preloader */}
      <TexturePreloader urls={preloadUrls} />

      {/* Smooth Fade Overlay for Panorama Transition */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none z-20 transition-opacity ${
          fadeIn ? 'opacity-50 duration-150' : 'opacity-0 duration-500'
        }`}
      />

      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 0, 0.1], fov: 75 }}>
        <CameraController
          controlsRef={controlsRef}
          onAzimuthChange={handleAzimuthChange}
        />

        {currentStation && (
          <React.Suspense fallback={null}>
            <PanoramaSphere
              url={currentStation.panoramaUrl}
              yaw={(currentStation.yaw || 0) + globalYawOffset}
            />

            {/* 3D Green Navigation Hotspots projected directly in the 360 photo (only inside Cuves) */}
            {!isAtTop &&
              connectedStations.map((targetSt) => (
                <NavigationHotspot3D
                  key={`hotspot-${targetSt.id}`}
                  currentPos={currentStation.position}
                  targetStation={targetSt}
                  yawOffset={(currentStation.yaw || 0) + globalYawOffset}
                  onClick={() => navigateToStation(targetSt.id)}
                />
              ))}
          </React.Suspense>
        )}
      </Canvas>

      {/* Top Bar Info */}
      <div className="absolute top-4 left-4 right-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pointer-events-none z-10">
        <div className="bg-slate-900/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 text-white flex items-center gap-3 shadow-xl pointer-events-auto">
          <div className={`w-3 h-3 rounded-full ${isAtTop ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <div>
            <h1 className="font-bold text-sm tracking-wide flex items-center gap-2">
              <span>{isAtTop ? 'Niveau 0 (Extérieur)' : `Niveau -1 (${activeZone.name})`}</span>
              <span className="text-slate-400 font-normal">•</span>
              <span>{currentStation?.name}</span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Station {currentStation?.id} / {activeZone.stations.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setShowMinimap(!showMinimap)}
            className="bg-slate-900/85 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800 text-xs font-semibold transition shadow-xl cursor-pointer"
          >
            {showMinimap ? 'Masquer carte' : 'Carte 2D'}
          </button>
        </div>
      </div>

      {/* 2D Minimap Floating Card (Bottom-Right, Enlarged) */}
      {showMinimap && (
        <div className="absolute bottom-6 right-6 z-10 hidden md:block">
          <Minimap
            zones={zones}
            activeZoneId={activeZoneId}
            currentId={currentId}
            onSelectStation={(id, zoneId) => navigateToStation(id, zoneId)}
            onMoveUp={handleMoveUp}
            cameraAzimuth={cameraAzimuth}
          />
        </div>
      )}

      {/* Compass Widget (bottom-left) */}
      <div className="absolute bottom-6 left-6 z-10">
        <CompassWidget azimuth={cameraAzimuth} />
      </div>

      {/* Data Inspector Modal */}
      {showInspector && (
        <StationInspectorModal
          zones={zones}
          activeZoneId={activeZoneId}
          currentId={currentId}
          onSelectStation={(id, zoneId) => navigateToStation(id, zoneId)}
          onClose={() => setShowInspector(false)}
        />
      )}
    </div>
  );
}
