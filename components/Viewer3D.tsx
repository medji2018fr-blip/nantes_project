'use client';

import React, { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
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
  connections: number[];
}

function PanoramaSphere({ url }: { url: string }) {
  const texture = useTexture(url);
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

function StreetViewHotspot({
  targetStation,
  currentPosition,
  onClick,
}: {
  targetStation: Station;
  currentPosition: Position;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Delta vector in scanner coordinates
  const dx = targetStation.position.x - currentPosition.x;
  const dy = targetStation.position.y - currentPosition.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Normalized direction in Three.js (X = East/x, Z = South/-y)
  const ux = dist > 0 ? dx / dist : 0;
  const uz = dist > 0 ? -dy / dist : -1;

  // Position marker on the ground plane (Y = -2.0)
  const radius = Math.min(10, Math.max(5, dist * 0.45));
  const markerX = ux * radius;
  const markerY = -2.0;
  const markerZ = uz * radius;

  // Yaw angle for arrow pointing
  const angleY = Math.atan2(ux, uz);

  return (
    <group position={[markerX, markerY, markerZ]}>
      {/* Ground Navigation Disc (Street View Style) */}
      <group
        rotation={[-Math.PI / 2, 0, angleY]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        {/* Outer Pulsing/Hover Ring */}
        <mesh position={[0, 0, 0]}>
          <ringGeometry args={[0.7, 0.95, 32]} />
          <meshBasicMaterial
            color={hovered ? '#38bdf8' : '#ffffff'}
            transparent
            opacity={hovered ? 0.95 : 0.65}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Inner Solid Disc */}
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[0.65, 32]} />
          <meshBasicMaterial
            color={hovered ? '#0284c7' : '#0f172a'}
            transparent
            opacity={hovered ? 0.85 : 0.6}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Directional Chevron Arrow */}
        <mesh position={[0, 0.2, 0.02]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.25, 0.45, 3]} />
          <meshBasicMaterial
            color={hovered ? '#ffffff' : '#38bdf8'}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Floating HTML Label above Marker */}
      <Html position={[0, 1.2, 0]} center distanceFactor={14}>
        <button
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition-all duration-200 flex items-center gap-2 border shadow-lg cursor-pointer whitespace-nowrap ${
            hovered
              ? 'bg-sky-500/90 text-white border-sky-300 scale-110 shadow-sky-500/30'
              : 'bg-slate-900/80 text-slate-200 border-slate-700 hover:bg-slate-800/90'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span>{targetStation.name}</span>
          <span className="text-[10px] opacity-75">({dist.toFixed(1)}m)</span>
        </button>
      </Html>
    </group>
  );
}

// 2D Minimap overlay component
function Minimap({
  stations,
  currentId,
  onSelectStation,
}: {
  stations: Station[];
  currentId: number;
  onSelectStation: (id: number) => void;
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

  return (
    <div className="bg-slate-950/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800 shadow-2xl">
      <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2 flex justify-between items-center">
        <span>Plan des stations</span>
        <span className="text-sky-400 font-mono text-[10px]">2D MAP</span>
      </div>
      <svg width={mapWidth} height={mapHeight} className="overflow-visible">
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
              className="cursor-pointer group"
            >
              {isSelected && (
                <circle
                  cx={cx}
                  cy={cy}
                  r="10"
                  className="fill-sky-500/30 animate-ping"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 6 : isConnected ? 4.5 : 3.5}
                fill={isSelected ? '#38bdf8' : isConnected ? '#38bdf8' : '#64748b'}
                className="transition-all duration-200 group-hover:scale-125"
              />
              <text
                x={cx}
                y={cy - 8}
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
      </svg>
    </div>
  );
}

export default function Viewer3D({ stations }: { stations: Station[] }) {
  const [currentId, setCurrentId] = useState(1);
  const [showMinimap, setShowMinimap] = useState(true);

  const currentStation = stations.find((s) => s.id === currentId) || stations[0];
  const connectedStations = stations.filter((s) =>
    currentStation.connections.includes(s.id)
  );

  const handlePrev = () => {
    const prevIndex = stations.findIndex((s) => s.id === currentId) - 1;
    if (prevIndex >= 0) setCurrentId(stations[prevIndex].id);
  };

  const handleNext = () => {
    const nextIndex = stations.findIndex((s) => s.id === currentId) + 1;
    if (nextIndex < stations.length) setCurrentId(stations[nextIndex].id);
  };

  return (
    <div className="w-full h-screen relative bg-slate-950 select-none overflow-hidden font-sans">
      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 0, 0.1], fov: 75 }}>
        <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={-0.55} />

        <React.Suspense fallback={null}>
          <PanoramaSphere url={currentStation.panoramaUrl} />
        </React.Suspense>

        {connectedStations.map((target) => (
          <StreetViewHotspot
            key={target.id}
            targetStation={target}
            currentPosition={currentStation.position}
            onClick={() => setCurrentId(target.id)}
          />
        ))}
      </Canvas>

      {/* Top Bar Info */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none z-10">
        <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 text-white flex items-center gap-3 shadow-xl pointer-events-auto">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <h1 className="font-bold text-sm tracking-wide">{currentStation.name}</h1>
            <p className="text-[11px] text-slate-400">
              Station {currentStation.id} / {stations.length} • {connectedStations.length} connexions
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowMinimap(!showMinimap)}
          className="bg-slate-900/80 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800/90 text-xs font-semibold transition shadow-xl pointer-events-auto flex items-center gap-2 cursor-pointer"
        >
          <span>{showMinimap ? 'Masquer la carte' : 'Afficher la carte'}</span>
        </button>
      </div>

      {/* 2D Minimap Floating Card */}
      {showMinimap && (
        <div className="absolute top-20 right-4 z-10 hidden md:block">
          <Minimap
            stations={stations}
            currentId={currentId}
            onSelectStation={(id) => setCurrentId(id)}
          />
        </div>
      )}

      {/* Navigation Help overlay hint */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-slate-900/70 backdrop-blur-md px-4 py-1.5 rounded-full border border-slate-800/80 text-slate-300 text-xs shadow-lg pointer-events-none hidden sm:block">
        Glissez pour orienter la vue • Cliquez sur les anneaux au sol pour naviguer
      </div>

      {/* Bottom Navigation Toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/85 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-800 flex items-center gap-3 shadow-2xl z-10">
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
          onChange={(e) => setCurrentId(Number(e.target.value))}
          className="bg-slate-800 text-white text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.connections.length} liens)
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
