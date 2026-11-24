
// ================= INTERFAZ =================
(function () {
  const $ = id => document.getElementById(id);
  const cs = getComputedStyle(document.documentElement);
  const tok = (n, f) => (cs.getPropertyValue(n).trim() || f);
  const hex = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const COL = {
    fg: tok('--fg', '#d9e8df'), muted: tok('--muted', '#8aa096'), gcamp: tok('--gcamp', '#7dffa0'),
    ship: tok('--ship', '#ffb347'), inh: tok('--inh', '#ff6f8a'), rock: tok('--rock', '#9dc2b4')
  };
  const GRGB = [hex(COL.rock), hex(COL.gcamp), hex(COL.inh), hex(COL.ship)]; // por grupo: ojo, E, I, descendente
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

  const gc = $('game'), g = gc.getContext('2d'), SC = gc.width / W;
  const bc = $('brain'), b2 = bc.getContext('2d'), BS = bc.width;
  const rc = $('raster'), r2 = rc.getContext('2d');

  // ---------- estado ----------
  let brain, pos, staticLayer, tr;
  const game = new Game(Math.random);
  const sens = new Float32Array(NSENS);
  const lesion = [false, false, false, false];
  let mode = 'fly', paused = false, acc = 0, last = performance.now();
  const keys = {};

  const stars = [];
  { const r = mulberry32(99); for (let i = 0; i < 70; i++) stars.push([r() * W, r() * H, r() * 1.2 + 0.5, r()]); }

  function layoutBrain(b) {
    const rnd = mulberry32(4242), R = 0.46 * BS, cx = BS / 2, cy = BS / 2;
    const p = new Float32Array(b.N * 2);
    const centers = [[-0.17, 0], [0.17, 0], [0, 0.13], [0, -0.13]];
    const slot = [0, 0, 0, 0];
    b.nodes.forEach((n, i) => {
      let x, y;
      if (n.g === GROUP_DN) {
        const c = centers[n.pool], a = TAU * slot[n.pool]++ / PER_POOL;
        x = cx + c[0] * R + Math.cos(a) * 0.065 * R; y = cy + c[1] * R + Math.sin(a) * 0.065 * R;
      } else {
        const th = n.phi - Math.PI / 2 + (n.g === GROUP_SENS ? (b.real ? (rnd() - 0.5) * 0.09 : 0) : (rnd() - 0.5) * 0.1);
        let rad;
        if (n.g === GROUP_SENS) rad = (n.band === 1 ? 0.97 : 0.86) + (b.real ? (rnd() - 0.5) * 0.06 : 0);
        else if (n.g === GROUP_E) rad = n.band === 0 ? 0.42 + rnd() * 0.2 : 0.62 + rnd() * 0.16;
        else rad = 0.3 + rnd() * 0.2;
        x = cx + Math.cos(th) * rad * R; y = cy + Math.sin(th) * rad * R;
      }
      p[i * 2] = x; p[i * 2 + 1] = y;
    });
    return p;
  }

  function buildStatic(b) {
    const c = document.createElement('canvas'); c.width = c.height = BS;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(' + GRGB[1].join(',') + ',0.05)'; x.lineWidth = 1;
    x.beginPath();
    const stride = Math.max(1, Math.ceil(b.edges / 9000));
    for (let i = 0; i < b.N; i++) for (let e = b.outStart[i]; e < b.outStart[i + 1]; e += stride) {
      const j = b.outTo[e]; x.moveTo(pos[i * 2], pos[i * 2 + 1]); x.lineTo(pos[j * 2], pos[j * 2 + 1]);
    }
    x.stroke();
    return c;
  }

  function install(b) {
    brain = b;
    pos = layoutBrain(brain);
    staticLayer = buildStatic(brain);
    tr = new Float32Array(brain.N);
    rc.height = Math.min(brain.N, 700);
    r2.fillStyle = '#030706'; r2.fillRect(0, 0, rc.width, rc.height);
    $('rasterCap').textContent = 'Actividad de las ' + brain.N.toLocaleString('es') + ' neuronas, últimos 5 s';
    game.reset();
  }
  const SYNTH_TXT = [$('w1').textContent, $('w2').textContent, $('w3').textContent];
  let embedded = null;
  try { const el0 = $('connData'); if (el0) embedded = JSON.parse(el0.textContent); } catch (e) { embedded = null; }
  function setWiringText(real) {
    if (!real) { ['w1', 'w2', 'w3'].forEach((id, i) => { $(id).textContent = SYNTH_TXT[i]; }); return; }
    const nIn = brain.nIn, nDn = brain.poolSize.reduce((a, b) => a + b, 0), nMid = brain.N - nIn - nDn;
    $('w1').textContent = brain.meta.version >= 2
      ? nIn.toLocaleString('es') + ' neuronas reales de las columnas del ojo (tipos Tm, Mi, T4, T5 y otros), una por columna y por ojo. Cada una dispara más rápido cuando hay un asteroide cerca en el ángulo que le corresponde por la posición real de su columna.'
      : nIn.toLocaleString('es') + ' neuronas visuales reales (tipos LC y LPLC). Cada una dispara más rápido cuando hay un asteroide cerca en el sector que se le asignó dentro de su ojo. El sector se reparte al azar, porque los datos no traen su posición en la retina.';
    $('w2').textContent = nMid.toLocaleString('es') + ' neuronas reales que conectan los ojos con las salidas, con ' + brain.edges.toLocaleString('es') + ' conexiones entre todas. Excitan o inhiben según su neurotransmisor predicho: la acetilcolina excita; el GABA y el glutamato inhiben.';
    $('w3').textContent = nDn + ' neuronas descendentes reales: DNa02 y DNa01 giran la nave hacia su lado, DNp09 la empuja y DNp01 dispara. El disparo es una asignación arbitraria. Con la lectura adaptativa la nave dispara cuando DNp01 está por encima de su actividad reciente; sin ella, cuando supera 15 Hz.';
  }
  function newFly(seed) {
    install(buildBrain(seed));
    $('btnSynth').textContent = embedded ? 'Usar conectoma de FlyWire' : 'Usar red generada';
    $('btnSynth').hidden = !embedded;
    $('flipRow').hidden = true; $('adaptRow').hidden = true;
    setWiringText(false);
    $('connStatus').textContent = 'Red generada con reglas de cableado, ' + brain.N + ' neuronas. Carga el JSON que produce extraccion.py para usar neuronas reales de FlyWire.';
    $('note').textContent = NOTE_SYNTH;
  }
  const NOTE_SYNTH = $('note').textContent;
  const NOTE_REAL = 'Subcircuito real del conectoma de FlyWire, elegido entre unas 139 000 neuronas: ojos LC y LPLC, neuronas intermedias y cuatro tipos de neuronas descendentes. Las sinapsis y sus signos vienen de los datos, pero el resto es una simplificación: neuronas integradoras con fugas, una ganancia sináptica ajustada a mano con el deslizador, sectores visuales repartidos al azar y un disparo que la mosca no tiene. El lado de DNa02 y DNa01 se estimó por el lado de sus entradas visuales, así que podría estar invertido.';

  const NOTE_REAL2 = 'Subcircuito real del conectoma de FlyWire, elegido entre unas 139 000 neuronas: neuronas columnares del ojo (una por columna y por ojo) como entradas, neuronas intermedias (entre ellas LC y LPLC) y cuatro tipos de descendentes con su lado real. Las sinapsis, sus signos y la posición de cada entrada en el ojo vienen de los datos. El resto es una simplificación mía: neuronas integradoras con fugas, ganancia ajustada a mano, solo el ángulo horizontal (la altura en el ojo no se usa), un disparo que la mosca no tiene, y la suposición de que el eje x de las columnas es el horizontal y que el quiasma óptico lo invierte. En simulación, invertir ese eje no cambia el rendimiento. La lectura adaptativa también es mía: con umbrales fijos las neuronas reales dejaban a la nave disparando siempre y casi sin girar, porque sus rangos de disparo no son los que supuse. Con este cableado la nave gira alejándose del lado del asteroide, y DNp09 casi no dispara, así que el empuje queda en un nivel bajo constante.';
  let currentData = null, currentName = '';
  function loadConnectome(data, name) {
    if (!data || (data.version !== 1 && data.version !== 2) || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || data.edges.length % 3 !== 0)
      throw new Error('El archivo no tiene el formato de extraccion.py.');
    if (!data.nodes.some(n => n[1] === 0) || !data.nodes.some(n => n[1] === 2)) throw new Error('El subcircuito no tiene neuronas de entrada y de salida.');
    if (data.nodes.length > 60000) throw new Error('Subcircuito demasiado grande (más de 60 000 neuronas).');
    const gain = Number($('gain').value);
    currentData = data; currentName = name;
    install(buildBrainFromData(data, gain, 1, { flip: $('flip').checked }));
    $('btnSynth').textContent = 'Usar red generada'; $('btnSynth').hidden = false;
    $('flipRow').hidden = data.version < 2;
    $('adaptRow').hidden = false;
    $('note').textContent = data.version >= 2 ? NOTE_REAL2 : NOTE_REAL;
    setWiringText(true);
    const empty = brain.poolSize.map((n, i) => n === 0 ? ['giro izq.', 'giro der.', 'empuje', 'fuego'][i] : null).filter(Boolean);
    $('connStatus').textContent = (name || 'subcircuito') + ': ' + brain.N.toLocaleString('es') + ' neuronas, ' + brain.edges.toLocaleString('es') + ' conexiones, ' +
      brain.nIn + ' entradas; neuronas motoras por grupo ' + brain.poolSize.join('/') + '.' + (empty.length ? ' Sin neuronas en: ' + empty.join(', ') + '.' : '');
  }
  async function readFile(file) {
    let text;
    if (/\.gz$/i.test(file.name)) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no descomprime .gz; descomprime el archivo y carga el .json.');
      text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else text = await file.text();
    return JSON.parse(text);
  }
  $('flip').addEventListener('change', () => { if (brain.real && currentData) loadConnectome(currentData, currentName); });
  $('btnLoad').addEventListener('click', () => $('fileConn').click());
  $('fileConn').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    $('connStatus').textContent = 'Leyendo ' + f.name + '...';
    try { loadConnectome(await readFile(f), f.name); }
    catch (err) { $('connStatus').textContent = 'No se pudo cargar: ' + err.message; }
    e.target.value = '';
  });
  $('btnSynth').addEventListener('click', () => { if (brain.real || !embedded) newFly(3); else loadConnectome(embedded, 'Subcircuito de FlyWire incluido'); });
  $('gain').addEventListener('input', e => {
    const g = Number(e.target.value); $('gainVal').textContent = g.toFixed(3);
    if (brain.real) setGain(brain, g);
  });

  // ---------- dibujo del juego ----------
  function eachWrap(x, y, r, fn) {
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      const px = x + ox, py = y + oy;
      if (px < -r - 4 || px > W + r + 4 || py < -r - 4 || py > H + r + 4) continue;
      fn(px, py);
    }
  }

  function drawGame() {
    g.setTransform(SC, 0, 0, SC, 0, 0);
    g.fillStyle = '#030706'; g.fillRect(0, 0, W, H);
    for (const s of stars) { g.fillStyle = 'rgba(217,232,223,' + (0.12 + s[3] * 0.3).toFixed(2) + ')'; g.fillRect(s[0], s[1], s[2], s[2]); }
    const sh = game.ship;
    if (sh.alive) {
      for (const band of [1, 0]) {
        for (let k = 0; k < NSECT; k++) {
          const v = sens[k * 2 + band]; if (v < 0.05) continue;
          const a = sh.a + k * TAU / NSECT, rad = band ? 300 : NEAR;
          g.fillStyle = 'rgba(' + GRGB[1].join(',') + ',' + ((band ? 0.09 : 0.2) * Math.min(1, v * 1.2)).toFixed(3) + ')';
          g.beginPath(); g.moveTo(sh.x, sh.y); g.arc(sh.x, sh.y, rad, a - TAU / 24, a + TAU / 24); g.closePath(); g.fill();
        }
      }
    }
    g.lineWidth = 1.7; g.lineJoin = 'round';
    for (const a of game.asteroids) {
      eachWrap(a.x, a.y, a.r, (px, py) => {
        g.beginPath();
        for (let i = 0; i < a.verts.length; i++) {
          const an = a.rot + i * TAU / a.verts.length, r = a.r * a.verts[i];
          const x = px + Math.cos(an) * r, y = py + Math.sin(an) * r;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        g.fillStyle = 'rgba(' + GRGB[0].join(',') + ',0.06)'; g.fill();
        g.strokeStyle = COL.rock; g.stroke();
      });
    }
    g.fillStyle = COL.ship;
    for (const b of game.bullets) { g.beginPath(); g.arc(b.x, b.y, 2.4, 0, TAU); g.fill(); }
    if (sh.alive && (sh.inv <= 0 || Math.floor(game.t * 12) % 2 === 0)) {
      eachWrap(sh.x, sh.y, 14, (px, py) => {
        g.save(); g.translate(px, py); g.rotate(sh.a);
        g.strokeStyle = COL.ship; g.lineWidth = 2;
        g.beginPath(); g.moveTo(15, 0); g.lineTo(-10, -9); g.lineTo(-5, 0); g.lineTo(-10, 9); g.closePath(); g.stroke();
        if (sh.thrusting > 0.05) {
          g.beginPath(); g.moveTo(-6, -4); g.lineTo(-6 - 8 - 10 * sh.thrusting, 0); g.lineTo(-6, 4); g.stroke();
        }
        g.restore();
      });
    }
    for (const p of game.parts) { g.fillStyle = 'rgba(217,232,223,' + Math.min(1, p.life * 1.6).toFixed(2) + ')'; g.fillRect(p.x, p.y, 2, 2); }
    if (game.state === 'over') {
      g.fillStyle = 'rgba(3,7,6,0.62)'; g.fillRect(0, 0, W, H);
      g.textAlign = 'center'; g.fillStyle = COL.fg; g.font = '600 34px ' + MONO;
      g.fillText('Partida terminada', W / 2, H / 2 - 12);
      g.fillStyle = COL.muted; g.font = '400 18px ' + MONO;
      g.fillText(game.score + ' puntos. Nueva partida en ' + Math.max(0, Math.ceil(game.overT)) + ' s', W / 2, H / 2 + 24);
      g.textAlign = 'start';
    }
  }

  // ---------- dibujo del cerebro ----------
  const LEV = 10;
  const PAL = GRGB.map(c => Array.from({ length: LEV }, (_, l) => 'rgba(' + c.join(',') + ',' + (0.3 + 0.7 * l / (LEV - 1)).toFixed(2) + ')'));
  const FLASH = GRGB.map(c => 'rgba(' + c.join(',') + ',0.3)');
  const RAD = [6, 3.6, 3.6, 4.6];
  const LABELS = [['izq.', -0.17, 0.085], ['der.', 0.17, 0.085], ['empuje', 0, 0.215], ['fuego', 0, -0.215]];

  function drawBrain(dt) {
    b2.clearRect(0, 0, BS, BS);
    b2.drawImage(staticLayer, 0, 0);
    const decay = Math.exp(-dt / 0.15);
    for (let i = 0; i < brain.N; i++) tr[i] *= decay;
    const n = Math.min(brain.logN, 260);
    // aristas de las neuronas que dispararon en este cuadro, agrupadas por tipo
    let budget = 2500;
    for (let gi = 0; gi < 3; gi++) {
      b2.beginPath(); let any = false;
      for (let k = 0; k < n; k++) {
        const j = brain.log[k]; if (brain.group[j] !== gi) continue;
        for (let e = brain.outStart[j]; e < brain.outStart[j + 1] && budget > 0; e++, budget--) {
          const t = brain.outTo[e]; b2.moveTo(pos[j * 2], pos[j * 2 + 1]); b2.lineTo(pos[t * 2], pos[t * 2 + 1]); any = true;
        }
      }
      if (any) { b2.strokeStyle = FLASH[gi]; b2.lineWidth = 1.4; b2.stroke(); }
    }
    for (let k = 0; k < brain.logN; k++) tr[brain.log[k]] = 1;
    for (let i = 0; i < brain.N; i++) {
      const gi = brain.group[i], lv = Math.min(LEV - 1, Math.floor(tr[i] * LEV));
      b2.fillStyle = PAL[gi][lv];
      b2.beginPath(); b2.arc(pos[i * 2], pos[i * 2 + 1], RAD[gi] + 2.2 * tr[i], 0, TAU); b2.fill();
      if (gi === GROUP_DN && lesion[brain.pool[i]]) {
        b2.strokeStyle = COL.inh; b2.lineWidth = 1.6; b2.beginPath(); b2.arc(pos[i * 2], pos[i * 2 + 1], 8, 0, TAU); b2.stroke();
      }
    }
    const R = 0.46 * BS;
    b2.fillStyle = COL.muted; b2.font = '500 20px ' + MONO; b2.textAlign = 'center';
    for (const l of LABELS) b2.fillText(l[0], BS / 2 + l[1] * R, BS / 2 + l[2] * R + 6);
    b2.fillText('FRENTE', BS / 2, 30);
    b2.textAlign = 'start';
  }

  function drawRaster() {
    const w = rc.width;
    r2.drawImage(rc, -1, 0);
    r2.fillStyle = '#030706'; r2.fillRect(w - 1, 0, 1, rc.height);
    for (let k = 0; k < brain.logN; k++) {
      const j = brain.log[k];
      r2.fillStyle = COL_BY_GROUP[brain.group[j]];
      r2.fillRect(w - 1, Math.floor(j * rc.height / brain.N), 1, 1);
    }
  }
  const COL_BY_GROUP = [COL.rock, COL.gcamp, COL.inh, COL.ship];

  // ---------- control manual ----------
  function manualCmd() {
    const L = keys.ArrowLeft || keys.KeyA, R = keys.ArrowRight || keys.KeyD, U = keys.ArrowUp || keys.KeyW;
    return { turn: (R ? 1 : 0) - (L ? 1 : 0), thrust: U ? 1 : 0, fire: !!keys.Space };
  }
  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'];
  window.addEventListener('keydown', e => { if (mode !== 'manual' || !GAME_KEYS.includes(e.code)) return; keys[e.code] = true; e.preventDefault(); });
  window.addEventListener('keyup', e => { if (GAME_KEYS.includes(e.code)) keys[e.code] = false; });
  const padMap = { padL: 'ArrowLeft', padR: 'ArrowRight', padU: 'ArrowUp', padF: 'Space' };
  Object.keys(padMap).forEach(id => {
    const el = $(id), code = padMap[id];
    const on = e => { keys[code] = true; e.preventDefault(); };
    const off = () => { keys[code] = false; };
    el.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.addEventListener(t, off));
  });

  // ---------- controles de la página ----------
  function setMode(m) {
    mode = m;
    $('modeFly').setAttribute('aria-pressed', String(m === 'fly'));
    $('modeManual').setAttribute('aria-pressed', String(m === 'manual'));
    document.body.classList.toggle('manual', m === 'manual');
    $('hint').textContent = m === 'manual'
      ? 'Flechas o A, D y W para girar y empujar; espacio para disparar. Haz clic en la página primero para que reciba el teclado. La red sigue activa y ve lo mismo que tú.'
      : 'El cerebro juega solo. «Nueva red generada» crea una red con otro cableado, y no todas juegan igual.';
    Object.keys(keys).forEach(k => { keys[k] = false; });
  }
  $('modeFly').addEventListener('click', () => setMode('fly'));
  $('modeManual').addEventListener('click', () => setMode('manual'));
  $('btnNew').addEventListener('click', () => newFly(1 + Math.floor(Math.random() * 1e6)));
  $('btnRestart').addEventListener('click', () => game.reset());
  $('btnPause').addEventListener('click', e => { paused = !paused; e.currentTarget.setAttribute('aria-pressed', String(paused)); e.currentTarget.textContent = paused ? 'Seguir' : 'Pausa'; });
  document.querySelectorAll('.les').forEach(btn => btn.addEventListener('click', () => {
    const p = Number(btn.dataset.pool); lesion[p] = !lesion[p];
    btn.setAttribute('aria-pressed', String(lesion[p]));
    $('m' + p).classList.toggle('off', lesion[p]);
  }));

  // ---------- HUD ----------
  const el = { score: $('st-score'), lives: $('st-lives'), wave: $('st-wave'), best: $('st-best'), sps: $('st-sps') };
  const meters = [0, 1, 2, 3].map(p => { const m = $('m' + p); return { fill: m.querySelector('.fill'), val: m.querySelector('.val') }; });
  let hudT = 0, lastTotal = 0, lastWall = performance.now();
  function hud(now) {
    if (now - hudT < 120) return;
    const wall = (now - lastWall) / 1000; hudT = now;
    el.score.textContent = game.score; el.lives.textContent = Math.max(0, game.lives);
    el.wave.textContent = game.wave; el.best.textContent = Math.max(game.best, game.score);
    el.sps.textContent = Math.round((brain.total - lastTotal) / Math.max(wall, 0.05)).toLocaleString('es');
    lastTotal = brain.total; lastWall = now;
    for (let p = 0; p < NPOOL; p++) {
      meters[p].fill.style.width = (clamp(brain.rate[p] / 50, 0, 1) * 100).toFixed(0) + '%';
      meters[p].val.textContent = brain.rate[p].toFixed(0) + ' Hz';
    }
  }

  // ---------- bucle ----------
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    brain.logN = 0;
    if (!paused) {
      game.sense(sens);
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 30) { stepBrain(brain, sens, lesion); acc -= DT; steps++; }
      if (acc >= DT) acc = 0;
      const cmd = mode === 'fly' ? (brain.real && $('adapt').checked ? brainCommandAdaptive(brain, dt) : brainCommand(brain)) : manualCmd();
      game.update(dt, cmd);
      if (game.state === 'over' && game.overT <= 0) game.reset();
    }
    drawGame();
    drawBrain(dt);
    drawRaster();
    hud(now);
    requestAnimationFrame(frame);
  }

  if (embedded) { try { loadConnectome(embedded, 'Subcircuito de FlyWire incluido'); } catch (e) { newFly(3); } } else newFly(3);
  requestAnimationFrame(frame);
})();
</script>
