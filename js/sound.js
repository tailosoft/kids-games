// Short synthesised tones. No audio files: the app has to work offline and
// install small, and a kid needs the "yes" sound within ~50ms of answering.
let ctx = null;

function audio() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  return ctx;
}

/** Call from a tap: mobile browsers only start audio inside a gesture. */
export function unlock() {
  const ac = audio();
  if (ac && ac.state === 'suspended') ac.resume();
}

function tone(freq, start, length, gain, type) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const t0 = ac.currentTime + start;
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

export function right() {
  unlock();
  tone(659.25, 0, 0.12, 0.3);     // E5
  tone(987.77, 0.1, 0.22, 0.26);  // B5
}

export function wrong() {
  unlock();
  tone(196, 0, 0.14, 0.22, 'triangle');
  tone(146.83, 0.1, 0.2, 0.2, 'triangle');
}

export function win() {
  unlock();
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(f, i * 0.11, 0.3, 0.26));
  tone(1318.5, 0.5, 0.5, 0.2);
}

export function tick() {
  unlock();
  tone(440, 0, 0.05, 0.12, 'square');
}
