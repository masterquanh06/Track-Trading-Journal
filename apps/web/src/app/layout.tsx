import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import { AstryxProvider } from '@/components/layout/astryx-provider';
import { PreferencesProvider } from '@/lib/preferences-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrackDailyTrade — Trading Journal & Analytics',
  description:
    'Multi-platform Trading Journal with MT5 Auto-Sync, Deep Analytics, and Trade Replay.',
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var savedTheme = localStorage.getItem('tdt_theme');
    var theme = (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    var savedLocale = localStorage.getItem('tdt_locale');
    if (savedLocale === 'en' || savedLocale === 'vi') {
      root.lang = savedLocale;
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-fg">
        <PreferencesProvider>
          <AstryxProvider>
            <AppShell>{children}</AppShell>
          </AstryxProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
