import { create } from 'zustand';

export type ViewKind = 'diff' | 'code';

/** エディタ上の位置。line は 1 始まり */
export type NavLocation = {
  path: string;
  line?: number;
  view: ViewKind;
};

export type Cursor = { path: string; line: number; character: number; side: 'base' | 'head' };

export type ContextTab = 'tests' | 'imports' | 'references' | 'outline' | 'notes';

type ReviewState = {
  targetKey: string | null;
  location: NavLocation | null;
  back: NavLocation[];
  forward: NavLocation[];
  cursor: Cursor | null;
  sidebarVisible: boolean;
  panelVisible: boolean;
  contextTab: ContextTab;
  fileOrder: 'review' | 'path';
  sinceViewed: boolean;
  peek: NavLocation | null;
  /** 一時的に強調する行（ジャンプ直後） */
  flash: { path: string; line: number; at: number } | null;
  quickOpen: boolean;
  palette: boolean;
  noteDraft: { path: string; line: number } | null;
  findOpen: boolean;

  reset: (targetKey: string) => void;
  /** 位置へ移動し、履歴に積む */
  navigate: (location: NavLocation, options?: { replace?: boolean }) => void;
  goBack: () => void;
  goForward: () => void;
  setCursor: (cursor: Cursor | null) => void;
  toggleSidebar: () => void;
  togglePanel: () => void;
  setContextTab: (tab: ContextTab) => void;
  setFileOrder: (order: 'review' | 'path') => void;
  setSinceViewed: (value: boolean) => void;
  setPeek: (location: NavLocation | null) => void;
  setQuickOpen: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  setNoteDraft: (draft: { path: string; line: number } | null) => void;
  setFindOpen: (open: boolean) => void;
};

const MAX_HISTORY = 100;

const same = (a: NavLocation | null, b: NavLocation | null) =>
  a !== null && b !== null && a.path === b.path && a.line === b.line && a.view === b.view;

export const useReviewStore = create<ReviewState>((set) => ({
  targetKey: null,
  location: null,
  back: [],
  forward: [],
  cursor: null,
  sidebarVisible: true,
  panelVisible: true,
  contextTab: 'tests',
  fileOrder: 'review',
  sinceViewed: false,
  peek: null,
  flash: null,
  quickOpen: false,
  palette: false,
  noteDraft: null,
  findOpen: false,

  reset: (targetKey) =>
    set((state) =>
      state.targetKey === targetKey
        ? state
        : {
            targetKey,
            location: null,
            back: [],
            forward: [],
            cursor: null,
            peek: null,
            flash: null,
            sinceViewed: false,
          },
    ),
  navigate: (location, options) =>
    set((state) => {
      if (same(state.location, location)) return state;
      const flash = location.line ? { path: location.path, line: location.line, at: Date.now() } : null;
      if (options?.replace || !state.location) return { location, flash, peek: null };
      return {
        location,
        flash,
        peek: null,
        back: [...state.back, state.location].slice(-MAX_HISTORY),
        forward: [],
      };
    }),
  goBack: () =>
    set((state) => {
      const previous = state.back.at(-1);
      if (!previous) return state;
      return {
        location: previous,
        back: state.back.slice(0, -1),
        forward: state.location ? [state.location, ...state.forward] : state.forward,
        flash: previous.line ? { path: previous.path, line: previous.line, at: Date.now() } : null,
      };
    }),
  goForward: () =>
    set((state) => {
      const next = state.forward[0];
      if (!next) return state;
      return {
        location: next,
        forward: state.forward.slice(1),
        back: state.location ? [...state.back, state.location] : state.back,
        flash: next.line ? { path: next.path, line: next.line, at: Date.now() } : null,
      };
    }),
  setCursor: (cursor) => set({ cursor }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
  setContextTab: (contextTab) => set({ contextTab, panelVisible: true }),
  setFileOrder: (fileOrder) => set({ fileOrder }),
  setSinceViewed: (sinceViewed) => set({ sinceViewed }),
  setPeek: (peek) => set({ peek }),
  setQuickOpen: (quickOpen) => set({ quickOpen }),
  setPalette: (palette) => set({ palette }),
  setNoteDraft: (noteDraft) => set({ noteDraft }),
  setFindOpen: (findOpen) => set({ findOpen }),
}));
