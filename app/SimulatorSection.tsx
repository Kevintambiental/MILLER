'use client';

import { useEffect, useRef, useState } from 'react';

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

const maximumCells = 24_000;
const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function SimulatorSection() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const playAfterRun = useRef(false);
  const [frameHeight, setFrameHeight] = useState(1120);

  useEffect(() => {
    const handleControl = (event: Event) => {
      const { action, value } = (event as CustomEvent<{ action?: string; value?: number }>).detail ?? {};
      const document = frameRef.current?.contentDocument;
      if (!document) return;
      if (action === 'run') {
        const playButton = document.querySelector<HTMLButtonElement>('#playPause');
        if (playButton?.textContent?.includes('Pausar')) playButton.click();
        const hasSoilData = [...document.querySelectorAll<HTMLInputElement>('#soilRows input')]
          .some((input) => input.value.trim() !== '');
        playAfterRun.current = true;
        if (hasSoilData) {
          document.querySelector<HTMLButtonElement>('#runSimulation')?.click();
        } else {
          document.querySelector<HTMLButtonElement>('#loadExample')?.click();
        }
      } else if (action === 'toggle-play') {
        document.querySelector<HTMLButtonElement>('#playPause')?.click();
      } else if (action === 'seek' && Number.isFinite(value)) {
        const slider = document.querySelector<HTMLInputElement>('#timeSlider');
        if (!slider) return;
        slider.value = String(value);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const message = event.data as { type?: string; height?: number; snapshot?: SimulationSnapshot; state?: string; playing?: boolean };
      if (message.type === 'edmunds:height' && Number.isFinite(message.height)) {
        setFrameHeight(Math.max(780, Math.min(14_000, Math.ceil(message.height!))));
        return;
      }
      if (message.type === 'edmunds:run-state' && ['running', 'complete', 'error'].includes(message.state ?? '')) {
        if (message.state === 'complete' && playAfterRun.current) {
          const playButton = frameRef.current?.contentDocument?.querySelector<HTMLButtonElement>('#playPause');
          playAfterRun.current = false;
          if (playButton && !playButton.textContent?.includes('Pausar')) playButton.click();
        } else if (message.state === 'error') {
          playAfterRun.current = false;
        }
        window.dispatchEvent(new CustomEvent('edmunds:run-state', { detail: message.state }));
        return;
      }
      if (message.type === 'edmunds:playback-state' && typeof message.playing === 'boolean') {
        window.dispatchEvent(new CustomEvent('edmunds:playback-state', { detail: message.playing }));
        return;
      }
      if (message.type === 'edmunds:reset') {
        window.dispatchEvent(new CustomEvent('edmunds:snapshot', { detail: null }));
        return;
      }
      if (message.type !== 'edmunds:snapshot' || !message.snapshot) return;
      const next = message.snapshot;
      const validGrid = [next.nx, next.ny, next.nz].every((value) => Number.isInteger(value) && value > 0);
      const cells = next.nx * next.ny * next.nz;
      if (!validGrid || cells > maximumCells || next.field?.length !== cells) return;
      if (![next.L, next.W, next.Z, next.threshold, next.day].every(Number.isFinite)) return;
      if (!Number.isInteger(next.cut) || !Number.isInteger(next.cuts) || next.cut < 0 || next.cuts <= next.cut) return;
      if (![next.sourceX0, next.sourceX1, next.sourceY0, next.sourceY1, next.sourceZ0, next.sourceZ1].every(Number.isFinite)) return;
      if (!Number.isInteger(next.solution) || next.solution < 1 || !['continuous', 'pulse'].includes(next.sourceMode)) return;
      if (!next.field.every((value) => Number.isFinite(value) && value >= 0)) return;
      window.dispatchEvent(new CustomEvent('edmunds:snapshot', { detail: next }));
    };
    window.addEventListener('edmunds:control', handleControl);
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('edmunds:control', handleControl);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <section className="simulator" id="simulador" aria-labelledby="simulator-title">
      <div className="simulator-heading">
        <div>
          <p className="section-kicker">MODELO CIENTÍFICO</p>
          <h2 id="simulator-title">Configura una corrida.</h2>
        </div>
        <p>Perfiles de suelo, analito, fuente y malla. Las lecturas y visualizaciones se mantienen sincronizadas con el solver de EDMUNDS.</p>
      </div>
      <iframe
        ref={frameRef}
        className="simulator-frame"
        src={`${publicBasePath}/simulator/index.html`}
        title="Simulador científico EDMUNDS de transporte de contaminantes"
        height={frameHeight}
        loading="eager"
        onLoad={() => frameRef.current?.contentWindow?.postMessage({ type: 'edmunds:ready' }, window.location.origin)}
      />
    </section>
  );
}
