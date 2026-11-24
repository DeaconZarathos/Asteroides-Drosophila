// Simula partidas sin pantalla con el subcircuito y muestra puntaje, tasas de cada grupo motor y conducta.
// Uso:  node simular.js [subcircuito.json] [ganancia] [segundos] [semillas]
//   Variables opcionales:  FLIP=1 (invierte el eje del ojo)   ADAPT=0 (umbrales fijos en vez de lectura adaptativa)
const fs = require('fs'), path = require('path');
const C = require(path.join(__dirname, 'core.js'));
const file = process.argv[2] || path.join(__dirname, 'subcircuito.json');
const gain = Number(process.argv[3] || 0.034), secs = Number(process.argv[4] || 120), seeds = Number(process.argv[5] || 3);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
let tot = { score: 0, over: 0, fire: 0, turnSd: 0 };
for (let s = 1; s <= seeds; s++) {
  const brain = C.buildBrainFromData(data, gain, s, { flip: process.env.FLIP === '1' });
  const game = new C.Game(C.mulberry32(5 + s));
  const sens = new Float32Array(C.NSENS), lesion = [false, false, false, false];
  let acc = 0, n = 0, sf = 0, st = 0, st2 = 0, over = 0;
  for (let f = 0; f < 60 * secs; f++) {
    game.sense(sens); acc += 1 / 60;
    while (acc >= C.DT) { C.stepBrain(brain, sens, lesion); acc -= C.DT; }
    brain.logN = 0;
    const cmd = process.env.ADAPT === '0' ? C.brainCommand(brain) : C.brainCommandAdaptive(brain, 1 / 60);
    game.update(1 / 60, cmd);
    sf += cmd.fire ? 1 : 0; st += cmd.turn; st2 += cmd.turn * cmd.turn; n++;
    if (game.state === 'over' && game.overT <= 0) { over++; game.reset(); }
  }
  const m = st / n;
  tot.score += game.score; tot.over += over; tot.fire += sf / n; tot.turnSd += Math.sqrt(st2 / n - m * m);
  console.log(`semilla ${s}: puntos ${game.score}, partidas perdidas ${over}, disparo ${(100 * sf / n).toFixed(0)}% del tiempo, neuronas ${brain.N}`);
}
console.log(`PROMEDIO: puntos ${(tot.score / seeds).toFixed(0)}, perdidas ${(tot.over / seeds).toFixed(1)}, disparo ${(100 * tot.fire / seeds).toFixed(0)}%, variacion del giro ${(tot.turnSd / seeds).toFixed(2)}`);
