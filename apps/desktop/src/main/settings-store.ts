import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { settingsSchema, type Settings } from '../shared/settings';

/** アプリ全体の設定（settings.json、zod で検証） */
export class SettingsStore {
  readonly #file: string;
  #settings: Settings;

  constructor(file: string) {
    this.#file = file;
    this.#settings = this.#load();
  }

  #load(): Settings {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.#file, 'utf8'));
      const parsed = settingsSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // ファイルがない・壊れている場合はデフォルト
    }
    return settingsSchema.parse({});
  }

  get(): Settings {
    return this.#settings;
  }

  update(patch: { [K in keyof Settings]?: Settings[K] | undefined }): Settings {
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    this.#settings = settingsSchema.parse({ ...this.#settings, ...defined });
    mkdirSync(path.dirname(this.#file), { recursive: true });
    writeFileSync(this.#file, `${JSON.stringify(this.#settings, null, 2)}\n`);
    return this.#settings;
  }
}
