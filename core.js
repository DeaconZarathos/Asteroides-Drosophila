'use strict';
// ================= NÚCLEO: cerebro de picos + juego (sin DOM) =================
const TAU = Math.PI * 2;
const W = 800, H = 600;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wrapAng = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const angDiff = (a, b) => Math.abs(wrapAng(a - b));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapD = (d, L) => d - L * Math.round(d / L);

const NSECT = 12, NSENS = NSECT * 2;      // 12 sectores x 2 bandas (cerca / lejos)
const PER_POOL = 8, NPOOL = 4;            // 0 giro izq, 1 giro der, 2 empuje, 3 disparo
const GROUP_SENS = 0, GROUP_E = 1, GROUP_I = 2, GROUP_DN = 3;

const DT = 0.002, TAU_M = 0.02, TAU_S = 0.005, REFR = 0.003, RMAX = 160;

const P = { sh: 2.0, turn: 2.0, fire: 2.4, thr: 4.0, inh: 2.4, ee: 0.2, ring: 0.18, ei: 0.4, ie: 0.5 };

function buildBrain(seed) {
  const rnd = mulberry32(seed);
  const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd()); };
  const lognorm = s => Math.exp(gauss() * s - s * s / 2);
  const nodes = [];
  for (let k = 0; k < NSECT; k++) for (let b = 0; b < 2; b++) nodes.push({ g: GROUP_SENS, phi: wrapAng(k * TAU / NSECT), band: b });
  const NHE = 170, NHI = 56;
  for (let i = 0; i < NHE; i++) nodes.push({ g: GROUP_E, phi: (rnd() * 2 - 1) * Math.PI, band: rnd() < 0.5 ? 0 : 1 });
  for (let i = 0; i < NHI; i++) nodes.push({ g: GROUP_I, phi: (rnd() * 2 - 1) * Math.PI, band: rnd() < 0.5 ? 0 : 1 });
  for (let p = 0; p < NPOOL; p++) for (let j = 0; j < PER_POOL; j++) nodes.push({ g: GROUP_DN, pool: p, phi: 0, band: 0 });
  const N = nodes.length;
  const out = Array.from({ length: N }, () => []);
  const link = (a, b, w) => { out[a].push([b, w]); };
  const ids = g => { const r = []; nodes.forEach((n, i) => { if (n.g === g) r.push(i); }); return r; };
  const S = ids(GROUP_SENS), HE = ids(GROUP_E), HI = ids(GROUP_I);
  const M = [0, 1, 2, 3].map(p => { const r = []; nodes.forEach((n, i) => { if (n.g === GROUP_DN && n.pool === p) r.push(i); }); return r; });
  const toPool = (h, p, w) => { for (const m of M[p]) if (rnd() < 0.65) link(h, m, w * lognorm(0.4)); };

  // sensorial -> interneuronas (campo receptivo topográfico + algo de cableado cruzado)
  for (const h of HE.concat(HI)) {
    const nh = nodes[h];
    for (const s of S) {
      const ns = nodes[s], d = angDiff(nh.phi, ns.phi);
      if (ns.band === nh.band && d <= 0.6) link(s, h, P.sh * Math.exp(-Math.pow(d / 0.45, 2)) * lognorm(0.3));
      else if (rnd() < 0.03) link(s, h, P.sh * 0.25 * lognorm(0.5));
    }
  }
  // interneuronas -> neuronas descendentes
  for (const h of HE) {
    const n = nodes[h], sn = Math.sin(n.phi), cs = Math.cos(n.phi);
    const bandGain = n.band === 0 ? 1.3 : 1;
    if (sn > 0.2) toPool(h, 1, P.turn * sn * bandGain);
    if (sn < -0.2) toPool(h, 0, P.turn * -sn * bandGain);
    if (cs > 0.8) toPool(h, 3, P.fire * (0.5 + (cs - 0.8) * 2.5) * (n.band === 0 ? 1 : 0.8));
    if (n.band === 0 && cs < -0.1) toPool(h, 2, P.thr * -cs);
  }
  for (const h of HI) {
    const n = nodes[h], sn = Math.sin(n.phi), cs = Math.cos(n.phi);
    if (sn > 0.2) toPool(h, 0, -P.inh * sn);
    if (sn < -0.2) toPool(h, 1, -P.inh * -sn);
    if (n.band === 0 && cs > 0.3) toPool(h, 2, -P.inh * 1.5 * cs);
  }
  // recurrencia entre interneuronas
  for (const a of HE) for (const b of HE) {
    if (a === b) continue;
    const d = angDiff(nodes[a].phi, nodes[b].phi);
    if (rnd() < 0.03) link(a, b, P.ee * lognorm(0.6));
    else if (d < 0.4 && nodes[a].band === nodes[b].band && rnd() < 0.1) link(a, b, P.ring * lognorm(0.4));
  }
  for (const a of HE) for (const b of HI) if (rnd() < 0.05) link(a, b, P.ei * lognorm(0.5));
  for (const i of HI) {
    for (const e of HE) { if (angDiff(nodes[i].phi, nodes[e].phi) > 1.2 && rnd() < 0.12) link(i, e, -P.ie * lognorm(0.5)); }
    for (const j of HI) if (i !== j && rnd() < 0.03) link(i, j, -0.3 * lognorm(0.5));
  }

  // aplanar
  let E = 0; out.forEach(o => { E += o.length; });
  const outStart = new Int32Array(N + 1), outTo = new Int32Array(E), outW = new Float32Array(E);
  let c = 0;
  for (let i = 0; i < N; i++) { outStart[i] = c; for (const [t, w] of out[i]) { outTo[c] = t; outW[c] = w; c++; } }
  outStart[N] = c;

  const group = new Uint8Array(N), pool = new Int8Array(N).fill(-1), bias = new Float32Array(N);
  nodes.forEach((n, i) => {
    group[i] = n.g;
    if (n.g === GROUP_DN) { pool[i] = n.pool; bias[i] = n.pool === 2 ? 0.85 : 0.2; }
    else if (n.g !== GROUP_SENS) bias[i] = 0.25;
  });
  return {
    N, nodes, group, pool, bias, outStart, outTo, outW, edges: E,
    v: new Float32Array(N), I: new Float32Array(N), refr: new Float32Array(N),
    last: new Float32Array(N).fill(-9), spiked: new Int32Array(N + 8),
    log: new Uint16Array(16384), logN: 0, nSpikes: 0, total: 0,
    x: [0, 0, 0, 0], rate: [0, 0, 0, 0], noise: 0.9, rnd, t: 0,
    nIn: NSENS, chan: null, poolSize: [PER_POOL, PER_POOL, PER_POOL, PER_POOL], real: false
  };
}

