// Publish the site to GitHub Pages: build for https://<user>.github.io/<repo>/ and commit the built
// site (dist/) to the gh-pages branch through a temporary git worktree, so the main branch and the
// working tree are untouched. Pages serves that branch. The built site includes the General Sans
// files: self-hosting them for this website is what their licence allows (they are not committed to
// main; see src/assets/fonts/README.md).
//
// Usage: ./node.sh node scripts/publish-pages.mjs --user <github-login> [--repo solar-dye] [--push]
// Without --push it builds and commits to the local gh-pages branch only.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(site, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const user = arg('user');
const repo = arg('repo', 'solar-dye');
const push = process.argv.includes('--push');
if (!user) throw new Error('publish-pages: pass --user <github-login>');

const run = (cmd, cwd = repoRoot, env = {}) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
const out = (cmd, cwd = repoRoot) => execSync(cmd, { cwd, encoding: 'utf-8' }).trim();

const SITE_URL = `https://${user.toLowerCase()}.github.io`;
const SITE_BASE = `/${repo}/`;
console.log(`publish-pages: building for ${SITE_URL}${SITE_BASE}`);
run('npm run build', site, { SITE_URL, SITE_BASE });
if (!fs.existsSync(path.join(site, 'dist', '.nojekyll'))) throw new Error('publish-pages: dist/.nojekyll missing (GitHub would drop _astro/)');

const source = out('git rev-parse --short HEAD');
const dirty = out('git status --porcelain -- site results src') !== '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solar-dye-pages-'));
try {
  const hasBranch = out('git branch --list gh-pages') !== '';
  if (hasBranch) run(`git worktree add "${tmp}" gh-pages`);
  else {
    run(`git worktree add --detach "${tmp}"`);
    run('git checkout --orphan gh-pages', tmp);
  }
  // Replace the branch contents with the fresh build.
  for (const entry of fs.readdirSync(tmp)) if (entry !== '.git') fs.rmSync(path.join(tmp, entry), { recursive: true, force: true });
  fs.cpSync(path.join(site, 'dist'), tmp, { recursive: true });
  run('git add -A', tmp);
  const changed = out('git status --porcelain', tmp) !== '';
  if (changed) run(`git commit -q -m "Deploy site built from ${source}${dirty ? ' (with uncommitted changes)' : ''}"`, tmp);
  else console.log('publish-pages: no changes to deploy');
  if (push) run('git push origin gh-pages', tmp);
} finally {
  run(`git worktree remove --force "${tmp}"`);
}
console.log(`publish-pages: done${push ? `; live soon at ${SITE_URL}${SITE_BASE}` : ' (not pushed; add --push)'}`);
