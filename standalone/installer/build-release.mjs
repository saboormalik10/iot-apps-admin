#!/usr/bin/env node
/**
 * Build the Windows release: one zip a technician unpacks on the site PC and
 * installs with install.cmd. Runs on Linux or Windows (Node 20+).
 *
 *   node installer/build-release.mjs              build both apps, then package
 *   node installer/build-release.mjs --skip-build package what is already built
 *   node installer/build-release.mjs --no-zip     leave the folder, skip the zip
 *   node installer/build-release.mjs --exe        also build Setup.exe (Inno Setup)
 *
 * The client asked for an .exe installer (23 Sep 2026); the zip and install.cmd stay
 * for anyone who prefers them. --exe needs Inno Setup 6's compiler: set ISCC to
 * ISCC.exe (a Windows path when run through Wine) and, on Linux, WINE (default
 * "wine"); WINEPREFIX is passed through.
 *
 * What goes in (installer/dist/observator-weather-<version>-win-x64/):
 *   app/api          the API: dist/ + production dependencies for Windows
 *   app/web          the portal: .next/ + server.mjs + production dependencies
 *   runtime/node     node.exe                     (versions.json, vendor checksum)
 *   runtime/mongodb  mongod, mongodump, mongorestore (vendor checksum / pinned)
 *   runtime          vc_redist.x64.exe - the C++ runtime mongod needs (pinned)
 *   services         WinSW-x64.exe, the service wrapper (pinned checksum)
 *   scripts, *.cmd   install, upgrade, uninstall, status, backup, reset-password
 *   config           observator.env.template (= config/standalone.env.example)
 *   docs             the guides
 *
 * Checks before zipping: every script is plain ASCII (Windows PowerShell 5.1
 * reads BOM-less scripts as ANSI), parses in PowerShell when `pwsh` is found
 * (PWSH=<path> to point at one), and no Linux or macOS binary is left in the
 * dependencies.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CACHE = path.join(HERE, '.cache');
const args = new Set(process.argv.slice(2));
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const versions = JSON.parse(fs.readFileSync(path.join(HERE, 'versions.json'), 'utf8'));
const NAME = `observator-weather-${VERSION}-win-x64`;
const OUT = path.join(HERE, 'dist', NAME);
const isWin = process.platform === 'win32';

const log = (s) => console.log(s);
const step = (s) => console.log(`\n==> ${s}`);
const run = (cmd, argv, cwd, env = {}) =>
  execFileSync(cmd, argv, { cwd, stdio: 'inherit', env: { ...process.env, ...env }, shell: isWin });

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(url, file) {
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  // Streamed to disk (MongoDB's zip is ~640 MB) and retried: vendor servers drop
  // connections now and then.
  for (let attempt = 1; ; attempt++) {
    try {
      log(`   downloading ${url}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
      fs.renameSync(tmp, file);
      return file;
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

async function text(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

/**
 * A checksum list, cached beside the file it checks.
 *
 * The runtimes themselves are cached, so a second build downloads nothing — but
 * the checksum list was fetched every time, which meant a flaky connection could
 * fail a build that needed no network at all. (nodejs.org was answering about
 * half of our requests on 25 Sep 2026; four retries were not enough, twice.)
 *
 * The cached copy is used only when the fetch fails, and the build says so. It
 * is no weaker than the cached download it verifies: both live in the same
 * folder, and anything able to rewrite one can rewrite the other.
 */
async function checksums(url, cacheName) {
  const cached = path.join(CACHE, cacheName);
  try {
    const body = await text(url);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(cached, body);
    return body;
  } catch (err) {
    if (!fs.existsSync(cached)) throw err;
    log(`   ${url} unreachable (${err.message}) — using the copy cached with the download`);
    return fs.readFileSync(cached, 'utf8');
  }
}

function verify(file, expected, what) {
  const got = sha256(file);
  if (got !== expected.toLowerCase()) {
    fs.rmSync(file, { force: true });
    throw new Error(`${what}: checksum mismatch (got ${got}, expected ${expected}). The download was deleted.`);
  }
  log(`   ${what}: checksum OK`);
}

