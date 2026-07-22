'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture, Html } from '@react-three/drei';
import * as THREE from 'three';

interface Position {
  x: number;
  y: number;
  z: number;
}

interface Station {
  id: number;
  name: string;
  panoramaUrl: string;
  position: Position;
  yaw?: number;
  connections: number[];
}

// Camera controller driving OrbitControls.target directly
// Also reports azimuthal angle back for the minimap compass
function CameraController({
  lookAngle,
  navToken,
  controlsRef,
  onAzimuthChange,
}: {
  lookAngle: number | null;
  navToken: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.RefObject<any>;
  onAzimuthChange: (angle: number) => void;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (lookAngle !== null && controlsRef.current) {
      const dir = new THREE.Vector3(
        Math.sin(lookAngle),
        0,
        -Math.cos(lookAngle)
      );
      controlsRef.current.target.copy(camera.position).add(dir);
      controlsRef.current.update();
    }
  }, [lookAngle, navToken, camera, controlsRef]);

  // Read camera direction every frame and report azimuth angle
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
    <mesh scale={[-1, 1, 1]} rotation={[0, yaw, 0]}>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

function StreetViewHotspot({
  targetStation,
  currentStation,
  onClick,
}: {
  targetStation: Station;
  currentStation: Station;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Exact relative 3D position vector in scanner coordinates
  const dx = targetStation.position.x - currentStation.position.x;
  const dy = targetStation.position.y - currentStation.position.y;
  const dz = targetStation.position.z - currentStation.position.z;

  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist === 0) return null;

  // Exact 3D coordinates in Three.js space (center of station)
  const markerX = dx;
  const markerY = dz;
  const markerZ = -dy;

  const handleClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onClick();
  };

  return (
    <group position={[markerX, markerY, markerZ]}>
      {/* 3D Hotspot Sphere at Exact Station Center */}
      <group
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        {/* Outer Glowing Sphere */}
        <mesh>
          <sphereGeometry args={[0.35, 32, 32]} />
          <meshBasicMaterial
            color={hovered ? '#38bdf8' : '#ffffff'}
            transparent
            opacity={hovered ? 0.9 : 0.65}
            wireframe={hovered}
          />
        </mesh>

        {/* Inner Solid Core */}
        <mesh>
          <sphereGeometry args={[0.2, 32, 32]} />
          <meshBasicMaterial color={hovered ? '#0284c7' : '#0f172a'} />
        </mesh>
      </group>

      {/* Floating HTML Label directly above the Station Center */}
      <Html position={[0, 0.75, 0]} center distanceFactor={14}>
        <button
          onClick={handleClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md transition-all duration-200 flex items-center gap-2 border shadow-xl cursor-pointer whitespace-nowrap ${
            hovered
              ? 'bg-sky-500 text-white border-sky-300 scale-110 shadow-sky-500/40 ring-2 ring-sky-300'
              : 'bg-slate-900/90 text-slate-100 border-slate-700 hover:bg-slate-800'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
          <span>{targetStation.name}</span>
          <span className="text-[10px] text-sky-300 font-mono">({dist.toFixed(1)}m)</span>
        </button>
      </Html>
    </group>
  );
}

// 2D Minimap overlay component with compass view cone
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

  const mapWidth = 220;
  const mapHeight = 180;
  const padding = 24;

  const getMapCoords = (x: number, y: number) => {
    const normX = (x - minX) / (maxX - minX || 1);
    const normY = (y - minY) / (maxY - minY || 1);
    return {
      cx: padding + normX * (mapWidth - 2 * padding),
      cy: mapHeight - (padding + normY * (mapHeight - 2 * padding)),
    };
  };

  const currentStation = stations.find((s) => s.id === currentId);

  // View cone geometry for minimap
  const currentCoords = currentStation
    ? getMapCoords(currentStation.position.x, currentStation.position.y)
    : { cx: 0, cy: 0 };
  const coneLength = 28;
  const coneSpread = Math.PI / 5; // ~36° total FOV cone
  // Camera azimuth is in Three.js coords; map it to 2D minimap (rotate -90° to align)
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
    <div className="bg-slate-950/85 backdrop-blur-md p-3 rounded-2xl border border-slate-800 shadow-2xl">
      <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2 flex justify-between items-center">
        <span>Plan des stations</span>
        <span className="text-sky-400 font-mono text-[10px]">2D MAP</span>
      </div>
      <svg width={mapWidth} height={mapHeight} className="overflow-visible">
        {/* View Cone showing camera look direction */}
        {currentStation && (
          <polygon
            points={`${currentCoords.cx},${currentCoords.cy} ${coneLeft.x},${coneLeft.y} ${coneRight.x},${coneRight.y}`}
            fill="#38bdf8"
            opacity={0.15}
            stroke="#38bdf8"
            strokeWidth={0.5}
            strokeOpacity={0.4}
          />
        )}

        {/* Draw connections */}
        {stations.map((s) => {
          const from = getMapCoords(s.position.x, s.position.y);
          return s.connections.map((targetId) => {
            if (targetId < s.id) return null; // Avoid duplicate lines
            const target = stations.find((t) => t.id === targetId);
            if (!target) return null;
            const to = getMapCoords(target.position.x, target.position.y);
            const isCurrentConn =
              s.id === currentId || targetId === currentId;
            return (
              <line
                key={`${s.id}-${targetId}`}
                x1={from.cx}
                y1={from.cy}
                x2={to.cx}
                y2={to.cy}
                stroke={isCurrentConn ? '#38bdf8' : '#334155'}
                strokeWidth={isCurrentConn ? 2 : 1}
                strokeDasharray={isCurrentConn ? 'none' : '2,2'}
                opacity={isCurrentConn ? 0.9 : 0.5}
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
              {/* Invisible large hit area for easy clicking */}
              <circle
                cx={cx}
                cy={cy}
                r="14"
                fill="transparent"
              />
              {isSelected && (
                <circle
                  cx={cx}
                  cy={cy}
                  r="10"
                  className="fill-sky-500/40 animate-ping"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 6 : isConnected ? 5 : 4}
                fill={isSelected ? '#38bdf8' : isConnected ? '#38bdf8' : '#64748b'}
                stroke={isSelected ? '#fff' : 'transparent'}
                strokeWidth={isSelected ? 1.5 : 0}
              >
                <title>
                  {s.name} — Cliquer pour naviguer
                </title>
              </circle>
              <text
                x={cx}
                y={cy - 9}
                textAnchor="middle"
                fontSize="8"
                fill={isSelected ? '#38bdf8' : '#94a3b8'}
                fontWeight={isSelected ? 'bold' : 'normal'}
                className="pointer-events-none select-none"
              >
                {s.id}
              </text>
            </g>
          );
        })}

        {/* Compass Rose (N/S/E/W labels) */}
        <text x={mapWidth / 2} y={8} textAnchor="middle" fontSize="9" fill="#ef4444" fontWeight="bold" className="select-none">N</text>
        <text x={mapWidth / 2} y={mapHeight - 2} textAnchor="middle" fontSize="8" fill="#64748b" className="select-none">S</text>
        <text x={5} y={mapHeight / 2 + 3} textAnchor="start" fontSize="8" fill="#64748b" className="select-none">O</text>
        <text x={mapWidth - 5} y={mapHeight / 2 + 3} textAnchor="end" fontSize="8" fill="#64748b" className="select-none">E</text>
      </svg>
    </div>
  );
}

// Standalone compass widget for main 3D view
function CompassWidget({ azimuth }: { azimuth: number }) {
  // Rotate the compass needle by the negative azimuth so N stays pointing north
  const rotation = -azimuth * (180 / Math.PI);

  return (
    <div className="bg-slate-900/85 backdrop-blur-md rounded-full w-16 h-16 border border-slate-700 shadow-2xl flex items-center justify-center relative">
      <svg width="52" height="52" viewBox="-26 -26 52 52" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.1s ease-out' }}>
        {/* North needle (red) */}
        <polygon points="0,-20 -4,-4 4,-4" fill="#ef4444" />
        {/* South needle (white/gray) */}
        <polygon points="0,20 -4,4 4,4" fill="#94a3b8" />
        {/* Center circle */}
        <circle cx="0" cy="0" r="3" fill="#1e293b" stroke="#64748b" strokeWidth="1" />
      </svg>
      {/* Cardinal labels (fixed, don't rotate) */}
      <span className="absolute top-0.5 text-[8px] font-bold text-red-400 select-none">N</span>
      <span className="absolute bottom-0.5 text-[8px] font-medium text-slate-500 select-none">S</span>
      <span className="absolute left-1.5 text-[8px] font-medium text-slate-500 select-none">O</span>
      <span className="absolute right-1.5 text-[8px] font-medium text-slate-500 select-none">E</span>
    </div>
  );
}

export default function Viewer3D({ stations }: { stations: Station[] }) {
  const [currentId, setCurrentId] = useState(1);
  const [showMinimap, setShowMinimap] = useState(true);
  const [fadeIn, setFadeIn] = useState(false);
  const [lookAngle, setLookAngle] = useState<number | null>(null);
  const [navToken, setNavToken] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [cameraAzimuth, setCameraAzimuth] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  // Throttle azimuth updates to avoid excessive re-renders
  const azimuthRef = useRef(0);
  const handleAzimuthChange = useCallback((angle: number) => {
    azimuthRef.current = angle;
  }, []);

  // Sync azimuth to React state at 10fps for minimap/compass rendering
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

  // Collect URLs of all connected stations for background preloading
  const preloadUrls = useMemo(() => {
    return connectedStations.map((s) => s.panoramaUrl);
  }, [connectedStations]);

  const navigateToStation = (targetId: number) => {
    if (targetId === currentId || isNavigating) return;

    const targetStation = stations.find((s) => s.id === targetId);
    if (targetStation) {
      const dx = targetStation.position.x - currentStation.position.x;
      const dy = targetStation.position.y - currentStation.position.y;
      const travelAngle = Math.atan2(dx, dy) + (currentStation.yaw || 0);
      setLookAngle(travelAngle);
      setNavToken((t) => t + 1);
    }

    setIsNavigating(true);

    // Fade out briefly, switch station, then fade in
    setFadeIn(true);
    setTimeout(() => {
      setCurrentId(targetId);
      // Keep fade overlay for a moment so the new texture settles
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
          lookAngle={lookAngle}
          navToken={navToken}
          controlsRef={controlsRef}
          onAzimuthChange={handleAzimuthChange}
        />

        <React.Suspense fallback={null}>
          <PanoramaSphere
            url={currentStation.panoramaUrl}
            yaw={currentStation.yaw || 0}
          />
        </React.Suspense>

        {connectedStations.map((target) => (
          <StreetViewHotspot
            key={target.id}
            targetStation={target}
            currentStation={currentStation}
            onClick={() => navigateToStation(target.id)}
          />
        ))}
      </Canvas>

      {/* Top Bar Info */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none z-10">
        <div className="bg-slate-900/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 text-white flex items-center gap-3 shadow-xl pointer-events-auto">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <h1 className="font-bold text-sm tracking-wide">{currentStation.name}</h1>
            <p className="text-[11px] text-slate-400">
              Station {currentStation.id} / {stations.length} • {connectedStations.length} connexions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setShowMinimap(!showMinimap)}
            className="bg-slate-900/85 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800 text-xs font-semibold transition shadow-xl cursor-pointer"
          >
            {showMinimap ? 'Masquer la carte' : 'Afficher la carte'}
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
        Glissez pour orienter la vue • Cliquez sur les points 3D pour naviguer
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
              {s.name} ({s.connections.length} connexions)
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
    </div>
  );
}