// Construye un cerebro desde el JSON de extraer_subcircuito.py (conectoma real de FlyWire).
function buildBrainFromData(data, gain, seed, opts) {
  opts = opts || {};
  const rnd = mulberry32(seed || 1);
  const raw = data.nodes, edges = data.edges;
  const order = []; // entradas primero
  for (let r = 0; r < 3; r++) raw.forEach((n, i) => { if (n[1] === r) order.push(i); });
  const newIdx = new Int32Array(raw.length); order.forEach((o, k) => { newIdx[o] = k; });
  const N = raw.length;
  let nIn = 0; raw.forEach(n => { if (n[1] === 0) nIn++; });
  const nodes = new Array(N), chan = new Int16Array(nIn), poolSize = [0, 0, 0, 0];
  const group = new Uint8Array(N), pool = new Int8Array(N).fill(-1), bias = new Float32Array(N);
  const phiAcc = new Float64Array(N * 2), wAcc = new Float64Array(N);
  // entradas: ojo izquierdo cubre phi < ~0.3, ojo derecho phi > ~-0.3 (campo frontal compartido)
  order.forEach((o, k) => {
    const n = raw[o];
    if (n[1] === 0) {
      const left = n[2] === 0;
      let phi;
      if (data.version >= 2 && data.meta && n.length >= 7) {
        // posición real en el ojo: x alto = médula posterior = campo visual frontal (el quiasma invierte el eje)
        let t = (data.meta.xmax - n[5]) / (data.meta.xmax - data.meta.xmin);
        if (opts.flip) t = 1 - t;
        const az = (-20 + 170 * t) * Math.PI / 180;   // de 20° del lado contrario a 150° hacia atrás
        phi = left ? -az : az;
      } else phi = left ? -Math.PI + rnd() * (Math.PI + 0.3) : -0.3 + rnd() * (Math.PI + 0.3);
      const band = rnd() < 0.5 ? 0 : 1;
      const sec = ((Math.round(wrapAng(phi) / (TAU / NSECT)) % NSECT) + NSECT) % NSECT;
      chan[k] = sec * 2 + band;
      nodes[k] = { g: GROUP_SENS, phi: wrapAng(phi), band, type: n[3] };
      group[k] = GROUP_SENS;
    }
  });
  // sinapsis
  const E = edges.length / 3;
  const src = new Int32Array(E), dst = new Int32Array(E), rawW = new Float32Array(E);
  for (let e = 0; e < E; e++) { src[e] = newIdx[edges[e * 3]]; dst[e] = newIdx[edges[e * 3 + 1]]; rawW[e] = edges[e * 3 + 2]; }
  // signo de cada neurona intermedia = signo de su salida dominante
  const sgn = new Float64Array(N);
  for (let e = 0; e < E; e++) sgn[src[e]] += rawW[e];
  // posición angular de las intermedias = media circular de sus entradas
  for (let e = 0; e < E; e++) {
    const s = src[e], d = dst[e];
    if (s < nIn && nodes[s]) { const w = Math.abs(rawW[e]); phiAcc[d * 2] += Math.cos(nodes[s].phi) * w; phiAcc[d * 2 + 1] += Math.sin(nodes[s].phi) * w; wAcc[d] += w; }
  }
  order.forEach((o, k) => {
    const n = raw[o];
    if (n[1] === 1) {
      const phi = wAcc[k] > 0 ? Math.atan2(phiAcc[k * 2 + 1], phiAcc[k * 2]) : (rnd() * 2 - 1) * Math.PI;
      const g = sgn[k] < 0 ? GROUP_I : GROUP_E;
      nodes[k] = { g, phi, band: rnd() < 0.5 ? 0 : 1 }; group[k] = g; bias[k] = 0.25;
    } else if (n[1] === 2) {
      const p = n[2];
      nodes[k] = { g: GROUP_DN, pool: p, phi: 0, band: 0, type: n[3] };
      group[k] = GROUP_DN; pool[k] = p; poolSize[p]++; bias[k] = p === 2 ? 0.85 : 0.2;
    }
  });
  const cnt = new Int32Array(N + 1);
  for (let e = 0; e < E; e++) cnt[src[e] + 1]++;
  for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
  const outStart = new Int32Array(cnt), fill = new Int32Array(N), outTo = new Int32Array(E), outW = new Float32Array(E), baseW = new Float32Array(E);
  for (let e = 0; e < E; e++) { const s = src[e], p = outStart[s] + fill[s]++; outTo[p] = dst[e]; baseW[p] = rawW[e]; outW[p] = rawW[e] * gain; }
  return {
    N, nodes, group, pool, bias, outStart, outTo, outW, baseW, edges: E,
    v: new Float32Array(N), I: new Float32Array(N), refr: new Float32Array(N),
    last: new Float32Array(N).fill(-9), spiked: new Int32Array(N + 8),
    log: new Uint16Array(16384), logN: 0, nSpikes: 0, total: 0,
    x: [0, 0, 0, 0], rate: [0, 0, 0, 0], noise: 0.9, rnd, t: 0,
    nIn, chan, poolSize, real: true, meta: { inputs: nIn, pools: poolSize.slice(), version: data.version }
  };
}
function setGain(b, gain) { if (b.baseW) for (let e = 0; e < b.edges; e++) b.outW[e] = b.baseW[e] * gain; }

