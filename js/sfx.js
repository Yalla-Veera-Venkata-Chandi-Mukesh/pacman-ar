/* Original retro arcade-style sound effects, synthesized live with the Web Audio API.
 * No audio files needed and nothing copied from the original game.
 * PAC.sfx.unlock() must be called from a tap (browsers block audio until the user interacts).
 */
(function () {
  const PAC = (window.PAC = window.PAC || {});
  let ctx = null, master = null, siren = null, wakaFlip = false;

  function tone(freq, dur, { type = 'square', vol = 0.18, to = null, at = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz
  function melody(notes, step, opts) {
    notes.forEach((n, i) => { if (n) tone(note(n), step * 0.9, { ...opts, at: i * step }); });
  }

  PAC.sfx = {
    unlock() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.8;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    },
    startup() { // short original "insert coin" fanfare
      melody([72, 76, 79, 84, 0, 79, 84, 88], 0.11, { type: 'square', vol: 0.12 });
      melody([48, 0, 55, 0, 52, 0, 60, 0], 0.11, { type: 'triangle', vol: 0.2 });
    },
    activate() { tone(200, 0.6, { type: 'sawtooth', to: 1200, vol: 0.06 }); },
    jump() { tone(260, 0.28, { type: 'square', to: 900, vol: 0.12 }); },
    pop() { tone(900, 0.06, { type: 'square', vol: 0.06 }); },
    waka() { // alternating up/down chirp
      wakaFlip = !wakaFlip;
      wakaFlip ? tone(480, 0.09, { type: 'triangle', to: 220, vol: 0.3 }) : tone(220, 0.09, { type: 'triangle', to: 480, vol: 0.3 });
    },
    sirenStart(fast) {
      this.sirenStop();
      if (!ctx) return;
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lfoGain = ctx.createGain(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = fast ? 300 : 520;
      lfo.frequency.value = fast ? 9 : 2.2;
      lfoGain.gain.value = fast ? 120 : 180;
      g.gain.value = 0.05;
      lfo.connect(lfoGain).connect(o.frequency);
      o.connect(g).connect(master);
      o.start(); lfo.start();
      siren = { o, lfo, g };
    },
    sirenStop() {
      if (!siren) return;
      const t = ctx.currentTime;
      siren.g.gain.setTargetAtTime(0, t, 0.05);
      siren.o.stop(t + 0.3); siren.lfo.stop(t + 0.3);
      siren = null;
    },
    power() {
      tone(300, 0.15, { to: 800, vol: 0.12 });
      tone(400, 0.15, { to: 1000, vol: 0.12, at: 0.15 });
      tone(500, 0.25, { to: 1400, vol: 0.12, at: 0.3 });
    },
    eatGhost() { tone(150, 0.35, { type: 'square', to: 1500, vol: 0.12 }); tone(1500, 0.1, { type: 'triangle', vol: 0.15, at: 0.35 }); },
    eyes() { for (let i = 0; i < 6; i++) tone(1200 - i * 80, 0.05, { type: 'square', vol: 0.04, at: i * 0.07 }); },
    portal() { tone(80, 1.2, { type: 'sawtooth', to: 900, vol: 0.08 }); tone(120, 1.2, { type: 'sine', to: 1600, vol: 0.1 }); },
    celebrate() { melody([79, 83, 86, 91], 0.08, { vol: 0.1 }); },
    victory() {
      melody([72, 72, 79, 79, 81, 84, 0, 79, 76, 79, 84, 0, 88], 0.12, { type: 'square', vol: 0.11 });
      melody([48, 0, 55, 0, 53, 0, 55, 0, 48, 0, 55, 0, 60], 0.12, { type: 'triangle', vol: 0.2 });
    },
  };
})();