function unzip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // bsdtar (Windows 10+, macOS) reads zip; on Linux use unzip.
  if (isWin) run('tar', ['-xf', zip, '-C', dest]);
  else execFileSync('unzip', ['-q', '-o', zip, '-d', dest], { stdio: 'inherit' });
}

function copy(from, to, filter) {
  fs.cpSync(from, to, { recursive: true, filter: filter ?? (() => true) });
}

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const f = findFile(p, name);
      if (f) return f;
    } else if (e.name.toLowerCase() === name.toLowerCase()) return p;
  }
  return null;
}

function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  log(`Observator Weather Station ${VERSION} - Windows release`);

  if (!args.has('--skip-build')) {
    step('Building the API and the portal');
    run('npm', ['run', 'build'], path.join(ROOT, 'backend'));
    run('npm', ['run', 'build'], path.join(ROOT, 'web'), { NEXT_TELEMETRY_DISABLED: '1' });
  }
  for (const f of [path.join(ROOT, 'backend/dist/main.js'), path.join(ROOT, 'web/.next/BUILD_ID')]) {
    if (!fs.existsSync(f)) throw new Error(`${f} is missing - build first (or drop --skip-build).`);
  }

  step(`Staging ${path.relative(ROOT, OUT)}`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // -- The API -------------------------------------------------------------
  const api = path.join(OUT, 'app/api');
  copy(path.join(ROOT, 'backend/dist'), path.join(api, 'dist'), (src) => !src.endsWith('.d.ts') && !src.endsWith('.d.ts.map'));
  for (const f of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(ROOT, 'backend', f), path.join(api, f));
  log('   installing the API\'s production dependencies for Windows');
  run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--os=win32', '--cpu=x64'], api);
  removeLinks(api);

  // -- The portal ----------------------------------------------------------
  const web = path.join(OUT, 'app/web');
  copy(path.join(ROOT, 'web/.next'), path.join(web, '.next'), (src) => !/[\\/]\.next[\\/](cache|trace)([\\/]|$)/.test(src));
  if (fs.existsSync(path.join(ROOT, 'web/public'))) copy(path.join(ROOT, 'web/public'), path.join(web, 'public'));
  for (const f of ['server.mjs', 'next.config.mjs', 'package.json', 'yarn.lock']) fs.copyFileSync(path.join(ROOT, 'web', f), path.join(web, f));
  log('   installing the portal\'s production dependencies');
  // Yarn 1 cannot pick another platform's optional packages, so it takes every
  // platform's and the ones Windows does not need are removed below.
  run('yarn', ['install', '--production', '--frozen-lockfile', '--ignore-scripts', '--ignore-platform', '--ignore-engines', '--non-interactive', '--no-progress', '--silent'], web);
  // Yarn 1 still installs dev packages that satisfy a production package's
  // optional peer (Next lists Playwright; tailwindcss-animate, Tailwind): keep only
  // what production code can actually reach.
  pruneToProductionClosure(web);
  pruneForWindows(web);

  // -- Runtimes ------------------------------------------------------------
  step('Runtimes');
  const nodeZip = await download(versions.node.url, path.join(CACHE, path.basename(versions.node.url)));
  const shasums = await checksums(versions.node.shasumsUrl, 'node-SHASUMS256.txt');
  const nodeLine = shasums.split('\n').find((l) => l.trim().endsWith(path.basename(versions.node.url)));
  if (!nodeLine) throw new Error('Node checksum not found in SHASUMS256.txt');
  verify(nodeZip, nodeLine.split(/\s+/)[0], `Node ${versions.node.version}`);
  const tmp = path.join(CACHE, 'unpacked');
  fs.rmSync(tmp, { recursive: true, force: true });
  unzip(nodeZip, path.join(tmp, 'node'));
  fs.mkdirSync(path.join(OUT, 'runtime/node'), { recursive: true });
  fs.copyFileSync(findFile(path.join(tmp, 'node'), 'node.exe'), path.join(OUT, 'runtime/node/node.exe'));
  fs.copyFileSync(findFile(path.join(tmp, 'node'), 'LICENSE'), path.join(OUT, 'runtime/node/LICENSE'));

  const mongoZip = await download(versions.mongodb.url, path.join(CACHE, path.basename(versions.mongodb.url)));
  verify(mongoZip, (await checksums(versions.mongodb.sha256Url, 'mongodb.sha256')).trim().split(/\s+/)[0], `MongoDB ${versions.mongodb.version}`);
  unzip(mongoZip, path.join(tmp, 'mongodb'));
  const mongoBin = path.join(OUT, 'runtime/mongodb/bin');
  fs.mkdirSync(mongoBin, { recursive: true });
  fs.copyFileSync(findFile(path.join(tmp, 'mongodb'), 'mongod.exe'), path.join(mongoBin, 'mongod.exe'));
  for (const f of ['LICENSE-Community.txt', 'MPL-2', 'README', 'THIRD-PARTY-NOTICES']) {
    const src = findFile(path.join(tmp, 'mongodb'), f);
    if (src) fs.copyFileSync(src, path.join(OUT, 'runtime/mongodb', `server-${f}`));
  }

  const toolsZip = await download(versions.mongodbTools.url, path.join(CACHE, path.basename(versions.mongodbTools.url)));
  verify(toolsZip, versions.mongodbTools.sha256, `MongoDB tools ${versions.mongodbTools.version}`);
  unzip(toolsZip, path.join(tmp, 'tools'));
  for (const exe of ['mongodump.exe', 'mongorestore.exe']) fs.copyFileSync(findFile(path.join(tmp, 'tools'), exe), path.join(mongoBin, exe));
  const toolsLicense = findFile(path.join(tmp, 'tools'), 'LICENSE.md');
  if (toolsLicense) fs.copyFileSync(toolsLicense, path.join(OUT, 'runtime/mongodb/tools-LICENSE.md'));

  const vc = await download(versions.vcRedist.url, path.join(CACHE, 'VC_redist.x64.exe'));
  verify(vc, versions.vcRedist.sha256, 'Visual C++ runtime');
  fs.copyFileSync(vc, path.join(OUT, 'runtime/vc_redist.x64.exe'));

  const winsw = await download(versions.winsw.url, path.join(CACHE, `WinSW-x64-${versions.winsw.version}.exe`));
  verify(winsw, versions.winsw.sha256, `WinSW ${versions.winsw.version}`);
  fs.mkdirSync(path.join(OUT, 'services'), { recursive: true });
  fs.copyFileSync(winsw, path.join(OUT, 'services/WinSW-x64.exe'));
  fs.rmSync(tmp, { recursive: true, force: true });

  // -- Scripts, settings, docs --------------------------------------------
  step('Scripts, settings and guides');
  copy(path.join(HERE, 'windows'), OUT);
  fs.mkdirSync(path.join(OUT, 'config'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'config/standalone.env.example'), path.join(OUT, 'config/observator.env.template'));
  fs.writeFileSync(path.join(OUT, 'VERSION'), `${VERSION}\r\n`);
  const docs = path.join(ROOT, 'docs/site');
  if (fs.existsSync(docs)) copy(docs, path.join(OUT, 'docs'));
  fs.writeFileSync(
    path.join(OUT, 'versions.txt'),
    [
      `Observator Weather Station ${VERSION}`,
      `Node.js ${versions.node.version}`,
      `MongoDB ${versions.mongodb.version}`,
      `MongoDB Database Tools ${versions.mongodbTools.version}`,
      `WinSW ${versions.winsw.version}`,
      `Built ${new Date().toISOString()}`,
      '',
    ].join('\r\n'),
  );

  step('Checks');
  checkScripts(OUT);
  checkNoForeignBinaries(OUT);

  if (args.has('--exe')) {
    step('Setup.exe');
    buildSetupExe();
  }

  if (!args.has('--no-zip')) {
    step('Zip');
    const zip = path.join(HERE, 'dist', `${NAME}.zip`);
    fs.rmSync(zip, { force: true });
    if (isWin) run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}' -DestinationPath '${zip}'`]);
    else execFileSync('zip', ['-q', '-r', '-9', zip, NAME], { cwd: path.join(HERE, 'dist'), stdio: 'inherit' });
    const hash = sha256(zip);
    fs.writeFileSync(`${zip}.sha256`, `${hash}  ${NAME}.zip\n`);
    log(`   ${path.relative(ROOT, zip)}  (${(fs.statSync(zip).size / 1048576).toFixed(0)} MB)`);
    log(`   sha256 ${hash}`);
  }
  log('\nDone.');
}

