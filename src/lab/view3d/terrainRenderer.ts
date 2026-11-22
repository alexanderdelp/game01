/**
 * Boden mit echter Höhe (M33 Laborphase 2) in einem eigenen WebGL2-Canvas unter dem (durchsichtigen) Phaser-Canvas.
 *
 * Ringtexturen wie im Prototyp `prototyp/perspektive`: Chunk (cx, cy) liegt im Platz (cx mod RW, cy mod RH).
 * - Farbe: das Bodenbild des Chunk-Workers (Pixel-Art, NEAREST).
 * - Höhe: Zellhöhen (4 px) als R16F, linear gefiltert → weiche Hänge.
 * Pro Bildpunkt läuft der Sehstrahl von der Kamera durch das Höhenfeld (Schrittweite wächst mit der Entfernung),
 * der Treffer wird per Bisektion verfeinert. Schattierung aus der Geländeneigung (Licht von Nordwesten),
 * wahlweise Höhenlinien je Stufe, Dunst bis zur Sichtweite.
 */
import type { Projection } from './projection';

const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uScreen;
uniform vec2 uCenter;
uniform float uF;
uniform float uD;
uniform float uSin;
uniform float uCos;
uniform vec3 uTarget;
uniform vec2 uRing;
uniform float uChunk;
uniform float uCells;
uniform vec4 uBounds;
uniform float uHScale;
uniform float uMaxH;
uniform float uFogStart;
uniform float uFogEnd;
uniform vec3 uFog;
uniform vec3 uSkyTop;
uniform float uShade;
uniform float uContour;
uniform float uLevel;
uniform sampler2D uGround;
uniform sampler2D uTags;
uniform sampler2D uHeight;
out vec4 outColor;

float H(vec2 w) {
  if (w.x < uBounds.x || w.y < uBounds.y || w.x >= uBounds.z || w.y >= uBounds.w) return -1e5;
  vec2 c = floor(w / uChunk);
  vec2 slot = mod(c, uRing);
  vec2 local = clamp((w - c * uChunk) / (uChunk / uCells), vec2(0.5), vec2(uCells - 0.5));
  return texture(uHeight, (slot * uCells + local) / (uRing * uCells)).r * uHScale;
}

vec4 ground(vec2 w) {
  vec2 c = floor(w / uChunk);
  vec2 slot = mod(c, uRing);
  vec4 tag = texelFetch(uTags, ivec2(slot), 0);
  vec2 want = mod(c, 256.0);
  if (tag.a < 0.5 || abs(floor(tag.r * 255.0 + 0.5) - want.x) > 0.5 || abs(floor(tag.g * 255.0 + 0.5) - want.y) > 0.5) return vec4(uFog, 0.0);
  ivec2 px = ivec2(slot * uChunk + clamp(floor(w - c * uChunk), vec2(0.0), vec2(uChunk - 1.0)));
  return vec4(texelFetch(uGround, px, 0).rgb, 1.0);
}

