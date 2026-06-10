import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://docs.useathos.ai'),
  title: {
    default: 'Athos Developer Docs',
    template: '%s · Athos Developer Docs',
  },
  description:
    'Integrate Athos AI roleplay and scored-call data into your product — the @useathos/sdk, the External REST API, and the call.scored webhook.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
