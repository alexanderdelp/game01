/**
 * Boden als gekippte Ebene („Mode 7“) in einem eigenen WebGL-Canvas unter dem Phaser-Canvas.
 *
 * Die Bodenbilder der Chunks (wie im Spiel vom Chunk-Worker gemalt) liegen in einer Ringtextur: Chunk (cx, cy) im
 * Platz (cx mod RW, cy mod RH). Eine kleine Kennungs-Textur sagt je Platz, welcher Chunk gerade drin liegt – so
 * zeigt der Shader nie veraltete oder fehlende Chunks, sondern Nebel. Pro Bildpunkt wird der Sehstrahl mit der
 * Bodenebene geschnitten (gleiche Formeln wie `Projection`), in der Ferne mit 4 Abtastungen geglättet.
 */
import type { Projection } from './projection';

const VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FS = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uScreen;
uniform vec2 uCenter;
uniform float uF;
uniform float uD;
uniform float uSin;
uniform float uCos;
uniform vec2 uTarget;
uniform vec2 uRing;
uniform float uChunk;
uniform float uWorld;
uniform float uFogStart;
uniform float uFogEnd;
uniform vec3 uFog;
uniform vec3 uSkyTop;
uniform sampler2D uGround;
uniform sampler2D uTags;

vec4 world(vec2 w) {
  if (w.x < 0.0 || w.y < 0.0 || w.x >= uWorld || w.y >= uWorld) return vec4(0.08, 0.2, 0.42, 1.0);
  vec2 c = floor(w / uChunk);
  vec2 slot = mod(c, uRing);
  vec4 tag = texture2D(uTags, (slot + 0.5) / uRing);
  vec2 want = mod(c, 256.0);
  if (tag.a < 0.5 || abs(floor(tag.r * 255.0 + 0.5) - want.x) > 0.5 || abs(floor(tag.g * 255.0 + 0.5) - want.y) > 0.5) return vec4(uFog, 0.0);
  vec2 uv = (slot * uChunk + (w - c * uChunk)) / (uRing * uChunk);
  return vec4(texture2D(uGround, uv).rgb, 1.0);
}

void main() {
  vec2 p = gl_FragCoord.xy / uRes * uScreen;
  p.y = uScreen.y - p.y;
  float px = p.x - uCenter.x;
  float py = p.y - uCenter.y;
  float den = uF * uCos + py * uSin;
  // Himmel: oben dunkler, zum Horizont hin Nebelfarbe
  float sky = clamp(p.y / max(1.0, uScreen.y * 0.5), 0.0, 1.0);
  vec3 skyCol = mix(uSkyTop, uFog, sky);
  if (den <= 0.0) { gl_FragColor = vec4(skyCol, 1.0); return; }
  float dy = py * uD / den;
  float z = uD - dy * uSin;
  vec2 w = uTarget + vec2(px * z / uF, dy);
  float fog = smoothstep(uFogStart, uFogEnd, max(0.0, -dy));
  if (fog >= 1.0) { gl_FragColor = vec4(uFog, 1.0); return; }
  // Weltpixel je Bildpunkt (in Tiefenrichtung zusätzlich gestaucht)
  float foot = max(z / uF, uD * uF * uCos / (den * den)) * uScreen.x / uRes.x;
  vec4 c;
  if (foot > 1.3) {
    float o = min(foot, 16.0) * 0.25;
    c = (world(w + vec2(-o, -o)) + world(w + vec2(o, -o)) + world(w + vec2(-o, o)) + world(w + vec2(o, o))) * 0.25;
  } else c = world(w);
  vec3 col = mix(c.rgb, uFog, max(fog, 1.0 - c.a));
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface Fog {
  start: number;
  end: number;
  color: [number, number, number];
  sky: [number, number, number];
}

export class GroundRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly prog: WebGLProgram;
  private readonly ground: WebGLTexture;
  private readonly tags: WebGLTexture;
  private readonly tagData: Uint8Array;
  private readonly u: Record<string, WebGLUniformLocation | null> = {};
  /** Ringgröße in Chunks */
  readonly ringW: number;
  readonly ringH: number;
  /** Bodenpixel je Bildschirmpixel (1 = volle Auflösung, 2–3 = grober, „pixeliger“) */
  pixel = 1;

  constructor(parent: HTMLElement, private readonly chunkPx: number, private readonly worldPx: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'perspektive-ground';
    Object.assign(this.canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: '0', imageRendering: 'pixelated' });
    parent.prepend(this.canvas);
    const gl = this.canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL fehlt');
    this.gl = gl;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    // 16 × 8 Chunks (8192 × 4096 px), wenn die Grafikkarte das kann – sonst 8 × 8
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
    for (const n of ['uRes', 'uScreen', 'uCenter', 'uF', 'uD', 'uSin', 'uCos', 'uTarget', 'uRing', 'uChunk', 'uWorld', 'uFogStart', 'uFogEnd', 'uFog', 'uSkyTop', 'uGround', 'uTags']) {
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }

    this.ground = texture(gl, this.ringW * chunkPx, this.ringH * chunkPx);
    this.tagData = new Uint8Array(this.ringW * this.ringH * 4);
    this.tags = texture(gl, this.ringW, this.ringH);
    gl.uniform1i(this.u.uGround, 0);
    gl.uniform1i(this.u.uTags, 1);
  }

  /** Bodenbild eines Chunks in seinen Ringplatz kopieren. */
  upload(cx: number, cy: number, image: TexImageSource): void {
    const gl = this.gl;
    const sx = cx % this.ringW;
    const sy = cy % this.ringH;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ground);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * this.chunkPx, sy * this.chunkPx, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.setTag(sx, sy, [cx % 256, cy % 256, 0, 255]);
  }

  /** Chunk ist entladen: Platz freigeben (sofern er noch drinliegt). */
  release(cx: number, cy: number): void {
    const sx = cx % this.ringW;
    const sy = cy % this.ringH;
    const i = (sy * this.ringW + sx) * 4;
    if (this.tagData[i] === cx % 256 && this.tagData[i + 1] === cy % 256) this.setTag(sx, sy, [0, 0, 0, 0]);
  }

  private setTag(sx: number, sy: number, v: number[]): void {
    const gl = this.gl;
    this.tagData.set(v, (sy * this.ringW + sx) * 4);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tags);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.ringW, this.ringH, gl.RGBA, gl.UNSIGNED_BYTE, this.tagData);
  }

  render(p: Projection, fog: Fog): void {
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
    gl.bindTexture(gl.TEXTURE_2D, this.ground);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tags);
    const u = this.u;
    gl.uniform2f(u.uRes, w, h);
    gl.uniform2f(u.uScreen, p.v.width, p.v.height);
    gl.uniform2f(u.uCenter, p.cx, p.cy);
    gl.uniform1f(u.uF, p.f);
    gl.uniform1f(u.uD, p.d);
    gl.uniform1f(u.uSin, p.sin);
    gl.uniform1f(u.uCos, p.cos);
    gl.uniform2f(u.uTarget, p.v.tx, p.v.ty);
    gl.uniform2f(u.uRing, this.ringW, this.ringH);
    gl.uniform1f(u.uChunk, this.chunkPx);
    gl.uniform1f(u.uWorld, this.worldPx);
    gl.uniform1f(u.uFogStart, fog.start);
    gl.uniform1f(u.uFogEnd, fog.end);
    gl.uniform3f(u.uFog, ...fog.color);
    gl.uniform3f(u.uSkyTop, ...fog.sky);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy(): void {
    this.canvas.remove();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function texture(gl: WebGLRenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function link(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
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
