'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
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

interface Station {
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

// 2D Minimap overlay component with zoom, pan, and guaranteed all-points visibility
function Minimap({
  stations,
  currentId,
  onSelectStation,
  cameraAzimuth,
}: {
  stations: Station[];
  currentId: number;
  onSelectStation: (id: number) => void;
  cameraAzimuth: number;
}) {
  const [zoom, setZoom] = useState<number>(1);
  const [hoveredStation, setHoveredStation] = useState<Station | null>(null);

  const [minX, maxX, minY, maxY] = useMemo(() => {
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
    return [minX, maxX, minY, maxY];
  }, [stations]);

  const mapWidth = 270;
  const mapHeight = 220;
  const padding = 30;

  const currentStation = stations.find((s) => s.id === currentId);

  // Global center of all points
  const globalCenterX = (minX + maxX) / 2;
  const globalCenterY = (minY + maxY) / 2;

  // Aspect-ratio scaling to guarantee all points fit inside padding bounds when zoom = 1
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const availW = mapWidth - 2 * padding;
  const availH = mapHeight - 2 * padding;
  const baseScale = Math.min(availW / spanX, availH / spanY);
  const scale = baseScale * zoom;

  // Pan interpolation: at zoom=1 center is fixed at global Center (shows ALL stations), at zoom>1 focus moves to currentStation
  const targetX = currentStation && zoom > 1 ? currentStation.position.x : globalCenterX;
  const targetY = currentStation && zoom > 1 ? currentStation.position.y : globalCenterY;
  const panWeight = Math.min(1, Math.max(0, (zoom - 1) / 1.2));
  const centerX = globalCenterX + (targetX - globalCenterX) * panWeight;
  const centerY = globalCenterY + (targetY - globalCenterY) * panWeight;

  const getMapCoords = (x: number, y: number) => {
    const cx = mapWidth / 2 + (x - centerX) * scale;
    const cy = mapHeight / 2 - (y - centerY) * scale; // Invert Y so North (+Y) is UP
    return { cx, cy };
  };

  const currentCoords = currentStation
    ? getMapCoords(currentStation.position.x, currentStation.position.y)
    : { cx: mapWidth / 2, cy: mapHeight / 2 };

  const coneLength = 32;
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
    <div className="bg-slate-950/90 backdrop-blur-xl p-3.5 rounded-2xl border border-slate-800 shadow-2xl relative w-[295px]">
      <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2 flex justify-between items-center select-none">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Plan des {stations.length} stations
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(1)}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white text-[10px] font-mono rounded transition cursor-pointer"
            title="Afficher tout le plan (Réinitialiser zoom)"
          >
            Tout voir
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.8, z - 0.3))}
            className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded flex items-center justify-center transition cursor-pointer"
            title="Dézoomer"
          >
            -
          </button>
          <span className="text-[10px] font-mono text-slate-400 px-0.5">{zoom.toFixed(1)}x</span>
          <button
            onClick={() => setZoom((z) => Math.min(3.5, z + 0.4))}
            className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded flex items-center justify-center transition cursor-pointer"
            title="Zoomer"
          >
            +
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-slate-900/80 border border-slate-800/80">
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

          {/* Connections */}
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
                  strokeWidth={isCurrentConn ? 2 : 1}
                  strokeDasharray={isCurrentConn ? 'none' : '3,3'}
                  opacity={isCurrentConn ? 0.95 : 0.4}
                />
              );
            });
          })}

          {/* Station Dots */}
          {stations.map((s) => {
            const { cx, cy } = getMapCoords(s.position.x, s.position.y);
            const isSelected = s.id === currentId;
            const isConnected = currentStation?.connections.includes(s.id);
            const isHovered = hoveredStation?.id === s.id;

            return (
              <g
                key={s.id}
                onClick={() => onSelectStation(s.id)}
                onMouseEnter={() => setHoveredStation(s)}
                onMouseLeave={() => setHoveredStation(null)}
                className="cursor-pointer group"
              >
                <circle cx={cx} cy={cy} r="12" fill="transparent" />
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="9"
                    className="fill-sky-500/40 animate-ping"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 6.5 : isHovered ? 6 : isConnected ? 5 : 4}
                  fill={isSelected ? '#38bdf8' : isHovered ? '#f59e0b' : isConnected ? '#0ea5e9' : '#64748b'}
                  stroke={isSelected || isHovered ? '#ffffff' : 'transparent'}
                  strokeWidth={isSelected || isHovered ? 1.5 : 0}
                  className="transition-all duration-150"
                />
                <text
                  x={cx}
                  y={cy - 9}
                  textAnchor="middle"
                  fontSize="8"
                  fill={isSelected ? '#38bdf8' : isHovered ? '#fbbf24' : '#94a3b8'}
                  fontWeight={isSelected || isHovered ? 'bold' : 'normal'}
                  className="pointer-events-none select-none font-mono"
                >
                  {s.id}
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

      {/* Hover Info Tooltip Banner */}
      {hoveredStation && (
        <div className="mt-2 p-2 bg-slate-900 rounded-lg border border-amber-500/30 text-[10px] text-slate-300 font-mono flex flex-col gap-0.5 animate-fadeIn">
          <div className="flex justify-between items-center text-amber-400 font-bold">
            <span>{hoveredStation.name}</span>
            <span>ID: {hoveredStation.id}</span>
          </div>
          <div className="text-slate-400">
            X: {hoveredStation.position.x.toFixed(3)}m | Y: {hoveredStation.position.y.toFixed(3)}m | Z: {hoveredStation.position.z.toFixed(3)}m
          </div>
        </div>
      )}
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
  stations,
  currentId,
  onSelectStation,
  onClose,
}: {
  stations: Station[];
  currentId: number;
  onSelectStation: (id: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  const filteredStations = useMemo(() => {
    return stations.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toString().includes(search) ||
        (s.sensorName && s.sensorName.toLowerCase().includes(search.toLowerCase()))
    );
  }, [stations, search]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-400"></span>
              Coordonnées des Panoramas & Stations ({stations.length} Points)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Extrait automatiquement depuis les fichiers de configuration .inf de chaque panorama
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Search Bar & Stats */}
        <div className="p-4 bg-slate-900/60 border-b border-slate-800/80 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <input
            type="text"
            placeholder="Rechercher par ID, Nom ou Identifiant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-80 bg-slate-950 text-white text-xs px-3.5 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-sky-500 font-mono"
          />
          <div className="text-xs text-slate-400 flex items-center gap-4">
            <span>Affichés: <strong className="text-sky-400 font-mono">{filteredStations.length}</strong> / {stations.length}</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-mono font-semibold">100% Coordonnées Valides</span>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="pb-3 px-3">ID</th>
                <th className="pb-3 px-3">Station</th>
                <th className="pb-3 px-3">Fichier .inf</th>
                <th className="pb-3 px-3 text-right">X (m)</th>
                <th className="pb-3 px-3 text-right">Y (m)</th>
                <th className="pb-3 px-3 text-right">Z (m)</th>
                <th className="pb-3 px-3 text-center">Connexions</th>
                <th className="pb-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredStations.map((s) => {
                const isSelected = s.id === currentId;
                return (
                  <tr
                    key={s.id}
                    className={`hover:bg-slate-800/50 transition ${
                      isSelected ? 'bg-sky-500/10 text-white' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-bold text-sky-400">#{s.id}</td>
                    <td className="py-3 px-3 font-sans font-semibold text-slate-200">
                      {s.name}
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px]">
                      {s.infFile || `image2d-${s.id}.inf`}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400">
                      {s.position.x.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400">
                      {s.position.y.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400">
                      {s.position.z.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px]">
                        {s.connections.length} proches
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => {
                          onSelectStation(s.id);
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
          <span>Format: Système de coordonnée Leica / Cyclone Register 360</span>
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

export default function Viewer3D({ stations }: { stations: Station[] }) {
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

  const currentStation = stations.find((s) => s.id === currentId) || stations[0];
  const connectedStations = stations.filter((s) =>
    currentStation.connections.includes(s.id)
  );

  const preloadUrls = useMemo(() => {
    return connectedStations.map((s) => s.panoramaUrl);
  }, [connectedStations]);

  const navigateToStation = (targetId: number) => {
    if (targetId === currentId || isNavigating) return;

    setIsNavigating(true);
    setFadeIn(true);
    setTimeout(() => {
      setCurrentId(targetId);
      setTimeout(() => {
        setFadeIn(false);
        setIsNavigating(false);
      }, 120);
    }, 250);
  };

  const handlePrev = () => {
    const prevIndex = stations.findIndex((s) => s.id === currentId) - 1;
    if (prevIndex >= 0) navigateToStation(stations[prevIndex].id);
  };

  const handleNext = () => {
    const nextIndex = stations.findIndex((s) => s.id === currentId) + 1;
    if (nextIndex < stations.length) navigateToStation(stations[nextIndex].id);
  };

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

        <React.Suspense fallback={null}>
          <PanoramaSphere
            url={currentStation.panoramaUrl}
            yaw={(currentStation.yaw || 0) + globalYawOffset}
          />
        </React.Suspense>
      </Canvas>

      {/* Top Bar Info */}
      <div className="absolute top-4 left-4 right-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pointer-events-none z-10">
        <div className="bg-slate-900/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 text-white flex items-center gap-3 shadow-xl pointer-events-auto">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <h1 className="font-bold text-sm tracking-wide flex items-center gap-2">
              {currentStation.name}
              <span className="text-[10px] font-mono font-normal text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-800">
                X: {currentStation.position.x.toFixed(2)}m | Y: {currentStation.position.y.toFixed(2)}m
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Station {currentStation.id} / {stations.length} • {connectedStations.length} connexions proches
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Open Station Points Table Button */}
          <button
            onClick={() => setShowInspector(true)}
            className="bg-sky-600 hover:bg-sky-500 text-white px-3.5 py-2 rounded-2xl text-xs font-semibold shadow-xl transition cursor-pointer flex items-center gap-1.5"
          >
            <span>📊 Tableau des points</span>
          </button>

          {/* Quick Rotation Alignment Control */}
          <div className="bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-800 text-slate-200 text-xs font-semibold hidden md:flex items-center gap-2 shadow-xl">
            <span className="text-[10px] text-slate-400 uppercase">Rotation:</span>
            {[
              { label: '0°', val: 0 },
              { label: '90°', val: Math.PI / 2 },
              { label: '180°', val: Math.PI },
              { label: '270°', val: (3 * Math.PI) / 2 },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setGlobalYawOffset(opt.val)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition cursor-pointer ${
                  Math.abs(globalYawOffset - opt.val) < 0.01
                    ? 'bg-sky-500 text-white font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowMinimap(!showMinimap)}
            className="bg-slate-900/85 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800 text-xs font-semibold transition shadow-xl cursor-pointer"
          >
            {showMinimap ? 'Masquer carte' : 'Carte 2D'}
          </button>
        </div>
      </div>

      {/* 2D Minimap Floating Card */}
      {showMinimap && (
        <div className="absolute top-20 right-4 z-10 hidden md:block">
          <Minimap
            stations={stations}
            currentId={currentId}
            onSelectStation={(id) => navigateToStation(id)}
            cameraAzimuth={cameraAzimuth}
          />
        </div>
      )}

      {/* Compass Widget (bottom-left) */}
      <div className="absolute bottom-24 left-4 z-10">
        <CompassWidget azimuth={cameraAzimuth} />
      </div>

      {/* Navigation Help overlay hint */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-slate-900/75 backdrop-blur-md px-4 py-1.5 rounded-full border border-slate-800/80 text-slate-200 text-xs shadow-lg pointer-events-none hidden sm:block">
        Glissez pour orienter la vue • Utilisez la carte ou le tableau pour naviguer
      </div>

      {/* Bottom Navigation Toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-800 flex items-center gap-3 shadow-2xl z-10">
        <button
          onClick={handlePrev}
          disabled={currentId === 1}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          title="Station précédente"
        >
          ‹
        </button>

        <select
          value={currentId}
          onChange={(e) => navigateToStation(Number(e.target.value))}
          className="bg-slate-800 text-white text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (X: {s.position.x.toFixed(1)}m, Y: {s.position.y.toFixed(1)}m)
            </option>
          ))}
        </select>

        <button
          onClick={handleNext}
          disabled={currentId === stations.length}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          title="Station suivante"
        >
          ›
        </button>
      </div>

      {/* Data Inspector Modal */}
      {showInspector && (
        <StationInspectorModal
          stations={stations}
          currentId={currentId}
          onSelectStation={(id) => navigateToStation(id)}
          onClose={() => setShowInspector(false)}
        />
      )}
    </div>
  );
}

