/** Welche Umgebung läuft? Abgeleitet vom Git-Branch, aus dem gebaut wurde (wie konjugi). */
export type Stage = 'release' | 'integration' | 'abnahme' | 'lokal';

declare const __APP_VERSION__: string;
declare const __APP_BRANCH__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

export function stageFor(branch: string): Stage {
  if (branch === 'release') return 'release';
  if (branch === 'main') return 'integration';
  if (branch === 'lokal' || branch === '' || branch === 'HEAD') return 'lokal';
  return 'abnahme';
}

/** Kurzes Label für das Umgebungs-Abzeichen; in Produktion keins. */
export function stageLabel(stage: Stage, branch: string): string | null {
  switch (stage) {
    case 'release':
      return null;
    case 'integration':
      return 'Integration';
    case 'abnahme':
      return `Abnahme: ${branch}`;
    case 'lokal':
      return 'Lokal';
  }
}

const v = <T>(f: () => T, fallback: T): T => {
  try {
    return f();
  } catch {
    return fallback; // in Unit-Tests ohne Vite-define
  }
};

export const build = {
  version: v(() => __APP_VERSION__, '0.0.0'),
  branch: v(() => __APP_BRANCH__, 'lokal'),
  commit: v(() => __APP_COMMIT__, 'unbekannt'),
  time: v(() => __APP_BUILD_TIME__, ''),
  get stage(): Stage {
    return stageFor(this.branch);
  },
};

/** Text unten am Rand: Version, außerhalb der Produktion zusätzlich Branch und Commit. */
export function versionText(b: { version: string; branch: string; commit: string; stage: Stage }): string {
  return b.stage === 'release' ? `v${b.version}` : `v${b.version} · ${b.branch} · ${b.commit}`;
}

/** Abzeichen oben und Versionszeile unten als HTML über dem Spiel (klick-durchlässig). */
export function mountBuildInfo(doc: Document = document): void {
  const label = stageLabel(build.stage, build.branch);
  if (label) {
    const badge = doc.createElement('div');
    badge.id = 'stage-badge';
    badge.textContent = label;
    badge.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:10;pointer-events:none;font:bold 11px monospace;color:#0b0b14;background:#ffb547;padding:2px 8px;border-radius:3px;opacity:.85';
    doc.body.appendChild(badge);
  }
  const ver = doc.createElement('div');
  ver.id = 'build-version';
  ver.textContent = versionText(build);
  ver.title = build.time;
  ver.style.cssText = 'position:fixed;bottom:2px;left:4px;z-index:10;pointer-events:none;font:10px monospace;color:#8a8aa0;opacity:.6';
  doc.body.appendChild(ver);
}
