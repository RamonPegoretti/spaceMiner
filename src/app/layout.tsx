import type { Metadata, Viewport } from 'next';
import { Pixelify_Sans, Silkscreen } from 'next/font/google';
import './globals.css';

const pixel = Pixelify_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-pixel' });
const tiny = Silkscreen({ subsets: ['latin'], weight: ['400'], variable: '--font-tiny' });

export const metadata: Metadata = {
  title: 'spaceMiner',
  description: 'Mine drifting asteroid fields, build factories and haul cargo across a shared galaxy.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#07060f' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pixel.variable} ${tiny.variable}`}>
      <body>{children}</body>
    </html>
  );
}
