import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isTsFile } from '../review/target';
import { ModuleResolver } from './resolver';
import { scanModule, type ImportKind } from './scan';

export const EXTERNAL_PREFIX = 'npm:';

export type GraphEdge = {
  from: string;
  /** 内部ファイルの相対パス、または `npm:<package>` */
  to: string;
  kind: ImportKind;
};

export type GraphSnapshot = {
  files: string[];
  edges: GraphEdge[];
};

export const isExternalNode = (id: string): boolean => id.startsWith(EXTERNAL_PREFIX);

const isScannable = (file: string): boolean =>
  (isTsFile(file) || /\.(m|c)?jsx?$/.test(file)) && !file.split('/').includes('node_modules');

/** Workspace 全体のモジュール依存グラフ（docs/adr/0011） */
export class ImportGraph {
  readonly root: string;
  readonly #resolver: ModuleResolver;
  readonly #out = new Map<string, GraphEdge[]>();
  readonly #in = new Map<string, Set<string>>();
  readonly #files = new Set<string>();

  constructor(root: string) {
    this.root = root;
    this.#resolver = new ModuleResolver(root);
  }

  get size(): number {
    return this.#files.size;
  }

  hasFile(file: string): boolean {
    return this.#files.has(file);
  }

  files(): string[] {
    return [...this.#files];
  }

  /** ファイル一覧からグラフを構築する */
  async build(files: readonly string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const targets = files.filter(isScannable);
    for (const f of targets) this.#files.add(f);
    let done = 0;
    const concurrency = 32;
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const file = targets[cursor];
        cursor += 1;
        if (file === undefined) break;
        await this.#scanFile(file);
        done += 1;
        if (onProgress && done % 200 === 0) onProgress(done, targets.length);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    onProgress?.(targets.length, targets.length);
  }

  async #scanFile(file: string): Promise<void> {
    let source: string;
    try {
      source = await readFile(path.join(this.root, file), 'utf8');
    } catch {
      this.#removeOutgoing(file);
      this.#files.delete(file);
      return;
    }
    this.setOutgoing(file, this.resolveImports(file, source));
  }

  resolveImports(file: string, source: string): GraphEdge[] {
    let scanned;
    try {
      scanned = scanModule(file, source);
    } catch {
      return [];
    }
    const edges: GraphEdge[] = [];
    for (const imp of scanned) {
      const resolved = this.#resolver.resolve(file, imp.specifier);
      if (resolved.type === 'internal') edges.push({ from: file, to: resolved.path, kind: imp.kind });
      else if (resolved.type === 'external')
        edges.push({ from: file, to: EXTERNAL_PREFIX + resolved.packageName, kind: imp.kind });
    }
    return edges;
  }

  setOutgoing(file: string, edges: GraphEdge[]): void {
    this.#removeOutgoing(file);
    this.#out.set(file, edges);
    for (const edge of edges) {
      let set = this.#in.get(edge.to);
      if (!set) {
        set = new Set();
        this.#in.set(edge.to, set);
      }
      set.add(file);
    }
  }

  #removeOutgoing(file: string): void {
    for (const edge of this.#out.get(file) ?? []) this.#in.get(edge.to)?.delete(file);
    this.#out.delete(file);
  }

  /** ファイル単位の差分更新 */
  async update(changed: readonly string[], removed: readonly string[]): Promise<void> {
    this.#resolver.clearCache();
    for (const file of removed) {
      this.#removeOutgoing(file);
      this.#files.delete(file);
    }
    for (const file of changed) {
      if (!isScannable(file)) continue;
      this.#files.add(file);
      await this.#scanFile(file);
    }
  }

  outgoing(file: string): GraphEdge[] {
    return this.#out.get(file) ?? [];
  }

  incoming(file: string): string[] {
    return [...(this.#in.get(file) ?? [])];
  }

  incomingEdges(file: string): GraphEdge[] {
    return this.incoming(file).flatMap((from) => this.outgoing(from).filter((e) => e.to === file));
  }

  /** 起点集合から両方向に hops 段まで辿った近傍 */
  neighborhood(
    seeds: readonly string[],
    hops: number,
    options: { includeExternal?: boolean; includeTypeOnly?: boolean } = {},
  ): GraphSnapshot {
    const { includeExternal = false, includeTypeOnly = true } = options;
    const accept = (e: GraphEdge) =>
      (includeExternal || !isExternalNode(e.to)) && (includeTypeOnly || e.kind !== 'type-only');
    const visited = new Set(seeds);
    let frontier = [...seeds];
    for (let depth = 0; depth < hops; depth += 1) {
      const next: string[] = [];
      for (const node of frontier) {
        if (isExternalNode(node)) continue;
        for (const edge of this.outgoing(node)) {
          if (accept(edge) && !visited.has(edge.to)) {
            visited.add(edge.to);
            next.push(edge.to);
          }
        }
        for (const edge of this.incomingEdges(node)) {
          if (accept(edge) && !visited.has(edge.from)) {
            visited.add(edge.from);
            next.push(edge.from);
          }
        }
      }
      frontier = next;
    }
    const edges = [...visited]
      .filter((n) => !isExternalNode(n))
      .flatMap((n) => this.outgoing(n))
      .filter((e) => accept(e) && visited.has(e.to));
    return { files: [...visited], edges };
  }
}
