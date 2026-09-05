/* Sons sintetizados na hora com a Web Audio API — sem arquivo, sem asset de
   terceiro. Três momentos: folhear (sorteio), começar (estudo/fala) e o tempo
   acabar. Tudo discreto e curto. */

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/* nota com envelope percussivo: sobe em 10ms, decai em `dur` */
function nota(ac: AudioContext, freq: number, inicio: number, dur: number, pico: number, tipo: OscillatorType) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, inicio);
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(pico, inicio + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(inicio);
  osc.stop(inicio + dur + 0.02);
}

/* estalo de ruído filtrado: uma página passando */
function estalo(ac: AudioContext, inicio: number, dur: number, pico: number, freq: number) {
  const n = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buffer = ac.createBuffer(1, n, ac.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / n);

  const src = ac.createBufferSource();
  src.buffer = buffer;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.value = pico;

  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  src.start(inicio);
  src.stop(inicio + dur);
}

/* sortear: folhear o bloquinho. Os estalos preenchem toda a duração da roleta
   e desaceleram igual à animação, então o som termina quando ela para no
   assunto — nunca antes. */
export function tocarSorteio(duracaoMs = 900) {
  const ac = contexto();
  if (!ac) return;
  try {
    const t0 = ac.currentTime;
    const dur = duracaoMs / 1000;
    let t = 0;
    while (t < dur) {
      const p = t / dur; // progresso 0..1
      const freq = 1800 + p * 1700 + Math.random() * 250; // vai clareando
      estalo(ac, t0 + t, 0.035, Math.max(0.02, 0.06 - p * 0.02), freq);
      t += 0.045 + 0.24 * p * p; // desacelera igual à roleta (intervalo cresce)
    }
    // toque final, no instante em que assenta
    estalo(ac, t0 + dur, 0.045, 0.05, 3200);
  } catch {
    /* áudio nunca pode atrapalhar o sorteio */
  }
}

/* início de uma fase: um toque macio, dois tons subindo */
export function tocarInicio() {
  const ac = contexto();
  if (!ac) return;
  try {
    const t = ac.currentTime;
    nota(ac, 392.0, t, 0.16, 0.09, "sine"); // sol
    nota(ac, 587.33, t + 0.09, 0.22, 0.08, "sine"); // ré
  } catch {
    /* silêncio em caso de erro */
  }
}

/* fim do tempo: um sino suave descendo, sem susto */
export function tocarFim() {
  const ac = contexto();
  if (!ac) return;
  try {
    const t = ac.currentTime;
    nota(ac, 659.25, t, 0.5, 0.1, "sine"); // mi
    nota(ac, 523.25, t + 0.16, 0.6, 0.09, "sine"); // dó
    nota(ac, 392.0, t + 0.34, 0.8, 0.08, "sine"); // sol grave
  } catch {
    /* silêncio em caso de erro */
  }
}
