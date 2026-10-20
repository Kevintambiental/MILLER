'use client';

import { motion } from 'framer-motion';
import SoilExperience from './SoilExperience';
import SimulatorSection from './SimulatorSection';

export default function HomePage() {
  return (
    <main>
      <header className="site-header shell">
        <a className="wordmark" href="#inicio" aria-label="EDMUNDS, inicio">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>EDMUNDS<span className="wordmark-dot">.</span></span>
        </a>
        <nav className="site-nav" aria-label="Navegación principal">
          <a href="#simulador">Modelo</a>
          <a href="#simulador">Simulador</a>
        </nav>
        <a className="header-cta" href="#simulador">ABRIR MODELO <span aria-hidden="true">↗</span></a>
      </header>

      <section className="hero shell" id="hero">
        <div className="hero-copy" id="inicio">
          <motion.p className="hero-kicker" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            EDMUNDS <span> / </span> TRANSPORTE EN SUELO
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.08 }}>
            Transporte de<br />
            <span>contaminantes</span>
          </motion.h1>
          <motion.p className="hero-description" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }}>
            Del vertimiento en superficie a la pluma dentro del suelo.
          </motion.p>
          <motion.div className="hero-actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.32 }}>
            <a className="button-main" href="#simulador">Abrir simulación <span aria-hidden="true">↓</span></a>
            <span className="scene-caption"><i /> SIMULACIÓN ESPACIAL · 3D</span>
          </motion.div>
        </div>
        <div className="hero-visual">
          <SoilExperience />
          <div className="visual-label visual-label-top">
            <span>FUENTE → ZONA VADOSA</span>
            <i>ESTRATOS · TRANSPORTE · DISPERSIÓN</i>
          </div>
          <div className="hero-coordinate" aria-hidden="true">EDMUNDS&nbsp;&nbsp; / &nbsp;&nbsp;SOIL TRANSPORT</div>
        </div>
      </section>

      <SimulatorSection />

      <footer className="site-footer shell">
        <a className="wordmark" href="#inicio"><span className="brand-mark" aria-hidden="true">E</span><span>EDMUNDS<span className="wordmark-dot">.</span></span></a>
        <p>Los resultados dependen de los datos de suelo, del analito y de la fuente documentados para cada corrida.</p>
      </footer>
    </main>
  );
}