/**
 * Compile the wizard around this release (installer/windows-setup/setup.iss).
 * Inno Setup runs on Windows; on Linux it is driven through Wine, where this
 * machine's paths are under the Z: drive.
 */
function buildSetupExe() {
  const iscc = process.env.ISCC;
  if (!iscc) throw new Error('--exe needs ISCC=<path to ISCC.exe> (Inno Setup 6).');
  const toWin = (p) => (isWin ? p : `Z:${p.replace(/\//g, '\\')}`);
  const argv = [
    `/DAppVersion=${VERSION}`,
    `/DSourceDir=${toWin(OUT)}`,
    `/DOutputDir=${toWin(path.join(HERE, 'dist'))}`,
    toWin(path.join(HERE, 'windows-setup/setup.iss')),
  ];
  if (isWin) run(iscc, argv, HERE);
  else run(process.env.WINE || 'wine', [iscc, ...argv], HERE, { WINEDEBUG: process.env.WINEDEBUG || '-all' });
  const exe = path.join(HERE, 'dist', `${NAME.replace('-win-x64', '')}-setup.exe`);
  if (!fs.existsSync(exe)) throw new Error(`Inno Setup reported success but ${exe} is missing.`);
  log(`   ${path.relative(ROOT, exe)}  (${(fs.statSync(exe).size / 1048576).toFixed(0)} MB)`);
  fs.writeFileSync(`${exe}.sha256`, `${sha256(exe)}  ${path.basename(exe)}\n`);
}

