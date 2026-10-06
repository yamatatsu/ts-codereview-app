import { useEffect, useState } from 'react';

import { useSettings } from '@/lib/queries';

export const DIFF_THEMES = { dark: 'github-dark-default', light: 'github-light-default' } as const;

export const useDiffTheme = () => {
  const { data } = useSettings();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return {
    theme: DIFF_THEMES,
    themeType: (dark ? 'dark' : 'light') as 'dark' | 'light',
    layout: data?.diffLayout ?? 'split',
  };
};
