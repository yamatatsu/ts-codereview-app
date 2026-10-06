// electron-builder の afterPack フック。
// 依存の収集で *.d.ts が除外されるが、ネイティブ版 tsc は自身の隣にある lib*.d.ts を必要とするため、ここでコピーする。
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const arch = context.arch === 3 ? 'arm64' : 'x64';
  const pkgName = `@typescript/typescript-${context.electronPlatformName}-${arch}`;
  const tsDir = path.dirname(
    require.resolve('typescript/package.json', { paths: [context.packager.projectDir] }),
  );
  const nativeDir = path.dirname(require.resolve(`${pkgName}/package.json`, { paths: [tsDir] }));
  const appName = context.packager.appInfo.productFilename;
  const target = path.join(
    context.appOutDir,
    `${appName}.app`,
    'Contents/Resources/app.asar.unpacked/node_modules',
    pkgName,
    'lib',
  );
  fs.mkdirSync(target, { recursive: true });
  let copied = 0;
  for (const file of fs.readdirSync(path.join(nativeDir, 'lib'))) {
    if (!file.endsWith('.d.ts')) continue;
    fs.copyFileSync(path.join(nativeDir, 'lib', file), path.join(target, file));
    copied += 1;
  }
  console.log(
    `  • after-pack: copied ${copied} TypeScript lib files to ${path.relative(context.appOutDir, target)}`,
  );
};