/**
 * Delete every installed package that production code cannot reach: walk from
 * package.json's `dependencies` through each package's `dependencies` and
 * `optionalDependencies` (never dev, never peer), resolving each name the way
 * Node does - the nearest node_modules up the tree - and remove the rest.
 */
function pruneToProductionClosure(dir) {
  const root = path.join(dir, 'node_modules');
  const readPkg = (p) => JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'));
  // Node's rule: <each ancestor folder>/node_modules/<name>, nearest first.
  const resolveFrom = (fromDir, name) => {
    for (let cur = fromDir; cur.startsWith(dir); cur = path.dirname(cur)) {
      if (path.basename(cur) !== 'node_modules') {
        const cand = path.join(cur, 'node_modules', name);
        if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
      }
      if (cur === dir) break;
    }
    return null;
  };
  const keep = new Set();
  const queue = [[dir, Object.keys(readPkg(dir).dependencies ?? {})]];
  while (queue.length) {
    const [from, names] = queue.pop();
    for (const name of names) {
      const at = resolveFrom(from, name);
      if (!at || keep.has(at)) continue;
      keep.add(at);
      const pkg = readPkg(at);
      queue.push([at, [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]]);
    }
  }
  let removed = 0;
  const sweep = (modules) => {
    if (!fs.existsSync(modules)) return;
    for (const name of fs.readdirSync(modules)) {
      if (name.startsWith('.')) continue;
      const entries = name.startsWith('@') ? fs.readdirSync(path.join(modules, name)).map((n) => path.join(modules, name, n)) : [path.join(modules, name)];
      for (const p of entries) {
        if (!fs.existsSync(path.join(p, 'package.json'))) continue;
        if (keep.has(p)) sweep(path.join(p, 'node_modules'));
        else {
          fs.rmSync(p, { recursive: true, force: true });
          removed++;
        }
      }
    }
  };
  sweep(root);
  removeLinks(dir);
  log(`   kept ${keep.size} production package(s), removed ${removed} dev-only`);
}

/**
 * Remove every symbolic link (the node_modules/.bin shims, some now dangling).
 * Nothing at run time uses them, and a zip unpacked on Windows cannot make them.
 */
