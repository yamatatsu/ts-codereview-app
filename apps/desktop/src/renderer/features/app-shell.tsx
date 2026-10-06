import { Link, useRouterState } from '@tanstack/react-router';
import { FolderGit2Icon, SettingsIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

const useTheme = () => {
  const { data } = useSettings();
  const theme = data?.theme ?? 'system';
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
};

/** 画面全体の枠。macOS のタイトルバー（hiddenInset）の分だけ上部を空ける */
export function AppShell({ children }: { children: ReactNode }) {
  useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inReview = pathname.startsWith('/review/');
  return (
    <div className="flex h-full flex-col">
      {!inReview && (
        <header className="app-drag flex h-11 shrink-0 items-center gap-2 border-b bg-sidebar pr-3 pl-20">
          <span className="font-semibold tracking-tight">TSugi</span>
          <nav className="app-no-drag ml-4 flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className={cn(pathname === '/' && 'bg-accent')}>
              <Link to="/">
                <FolderGit2Icon />
                プロジェクト
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className={cn(pathname === '/settings' && 'bg-accent')}>
              <Link to="/settings">
                <SettingsIcon />
                設定
              </Link>
            </Button>
          </nav>
        </header>
      )}
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
