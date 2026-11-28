'use client';

import * as React from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { usePreferences } from '@/lib/preferences-context';

export function AstryxProvider({ children }: { children: React.ReactNode }) {
  const { theme } = usePreferences();

  return (
    <Theme theme={neutralTheme} mode={theme}>
      {children}
    </Theme>
  );
}
