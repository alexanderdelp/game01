import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Branch und Commit des Builds – in Workers Builds aus WORKERS_CI_*, lokal aus git (wie konjugi). */
function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
const branch = process.env.WORKERS_CI_BRANCH || process.env.GITHUB_HEAD_REF || git('rev-parse --abbrev-ref HEAD') || 'lokal';
const isSha = (s?: string) => !!s && /^[0-9a-f]{7,40}$/i.test(s);
const commit = ([git('rev-parse HEAD'), process.env.WORKERS_CI_COMMIT_SHA].find(isSha) ?? 'unbekannt').slice(0, 7);
const version: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BRANCH__: JSON.stringify(branch),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: { chunkSizeWarningLimit: 2000, minify: false },
});
