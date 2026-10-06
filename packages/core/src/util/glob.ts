import picomatch from 'picomatch';

export type GlobMatcher = (file: string) => boolean;

export const createMatcher = (globs: readonly string[]): GlobMatcher => {
  if (globs.length === 0) return () => false;
  const isMatch = picomatch([...globs], { dot: true });
  return (file) => isMatch(file);
};
