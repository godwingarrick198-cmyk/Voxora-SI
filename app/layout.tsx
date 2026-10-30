import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vexora SI — Vexora Super Intelligence',
  description: 'A virtual phone receptionist platform for businesses. Configure your receptionist, manage enquiries and review call activity.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
