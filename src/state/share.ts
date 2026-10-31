/** Teilen einer Welt per Link (Daten im Anker, nie an einen Server gesendet) oder Datei. */
import type { WorldEvent } from './worldState';

export interface SharePayload {
  seed: string;
  events: WorldEvent[];
}

const toB64Url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeShare(p: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  return toB64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeShare(code: string): Promise<SharePayload | null> {
  try {
    const raw = await pipe(fromB64Url(code), new DecompressionStream('deflate-raw'));
    const p = JSON.parse(new TextDecoder().decode(raw)) as SharePayload;
    return typeof p.seed === 'string' && Array.isArray(p.events) ? p : null;
  } catch {
    return null;
  }
}

export async function shareLink(p: SharePayload): Promise<string> {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('seed', p.seed);
  url.hash = `w=${await encodeShare(p)}`;
  return url.toString();
}