function stepBrain(b, sens, lesion) {
  const { N, v, I, refr, group, pool, bias, outStart, outTo, outW, spiked, rnd } = b;
  const decayS = Math.exp(-DT / TAU_S), decayX = Math.exp(-DT / 0.08);
  let ns = 0;
  b.t += DT;
  const nIn = b.nIn, chan = b.chan;
  for (let s = 0; s < nIn; s++) if (rnd() < (2 + sens[chan ? chan[s] : s] * RMAX) * DT) spiked[ns++] = s;
  for (let i = nIn; i < N; i++) {
    if (group[i] === GROUP_DN && lesion[pool[i]]) { v[i] = 0; I[i] = 0; continue; }
    I[i] *= decayS;
    if (refr[i] > 0) { refr[i] -= DT; continue; }
    const noise = (rnd() + rnd() + rnd() - 1.5) * b.noise;
    v[i] += DT / TAU_M * (-v[i] + I[i] + bias[i] + noise);
    if (v[i] >= 1) { v[i] = 0; refr[i] = REFR; spiked[ns++] = i; }
  }
  const cnt = [0, 0, 0, 0];
  for (let k = 0; k < ns; k++) {
    const j = spiked[k];
    b.last[j] = b.t;
    if (b.logN < b.log.length) b.log[b.logN++] = j;
    if (group[j] === GROUP_DN) cnt[pool[j]]++;
    for (let e = outStart[j], eEnd = outStart[j + 1]; e < eEnd; e++) I[outTo[e]] += outW[e];
  }
  for (let p = 0; p < NPOOL; p++) { b.x[p] = b.x[p] * decayX + cnt[p]; b.rate[p] = b.x[p] / (0.08 * Math.max(1, b.poolSize[p])); }
  b.nSpikes = ns; b.total += ns;
}

