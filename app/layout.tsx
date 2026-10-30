import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voxora AI — Your business, always answered',
  description: 'AI receptionists that answer every call, capture leads, and help businesses follow up.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
