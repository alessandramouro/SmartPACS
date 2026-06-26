import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'SmartPACS — Medical Imaging Platform',
    template: '%s | SmartPACS',
  },
  description: 'Enterprise SaaS platform for DICOM medical imaging management with automated cloud sync',
  keywords: ['DICOM', 'medical imaging', 'PACS', 'cloud storage', 'healthcare'],
  robots: 'noindex',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