function brainCommand(b) {
  const r = b.rate;
  return {
    turn: clamp((r[1] - r[0]) / 50, -1, 1),
    thrust: clamp((r[2] - 4) / 25, 0, 1),
    fire: r[3] > 15
  };
}


// Lectura adaptativa: cada grupo motor se mide respecto a su propia actividad reciente (media y varianza móviles, τ = 8 s).
// El cableado no cambia; solo cómo se traduce la tasa de disparo en giro, empuje y disparo.
function brainCommandAdaptive(b, dt) {
  const st = b.ad || (b.ad = { mu: b.rate.slice(), v: [4, 4, 4, 4] });
  const k = Math.min(1, dt / 8), z = [0, 0, 0, 0];
  for (let p = 0; p < 4; p++) {
    const r = b.rate[p]; st.mu[p] += k * (r - st.mu[p]);
    const d = r - st.mu[p]; st.v[p] += k * (d * d - st.v[p]);
    z[p] = d / Math.sqrt(st.v[p] + 0.5);
  }
  return { turn: clamp((z[1] - z[0]) / 2.5, -1, 1), thrust: clamp(0.25 + 0.4 * z[2], 0, 1), fire: z[3] > 0.3 };
}

// ----------------------------- Juego -----------------------------
const NEAR = 160, FAR = 480;
const TURN_MAX = 4.2, ACC = 250, DRAG = 0.55, VMAX = 280;
const R_BY_SIZE = { 3: 38, 2: 22, 1: 12 };
const PTS = { 3: 20, 2: 50, 1: 100 };