function removeLinks(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) fs.rmSync(p, { force: true });
    else if (e.isDirectory()) removeLinks(p);
  }
}

/**
 * Leave only what Windows x64 runs. The portal's images are `unoptimized`, so
 * sharp is never loaded; Next's compiler (SWC) is only needed to build, and the
 * config is plain .mjs; anything else carrying another platform's name goes.
 */
function pruneForWindows(dir) {
  const nm = path.join(dir, 'node_modules');
  // Whole platform names only ("-linux-", "darwin-") - a bare "arm" would match ordinary names.
  const otherOs = /(^|-)(linux|linuxmusl|darwin|freebsd|openbsd|netbsd|sunos|android|aix|wasm32)(-|$)/i;
  const otherWinCpu = /win32-(arm64|ia32)/i;
  const foreign = { test: (pkg) => otherOs.test(pkg) || otherWinCpu.test(pkg) };
  let removed = 0;
  const visit = (modules) => {
    if (!fs.existsSync(modules)) return;
    for (const scope of fs.readdirSync(modules)) {
      const sp = path.join(modules, scope);
      if (scope.startsWith('@')) {
        for (const pkg of fs.readdirSync(sp)) {
          const pp = path.join(sp, pkg);
          const drop = scope === '@next' ? pkg.startsWith('swc-') : scope === '@img' ? true : foreign.test(pkg);
          if (drop) {
            fs.rmSync(pp, { recursive: true, force: true });
            removed++;
          } else visit(path.join(pp, 'node_modules'));
        }
      } else if (scope === 'sharp' || scope === 'fsevents') {
        fs.rmSync(sp, { recursive: true, force: true });
        removed++;
      } else visit(path.join(sp, 'node_modules'));
    }
  };
  visit(nm);
  log(`   removed ${removed} package(s) Windows does not need`);
}

function checkScripts(dir) {
  const scripts = [];
  walk(dir, (f) => {
    if (/\.(ps1|psm1|cmd)$/i.test(f) && !f.includes(`${path.sep}node_modules${path.sep}`)) scripts.push(f);
  });
  for (const f of scripts) {
    const buf = fs.readFileSync(f);
    const bad = buf.findIndex((b) => b > 0x7e || (b < 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09));
    if (bad !== -1) throw new Error(`${path.relative(dir, f)}: non-ASCII byte at offset ${bad} - Windows PowerShell 5.1 would misread it.`);
  }
  log(`   ${scripts.length} scripts are plain ASCII`);
  const pwsh = process.env.PWSH || (isWin ? 'powershell' : 'pwsh');
  const ps = scripts.filter((f) => /\.ps(m?)1$/i.test(f));
  const check = ps.map((f) => `$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${f.replace(/'/g, "''")}',[ref]$null,[ref]$e); if ($e) { $e | % { Write-Output ('${path.basename(f)}: ' + $_.Extent.StartLineNumber + ': ' + $_.Message) } }`).join('; ');
  try {
    const out = execFileSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', check], { encoding: 'utf8' });
    if (out.trim()) throw new Error(`PowerShell syntax errors:\n${out}`);
    log(`   ${ps.length} PowerShell scripts parse cleanly`);
  } catch (err) {
    if (err.code === 'ENOENT') log('   (PowerShell not found - syntax not checked; set PWSH=<path>)');
    else throw err;
  }
}

function checkNoForeignBinaries(dir) {
  const bad = [];
  let pe = 0;
  walk(path.join(dir, 'app'), (f) => {
    const fd = fs.openSync(f, 'r');
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    const elf = head[0] === 0x7f && head.toString('latin1', 1, 4) === 'ELF';
    const macho = [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(head.readUInt32BE(0));
    if (elf || macho) bad.push(path.relative(dir, f));
    if (head[0] === 0x4d && head[1] === 0x5a && f.endsWith('.node')) pe++;
  });
  if (bad.length) throw new Error(`Binaries for another platform left in the release:\n  ${bad.slice(0, 20).join('\n  ')}`);
  log(`   no Linux/macOS binaries in app/ (${pe} Windows native module(s))`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
