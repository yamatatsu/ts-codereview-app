# 02. ReviewTarget とローカル差分

## モデル

```ts
type ReviewTarget =
  | { kind: 'local-worktree'; projectId: string } // 作業ツリー vs HEAD
  | { kind: 'local-branch'; projectId: string; branch: string; baseBranch: string } // merge-base(base, branch)..branch
  | { kind: 'pr'; projectId: string; number: number }; // merge-base(base, head)..head

type ResolvedTarget = {
  target: ReviewTarget;
  baseRev: string; // コミット SHA
  headRev: string | 'WORKTREE';
  workspacePath: string; // head 側のファイルが実在するディレクトリ
  files: ChangedFile[];
};

type ChangedFile = {
  path: string; // head 側のパス
  oldPath?: string; // rename のとき
  status: 'A' | 'M' | 'D' | 'R';
  kind: 'impl' | 'test' | 'collapsed' | 'other'; // other = 非 TS ファイル
  baseBlob?: string;
  headBlob?: string; // blob SHA（WORKTREE のときは hash-object で計算する）
};
```

## 差分の算出

- **local-worktree**
  - base は `HEAD`、head は作業ツリー
  - ファイル一覧は `git diff --name-status -M -z HEAD` と、追跡されていないファイル（`git ls-files --others --exclude-standard -z`）を合わせる
  - staged と unstaged は区別しない
- **local-branch**
  - base は `git merge-base <baseBranch> <branch>`、head は `<branch>`
  - workspace は clone 本体
  - ただし、`<branch>` がチェックアウト中のブランチでない場合、LSP によるジャンプは「head の内容と作業ツリーが一致しないかもしれない」という警告付きになる
  - MVP では、選べるのはチェックアウト中のブランチだけとする
- **pr**：[07](./07-github-pr.md) を参照

## ファイルの分類（kind）

判定は上から順に適用する。

1. `collapsedGlobs` に一致するか、`.gitattributes` で `linguist-generated` が付いている → `collapsed`
2. 拡張子が TS 以外 → `other`
3. `testGlobs` に一致 → `test`
4. それ以外 → `impl`

## ファイル監視による更新（local のみ）

- analysis 上の @parcel/watcher で clone 本体を監視する（`.gitignore` と `.git/` を除外）
- 300ms の debounce で ReviewTarget を再計算し、SSE `workspace.changed` を送る
- `.git/HEAD` や refs の変化（ブランチ切り替え）も検知して、再計算する

## 受け入れ条件

- 作業ツリーでファイルを編集・保存すると、1 秒以内にファイル一覧と diff が更新される
- rename は `R` として 1 エントリで表示され、base 側は旧パスで表示される
- バイナリファイルは「バイナリのため表示しません」と表示する