class Game {
  constructor(rnd) { this.rnd = rnd || Math.random; this.best = 0; this.reset(); }
  reset() {
    this.score = 0; this.lives = 3; this.wave = 0; this.t = 0; this.state = 'play'; this.overT = 0; this.kills = 0;
    this.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, inv: 2, cool: 0, respawn: 0, thrusting: 0 };
    this.asteroids = []; this.bullets = []; this.parts = []; this.waveWait = 0;
    this.startWave();
  }
  makeAst(x, y, vx, vy, size) {
    const n = 10, verts = [];
    for (let i = 0; i < n; i++) verts.push(0.74 + this.rnd() * 0.42);
    return { x, y, vx, vy, size, r: R_BY_SIZE[size], rot: this.rnd() * TAU, spin: (this.rnd() - 0.5) * 1.2, verts };
  }
  startWave() {
    this.wave++;
    const n = Math.min(3 + this.wave, 9);
    for (let i = 0; i < n; i++) {
      let x, y, tries = 0;
      do { x = this.rnd() * W; y = this.rnd() * H; tries++; } while (Math.hypot(wrapD(x - this.ship.x, W), wrapD(y - this.ship.y, H)) < 200 && tries < 30);
      const sp = (28 + this.rnd() * 30) * (1 + 0.06 * this.wave), an = this.rnd() * TAU;
      this.asteroids.push(this.makeAst(x, y, Math.cos(an) * sp, Math.sin(an) * sp, 3));
    }
  }
  sense(out) {
    out.fill(0);
    const s = this.ship;
    if (!s.alive) return out;
    for (const a of this.asteroids) {
      const dx = wrapD(a.x - s.x, W), dy = wrapD(a.y - s.y, H);
      const d = Math.hypot(dx, dy), sd = Math.max(0, d - a.r);
      const rel = wrapAng(Math.atan2(dy, dx) - s.a);
      const half = Math.atan2(a.r, Math.max(d, 1));
      const near = clamp(1 - sd / NEAR, 0, 1), far = clamp(1 - sd / FAR, 0, 1) * 0.8;
      if (near <= 0 && far <= 0) continue;
      for (let k = 0; k < NSECT; k++) {
        const da = Math.max(0, angDiff(rel, wrapAng(k * TAU / NSECT)) - half);
        const g = Math.exp(-Math.pow(da / 0.35, 2));
        if (near * g > out[k * 2]) out[k * 2] = near * g;
        if (far * g > out[k * 2 + 1]) out[k * 2 + 1] = far * g;
      }
    }
    return out;
  }
  boom(x, y, n, speed) {
    for (let i = 0; i < n; i++) { const a = this.rnd() * TAU, s = speed * (0.3 + this.rnd()); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + this.rnd() * 0.5, max: 1 }); }
  }
  update(dt, cmd) {
    this.t += dt;
    const s = this.ship;
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    if (this.state === 'over') { this.overT -= dt; this.moveWorld(dt); return; }
    if (s.alive) {
      s.a += cmd.turn * TURN_MAX * dt;
      s.thrusting = cmd.thrust;
      if (cmd.thrust > 0) { s.vx += Math.cos(s.a) * ACC * cmd.thrust * dt; s.vy += Math.sin(s.a) * ACC * cmd.thrust * dt; }
      const dr = Math.exp(-DRAG * dt); s.vx *= dr; s.vy *= dr;
      const sp = Math.hypot(s.vx, s.vy); if (sp > VMAX) { s.vx *= VMAX / sp; s.vy *= VMAX / sp; }
      s.x = (s.x + s.vx * dt + W) % W; s.y = (s.y + s.vy * dt + H) % H;
      s.cool -= dt; s.inv = Math.max(0, s.inv - dt);
      if (cmd.fire && s.cool <= 0 && this.bullets.length < 6) {
        s.cool = 0.25;
        this.bullets.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: s.vx + Math.cos(s.a) * 520, vy: s.vy + Math.sin(s.a) * 520, life: 0.9 });
      }
    } else {
      s.respawn -= dt;
      if (s.respawn <= 0) { s.alive = true; s.x = W / 2; s.y = H / 2; s.vx = s.vy = 0; s.a = -Math.PI / 2; s.inv = 2.5; }
    }
    this.moveWorld(dt);
    // balas contra asteroides
    for (const b of this.bullets) {
      for (let i = 0; i < this.asteroids.length; i++) {
        const a = this.asteroids[i];
        if (Math.hypot(wrapD(a.x - b.x, W), wrapD(a.y - b.y, H)) < a.r + 2) {
          b.life = 0; this.score += PTS[a.size]; this.kills++;
          this.boom(a.x, a.y, 6 + a.size * 3, 90);
          this.asteroids.splice(i, 1);
          if (a.size > 1) for (let k = 0; k < 2; k++) {
            const an = this.rnd() * TAU, sp = 45 + this.rnd() * 55;
            this.asteroids.push(this.makeAst(a.x, a.y, a.vx * 0.5 + Math.cos(an) * sp, a.vy * 0.5 + Math.sin(an) * sp, a.size - 1));
          }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    // nave contra asteroides
    if (s.alive && s.inv <= 0) {
      for (const a of this.asteroids) {
        if (Math.hypot(wrapD(a.x - s.x, W), wrapD(a.y - s.y, H)) < a.r + 8) {
          s.alive = false; s.respawn = 1.4; this.lives--;
          this.boom(s.x, s.y, 22, 160);
          if (this.lives <= 0) { this.state = 'over'; this.overT = 4; this.best = Math.max(this.best, this.score); }
          break;
        }
      }
    }
    if (this.asteroids.length === 0 && this.state === 'play') {
      this.waveWait += dt;
      if (this.waveWait > 1.5) { this.waveWait = 0; this.startWave(); }
    }
  }
  moveWorld(dt) {
    for (const a of this.asteroids) { a.x = (a.x + a.vx * dt + W) % W; a.y = (a.y + a.vy * dt + H) % H; a.rot += a.spin * dt; }
    for (const b of this.bullets) { b.x = (b.x + b.vx * dt + W) % W; b.y = (b.y + b.vy * dt + H) % H; b.life -= dt; }
  }
}

if (typeof module !== 'undefined') module.exports = { brainCommandAdaptive, buildBrainFromData, setGain, buildBrain, stepBrain, brainCommand, Game, mulberry32, NSENS, P, DT, W, H };
