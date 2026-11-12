// Self-hosted Latin subsets (SIL OFL): nothing is requested from a font CDN.
// Chinese text uses the visitor's own system fonts (a Chinese font is far too large to ship).
import localFont from 'next/font/local';

export const body = localFont({
  src: './fonts/atkinson-latin.woff2',
  weight: '400 700',
  variable: '--font-body',
  display: 'swap',
});

export const display = localFont({
  src: './fonts/barlow-condensed-700-latin.woff2',
  weight: '700',
  variable: '--font-display',
  display: 'swap',
});
