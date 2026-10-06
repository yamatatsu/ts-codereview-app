import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

import { maskSecrets } from '@tsugi/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 3;

/** JSON Lines でファイルに出力する。PAT や Authorization ヘッダーはマスクする（docs/adr/0019） */
export class Logger {
  readonly #file: string;

  constructor(dir: string, name: string) {
    mkdirSync(dir, { recursive: true });
    this.#file = path.join(dir, `${name}.log`);
  }

  #rotate(): void {
    try {
      if (statSync(this.#file).size < MAX_BYTES) return;
    } catch {
      return;
    }
    for (let i = KEEP - 1; i >= 1; i -= 1) {
      try {
        renameSync(`${this.#file}.${i}`, `${this.#file}.${i + 1}`);
      } catch {
        // 古い世代がなければ無視する
      }
    }
    renameSync(this.#file, `${this.#file}.1`);
  }

  log(level: LogLevel, message: string, data?: unknown): void {
    const line = maskSecrets(
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        message,
        ...(data === undefined ? {} : { data }),
      }),
    );
    if (level !== 'debug') (level === 'error' ? console.error : console.log)(line);
    try {
      this.#rotate();
      appendFileSync(this.#file, `${line}\n`);
    } catch {
      // ログが書けなくてもアプリは止めない
    }
  }

  debug = (message: string, data?: unknown) => this.log('debug', message, data);
  info = (message: string, data?: unknown) => this.log('info', message, data);
  warn = (message: string, data?: unknown) => this.log('warn', message, data);
  error = (message: string, data?: unknown) => this.log('error', message, data);
}
