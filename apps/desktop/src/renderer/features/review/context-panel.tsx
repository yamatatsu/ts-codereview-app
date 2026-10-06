import type { DocumentSymbolInfo, TestLink } from '@tsugi/core';
import { CopyIcon, FlaskConicalIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorText } from '@/lib/api';
import { useNotes, useRelations, useSymbols, useTestOutline } from '@/lib/queries';
import { basename, cn, dirname } from '@/lib/utils';
import { useReviewStore, type ContextTab } from '@/stores/review';

import type { TargetDto, TestOutlineDto } from '../../../shared/dto';
import { locationFor } from './navigation';
import { useReferences } from './use-lsp-actions';
import type { ReviewData } from './use-review-data';

export function ContextPanel({ target, data }: { target: TargetDto; data: ReviewData }) {
  const tab = useReviewStore((s) => s.contextTab);
  const setTab = useReviewStore((s) => s.setContextTab);
  const path = useReviewStore((s) => s.location?.path);
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ContextTab)} className="flex h-full flex-col gap-0">
      <TabsList className="m-2 grid grid-cols-5">
        <TabsTrigger value="tests">テスト</TabsTrigger>
        <TabsTrigger value="imports">依存</TabsTrigger>
        <TabsTrigger value="references">参照</TabsTrigger>
        <TabsTrigger value="outline">構造</TabsTrigger>
        <TabsTrigger value="notes">メモ</TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <TabsContent value="tests">
          {path && <TestsTab target={target} data={data} path={path} />}
        </TabsContent>
        <TabsContent value="imports">{path && <ImportsTab target={target} path={path} />}</TabsContent>
        <TabsContent value="references">
          <ReferencesTab target={target} />
        </TabsContent>
        <TabsContent value="outline">{path && <OutlineTab target={target} path={path} />}</TabsContent>
        <TabsContent value="notes">
          <NotesTab target={target} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function FileLink({
  target,
  path,
  line,
  children,
}: {
  target: TargetDto;
  path: string;
  line?: number;
  children?: React.ReactNode;
}) {
  const navigate = useReviewStore((s) => s.navigate);
  const changed = target.files.find((f) => f.path === path);
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent"
      onClick={() => navigate(locationFor(target.files, path, line))}
      title={path}
    >
      {changed && (
        <Badge
          variant={changed.status === 'A' ? 'added' : changed.status === 'D' ? 'removed' : 'outline'}
          className="px-1 font-mono"
        >
          {changed.status}
        </Badge>
      )}
      <span className="truncate">{basename(path)}</span>
      <span className="truncate text-[11px] text-muted-foreground">{dirname(path)}</span>
      {children}
    </button>
  );
}