void main() {
  vec2 p = gl_FragCoord.xy / uRes * uScreen;
  p.y = uScreen.y - p.y;
  float px = p.x - uCenter.x;
  float py = p.y - uCenter.y;
  vec3 cam = vec3(uTarget.x, uTarget.y + uD * uSin, uTarget.z + uD * uCos);
  vec3 dir = normalize(vec3(px, -uF * uSin + py * uCos, -uF * uCos - py * uSin));
  vec3 skyCol = mix(uSkyTop, uFog, clamp(1.0 + dir.z * 2.5, 0.0, 1.0));
  if (dir.z >= -1e-4 && cam.z > uMaxH) { outColor = vec4(skyCol, 1.0); return; }
  // Erst dort beginnen, wo der Strahl unter die höchste Stelle sinkt
  float t = dir.z < 0.0 ? max(0.0, (cam.z - uMaxH) / -dir.z) : 0.0;
  float hl = max(length(dir.xy), 1e-4);
  float tMax = (uD * uSin + uFogEnd + 64.0) / hl;
  float prev = t;
  bool hit = false;
  vec3 q;
  for (int i = 0; i < 320; i++) {
    q = cam + dir * t;
    if (q.z < H(q.xy)) { hit = true; break; }
    if (t > tMax || q.z < uTarget.z - 4000.0) break;
    prev = t;
    t += max(2.0, t * 0.008);
  }
  if (!hit) { outColor = vec4(skyCol, 1.0); return; }
  float a = prev;
  float b = t;
  for (int i = 0; i < 6; i++) {
    float m = 0.5 * (a + b);
    vec3 r = cam + dir * m;
    if (r.z < H(r.xy)) b = m; else a = m;
  }
  q = cam + dir * b;
  vec4 c = ground(q.xy);
  vec3 col = c.rgb;
  // Licht von Nordwesten aus der Neigung
  float e = 4.0;
  float hx = H(q.xy + vec2(e, 0.0)) - H(q.xy - vec2(e, 0.0));
  float hy = H(q.xy + vec2(0.0, e)) - H(q.xy - vec2(0.0, e));
  vec3 n = normalize(vec3(-hx, -hy, 2.0 * e));
  vec3 L = normalize(vec3(-0.6, -0.8, 1.1));
  float lit = clamp(dot(n, L) / L.z, 0.25, 1.5);
  col *= mix(1.0, 0.3 + 0.7 * lit, uShade);
  // Höhenlinien je Stufe
  if (uContour > 0.0) {
    float u = H(q.xy) / (uHScale * uLevel);
    float d = abs(fract(u + 0.5) - 0.5);
    float w = 0.04 + b * 0.00002;
    col *= 1.0 - uContour * 0.45 * (1.0 - smoothstep(w * 0.5, w, d));
  }
  float fog = smoothstep(uFogStart, uFogEnd, max(0.0, uTarget.y - q.y));
  outColor = vec4(mix(col, uFog, max(fog, 1.0 - c.a)), 1.0);
}
`;

export interface TerrainLook {
  fogStart: number;
  fogEnd: number;
  fog: [number, number, number];
  sky: [number, number, number];
  /** Pixel je Höheneinheit */
  hScale: number;
  /** Höhe der Kamera-Zielhöhe in Pixeln steckt in der Projektion; hier höchste geladene Stelle (Einheiten) */
  maxUnits: number;
  shade: number;
  contour: number;
  /** Höheneinheiten je Stufe (Abstand der Höhenlinien) */
  level: number;
  /** geladener Bereich (Weltpixel) */
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

export class TerrainRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: WebGLProgram;
  private readonly groundTex: WebGLTexture;
  private readonly tags: WebGLTexture;
  private readonly heights: WebGLTexture;
  private readonly tagData: Uint8Array;
  private readonly empty: Float32Array;
  private readonly u: Record<string, WebGLUniformLocation | null> = {};
  readonly ringW: number;
  readonly ringH: number;
  /** Bildschirmpixel je Bodenpixel (1 = volle Auflösung, 2–4 = gröber, schneller) */
  pixel = 2;

  /** Erzeugt den Renderer oder undefined ohne WebGL2. */
  static create(parent: HTMLElement, chunkPx: number, cells: number): TerrainRenderer | undefined {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return undefined;
    return new TerrainRenderer(parent, canvas, gl, chunkPx, cells);
  }

  private constructor(parent: HTMLElement, canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, private readonly chunkPx: number, private readonly cells: number) {
    this.canvas = canvas;
    canvas.id = 'labor-terrain';
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: '0', imageRendering: 'pixelated' });
    parent.prepend(canvas);
    this.gl = gl;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.ringW = max >= chunkPx * 16 ? 16 : 8;
    this.ringH = 8;
    this.prog = link(gl, VS, FS);
    gl.useProgram(this.prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const names = ['uRes', 'uScreen', 'uCenter', 'uF', 'uD', 'uSin', 'uCos', 'uTarget', 'uRing', 'uChunk', 'uCells', 'uBounds', 'uHScale', 'uMaxH', 'uFogStart', 'uFogEnd', 'uFog', 'uSkyTop', 'uShade', 'uContour', 'uLevel', 'uGround', 'uTags', 'uHeight'];
    for (const n of names) this.u[n] = gl.getUniformLocation(this.prog, n);

    this.groundTex = texture(gl, gl.RGBA8, this.ringW * chunkPx, this.ringH * chunkPx, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    this.tags = texture(gl, gl.RGBA8, this.ringW, this.ringH, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    this.heights = texture(gl, gl.R16F, this.ringW * cells, this.ringH * cells, gl.RED, gl.FLOAT, gl.LINEAR);
    this.tagData = new Uint8Array(this.ringW * this.ringH * 4);
    this.empty = new Float32Array(cells * cells).fill(-1e4);
    gl.uniform1i(this.u.uGround, 0);
    gl.uniform1i(this.u.uTags, 1);
    gl.uniform1i(this.u.uHeight, 2);
  }

  /** Bodenbild und Zellhöhen eines Chunks in seinen Ringplatz legen. */
  upload(cx: number, cy: number, image: TexImageSource, heights: Float32Array): void {
    const gl = this.gl;
    const sx = mod(cx, this.ringW);
    const sy = mod(cy, this.ringH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * this.chunkPx, sy * this.chunkPx, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.putHeights(sx, sy, heights);
    this.setTag(sx, sy, [mod(cx, 256), mod(cy, 256), 0, 255]);
  }

  /** Chunk entladen: Platz freigeben (sofern er noch drinliegt). */
  release(cx: number, cy: number): void {
    const sx = mod(cx, this.ringW);
    const sy = mod(cy, this.ringH);
    const i = (sy * this.ringW + sx) * 4;
    if (this.tagData[i] === mod(cx, 256) && this.tagData[i + 1] === mod(cy, 256)) {
      this.setTag(sx, sy, [0, 0, 0, 0]);
      this.putHeights(sx, sy, this.empty);
    }
  }

  private putHeights(sx: number, sy: number, data: Float32Array): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.heights);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * this.cells, sy * this.cells, this.cells, this.cells, gl.RED, gl.FLOAT, data);
  }

  private setTag(sx: number, sy: number, v: number[]): void {
    const gl = this.gl;
    this.tagData.set(v, (sy * this.ringW + sx) * 4);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tags);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.ringW, this.ringH, gl.RGBA, gl.UNSIGNED_BYTE, this.tagData);
  }

  render(p: Projection, look: TerrainLook): void {
    const gl = this.gl;
    const w = Math.max(1, Math.floor(p.v.width / this.pixel));
    const h = Math.max(1, Math.floor(p.v.height / this.pixel));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tags);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.heights);
    const u = this.u;
    gl.uniform2f(u.uRes, w, h);
    gl.uniform2f(u.uScreen, p.v.width, p.v.height);
    gl.uniform2f(u.uCenter, p.cx, p.cy);
    gl.uniform1f(u.uF, p.f);
    gl.uniform1f(u.uD, p.d);
    gl.uniform1f(u.uSin, p.sin);
    gl.uniform1f(u.uCos, p.cos);
    gl.uniform3f(u.uTarget, p.v.tx, p.v.ty, p.v.th);
    gl.uniform2f(u.uRing, this.ringW, this.ringH);
    gl.uniform1f(u.uChunk, this.chunkPx);
    gl.uniform1f(u.uCells, this.cells);
    const b = look.bounds;
    gl.uniform4f(u.uBounds, b.x0, b.y0, b.x1, b.y1);
    gl.uniform1f(u.uHScale, look.hScale);
    gl.uniform1f(u.uMaxH, look.maxUnits * look.hScale + 4);
    gl.uniform1f(u.uFogStart, look.fogStart);
    gl.uniform1f(u.uFogEnd, look.fogEnd);
    gl.uniform3f(u.uFog, ...look.fog);
    gl.uniform3f(u.uSkyTop, ...look.sky);
    gl.uniform1f(u.uShade, look.shade);
    gl.uniform1f(u.uContour, look.contour);
    gl.uniform1f(u.uLevel, look.level);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy(): void {
    this.canvas.remove();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

function texture(gl: WebGL2RenderingContext, internal: number, w: number, h: number, format: number, type: number, filter: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'Programm');
  return p;
}
