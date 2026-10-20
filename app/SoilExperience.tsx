'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

const SoilScene = dynamic(() => import('./SoilScene'), { ssr: false });

type SimulationSnapshot = {
  nx: number;
  ny: number;
  nz: number;
  L: number;
  W: number;
  Z: number;
  threshold: number;
  day: number;
  cut: number;
  cuts: number;
  profile: string;
  field: number[];
  solution: number;
  sourceX0: number;
  sourceX1: number;
  sourceY0: number;
  sourceY1: number;
  sourceZ0: number;
  sourceZ1: number;
  sourceMode: string;
  sourceClose: number | null;
};

export default function SoilExperience() {
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [runState, setRunState] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [playing, setPlaying] = useState(false);
  const metrics = useMemo(() => {
    if (!snapshot) return null;
    let front = 0, deepest = 0, maximum = 0;
    for (let z = 0; z < snapshot.nz; z++) for (let y = 0; y < snapshot.ny; y++) for (let x = 0; x < snapshot.nx; x++) {
      const concentration = snapshot.field[(z * snapshot.ny + y) * snapshot.nx + x];
      maximum = Math.max(maximum, concentration);
      if (concentration >= snapshot.threshold) {
        front = Math.max(front, (x + 1) * snapshot.L / snapshot.nx);
        deepest = Math.max(deepest, (z + 1) * snapshot.Z / snapshot.nz);
      }
    }
    return { front, deepest, maximum };
  }, [snapshot]);

  useEffect(() => {
    const receiveSnapshot = (event: Event) => {
      const next = (event as CustomEvent<SimulationSnapshot | null>).detail;
      setSnapshot(next);
      setRunState(next ? 'complete' : 'idle');
      if (!next) setPlaying(false);
    };
    const receiveRunState = (event: Event) => {
      setRunState((event as CustomEvent<'running' | 'complete' | 'error'>).detail);
      if ((event as CustomEvent<string>).detail !== 'running') setPlaying(false);
    };
    const receivePlaybackState = (event: Event) => {
      setPlaying((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener('edmunds:snapshot', receiveSnapshot);
    window.addEventListener('edmunds:run-state', receiveRunState);
    window.addEventListener('edmunds:playback-state', receivePlaybackState);
    return () => {
      window.removeEventListener('edmunds:snapshot', receiveSnapshot);
      window.removeEventListener('edmunds:run-state', receiveRunState);
      window.removeEventListener('edmunds:playback-state', receivePlaybackState);
    };
  }, []);

  const sendControl = (action: 'run' | 'toggle-play' | 'seek', value?: number) => {
    window.dispatchEvent(new CustomEvent('edmunds:control', { detail: { action, value } }));
  };
  return (
    <div className="scene-wrap" aria-label="Modelo 3D del suelo y plume de concentración">
      <SoilScene snapshot={snapshot} />
      {!snapshot && (
        <div className="scene-note" aria-live="polite">
          ESCENARIO LISTO <span>/</span> EL CAMPO APARECE AL EJECUTAR EL MODELO
        </div>
      )}
      {snapshot && (
        <div className="scene-data" aria-live="polite">
          <span>DÍA {snapshot.day.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</span>
          <span>{snapshot.profile}</span>
          <span>FRENTE {metrics?.front.toLocaleString('es-CO', { maximumFractionDigits: 1 })} m</span>
          <span>PROFUNDIDAD {metrics?.deepest.toLocaleString('es-CO', { maximumFractionDigits: 1 })} m</span>
        </div>
      )}
      {runState === 'error' && (
        <div className="scene-error" role="status">
          Corrida no iniciada. Revisa los datos del simulador y vuelve a intentarlo.
        </div>
      )}
      <div className="scene-cut-label">
        <span>CORTES INTERNOS X-Z / Y-Z / X-Y</span>
        {snapshot && (
          <small>
            FUENTE X {((snapshot.sourceX0 + snapshot.sourceX1) / 2).toLocaleString('es-CO', { maximumFractionDigits: 2 })} m
            {' · '}Y {((snapshot.sourceY0 + snapshot.sourceY1) / 2).toLocaleString('es-CO', { maximumFractionDigits: 2 })} m
            {' · '}Z {((snapshot.sourceZ0 + snapshot.sourceZ1) / 2).toLocaleString('es-CO', { maximumFractionDigits: 2 })} m
          </small>
        )}
      </div>
      <div className="scene-controls" role="group" aria-label="Controles de la simulación 3D">
        <button className="scene-run" type="button" onClick={() => sendControl('run')} disabled={runState === 'running'}>
          {runState === 'running' ? 'CALCULANDO…' : runState === 'error' ? 'REINTENTAR CORRIDA' : snapshot ? '↻ NUEVA CORRIDA' : '▶ INICIAR CORRIDA'}
        </button>
        <button type="button" onClick={() => sendControl('toggle-play')} disabled={!snapshot} aria-label={playing ? 'Pausar simulación' : 'Reproducir simulación'}>
          {playing ? 'Ⅱ PAUSAR' : '▷ VER AVANCE'}
        </button>
        <input
          type="range"
          min={0}
          max={snapshot ? snapshot.cuts - 1 : 0}
          step={1}
          value={snapshot?.cut ?? 0}
          disabled={!snapshot}
          aria-label="Día mostrado en el modelo 3D"
          onChange={(event) => sendControl('seek', Number(event.currentTarget.value))}
        />
      </div>
      <div className="scene-hint">ARRASTRA O PELLIZCA PARA ORBITAR · EL RELOJ SE CONTROLA AQUÍ</div>
    </div>
  );
}