function TestsTab({ target, data, path }: { target: TargetDto; data: ReviewData; path: string }) {
  const kind = target.files.find((f) => f.path === path)?.kind;
  const isTest = kind === 'test' || data.linksByTest.has(path);
  const links: TestLink[] = isTest ? (data.linksByTest.get(path) ?? []) : (data.linksByImpl.get(path) ?? []);
  const sorted = [...links].sort((a, b) =>
    a.strength === b.strength ? 0 : a.strength === 'primary' ? -1 : 1,
  );
  if (!data.testLinks.data?.ready) return <p className="p-2 text-xs text-muted-foreground">解析中…</p>;
  if (sorted.length === 0)
    return (
      <p className="p-2 text-xs text-muted-foreground">
        {isTest
          ? 'このテストが対象としている実装は見つかりません。'
          : 'このファイルに対応するテストは見つかりません。'}
      </p>
    );
  return (
    <div className="grid gap-1">
      <p className="px-1 text-[11px] text-muted-foreground">
        {isTest ? 'このテストの対象' : 'このファイルのテスト'}（<kbd>⌥O</kbd> で切り替え）
      </p>
      <ul>
        {sorted.map((link) => {
          const other = isTest ? link.implPath : link.testPath;
          return (
            <li key={`${link.implPath}:${link.testPath}`}>
              <FileLink target={target} path={other}>
                <Badge variant={link.strength === 'primary' ? 'secondary' : 'outline'} className="ml-auto">
                  {link.strength === 'primary' ? '主対象' : '間接'}
                </Badge>
              </FileLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ImportsTab({ target, path }: { target: TargetDto; path: string }) {
  const relations = useRelations(target.key, path);
  if (!relations.data?.ready) return <p className="p-2 text-xs text-muted-foreground">解析中…</p>;
  const { imports, importedBy } = relations.data;
  return (
    <div className="grid gap-3">
      <section>
        <h4 className="px-1 text-[11px] font-medium text-muted-foreground">
          Imports（依存先）{imports.length}
        </h4>
        <ul>
          {imports.map((imp) =>
            imp.external ? (
              <li key={imp.path} className="px-1.5 py-1 text-xs text-muted-foreground">
                📦 {imp.path.replace(/^npm:/, '')}
              </li>
            ) : (
              <li key={imp.path}>
                <FileLink target={target} path={imp.path}>
                  {imp.kind !== 'static' && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{imp.kind}</span>
                  )}
                </FileLink>
              </li>
            ),
          )}
        </ul>
      </section>
      <section>
        <h4 className="px-1 text-[11px] font-medium text-muted-foreground">
          Imported by（被依存）{importedBy.length}
        </h4>
        <ul>
          {importedBy.map((imp) => (
            <li key={imp.path}>
              <FileLink target={target} path={imp.path} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReferencesTab({ target }: { target: TargetDto }) {
  const { query, results, loading } = useReferences();
  const navigate = useReviewStore((s) => s.navigate);
  if (!query)
    return (
      <p className="p-2 text-xs text-muted-foreground">
        トークンを選択して <kbd>⇧F12</kbd> で参照を検索します。
      </p>
    );
  if (loading) return <p className="p-2 text-xs text-muted-foreground">検索中…</p>;
  const changed = new Set(target.files.map((f) => f.path));
  const sorted = [...results].sort(
    (a, b) => Number(changed.has(b.relativePath)) - Number(changed.has(a.relativePath)),
  );
  return (
    <div className="grid gap-1">
      <p className="px-1 text-[11px] text-muted-foreground">
        {query.symbol || `${basename(query.path)}:${query.line}`} — {results.length} 件
      </p>
      <ul>
        {sorted.map((r) => (
          <li key={`${r.absPath}:${r.range.start.line}:${r.range.start.character}`}>
            <button
              type="button"
              className={cn(
                'grid w-full rounded px-1.5 py-1 text-left hover:bg-accent',
                changed.has(r.relativePath) && 'border-l-2 border-primary',
              )}
              onClick={() => navigate(locationFor(target.files, r.relativePath, r.range.start.line + 1))}
            >
              <span className="truncate text-xs">
                {basename(r.relativePath)}:{r.range.start.line + 1}
                <span className="ml-1 text-[11px] text-muted-foreground">{dirname(r.relativePath)}</span>
              </span>
              <code className="truncate font-mono text-[11px] text-muted-foreground">{r.preview}</code>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutlineTab({ target, path }: { target: TargetDto; path: string }) {
  const file = target.files.find((f) => f.path === path);
  const isTest =
    file?.kind === 'test' || /\.(test|spec)\.[cm]?tsx?$/.test(path) || path.includes('__tests__/');
  const outline = useTestOutline(target.key, path, isTest);
  const symbols = useSymbols(target.key, path, !isTest && file?.status !== 'D');
  const navigate = useReviewStore((s) => s.navigate);

  if (isTest) {
    if (outline.isLoading) return <p className="p-2 text-xs text-muted-foreground">読み込み中…</p>;
    const nodes = outline.data?.nodes ?? [];
    if (nodes.length === 0)
      return <p className="p-2 text-xs text-muted-foreground">テストケースが見つかりません。</p>;
    const renderNode = (node: TestOutlineDto['nodes'][number], depth: number): React.ReactNode => (
      <li key={`${node.startLine}:${node.name}`}>
        <button
          type="button"
          className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-accent"
          style={{ paddingLeft: 6 + depth * 12 }}
          onClick={() => navigate(locationFor(target.files, path, node.startLine))}
        >
          {node.kind === 'describe' ? (
            <span className="text-muted-foreground">▸</span>
          ) : (
            <FlaskConicalIcon className="size-3 text-muted-foreground" />
          )}
          <span className={cn('truncate', node.changed && 'font-medium text-added')}>{node.name}</span>
          {node.modifiers.map((m) => (
            <Badge key={m} variant="outline" className="px-1 text-[10px]">
              {m}
            </Badge>
          ))}
          {node.changed && (
            <span className="ml-auto size-1.5 shrink-0 rounded-full bg-added" title="変更あり" />
          )}
        </button>
        {node.children.length > 0 && (
          <ul>{node.children.map((c) => renderNode(c as TestOutlineDto['nodes'][number], depth + 1))}</ul>
        )}
      </li>
    );
    return <ul className="text-xs">{nodes.map((n) => renderNode(n, 0))}</ul>;
  }

  if (symbols.isLoading)
    return <p className="p-2 text-xs text-muted-foreground">TypeScript の解析を待っています…</p>;
  if (symbols.error) return <p className="p-2 text-xs text-destructive">{errorText(symbols.error)}</p>;
  const renderSymbol = (s: DocumentSymbolInfo, depth: number): React.ReactNode => (
    <li key={`${s.name}:${s.range.start.line}`}>
      <button
        type="button"
        className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-accent"
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => navigate(locationFor(target.files, path, s.selectionRange.start.line + 1))}
      >
        <span className="truncate">{s.name}</span>
        {s.detail && <span className="truncate text-[11px] text-muted-foreground">{s.detail}</span>}
      </button>
      {s.children.length > 0 && <ul>{s.children.map((c) => renderSymbol(c, depth + 1))}</ul>}
    </li>
  );
  return <ul className="text-xs">{(symbols.data ?? []).map((s) => renderSymbol(s, 0))}</ul>;
}

function NotesTab({ target }: { target: TargetDto }) {
  const notes = useNotes(target.key);
  const list = notes.data ?? [];
  const copy = () => {
    const md = list.map((n) => `- \`${n.path}:${n.startLine}\` ${n.body.replace(/\n/g, '\n  ')}`).join('\n');
    void navigator.clipboard.writeText(md);
    toast.success('メモを Markdown としてコピーしました');
  };
  if (list.length === 0)
    return (
      <p className="p-2 text-xs text-muted-foreground">
        行番号の横の ＋ か <kbd>⌘⌥M</kbd> でメモを追加できます。
      </p>
    );
  return (
    <div className="grid gap-2">
      <Button variant="outline" size="sm" onClick={copy}>
        <CopyIcon />
        Markdown としてコピー
      </Button>
      <ul className="grid gap-1">
        {list.map((note) => (
          <li key={note.id} className="rounded border p-1.5">
            <FileLink target={target} path={note.path} line={note.startLine}>
              <span className="ml-auto text-[11px] text-muted-foreground">L{note.startLine}</span>
            </FileLink>
            <p className="px-1.5 text-xs whitespace-pre-wrap" data-selectable>
              {note.stale && <span className="mr-1 text-renamed">（古いメモ）</span>}
              {note.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
