import { resultMatchers, type ResultMatchers } from '@praha/byethrow-testing';
import { expect } from 'vite-plus/test';

declare module 'vitest' {
  // vitest 5 の Matchers は <R, T> の 2 つの型引数を持つ
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends ResultMatchers<R> {
    readonly __tsugiResultMatchers?: T;
  }
}

expect.extend(resultMatchers);
