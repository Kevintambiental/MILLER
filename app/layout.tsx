import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EDMUNDS · Transporte de contaminantes en el suelo',
  description: 'Explora la simulación 3D del transporte de contaminantes dentro del medio poroso del suelo.',
  applicationName: 'EDMUNDS'
};

export const viewport: Viewport = {
  themeColor: '#07121b',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
