// Procedural sound: every effect is synthesised with WebAudio, so the
// game ships no audio files. The context starts on the first user gesture
// (the play click), which is also when the browser allows sound.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    // Loud nearby rifle crack; distant shots use quieter() through gain.
    shot(near = true) {
      noise(0.09, near ? 3200 : 1200, near ? 0.9 : 0.25);
      tone(180, 0.07, near ? 0.5 : 0.12, 'square', 60);
    },
    dryFire() {
      tone(900, 0.03, 0.15, 'square');
    },
    reload() {
      tone(500, 0.04, 0.2, 'square');
      tone(700, 0.04, 0.2, 'square', 0, 0.18);
    },
    hit() {
      tone(1200, 0.05, 0.3, 'square');
    },
    kill() {
      tone(880, 0.08, 0.3, 'sine');
      tone(1320, 0.12, 0.3, 'sine', 0, 0.08);
    },
    hurt() {
      tone(140, 0.15, 0.5, 'sawtooth', 70);
    },
    plantBeep() {
      tone(1500, 0.08, 0.3, 'sine');
    },
    defuseBeep() {
      tone(1100, 0.08, 0.3, 'sine');
    },
    explosion() {
      noise(0.9, 500, 1.0);
      tone(90, 0.8, 0.9, 'sine', 30);
    },
    grenadePin() {
      tone(2000, 0.03, 0.2, 'square');
    },
    roundWin() {
      tone(523, 0.15, 0.3, 'sine');
      tone(659, 0.15, 0.3, 'sine', 0, 0.14);
      tone(784, 0.25, 0.3, 'sine', 0, 0.28);
    },
    roundLose() {
      tone(392, 0.2, 0.3, 'sine');
      tone(311, 0.35, 0.3, 'sine', 0, 0.18);
    },
    buy() {
      tone(1000, 0.05, 0.25, 'square');
    },
    denied() {
      tone(220, 0.12, 0.3, 'square');
    },
  };
}
