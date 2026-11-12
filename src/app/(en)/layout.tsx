import type { ReactNode } from 'react';
import { RootShell } from '../RootShell';

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <RootShell locale="en">{children}</RootShell>;
}
