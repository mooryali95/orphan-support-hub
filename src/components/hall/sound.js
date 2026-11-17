// قاعة الأثر — صوتٌ اختياري (مطفأ افتراضياً) يُركَّب في المتصفّح بـ Web Audio،
// بلا ملفّات صوت: نبرةٌ خافتة للقاعة، وانفتاح الباب، ونقرةٌ عند الاختيار،
// وهبّةٌ عند الانتقال، ورنينٌ ذهبيّ حين يصل الدعم، وبريقٌ صاعد للصورة الكلية.
export function createSound() {
  let ctx = null,
    master = null,
    ambient = null,
    on = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    return ctx;
  }

  function noise(seconds) {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    return s;
  }

  function startAmbient() {
    if (ambient || !ctx) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const oscs = [55, 82.4, 110.2, 164.9].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      const og = ctx.createGain();
      og.gain.value = [0.5, 0.25, 0.18, 0.08][i];
      o.connect(og).connect(lp);
      o.start();
      return o;
    });
    // هواء القاعة: ضجيجٌ مرشَّح يتنفّس ببطء
    const air = noise(4);
    air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const ag = ctx.createGain();
    ag.gain.value = 0.04;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.03;
    lfo.connect(lg).connect(ag.gain);
    air.connect(bp).connect(ag).connect(lp);
    air.start();
    lfo.start();
    lp.connect(g).connect(master);
    ambient = { g, stop: () => [...oscs, air, lfo].forEach((n) => n.stop()) };
  }

  function tone(freq, { at = 0, dur = 1.6, gain = 0.2, type = "sine" } = {}) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function sweep({ from = 300, to = 2400, dur = 1.2, gain = 0.16, at = 0 } = {}) {
    const t = ctx.currentTime + at;
    const n = noise(dur + 0.1),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(master);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  const CUES = {
    door: () => {
      sweep({ from: 120, to: 700, dur: 2.4, gain: 0.2 });
      tone(55, { dur: 3, gain: 0.18 });
    },
    whoosh: () => sweep({ from: 400, to: 3200, dur: 1.1, gain: 0.12 }),
    tick: () => tone(1760, { dur: 0.25, gain: 0.05, type: "triangle" }),
    dive: () => {
      sweep({ from: 2800, to: 220, dur: 1.4, gain: 0.14 });
      tone(41, { at: 1.1, dur: 2.2, gain: 0.22 });
    },
    // رنينٌ ذهبيّ: نغماتٌ من سلّمٍ خماسيّ تتتابع كقطع نقدٍ تصل
    chime: () =>
      [0, 4, 7, 9, 12, 16].forEach((st, i) =>
        tone(523.25 * 2 ** (st / 12), { at: i * 0.11, dur: 2.4, gain: 0.07 }),
      ),
    bell: () =>
      [1, 2.76, 5.4].forEach((m, i) => tone(392 * m, { dur: 3.2 - i, gain: 0.06 / (i + 1) })),
    rise: () => {
      sweep({ from: 300, to: 5000, dur: 2.6, gain: 0.08 });
      [0, 7, 12, 19].forEach((st, i) =>
        tone(261.6 * 2 ** (st / 12), { at: 0.4 + i * 0.25, dur: 2.6, gain: 0.05 }),
      );
    },
  };

  return {
    get on() {
      return on;
    },
    async toggle() {
      if (!ensure()) return false;
      on = !on;
      if (ctx.state === "suspended") await ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(on ? 0.9 : 0, ctx.currentTime + 0.6);
      if (on) startAmbient();
      return on;
    },
    cue(name) {
      if (on && ctx && CUES[name]) CUES[name]();
    },
    dispose() {
      ambient?.stop();
      ctx?.close();
    },
  };
}
