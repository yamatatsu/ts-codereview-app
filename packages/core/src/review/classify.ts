import { createMatcher } from '../util/glob';
import { isTsFile, type FileKind } from './target';

export type ClassifyOptions = {
  collapsedGlobs: readonly string[];
  testGlobs: readonly string[];
  /** `.gitattributes` の linguist-generated が付いたファイル */
  generated?: ReadonlySet<string>;
};

export const createClassifier = (options: ClassifyOptions): ((file: string) => FileKind) => {
  const isCollapsed = createMatcher(options.collapsedGlobs);
  const isTest = createMatcher(options.testGlobs);
  return (file) => {
    if (isCollapsed(file) || options.generated?.has(file)) return 'collapsed';
    if (!isTsFile(file)) return 'other';
    if (isTest(file)) return 'test';
    return 'impl';
  };
};
