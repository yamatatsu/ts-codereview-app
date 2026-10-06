# 05. テストと実装の対応

## TestLink の算出

```ts
type TestLink = { implPath: string; testPath: string; strength: 'primary' | 'indirect' };
```

1. **primary（命名一致）**：テストファイル `T` から、次の候補パスを生成する。実在すれば、その実装ファイルと primary で結ぶ
   - `foo.test.ts` / `foo.spec.ts` → 同じディレクトリの `foo.ts`（`.tsx`、`.mts`、`.cts` も含む）
   - `__tests__/foo.ts` / `__tests__/foo.test.ts` → 親ディレクトリの `foo.ts`
   - `test/` や `tests/` 配下で `src/` をミラーしている構成：`tests/a/b/foo.test.ts` → `src/a/b/foo.ts`（パッケージのルートを基準にする）
   - 候補が `index.ts` になる場合も許容する（`foo/index.ts`）
2. **indirect（import）**：ImportGraph 上で、テストファイルから**直接** import されている実装ファイルを indirect で結ぶ。primary と重複するものは除く
   - 推移的な（2 ホップ以上の）import は対象外とする
   - テスト用のヘルパー（テスト glob に一致する、または `test-utils`、`fixtures`、`__mocks__` 配下）は実装として扱わない

## UI

- **ファイル一覧**：「実装」と「テスト」の 2 グループに分ける
  - 実装ファイルの行には、対応するテストの数を表示する（例：`🧪 2`）
  - 変更されたテストがある場合は、それを強調する
- **Context panel の Tests**：選択中のファイルに対応するファイルを一覧表示する
  - 実装を選択中なら、テストを primary → indirect の順に並べる
  - テストを選択中なら、対象の実装を並べる
  - 変更されていないテストも表示する（Code view で開く）
- **切り替え（`Alt+O`）**：対応する primary のファイルに移動する
  - 複数ある場合はピッカーを出す
  - primary がなければ indirect の中から選ぶ
- **テストのアウトライン**：テストファイルで `describe` / `it` / `test`（`.each`、`.skip`、`.only` を含む）を oxc の AST から抽出し、ツリーで表示する
  - 変更されたテストケースには変更マークを付ける
  - クリックすると、そのテストケースの位置にスクロールする

## 受け入れ条件

- fixture で `foo.ts` ↔ `foo.test.ts`（primary）と、`bar.ts` ← `integration.test.ts`（indirect）が正しく区別される
- 実装しか変更されていない ReviewTarget でも、対応する（変更されていない）テストを Context panel から開ける
