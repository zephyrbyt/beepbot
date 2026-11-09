/* Echo Robot for iPad and iPhone: the robot plus your home's controls, for Home Assistant's app.
   One layout that adjusts itself: on a wide screen (an iPad sideways) the robot has a panel on the left and the
   controls sit on the right; on a tall one (an iPad upright, an iPhone) the robot shrinks to a header, and Talk
   opens it full screen.
   Local only: no outside libraries, fonts or requests. Everything goes through Home Assistant.
   Separate from the Echo's own card (echo-home-card.js), which this doesn't change or need. */
(() => {
const VERSION = '1.0.0';
const DEFAULTS = {
  // Talking: requests count as coming from the Echo's device, so "set a timer" works and rings on the Echo.
  satellite: 'assist_satellite.echo_show_example_assist_satellite',
  talk_device: null,     // another device instead, or false for none
  talk: 'auto',          // 'auto': this screen's microphone, else Home Assistant's own Assist; 'assist': always Home Assistant's; false: no Talk button
  pipeline: null,        // the voice assistant to use; left out, the preferred one (the Echo's)
  weather: null,         // left out, the first weather entity
  doorbell: true,        // true finds the doorbells; false: none
  tiles: null,           // what shows to begin with: a list of entities (or { entity, name }); the heating is added by itself.
                         // Left out: the lights and the heating. Anything else is added with the cog, on each iPad or iPhone.
  scenes: null,          // left out, every scene is shown (scripts can be added on the Customise page)
  names: {},             // nicer names: { 'light.x': 'Lamp' }
  night_start: '22:30',  // the robot sleeps between these times (it still wakes when you use it); false: never
  night_end: '07:00',
};
const SETTINGS_KEY = 'echo-mobile-settings';
const TALK_LISTEN_MS = 15000, TALK_START_MS = 10000, TALK_CONVERSATION_MS = 300000, TALK_AFTER_MS = 3500;
const WATCH_MS = 45000, WATCH_EVERY_MS = 700;   // following a run started in Home Assistant's own Assist
const REACT_MS = 2600, GLANCE_MS = 7000, MOMENT_MS = 45000;
const HEAT_SETTLE_MS = 6000;
const LIGHT_HOLD_MS = 500, LIGHT_SEND_MS = 350, HEAT_SEND_MS = 900, SCENE_DONE_MS = 1600, THUMB_MS = 30000;
const DOORBELL_MS = 90000;
const WIDE_MIN = 900;     // at least this wide and wider than tall: the side-by-side layout
const KINDS = ['light', 'climate', 'switch', 'fan', 'media_player'];
const LIGHT_TEMPS = [['Warm', 2700], ['Daylight', 4000], ['Cool', 6000]];
const COLOUR_TEMP_MODES = ['color_temp', 'rgbww', 'rgbw'];
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

const svg = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  bulb: svg('<path d="M9 18h6m-5 3h4M8.5 14.5a6 6 0 1 1 7 0c-1 1-1.5 1.5-1.5 3h-4c0-1.5-.5-2-1.5-3Z"/>'),
  lamp: svg('<path d="M8 3h8l3 8H5zM12 11v8M8 21h8"/>'),
  flame: svg('<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8a7 7 0 0 0 7 7Z"/>'),
  plug: svg('<path d="M9 2v6m6-6v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>'),
  fan: svg('<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7s3 4-2 7M14 12c4 0 7 1 7 4s-4 3-7-2M12 14c0 4-1 7-4 7s-3-4 2-7M10 12c-4 0-7-1-7-4s4-3 7 2"/>'),
  tv: svg('<rect x="2" y="6" width="20" height="13" rx="2"/><path d="m8 2 4 4 4-4"/>'),
  video: svg('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>'),
  bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  play: svg('<path fill="currentColor" d="m8 5 12 7-12 7z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  next: svg('<path fill="currentColor" d="m5 5 10 7-10 7z"/><path d="M19 5v14"/>'),
  previous: svg('<path fill="currentColor" d="m19 5-10 7 10 7z"/><path d="M5 5v14"/>'),
  note: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>'),
  film: svg('<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5M2 12h20"/>'),
  exit: svg('<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 17l5-5-5-5M15 12H3"/>'),
  scene: svg('<path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>'),
  check: svg('<path d="m5 12 5 5L20 7"/>'),
  cog: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  heart: svg('<path fill="currentColor" stroke="none" d="M12 21C3 15 1 10 3.5 6.5 6 3 10 4 12 7c2-3 6-4 8.5-.5C23 10 21 15 12 21Z"/>'),
  star: svg('<path fill="currentColor" stroke="none" d="m12 2 3 7 7.5.6-5.7 4.9 1.8 7.5L12 18l-6.6 4 1.8-7.5L1.5 9.6 9 9z"/>'),
  cloud: svg('<path d="M7 19a5 5 0 1 1 .8-9.9A7 7 0 0 1 21 12a3.5 3.5 0 0 1-1 7Z"/>'),
  partly: svg('<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
  rain: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24M16 14v6M8 14v6M12 16v6"/>'),
  storm: svg('<path d="M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97"/><path d="m13 12-3 5h4l-3 5"/>'),
  snow: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>'),
  fog: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 17H7M17 21H9"/>'),
  wind: svg('<path d="M12.8 19.6A2 2 0 1 0 14 16H2M17.5 8a2.5 2.5 0 1 1 2 4H2M9.8 4.4A2 2 0 1 1 11 8H2"/>'),
};
const WEATHER_ICON = { 'clear-night': 'moon', cloudy: 'cloud', fog: 'fog', hail: 'snow', lightning: 'storm', 'lightning-rainy': 'storm',
  partlycloudy: 'partly', pouring: 'rain', rainy: 'rain', snowy: 'snow', 'snowy-rainy': 'snow', sunny: 'sun', windy: 'wind', 'windy-variant': 'wind', exceptional: 'cloud' };

// The robot's face, drawn the same way as on the Echo: the same eye and mouth shapes, the same colours for each mood.
const EYE_SVG = `<svg viewBox="0 0 100 120">
  <g class="round"><rect class="fill" x="8" y="4" width="84" height="112" rx="40"/></g>
  <g class="happy"><path class="line" d="M12 82Q50-6 88 82"/></g>
  <g class="closed"><path class="line" d="M12 50Q50 96 88 50"/></g>
  <g class="heart"><path class="fill" d="M50 112C6 76 0 46 12 26 26 6 46 14 50 36 54 14 74 6 88 26 100 46 94 76 50 112Z"/></g>
  <g class="star"><path class="fill" d="M50 4 63 42 100 44 71 68 82 108 50 85 18 108 29 68 0 44 37 42Z"/></g>
  <g class="x"><path class="line" d="M16 28 84 96M84 28 16 96"/></g>
  <g class="half"><rect class="fill" x="8" y="50" width="84" height="62" rx="28"/></g>
</svg>`;
const FACE_HTML = `<div class="face"><div class="face-move">
  <div class="eyes"><div class="eye l">${EYE_SVG}</div><div class="eye r">${EYE_SVG}</div></div>
  <div class="mouth">
    <svg class="smile" viewBox="0 0 180 80"><path class="stroke" d="M30 16Q90 90 150 16"/></svg>
    <svg class="small" viewBox="0 0 180 80"><path class="stroke" d="M64 28Q90 52 116 28"/></svg>
    <svg class="flat" viewBox="0 0 180 80"><path class="stroke" d="M52 40H128"/></svg>
    <svg class="o" viewBox="0 0 180 80"><ellipse class="solid" cx="90" cy="40" rx="26" ry="36"/></svg>
    <svg class="grin" viewBox="0 0 180 80"><path class="solid" d="M24 8H156Q150 78 90 78 30 78 24 8Z"/></svg>
    <svg class="wiggle" viewBox="0 0 180 80"><path class="stroke" d="M22 44Q44 8 66 44T110 44 158 40"/></svg>
    <div class="bars"><i></i><i></i><i></i><i></i><i></i></div>
  </div>
  <div class="props"><i class="p p1"></i><i class="p p2"></i><i class="p p3"></i></div>
</div></div>`;
// eye, mouth, an animation and things floating round it. The colours are in the style sheet, as on the Echo.
const MOODS = {
  idle:      { eye: 'round', mouth: 'smile' },
  sleep:     { eye: 'closed', mouth: 'small', props: 'z', anim: 'snooze' },
  listening: { eye: 'round', mouth: 'o', anim: 'lean' },
  thinking:  { eye: 'round', mouth: 'flat', props: 'dot', anim: 'ponder' },
  speaking:  { eye: 'round', mouth: 'bars', anim: 'chat' },
  happy:     { eye: 'happy', mouth: 'grin', props: 'star', anim: 'hop' },
  wave:      { eye: 'happy', mouth: 'smile', anim: 'hop' },
  love:      { eye: 'heart', mouth: 'smile', props: 'heart', anim: 'hop' },
  laugh:     { eye: 'happy', mouth: 'grin', anim: 'giggle' },
  bright:    { eye: 'star', mouth: 'grin', props: 'sun', anim: 'hop' },
  dim:       { eye: 'half', mouth: 'small', props: 'moon' },
  notes:     { eye: 'happy', mouth: 'smile', props: 'note', anim: 'dance' },
  weather:   { eye: 'round', mouth: 'smile', anim: 'hop' },
  clock:     { eye: 'round', mouth: 'smile', anim: 'hop' },
  sleepy:    { eye: 'closed', mouth: 'small', props: 'z', anim: 'snooze' },
  confused:  { eye: 'round', mouth: 'wiggle', props: 'question', anim: 'tilt' },
  door:      { eye: 'round', mouth: 'o', props: 'bell', anim: 'shake' },
  offline:   { eye: 'x', mouth: 'flat' },
  wink:      { eye: 'wink', mouth: 'grin', anim: 'hop' },
  giggle:    { eye: 'happy', mouth: 'grin', anim: 'giggle' },
  heart:     { eye: 'heart', mouth: 'smile', props: 'heart', anim: 'hop' },
  hum:       { eye: 'happy', mouth: 'small', props: 'note', anim: 'sway' },
};
const MOMENTS = ['wink', 'giggle', 'heart', 'hum'];
const PROP = { z: () => '<b>z</b>', question: () => '<b>?</b>', dot: () => '', heart: () => ICON.heart, star: () => ICON.star, sun: () => ICON.sun,
  moon: () => ICON.moon, note: () => ICON.note, bell: () => ICON.bell };
// How it reacts to what was said: the same rules as on the Echo.
function classify(said, responseType, code, failed) {
  const t = (said || '').toLowerCase();
  if (failed || responseType === 'error' || code) return 'confused';
  if (/\b(thank|thanks|thankyou|cheers|good (robot|boy|girl)|love you|well done|nice one)\b/.test(t)) return 'love';
  if (/\b(good ?night|go to sleep|bed ?time)\b/.test(t)) return 'sleepy';
  if (/\b(hello|hi|hey|hiya|good (morning|afternoon|evening)|how are you)\b/.test(t)) return 'wave';
  if (/\b(joke|funny|laugh)\b/.test(t)) return 'laugh';
  if (/\b(music|song|play|pause|skip|next track|volume|radio)\b/.test(t)) return 'notes';
  if (/\b(lights?|lamps?|bright|dim)\b/.test(t)) return /\b(off|dim)\b/.test(t) ? 'dim' : 'bright';
  if (/\b(weather|rain|raining|forecast|temperature|cold|hot|sunny)\b/.test(t)) return 'weather';
  if (/\b(time|date|day|timers?|alarms?|remind)\b/.test(t)) return 'clock';
  return responseType ? 'happy' : '';
}

// ---- colours from album art (the same sums as the Echo's card) ----
const contrastOf = (a, b) => {
  const lum = (c) => { const v = c.map((x) => { const n = x / 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mixWith = (c, target, amount) => c.map((v, i) => Math.round(v + (target[i] - v) * amount));
const hexOf = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const hueOf = (c) => {
  const [r, g, b] = c, max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
function artPalette(pixels) {
  const buckets = new Map();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const key = (pixels[i] >> 4 << 8) | (pixels[i + 1] >> 4 << 4) | (pixels[i + 2] >> 4);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n += 1; b.r += pixels[i]; b.g += pixels[i + 1]; b.b += pixels[i + 2];
    buckets.set(key, b);
  }
  const colours = [...buckets.values()].map((b) => {
    const c = [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)];
    const max = Math.max(...c), min = Math.min(...c), sat = max ? (max - min) / max : 0, light = (max + min) / 510;
    return { c, sat, score: b.n * (0.12 + sat) * (light < 0.08 || light > 0.94 ? 0.25 : 1) };
  }).sort((x, y) => y.score - x.score);
  if (!colours.length) return null;
  const base = colours[0];
  if (contrastOf(base.c, [255, 255, 255]) < 2.6) {
    const dark = mixWith(base.c, [0, 0, 0], 0.88);
    return { bg: hexOf(base.c), eye: hexOf(dark), ink: hexOf(dark) };
  }
  let bg = base.c, guard = 0;
  while (contrastOf(bg, [255, 255, 255]) < 4.5 && guard++ < 40) bg = mixWith(bg, [0, 0, 0], 0.06);
  const distance = (x) => { const d = Math.abs(hueOf(x.c) - hueOf(base.c)); return Math.min(d, 360 - d); };
  const accent = base.sat > 0.15 ? colours.find((x) => x.sat > 0.3 && distance(x) > 40) : null;
  let eye = accent ? accent.c : mixWith(base.c, [255, 255, 255], 0.8);
  guard = 0;
  while (contrastOf(eye, bg) < 3.5 && guard++ < 40) eye = mixWith(eye, [255, 255, 255], 0.12);
  return { bg: hexOf(bg), eye: hexOf(eye), ink: '#ffffff' };
}

const MIC_WORKLET = `class EchoMobileMic extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / 16000; this.pos = 0; this.sum = 0; this.count = 0; this.out = new Int16Array(1280); this.n = 0; this.level = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.count++; this.pos += 1; this.level = Math.max(this.level * 0.9995, Math.abs(ch[i]));
      if (this.pos >= this.step) {
        this.pos -= this.step;
        const v = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0; this.count = 0;
        this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === this.out.length) { this.port.postMessage({ pcm: this.out.buffer, level: this.level }, [this.out.buffer]); this.out = new Int16Array(1280); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('echo-mobile-mic', EchoMobileMic);`;

// An arc three-quarters of the way round, from bottom left to bottom right.
const ARC = 'M43.43 156.57A80 80 0 1 1 156.57 156.57';
const DIAL_HTML = `<svg class="dial-svg" viewBox="0 0 200 200" aria-hidden="true"><path class="d-track" d="${ARC}" pathLength="100"/>
  <path class="d-fill" d="${ARC}" pathLength="100"/><circle class="d-now" r="7"/><circle class="d-knob" r="14"/></svg>
  <div class="d-mid"><span class="d-label"></span><span class="d-val"></span><span class="d-cur"></span></div>`;
const dialPoint = (place, radius = 80) => {
  const angle = (135 + 270 * place) * Math.PI / 180;
  return [100 + radius * Math.cos(angle), 100 + radius * Math.sin(angle)];
};
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clockText = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const minutesOf = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

const STYLE = `
:host{display:block;height:var(--card-h,100vh);color-scheme:dark;-webkit-text-size-adjust:100%}
*{box-sizing:border-box;margin:0}
[hidden]{display:none!important}
button{border:0;background:none;color:inherit;font:inherit;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;text-align:inherit}
button:disabled{opacity:.4;cursor:default}
svg{display:block;width:100%;height:100%}
.app{--app:#1b1c2b;--tile:#2a2c40;--tile-2:#33364d;--on:#f2b632;--on-ink:#412402;--heat:#f0997b;--muted:rgba(255,255,255,.66);
  position:relative;height:100%;overflow:hidden;background:var(--app);color:#fff;
  font-family:var(--echo-font,-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif);font-size:15px;line-height:1.3;
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;display:grid;gap:14px;
  padding:max(14px,env(safe-area-inset-top,0px)) max(14px,env(safe-area-inset-right,0px)) max(14px,env(safe-area-inset-bottom,0px)) max(14px,env(safe-area-inset-left,0px))}
.app[data-layout=wide]{grid-template-columns:minmax(300px,36%) minmax(0,1fr);gap:16px;padding:16px}
.app[data-layout=tall]{grid-template-rows:auto minmax(0,1fr);gap:12px}

/* ---------- the robot: the whole panel takes the colour of its mood, as the Echo's screen does ---------- */
.robot{--bg:#3b3fb8;--eye:#fff;--ink:#fff;position:relative;overflow:hidden;border-radius:22px;background:var(--bg);color:var(--ink);transition:background-color .45s,color .45s}
.robot[data-mood=sleep],.robot[data-mood=sleepy]{--bg:#141a38;--eye:#8d9ab8;--ink:#b9c3dc}
.robot[data-mood=listening]{--bg:#ffc933;--eye:#1a1400;--ink:#1a1400}
.robot[data-mood=thinking]{--bg:#5b3fd6}
.robot[data-mood=speaking],.robot[data-mood=happy]{--bg:#0b7f5e}
.robot[data-mood=wave],.robot[data-mood=love],.robot[data-mood=laugh],.robot[data-mood=heart],.robot[data-mood=giggle]{--bg:#c93a63}
.robot[data-mood=bright]{--bg:#ffe39a;--eye:#2a1e00;--ink:#2a1e00}
.robot[data-mood=dim]{--bg:#0d1120;--eye:#7f9bc8;--ink:#b9c6df}
.robot[data-mood=notes],.robot[data-mood=hum]{--bg:#1561b8}
.robot[data-mood=weather]{--bg:#2469a8}
.robot[data-mood=clock]{--bg:#3b4663}
.robot[data-mood=confused]{--bg:#ee8a3c;--eye:#241000;--ink:#241000}
.robot[data-mood=door]{--bg:#c92a2e}
.robot[data-mood=offline]{--bg:#2a2e40;--eye:#98a0b8;--ink:#d6daea}
/* While music plays and it's just listening along, it takes the album's colours. */
.robot[data-art=on][data-mood=idle],.robot[data-art=on][data-mood=notes],.robot[data-art=on][data-mood=hum]{--bg:var(--art-bg);--eye:var(--art-eye);--ink:var(--art-ink)}

.face-box{position:relative;width:100%;height:100%}
.face{position:absolute;left:50%;top:50%;width:600px;height:350px;margin:-175px 0 0 -300px;transform:translateY(calc(var(--k,.4)*48px)) scale(var(--k,.4));color:var(--eye)}
.face-move{position:absolute;inset:0;transform-origin:50% 60%}
.eyes{position:absolute;inset:0;transition:transform .5s ease-out}
.eye{position:absolute;top:0;width:200px;height:240px;transition:transform .25s}
.eye.l{left:30px}.eye.r{left:370px}
.eye g{display:none}
.eye .fill{fill:currentColor;stroke:none}
.eye .line{fill:none;stroke:currentColor;stroke-width:21;stroke-linecap:round;stroke-linejoin:round}
[data-eye=round] .eye g.round,[data-eye=happy] .eye g.happy,[data-eye=closed] .eye g.closed,[data-eye=heart] .eye g.heart,
[data-eye=star] .eye g.star,[data-eye=x] .eye g.x,[data-eye=half] .eye g.half,
[data-eye=wink] .eye.l g.round,[data-eye=wink] .eye.r g.closed{display:block}
[data-eye=round] .eye{animation:blink 6.3s infinite}
[data-eye=round] .eye.r{animation-delay:.05s}
[data-mood=listening] .eye{animation:none;transform:scale(1.1)}
[data-mood=thinking] .eye{animation:none;transform:scale(.82)}
.mouth{position:absolute;left:210px;top:262px;width:180px;height:80px}
.mouth svg{position:absolute;inset:0;display:none}
.mouth .stroke{fill:none;stroke:currentColor;stroke-width:18;stroke-linecap:round;stroke-linejoin:round}
.mouth .solid{fill:currentColor}
[data-mouth=smile] .mouth .smile,[data-mouth=small] .mouth .small,[data-mouth=flat] .mouth .flat,[data-mouth=o] .mouth .o,
[data-mouth=grin] .mouth .grin,[data-mouth=wiggle] .mouth .wiggle{display:block}
.bars{position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:12px}
[data-mouth=bars] .bars{display:flex}
.bars i{width:24px;height:80px;border-radius:12px;background:currentColor;animation:talk .42s ease-in-out infinite alternate}
.bars i:nth-child(2){animation-delay:-.17s}.bars i:nth-child(3){animation-delay:-.31s}.bars i:nth-child(4){animation-delay:-.08s}.bars i:nth-child(5){animation-delay:-.24s}
.props{position:absolute;inset:0;pointer-events:none}
.p{position:absolute;display:none;width:84px;height:84px;color:var(--eye);font-style:normal}
.p b{display:block;font-size:84px;font-weight:800;line-height:1;text-align:center}
[data-props] .p{display:block;animation:float 2.4s ease-in-out infinite}
.p1{left:258px;top:-96px}.p2{left:560px;top:-30px;animation-delay:-.8s!important}.p3{left:-44px;top:-30px;animation-delay:-1.6s!important}
[data-props=dot] .p{width:34px;height:34px;border-radius:50%;background:currentColor;top:-60px;animation:dots 1.2s ease-in-out infinite}
[data-props=dot] .p1{left:220px}[data-props=dot] .p2{left:283px;animation-delay:.15s!important}[data-props=dot] .p3{left:346px;animation-delay:.3s!important}
[data-props=z] .p2,[data-props=z] .p3{display:none}
[data-props=z] .p1{left:520px;top:-70px}
[data-anim=lean] .face-move{animation:lean .9s ease-in-out infinite alternate}
[data-anim=ponder] .eyes{animation:ponder 2.2s ease-in-out infinite}
[data-anim=chat] .face-move{animation:chat .5s ease-in-out infinite alternate}
[data-anim=hop] .face-move{animation:hop .9s ease-in-out 2}
[data-anim=giggle] .face-move{animation:giggle .5s ease-in-out 4}
[data-anim=tilt] .face-move{animation:tilt 1.6s ease-in-out 2}
[data-anim=snooze] .face-move{animation:snooze 3s ease-in-out infinite}
[data-anim=dance] .face-move{animation:dance .8s ease-in-out infinite alternate}
[data-anim=sway] .face-move{animation:tilt 2.4s ease-in-out infinite}
[data-anim=shake] .face-move{animation:shake .5s ease-in-out 6}
@keyframes blink{0%,44%,47%,100%{transform:scaleY(1)}45.5%{transform:scaleY(.06)}}
@keyframes talk{from{transform:scaleY(.3)}to{transform:scaleY(1)}}
@keyframes lean{from{transform:scale(1) translateY(0)}to{transform:scale(1.05) translateY(-5px)}}
@keyframes ponder{0%,100%{transform:translate(-34px,-26px)}50%{transform:translate(34px,-26px)}}
@keyframes chat{from{transform:translateY(0) rotate(0)}to{transform:translateY(-6px) rotate(.8deg)}}
@keyframes hop{0%,100%{transform:translateY(0) scale(1,1)}15%{transform:translateY(0) scale(1.05,.93)}55%{transform:translateY(-26px) scale(.97,1.04)}}
@keyframes giggle{0%,50%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-8px) rotate(-2deg)}75%{transform:translateY(-8px) rotate(2deg)}}
@keyframes snooze{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
@keyframes tilt{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
@keyframes dance{from{transform:translateX(-14px) rotate(-3deg)}to{transform:translateX(14px) rotate(3deg)}}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-14px)}75%{transform:translateX(14px)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
@keyframes dots{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(-16px);opacity:1}}
@media (prefers-reduced-motion:reduce){.face *,.face-move{animation:none!important;transition:none!important}}

/* ---------- the robot's panel, on a wide screen ---------- */
.panel{display:flex;flex-direction:column;padding:18px 20px 20px;min-height:0}
.panel-top{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:17px;font-variant-numeric:tabular-nums}
.wx{display:flex;align-items:center;gap:6px}
.wx i{width:20px;height:20px;display:block}
.panel .face-box{flex:1 1 auto;min-height:120px}
.hello{text-align:center;font-size:21px;font-weight:600;line-height:1.2}
.status{text-align:center;font-size:14px;opacity:.82;margin-top:3px;min-height:1.3em}
.words{text-align:center;margin-top:6px;min-height:0}
.said{font-size:15px;opacity:.85;font-style:italic}
.reply{font-size:17px;font-weight:600;margin-top:4px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.said:empty,.reply:empty{display:none}
.robot.voice .hello,.robot.voice .status{display:none}
.robot:not(.voice) .words{display:none}
.pills{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}
.pill{display:flex;align-items:center;gap:8px;height:46px;padding:0 20px;border-radius:99px;font-weight:600;font-size:16px;background:rgba(255,255,255,.18);color:var(--ink)}
.pill i{display:block;width:20px;height:20px}
.pill.talk{background:var(--ink);color:var(--bg)}
.pill:active{transform:scale(.96)}

/* ---------- the robot's header, on a tall screen ---------- */
.header{display:flex;align-items:center;gap:14px;padding:12px 16px}
.header .face-box{flex:none;width:92px;height:62px}
.header .htext{flex:1;min-width:0}
.header .hello{text-align:left;font-size:18px}
.header .status{text-align:left;font-size:13px}
.header .wx{font-size:13px;opacity:.86;margin-top:2px}
.header .wx i{width:15px;height:15px}
.header .words{text-align:left;margin:0}
.header .reply{font-size:15px;-webkit-line-clamp:2}
.big-header .header{padding:18px 22px;gap:22px}
.big-header .header .face-box{width:250px;height:172px}
.big-header .header .hello{font-size:27px}
.big-header .header .status,.big-header .header .wx{font-size:17px}
.big-header .header .wx i{width:18px;height:18px}
.big-header .header .clock{font-size:17px}
.header .htop{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.header .clock{font-weight:600;font-variant-numeric:tabular-nums;opacity:.86;font-size:14px}

/* ---------- controls ---------- */
.main{display:flex;flex-direction:column;gap:12px;min-height:0;min-width:0}
.scroll{scrollbar-width:none;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;display:flex;flex-direction:column;gap:12px;padding-bottom:4px}
.roombar{display:flex;gap:8px;align-items:center;flex:none}
.rooms{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;flex:1 1 auto;min-width:0;padding:1px}
.rooms::-webkit-scrollbar{display:none}
.chip{flex:none;display:flex;align-items:center;gap:6px;height:36px;padding:0 15px;border-radius:99px;background:var(--tile);font-size:14px;font-weight:500;white-space:nowrap}
.chip i{display:block;width:16px;height:16px}
.chip[aria-pressed=true]{background:#fff;color:#26215c}
.chip.done{background:#0b7f5e}
.chip.gear{padding:0 11px}
.scroll::-webkit-scrollbar{display:none}
.tiles{display:grid;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:10px}
.tile{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:8px;min-height:96px;padding:12px 14px;border-radius:16px;background:var(--tile);overflow:hidden;transition:background-color .25s,color .25s,transform .1s}
.tile:active{transform:scale(.97)}
.tile .ic{width:24px;height:24px;flex:none}
.tile .nm,.tile .st{display:block}
.tile .nm{font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .st{font-size:13px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .big{font-size:22px;font-weight:700;line-height:1;opacity:1}
.tile.on{background:var(--on);color:var(--on-ink)}
.tile.on .st{opacity:.85}
.tile.heat .ic{color:var(--heat)}
.tile.heat.on{background:var(--tile);color:#fff}
.tile.heat.on .ic{color:#ff7a45}
.tile.off-line{opacity:.45}
.tile .lvl{position:absolute;left:0;bottom:0;height:4px;background:currentColor;opacity:.35;border-radius:0 2px 2px 0}
.doors{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.door-tile{flex-direction:row;align-items:center;justify-content:flex-start;gap:12px;min-height:84px}
.thumb{position:relative;flex:none;width:96px;height:60px;border-radius:10px;background:#444441;display:grid;place-items:center;overflow:hidden}
.thumb i{display:block;width:22px;height:22px}
.thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.door-tile .dt{min-width:0}
.door-tile.rang{background:#c92a2e}
.empty{padding:28px 12px;text-align:center;color:var(--muted)}
.scenes{display:flex;gap:8px;flex-wrap:wrap}
.sec{font-size:13px;font-weight:600;color:var(--muted);margin:4px 2px -4px}

/* ---------- music, coloured from the album cover ---------- */
.np{--np-bg:#993556;--np-ink:#fff;display:none;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:var(--np-bg);color:var(--np-ink);flex:none;transition:background-color .6s,color .6s}
.has-np .np{display:flex}
.np-art{position:relative;flex:none;width:52px;height:52px;border-radius:9px;overflow:hidden;background:rgba(255,255,255,.22)}
.np-art i{position:absolute;inset:14px;display:block;opacity:.7}
.np-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}
.np-art img.on{opacity:1}
.np-info{flex:1;min-width:0}
.np-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.np-sub{font-size:13px;opacity:.82;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.np-bar{height:3px;border-radius:2px;background:rgba(255,255,255,.3);margin-top:7px;overflow:hidden}
.np-fill{height:100%;width:0;background:currentColor;transition:width 1s linear}
.np-btns{display:flex;align-items:center;gap:2px;flex:none}
.np-b{width:44px;height:44px;display:grid;place-items:center;border-radius:50%}
.np-b i{display:block;width:22px;height:22px}
.np-b.main i{width:26px;height:26px}
.np-b:active{background:rgba(255,255,255,.18)}
.foot{display:flex;flex-direction:column;gap:10px;flex:none}
.foot .talk-row{display:flex;justify-content:center}
.foot .pill.talk{height:52px;padding:0 30px;font-size:17px;background:#fff;color:#26215c}
.app[data-size=phone] .np-b.prev{display:none}

/* ---------- full-screen robot, when talking on a tall screen ---------- */
.talkview{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;padding:max(20px,env(safe-area-inset-top,0px)) 22px max(26px,env(safe-area-inset-bottom,0px));
  opacity:0;visibility:hidden;transform:scale(.98);transition:opacity .25s,transform .25s,visibility 0s .25s,background-color .45s;border-radius:0}
.talkview.show{opacity:1;visibility:visible;transform:none;transition:opacity .25s,transform .25s,background-color .45s}
.talkview .tv-x{align-self:flex-end;width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.18)}
.talkview .tv-x i{display:block;width:22px;height:22px}
.talkview .face-box{flex:1 1 auto;width:100%;min-height:160px;max-height:52%}
.tv-state{font-size:20px;font-weight:700;margin-top:6px;text-align:center}
.talkview .said{font-size:17px;text-align:center;margin-top:10px;max-width:520px}
.talkview .reply{font-size:21px;text-align:center;max-width:560px;margin-top:10px;-webkit-line-clamp:6}
.tv-wave{display:flex;gap:5px;align-items:flex-end;height:30px;margin-top:auto;padding-top:18px}
.tv-wave i{width:6px;border-radius:3px;background:currentColor;height:8px;transition:height .12s;opacity:.85}
.talkview:not([data-mood=listening]) .tv-wave{visibility:hidden}
.tv-stop{margin-top:14px}

/* ---------- sheets: a light's brightness, the heating, the doorbell, Customise ---------- */
.sheet-back{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;visibility:hidden;transition:opacity .2s,visibility 0s .2s}
.sheet-back.show{opacity:1;visibility:visible;transition:opacity .2s}
.app[data-size=phone] .sheet-back{align-items:flex-end;padding:0}
.sheet>*{flex-shrink:0}
.sheet{scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;width:min(520px,100%);max-height:100%;overflow-y:auto;background:#24263a;border-radius:22px;padding:18px 20px 22px;display:flex;flex-direction:column;gap:14px}
.app[data-size=phone] .sheet{border-radius:22px 22px 0 0;padding-bottom:max(22px,env(safe-area-inset-bottom,0px))}
.sheet.door{width:min(760px,100%)}
.sh-top{display:flex;align-items:center;gap:12px}
.sh-title{flex:1;font-size:19px;font-weight:700;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-x{width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.12);flex:none}
.sh-x i{display:block;width:20px;height:20px}
.sh-big{font-size:54px;font-weight:700;text-align:center;line-height:1;font-variant-numeric:tabular-nums}
.sh-sub{text-align:center;color:var(--muted);font-size:14px}
.sh-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.round{width:64px;height:64px;border-radius:50%;background:var(--tile-2);display:grid;place-items:center}
.round i{display:block;width:26px;height:26px}
.slider{-webkit-appearance:none;appearance:none;width:100%;height:56px;border-radius:16px;background:linear-gradient(90deg,var(--on) var(--pct,50%),var(--tile-2) var(--pct,50%));outline:none;margin:0}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:56px;border-radius:12px;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.15)}
.slider::-moz-range-thumb{width:24px;height:56px;border-radius:12px;background:#fff;border:0}
.door-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000;display:grid;place-items:center;color:var(--muted)}
.door-video>*{width:100%;height:100%}
.door-video img{object-fit:contain}
.cust-list{display:flex;flex-direction:column;gap:6px}
.cust-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:var(--tile)}
.cust-item .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cust-item .rm{font-size:12px;color:var(--muted)}
.tog{flex:none;width:50px;height:30px;border-radius:15px;background:var(--tile-2);position:relative;transition:background-color .2s}
.tog::after{content:'';position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .2s}
.tog[aria-checked=true]{background:#34c759}
.tog[aria-checked=true]::after{transform:translateX(20px)}
/* ---------- the heating: a dial, like the Echo's ---------- */
.heat-tile{grid-column:1/-1;flex-direction:row;align-items:center;justify-content:flex-start;gap:14px;min-height:0;padding:12px 14px;cursor:default}
.heat-tile:active{transform:none}
.heat-tile .ht-open{display:flex;align-items:center;gap:14px;flex:1;min-width:0;text-align:left}
.heat-tile .dial{width:104px;flex:none;--dial:104px}
.heat-tile .ht-tx{min-width:0;display:flex;flex-direction:column;gap:3px}
.heat-tile .nm{font-size:16px}
.heat-tile .ht-st{font-size:13px;opacity:.75}
.heat-tile.heating .ht-st{color:#ffb37a;opacity:1}
.ht-steps{display:flex;gap:8px;flex:none}
.ht-steps .round{width:48px;height:48px}
.ht-steps .round i{width:22px;height:22px}
.dial{position:relative;aspect-ratio:1;--dial:240px}
.dial-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.d-track,.d-fill{fill:none;stroke-width:14;stroke-linecap:round}
.d-track{stroke:rgba(255,255,255,.14)}
.d-fill{stroke:#c9cde6;transition:stroke-dasharray .3s ease-out,stroke .3s}
.heating .d-fill{stroke:#ff8a3d}
.heat-off .d-fill,.heat-off .d-knob{opacity:0}
.d-now{fill:#fff;stroke:var(--app);stroke-width:4}
.d-knob{display:none;fill:#fff;stroke:rgba(0,0,0,.25);stroke-width:2}
.d-mid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;pointer-events:none;font-variant-numeric:tabular-nums}
.d-label{font-size:calc(var(--dial)*.075);opacity:.75}
.d-val{font-size:calc(var(--dial)*.24);font-weight:700;letter-spacing:-.02em;margin:calc(var(--dial)*.02) 0}
.d-cur{font-size:calc(var(--dial)*.075);opacity:.75}
.d-label:empty,.d-cur:empty{display:none}
.heat-tile .d-label,.heat-tile .d-cur{display:none}
.heat-tile .d-track,.heat-tile .d-fill{stroke-width:16}
.heat-sheet .dial{width:min(260px,64vw);margin:0 auto;--dial:min(260px,64vw);touch-action:none;cursor:grab}
.heat-sheet .d-knob{display:block}
.heat-sheet .d-label{font-size:15px}.heat-sheet .d-cur{font-size:15px}
.heat-sheet .d-val{font-size:58px}
.heat-steps{display:flex;gap:12px}
.heat-steps button{flex:1;height:64px;border-radius:18px;background:var(--tile-2);display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;font-size:16px}
.heat-steps i{display:block;width:22px;height:22px}
.heat-status{text-align:center;font-weight:600}
.heating .heat-status{color:#ffb37a}
.chip[aria-pressed=true]{background:#fff;color:#26215c}
/* ---------- Customise ---------- */
.search{width:100%;height:44px;border-radius:12px;border:0;background:var(--tile);color:#fff;font:inherit;padding:0 14px;outline:none;-webkit-appearance:none;appearance:none}
.search::placeholder{color:var(--muted)}
.cust-none{padding:6px 2px;color:var(--muted);font-size:14px}
.toast{position:absolute;left:50%;bottom:24px;z-index:40;transform:translate(-50%,20px);background:#fff;color:#1b1c2b;padding:10px 18px;border-radius:99px;font-weight:600;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:90%;text-align:center}
.toast.show{opacity:1;transform:translate(-50%,0)}
`;

class EchoMobileCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = { ...DEFAULTS };
    this._mood = 'idle';
    this._voice = null;      // { stage, said, reply, react } while talking
    this._talk = null;       // talking through this screen's microphone
    this._watch = null;      // following a run in Home Assistant's own Assist
    this._sheet = null;
  }
  static getStubConfig() { return {}; }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full', rows: 'auto' }; }
  setConfig(config) {
    this._config = { ...DEFAULTS, ...(config || {}) };
    this._config.names = { ...(config && config.names) };
    // Names given with the tiles count too: { entity: light.x, name: Bedroom }.
    for (const t of Array.isArray(this._config.tiles) ? this._config.tiles : []) {
      if (t && typeof t === 'object' && t.entity && t.name && !this._config.names[t.entity]) this._config.names[t.entity] = t.name;
    }
    this._listKey = null;
    if (this._built) this._render();
  }
  set hass(value) {
    this._hass = value;
    this._build();
    this._render();
  }
  get hass() { return this._hass; }

  connectedCallback() {
    this._build();
    if (!this._onResize) this._onResize = () => this._fit();
    window.addEventListener('resize', this._onResize);
    if (window.ResizeObserver && !this._ro) { this._ro = new ResizeObserver(() => this._fit()); }
    if (this._ro) this._ro.observe(this);
    clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), 1000);
    this._fit();
    this._tick();
    this._scheduleGlance();
    this._scheduleMoment();
  }
  disconnectedCallback() {
    window.removeEventListener('resize', this._onResize);
    if (this._ro) this._ro.disconnect();
    clearInterval(this._timer);
    [this._glanceT, this._momentT, this._reactT, this._toastT, this._afterT, this._doorT].forEach(clearTimeout);
    if (this._talk) this._talkFinish(this._talk);
    this._stopWatch();
    this._closeSheet();
  }

  // ---------- small helpers ----------
  _state(id) { return id && this._hass && this._hass.states ? this._hass.states[id] : undefined; }
  _usable(id) { const s = this._state(id); return !!s && !['unavailable', 'unknown'].includes(s.state); }
  _q(s) { return this.shadowRoot.querySelector(s); }
  _text(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  _choices() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (err) { return {}; }
  }
  _saveChoice(key, value) {
    const all = this._choices();
    all[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(all)); } catch (err) { /* private browsing: just for now */ }
    this._listKey = null;
  }
  _toast(text) {
    const t = this._el.toast;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }
  async _service(domain, service, data) {
    if (!this._hass) return false;
    try {
      await this._hass.callService(domain, service, data);
      return true;
    } catch (err) {
      const why = String((err && err.message) || '').trim().slice(0, 80);
      this._toast(why ? `Couldn’t do that: ${why}` : 'Couldn’t reach Home Assistant');
      this._react('confused');
      return false;
    }
  }

  // ---------- building the page ----------
  _build() {
    if (this._built) return;
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
    <div class="app" data-layout="tall">
      <section class="robot panel" data-mood="idle" aria-label="Robot">
        <div class="panel-top"><span class="clock"></span><span class="wx"><i></i><span></span></span></div>
        <div class="face-box">${FACE_HTML}</div>
        <p class="hello"></p><p class="status"></p>
        <div class="words" aria-live="polite"><p class="said"></p><p class="reply"></p></div>
        <div class="pills"><button class="pill talk" data-act="talk"><i>${ICON.mic}</i><span>Talk</span></button><button class="pill door-pill" data-act="door"><i>${ICON.bell}</i><span>Door</span></button></div>
      </section>
      <section class="robot header" data-mood="idle" aria-label="Robot">
        <div class="face-box">${FACE_HTML}</div>
        <div class="htext"><div class="htop"><p class="hello"></p><span class="clock"></span></div><p class="status"></p><div class="wx"><i></i><span></span></div>
          <div class="words" aria-live="polite"><p class="said"></p><p class="reply"></p></div></div>
      </section>
      <div class="main">
        <div class="roombar"><div class="rooms" role="toolbar" aria-label="Rooms"></div><button class="chip gear" aria-label="Customise"><i>${ICON.cog}</i></button></div>
        <div class="scroll">
          <div class="tiles"></div>
          <div class="doors"></div>
          <p class="sec scenes-label">Scenes</p>
          <div class="scenes"></div>
        </div>
        <div class="foot">
          <div class="np" role="group" aria-label="Now playing">
            <div class="np-art"><i>${ICON.note}</i><img alt=""></div>
            <div class="np-info"><div class="np-title"></div><div class="np-sub"></div><div class="np-bar"><div class="np-fill"></div></div></div>
            <div class="np-btns">
              <button class="np-b prev" data-np="media_previous_track" aria-label="Previous track"><i>${ICON.previous}</i></button>
              <button class="np-b main" data-np="media_play_pause" aria-label="Play or pause"><i>${ICON.pause}</i></button>
              <button class="np-b" data-np="media_next_track" aria-label="Next track"><i>${ICON.next}</i></button>
            </div>
          </div>
          <div class="talk-row"><button class="pill talk" data-act="talk"><i>${ICON.mic}</i><span>Talk</span></button></div>
        </div>
      </div>
      <section class="robot talkview" data-mood="idle" aria-label="Talking to the robot" aria-hidden="true">
        <button class="tv-x" data-act="close-talk" aria-label="Close"><i>${ICON.close}</i></button>
        <div class="face-box">${FACE_HTML}</div>
        <p class="tv-state"></p>
        <div class="words" aria-live="polite"><p class="said"></p><p class="reply"></p></div>
        <div class="tv-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <button class="pill tv-stop" data-act="talk"><i>${ICON.stop}</i><span>Stop</span></button>
      </section>
      <div class="sheet-back" aria-hidden="true"><div class="sheet" role="dialog" aria-modal="true"></div></div>
      <div class="toast" role="status"></div>
    </div>`;
    const q = (s) => this._q(s);
    this._el = {
      app: q('.app'), panel: q('.panel'), header: q('.header'), talkview: q('.talkview'),
      robots: [...this.shadowRoot.querySelectorAll('.robot')],
      rooms: q('.rooms'), tiles: q('.tiles'), doors: q('.doors'), scenes: q('.scenes'), scenesLabel: q('.scenes-label'),
      np: q('.np'), npImg: q('.np-art img'), npTitle: q('.np-title'), npSub: q('.np-sub'), npFill: q('.np-fill'), npMain: q('.np-b.main'),
      back: q('.sheet-back'), sheet: q('.sheet'), toast: q('.toast'), tvState: q('.tv-state'), wave: [...this.shadowRoot.querySelectorAll('.tv-wave i')],
      doorPill: q('.door-pill'),
    };
    this.shadowRoot.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'talk') this._talkPress();
        else if (a === 'close-talk') this._closeTalk();
        else if (a === 'door') { const d = this._doors()[0]; if (d) this._openDoor(d, false); }
        return;
      }
      const np = e.target.closest('[data-np]');
      if (np) { this._mediaPress(np.dataset.np); return; }
      // Tapping the robot itself: a little reaction, so it feels alive.
      if (e.target.closest('.face-box') && !this._voice) this._react(MOMENTS[Math.floor(Math.random() * MOMENTS.length)]);
    });
    this._el.back.addEventListener('click', (e) => { if (e.target === this._el.back) this._closeSheet(); });
    this._q('.gear').addEventListener('click', () => this._openCustomise());
  }

  // Fill the screen below Home Assistant's header, and pick the layout for its shape.
  _fit() {
    if (!this._built) return;
    const top = Math.max(0, this.getBoundingClientRect().top);
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const h = Math.max(320, Math.floor(vh - top));
    const w = this.getBoundingClientRect().width || window.innerWidth;
    if (h !== this._h) { this._h = h; this.style.setProperty('--card-h', h + 'px'); }
    const layout = w >= WIDE_MIN && w > h * 1.05 ? 'wide' : 'tall';
    const size = w < 600 ? 'phone' : 'tablet';
    const app = this._el.app;
    if (app.dataset.layout !== layout) { app.dataset.layout = layout; if (layout === 'wide') this._closeTalk(true); }
    app.dataset.size = size;
    app.classList.toggle('big-header', layout === 'tall' && size === 'tablet');
    this._el.panel.hidden = layout !== 'wide';
    this._el.header.hidden = layout === 'wide';
    this._q('.foot .talk-row').hidden = layout === 'wide' || this._config.talk === false;
    const mainW = this._q('.main').getBoundingClientRect().width || w;
    this._el.tiles.style.setProperty('--cols', String(Math.max(2, Math.min(4, Math.floor((mainW + 10) / 190)))));
    requestAnimationFrame(() => this._sizeFaces());
  }
  // The face is drawn at the Echo's size and scaled to fit its box.
  _sizeFaces() {
    for (const box of this.shadowRoot.querySelectorAll('.face-box')) {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // The props float a little above the face, so leave room for them.
      const k = Math.min(r.width / 680, r.height / 470);
      box.style.setProperty('--k', k.toFixed(4));
    }
  }

  // ---------- once a second: the clock, the music bar's progress, night time ----------
  _tick() {
    if (!this._built || !this._hass) return;
    const now = new Date();
    for (const el of this.shadowRoot.querySelectorAll('.clock')) this._text(el, clockText(now));
    this._updateProgress();
    const night = this._isNight(now);
    if (night !== this._night) { this._night = night; this._applyMood(); }
  }
  _isNight(now) {
    const a = minutesOf(this._config.night_start), b = minutesOf(this._config.night_end);
    if (a == null || b == null) return false;
    const m = now.getHours() * 60 + now.getMinutes();
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }

  // ---------- the robot's mood ----------
  // What it shows: talking first, then a short reaction, then night, then just being itself.
  _currentMood() {
    const v = this._voice;
    if (v) {
      if (v.stage === 'listening') return 'listening';
      if (v.stage === 'thinking') return 'thinking';
      if (v.stage === 'speaking') return 'speaking';
      if (v.react) return v.react;
    }
    if (this._reaction) return this._reaction;
    if (this._doorRinging) return 'door';
    if (this._night) return 'sleep';
    if (this._musicPlaying) return 'idle';
    return 'idle';
  }
  _applyMood() {
    if (!this._built) return;
    const mood = this._currentMood(), m = MOODS[mood] || MOODS.idle;
    this._mood = mood;
    for (const r of this._el.robots) {
      if (r.dataset.mood !== mood) r.dataset.mood = mood;
      const face = r.querySelector('.face');
      face.dataset.eye = m.eye;
      face.dataset.mouth = m.mouth;
      if (m.anim) face.dataset.anim = m.anim; else delete face.dataset.anim;
      const props = r.querySelector('.props');
      if (m.props) {
        if (props.dataset.props !== m.props) {
          props.dataset.props = m.props;
          for (const p of props.children) p.innerHTML = PROP[m.props] ? PROP[m.props]() : '';
        }
      } else delete props.dataset.props;
      r.dataset.art = this._art ? 'on' : 'off';
    }
    this._renderVoice();
  }
  _react(mood, ms = REACT_MS) {
    if (!MOODS[mood]) return;
    this._reaction = mood;
    clearTimeout(this._reactT);
    this._reactT = setTimeout(() => { this._reaction = null; this._applyMood(); }, ms);
    this._applyMood();
  }
  // Signs of life: a glance now and then, and every so often a little moment.
  _scheduleGlance() {
    clearTimeout(this._glanceT);
    this._glanceT = setTimeout(() => {
      if (this.isConnected && this._mood === 'idle' && this._built) {
        const x = Math.round((Math.random() - 0.5) * 70), y = Math.round((Math.random() - 0.6) * 40);
        for (const eyes of this.shadowRoot.querySelectorAll('.eyes')) eyes.style.transform = `translate(${x}px,${y}px)`;
        setTimeout(() => { for (const eyes of this.shadowRoot.querySelectorAll('.eyes')) eyes.style.transform = ''; }, 1600);
      }
      this._scheduleGlance();
    }, GLANCE_MS * (0.6 + Math.random() * 0.8));
  }
  _scheduleMoment() {
    clearTimeout(this._momentT);
    this._momentT = setTimeout(() => {
      if (this.isConnected && this._mood === 'idle' && !this._night && !this._sheet) this._react(MOMENTS[Math.floor(Math.random() * MOMENTS.length)]);
      this._scheduleMoment();
    }, MOMENT_MS * (0.7 + Math.random() * 0.6));
  }

  // ---------- what the robot says while you talk to it ----------
  _setVoice(v) {
    this._voice = v;
    clearTimeout(this._afterT);
    if (v && v.stage === 'done') {
      this._afterT = setTimeout(() => {
        if (this._voice !== v) return;
        this._voice = null;
        this._applyMood();
        this._closeTalk();
      }, TALK_AFTER_MS);
    }
    this._applyMood();
  }
  _renderVoice() {
    const v = this._voice;
    for (const r of this._el.robots) {
      r.classList.toggle('voice', !!v);
      this._text(r.querySelector('.said'), v && v.said ? `“${v.said}”` : '');
      this._text(r.querySelector('.reply'), v ? v.reply || '' : '');
    }
    const words = { listening: 'Listening…', thinking: 'Thinking…', speaking: '', done: '' };
    this._text(this._el.tvState, v ? (words[v.stage] ?? '') : '');
    const stop = this._q('.tv-stop');
    stop.hidden = !v || !['listening', 'thinking', 'speaking'].includes(v.stage);
    stop.querySelector('span').textContent = v && v.stage === 'listening' ? 'Done' : 'Stop';
  }
  _openTalkView() {
    if (this._el.app.dataset.layout !== 'tall') return;
    const tv = this._el.talkview;
    tv.classList.add('show');
    tv.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => this._sizeFaces());
  }
  _closeTalk(quiet) {
    if (!this._built) return;
    const tv = this._el.talkview;
    tv.classList.remove('show');
    tv.setAttribute('aria-hidden', 'true');
    if (!quiet && this._talk) this._talkFinish(this._talk);
  }

  // ---------- talking ----------
  _talkMode() {
    const mode = this._config.talk;
    if (mode === false) return null;
    if (mode === 'assist') return 'assist';
    const can = window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.AudioWorkletNode;
    return can && !this._micRefused ? 'page' : 'assist';
  }
  _talkPress() {
    const t = this._talk;
    if (t) { // pressing again: done talking, or stop it talking
      if (t.stage === 'listening') this._talkEndAudio(t); else { this._talkFinish(t); this._setVoice(null); this._closeTalk(true); }
      return;
    }
    if (this._watch) { this._stopWatch(); this._setVoice(null); this._closeTalk(true); return; }
    const mode = this._talkMode();
    if (!mode || !this._hass) return;
    if (mode === 'assist') { this._openAssist(); return; }
    this._talkStart();
  }
  async _pipelineId() {
    if (this._config.pipeline) return this._config.pipeline;
    if (this._pipeline !== undefined) return this._pipeline;
    try {
      const r = await this._hass.callWS({ type: 'assist_pipeline/pipeline/list' });
      this._pipeline = (r && r.preferred_pipeline) || null;
    } catch (err) { this._pipeline = null; }
    return this._pipeline;
  }
  _talkDevice() {
    const d = this._config.talk_device;
    if (d === false) return null;
    if (d) return d;
    const entry = this._hass.entities && this._hass.entities[this._config.satellite];
    return (entry && entry.device_id) || null;
  }
  async _talkStart() {
    const t = { stage: 'listening', handler: null, queue: [], said: '', reply: '', react: '', done: false };
    this._talk = t;
    // iPhones and iPads only let a page play sound or open the microphone straight from a tap, so both start here,
    // before anything has to wait: the sound player plays a moment of silence now, and the reply later.
    const Ctx = window.AudioContext || window.webkitAudioContext;
    try { t.ctx = new Ctx(); if (t.ctx.state === 'suspended') t.ctx.resume().catch(() => {}); } catch (err) { t.ctx = null; }
    try { t.audio = new Audio(SILENCE); const p = t.audio.play(); if (p && p.catch) p.catch(() => {}); } catch (err) { t.audio = null; }
    this._setVoice({ stage: 'listening', said: '', reply: '', react: '' });
    this._openTalkView();
    t.limitT = setTimeout(() => this._talkEndAudio(t), TALK_LISTEN_MS);
    t.startT = setTimeout(() => { if (t.handler == null) this._talkFail(t, 'Couldn’t reach Home Assistant'); }, TALK_START_MS);
    try {
      t.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (this._talk !== t) { this._talkStopMic(t); return; }
      if (!t.ctx) throw new Error('no audio');
      if (!this._micUrl) this._micUrl = URL.createObjectURL(new Blob([MIC_WORKLET], { type: 'application/javascript' }));
      await t.ctx.audioWorklet.addModule(this._micUrl);
      if (this._talk !== t || !t.ctx) { this._talkStopMic(t); return; }
      t.node = new AudioWorkletNode(t.ctx, 'echo-mobile-mic');
      t.node.port.onmessage = (e) => this._talkAudio(t, e.data);
      t.ctx.createMediaStreamSource(t.stream).connect(t.node);
      t.node.connect(t.ctx.destination); // keeps it running; it only ever outputs silence
    } catch (err) {
      // No microphone for this page (the app may not allow it): use Home Assistant's own Assist instead, from now on.
      this._talkStopMic(t);
      this._talkUnsub(t);
      clearTimeout(t.startT);
      this._talk = null;
      this._micRefused = true;
      this._setVoice(null);
      this._closeTalk(true);
      this._openAssist();
      return;
    }
    try {
      const pipeline = await this._pipelineId();
      const device = this._talkDevice();
      const msg = { type: 'assist_pipeline/run', start_stage: 'stt', end_stage: 'tts', input: { sample_rate: 16000 }, timeout: 60 };
      if (pipeline) msg.pipeline = pipeline;
      if (device) msg.device_id = device;
      if (this._conv && Date.now() - this._convAt < TALK_CONVERSATION_MS) msg.conversation_id = this._conv;
      t.unsub = await this._hass.connection.subscribeMessage((ev) => this._talkEvent(t, ev), msg, { resubscribe: false });
      if (this._talk !== t) this._talkUnsub(t);
    } catch (err) {
      this._talkFail(t, err && err.message ? `Couldn’t start: ${String(err.message).slice(0, 60)}` : 'Couldn’t reach Home Assistant');
    }
  }
  _talkAudio(t, data) {
    if (this._talk !== t || t.micDone) return;
    const level = Math.min(1, (data.level || 0) * 3);
    this._el.wave.forEach((bar, i) => { bar.style.height = `${Math.round(8 + level * 22 * (0.5 + 0.5 * Math.sin(i * 1.7 + Date.now() / 90)))}px`; });
    if (t.handler == null) { if (t.queue.length < 200) t.queue.push(data.pcm); return; }
    this._talkSend(t, new Uint8Array(data.pcm));
  }
  _talkSend(t, bytes) {
    const out = new Uint8Array(1 + bytes.byteLength);
    out[0] = t.handler;
    out.set(bytes, 1);
    try { this._hass.connection.socket.send(out); } catch (err) { /* the connection dropped; the run ends by itself */ }
  }
  _talkEndAudio(t) {
    if (this._talk !== t || t.micDone) return;
    this._talkStopMic(t);
    if (t.handler != null) this._talkSend(t, new Uint8Array(0)); // an empty piece means "that's everything"
    else t.endWhenReady = true;
    this._talkStage(t, 'thinking');
  }
  _talkStopMic(t) {
    t.micDone = true;
    clearTimeout(t.limitT);
    if (t.stream) t.stream.getTracks().forEach((track) => track.stop());
    if (t.ctx) t.ctx.close().catch(() => {});
    t.stream = null;
    t.ctx = null;
  }
  // Event names and shapes from homeassistant/components/assist_pipeline.
  _talkEvent(t, ev) {
    if (this._talk !== t || !ev) return;
    const d = ev.data || {};
    if (ev.type === 'run-start') {
      clearTimeout(t.startT);
      t.handler = d.runner_data ? d.runner_data.stt_binary_handler_id : null;
      t.ttsUrl = d.tts_output && d.tts_output.url;
      const queued = t.queue;
      t.queue = [];
      if (t.handler != null) {
        queued.forEach((b) => this._talkSend(t, new Uint8Array(b)));
        if (t.endWhenReady) this._talkSend(t, new Uint8Array(0));
      }
    } else if (ev.type === 'stt-vad-end') {
      this._talkEndAudio(t);
    } else if (ev.type === 'stt-end') {
      this._talkStopMic(t);
      t.said = (d.stt_output && d.stt_output.text) || '';
      this._talkStage(t, 'thinking');
    } else if (ev.type === 'intent-progress') {
      if (d.tts_start_streaming && t.ttsUrl) this._talkPlay(t, t.ttsUrl);
    } else if (ev.type === 'intent-end') {
      const out = d.intent_output || {}, r = out.response || {};
      t.reply = (r.speech && r.speech.plain && r.speech.plain.speech) || '';
      t.react = classify(t.said, r.response_type || '', (r.data && r.data.code) || '', false);
      t.done = true;
      if (out.conversation_id) { this._conv = out.conversation_id; this._convAt = Date.now(); }
    } else if (ev.type === 'tts-end') {
      this._talkPlay(t, (d.tts_output && d.tts_output.url) || t.ttsUrl);
    } else if (ev.type === 'error') {
      this._talkFail(t, null, /no-text|no_text|stt-stream|stt-no/.test(d.code || '') ? 'Sorry, I didn’t catch that.' : 'Sorry, something went wrong.');
      return;
    } else if (ev.type === 'run-end') {
      if (!t.playing) this._talkFinish(t, true);
      return;
    }
    this._talkShow(t);
  }
  _talkStage(t, stage) {
    if (this._talk !== t || t.stage === stage) return;
    t.stage = stage;
    this._talkShow(t);
  }
  _talkShow(t) {
    if (this._talk !== t) return;
    this._setVoice({ stage: t.stage, said: t.said, reply: t.stage === 'listening' || t.stage === 'thinking' ? '' : t.reply, react: t.react });
  }
  _talkPlay(t, url) {
    if (t.playing || !url || this._talk !== t) return;
    t.playing = true;
    const src = url.startsWith('/') && this._hass.hassUrl ? this._hass.hassUrl(url) : url;
    // The player that was started from the tap, so the phone lets it play.
    const audio = t.audio || new Audio();
    t.audio = audio;
    audio.onplaying = () => this._talkStage(t, 'speaking');
    audio.onended = () => this._talkFinish(t, true);
    audio.onerror = () => this._talkFinish(t, true);
    audio.src = src;
    const p = audio.play();
    if (p && p.catch) p.catch(() => this._talkFinish(t, true));
  }
  _talkFail(t, toastText, reply) {
    if (this._talk !== t) return;
    if (toastText) this._toast(toastText);
    this._talkStopMic(t);
    this._talkUnsub(t);
    clearTimeout(t.startT);
    this._talk = null;
    this._setVoice({ stage: 'done', said: t.said, reply: reply || '', react: 'confused' });
  }
  _talkUnsub(t) {
    const unsub = t.unsub;
    t.unsub = null;
    if (typeof unsub !== 'function') return;
    try { const p = unsub(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* it had already finished */ }
  }
  // finished: true when the run ended by itself (show its reaction), false when stopped
  _talkFinish(t, finished) {
    if (this._talk !== t) return;
    clearTimeout(t.startT);
    this._talkStopMic(t);
    if (t.audio && !t.audio.ended) { t.audio.onended = t.audio.onerror = null; t.audio.pause(); }
    this._talkUnsub(t);
    this._talk = null;
    if (finished) this._setVoice({ stage: 'done', said: t.said, reply: t.reply, react: t.react || (t.said ? 'happy' : '') });
  }

  // Home Assistant's own Assist (the app's, on an iPhone or iPad), when this page can't use the microphone.
  // The robot follows along by reading the voice assistant's recent runs (an admin login can).
  async _openAssist() {
    const pipeline = await this._pipelineId();
    const ext = this._hass.auth && this._hass.auth.external;
    if (ext && ext.config && ext.config.hasAssist && typeof ext.fireMessage === 'function') {
      ext.fireMessage({ type: 'assist/show', payload: { pipeline_id: pipeline || undefined, start_listening: true } });
    } else {
      this.dispatchEvent(new CustomEvent('hass-action', { bubbles: true, composed: true,
        detail: { config: { tap_action: { action: 'assist', pipeline_id: pipeline || 'last_used', start_listening: true } }, action: 'tap' } }));
    }
    this._startWatch(pipeline);
  }
  async _startWatch(pipeline) {
    this._stopWatch();
    if (!pipeline) return;
    const w = { pipeline, until: Date.now() + WATCH_MS, known: null, run: null };
    this._watch = w;
    try {
      const list = await this._hass.callWS({ type: 'assist_pipeline/pipeline_debug/list', pipeline_id: pipeline });
      w.known = new Set(((list && list.pipeline_runs) || []).map((r) => r.pipeline_run_id));
    } catch (err) { this._watch = null; return; } // not an admin login: Assist still works, the robot just doesn't follow
    const step = async () => {
      if (this._watch !== w) return;
      if (Date.now() > w.until) { this._stopWatch(); return; }
      try {
        if (!w.run) {
          const list = await this._hass.callWS({ type: 'assist_pipeline/pipeline_debug/list', pipeline_id: pipeline });
          const fresh = ((list && list.pipeline_runs) || []).filter((r) => !w.known.has(r.pipeline_run_id));
          if (fresh.length) w.run = fresh[fresh.length - 1].pipeline_run_id;
        }
        if (w.run) {
          const r = await this._hass.callWS({ type: 'assist_pipeline/pipeline_debug/get', pipeline_id: pipeline, pipeline_run_id: w.run });
          if (this._watch !== w) return;
          if (this._followRun(w, (r && r.events) || [])) return;
        }
      } catch (err) { /* try again shortly */ }
      w.t = setTimeout(step, WATCH_EVERY_MS);
    };
    w.t = setTimeout(step, WATCH_EVERY_MS);
  }
  // Returns true once the run is over.
  _followRun(w, events) {
    let stage = 'listening', said = '', reply = '', react = '', ended = false, failed = false;
    for (const ev of events) {
      const d = ev.data || {};
      if (ev.type === 'stt-end') { said = (d.stt_output && d.stt_output.text) || ''; stage = 'thinking'; }
      else if (ev.type === 'intent-start') { said = said || d.intent_input || ''; stage = 'thinking'; }
      else if (ev.type === 'intent-end') {
        const r = (d.intent_output && d.intent_output.response) || {};
        reply = (r.speech && r.speech.plain && r.speech.plain.speech) || '';
        react = classify(said, r.response_type || '', (r.data && r.data.code) || '', false);
        stage = 'speaking';
      } else if (ev.type === 'error') { failed = true; }
      else if (ev.type === 'run-end') ended = true;
    }
    if (failed) { this._stopWatch(); this._setVoice({ stage: 'done', said, reply: reply || 'Sorry, something went wrong.', react: 'confused' }); return true; }
    if (ended) {
      this._stopWatch();
      // Assist reads the reply out over there; the robot looks like it's talking for about as long.
      const v = { stage: 'speaking', said, reply, react };
      this._setVoice(v);
      const talkMs = Math.min(9000, 900 + reply.length * 55);
      setTimeout(() => { if (this._voice === v) this._setVoice({ stage: 'done', said, reply, react: react || 'happy' }); }, talkMs);
      return true;
    }
    this._setVoice({ stage, said, reply: stage === 'speaking' ? reply : '', react });
    return false;
  }
  _stopWatch() {
    if (this._watch) clearTimeout(this._watch.t);
    this._watch = null;
  }

  // ---------- what's in the house ----------
  // Every light, heater, switch, fan and TV Home Assistant shows, by room, less those switched off on Customise.
  _registry(id) { return (this._hass.entities && this._hass.entities[id]) || null; }
  _areaOf(id) {
    const e = this._registry(id);
    if (!e) return null;
    if (e.area_id) return e.area_id;
    const dev = e.device_id && this._hass.devices && this._hass.devices[e.device_id];
    return (dev && dev.area_id) || null;
  }
  _areaName(area) {
    const a = area && this._hass.areas && this._hass.areas[area];
    return (a && a.name) || null;
  }
  _name(id, inRoom) {
    if (this._config.names[id]) return this._config.names[id];
    const s = this._state(id);
    let name = (s && s.attributes.friendly_name) || capFirst(id.split('.')[1].replace(/_/g, ' '));
    // "Kitchen Ceiling" is just "Ceiling" when you're looking at the Kitchen.
    const room = inRoom && this._areaName(this._areaOf(id));
    if (room && name.toLowerCase().startsWith(room.toLowerCase() + ' ') && name.length > room.length + 2) name = capFirst(name.slice(room.length + 1));
    return name;
  }
  _candidates() {
    const states = this._hass.states, h = this._hass;
    // Worked out again only when the list of things or the rooms change, not on every update.
    const key = [Object.keys(states).length, h.entities, h.devices, h.areas, this._config.names];
    if (this._candKey && key.every((x, i) => x === this._candKey[i])) return this._candList;
    this._candKey = key;
    this._candList = this._findCandidates(states);
    return this._candList;
  }
  _findCandidates(states) {
    const list = [];
    for (const id of Object.keys(states)) {
      const domain = id.split('.')[0];
      if (!KINDS.includes(domain)) continue;
      const e = this._registry(id);
      if (e && (e.hidden || e.hidden_by || e.entity_category)) continue;
      const a = states[id].attributes || {};
      if (domain === 'media_player' && a.device_class !== 'tv') continue;
      if (domain === 'light' && Array.isArray(a.entity_id)) { /* a light group still counts */ }
      list.push(id);
    }
    const order = (id) => KINDS.indexOf(id.split('.')[0]);
    return list.sort((x, y) => order(x) - order(y) || this._name(x).localeCompare(this._name(y)));
  }
  // What shows to begin with: the dashboard's own list (plus the heating), else just the lights and the heating.
  _defaultTiles() {
    const listed = this._config.tiles, heat = this._candidates().filter((id) => id.startsWith('climate.'));
    if (Array.isArray(listed)) {
      const ids = listed.map((t) => (typeof t === 'string' ? t : t && t.entity)).filter(Boolean);
      return [...ids, ...heat.filter((h) => !ids.includes(h))];
    }
    return this._candidates().filter((id) => /^(light|climate)\./.test(id));
  }
  // Chosen with the cog on this screen, else the starting list. The heating always comes first, as a dial.
  _shown() {
    const saved = this._choices().tiles;
    const list = (Array.isArray(saved) ? saved : this._defaultTiles()).filter((id, i, all) => this._state(id) && all.indexOf(id) === i);
    return [...list.filter((id) => id.startsWith('climate.')), ...list.filter((id) => !id.startsWith('climate.'))];
  }
  _rooms(shown) {
    const rooms = new Map();
    for (const id of shown) {
      const area = this._areaOf(id), name = this._areaName(area);
      if (area && name && !rooms.has(area)) rooms.set(area, name);
    }
    return [...rooms.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }
  _doorbellIds() {
    const states = this._hass.states, named = this._config.doorbell;
    if (named === false) return [];
    if (typeof named === 'string') return [named];
    return Object.keys(states).filter((id) => {
      const a = states[id].attributes || {};
      if (id.startsWith('event.')) return a.device_class === 'doorbell' || (Array.isArray(a.event_types) && a.event_types.some((t) => /^(ding|ring|doorbell)$/i.test(t)));
      return id.startsWith('binary_sensor.') && (a.device_class === 'doorbell' || /_ding$|_doorbell$/.test(id));
    });
  }
  // The same choice of camera as the Echo's card: a live view first, never a still picture if there's better.
  _doorCamera(trigger) {
    const states = this._hass.states, registry = this._hass.entities || {};
    const device = registry[trigger] && registry[trigger].device_id;
    const own = Object.keys(states).filter((id) => id.startsWith('camera.') && device && registry[id] && registry[id].device_id === device);
    const stem = trigger.split('.')[1].replace(/_(ding|doorbell|ring|button|press|pressed)$/, '');
    const named = Object.keys(states).filter((id) => id.startsWith('camera.') && id.split('.')[1].startsWith(stem));
    const score = (id) => {
      const name = id.split('.')[1], entry = registry[id] || {};
      return (/live/.test(name) ? 8 : 0) + ((((states[id] || {}).attributes || {}).supported_features || 0) & 2 ? 4 : 0)
        + (own.includes(id) ? 1 : 0) - (/snapshot|still|last_recording|recording|_image$/.test(name) ? 16 : 0) - (entry.platform === 'mqtt' ? 16 : 0);
    };
    return [...new Set([...own, ...named])].sort((a, b) => score(b) - score(a))[0] || null;
  }
  // A still picture for the tile: the doorbell's snapshot camera if it has one (cheap), else the live one's picture.
  _doorStill(trigger, live) {
    const states = this._hass.states;
    const stem = trigger.split('.')[1].replace(/_(ding|doorbell|ring|button|press|pressed)$/, '');
    const still = Object.keys(states).find((id) => id.startsWith('camera.') && id.split('.')[1].startsWith(stem) && /snapshot/.test(id));
    return still || live;
  }
  _doorName(trigger) {
    return String((this._state(trigger) || { attributes: {} }).attributes.friendly_name || '').replace(/\s*(ding|doorbell|ring|button|pressed)$/i, '').trim() || 'Door';
  }
  _doors() {
    if (!this._hass) return [];
    const seen = new Map();
    for (const trigger of this._doorbellIds()) {
      if (!this._state(trigger)) continue;
      const camera = this._doorCamera(trigger);
      const key = camera || trigger;
      if (!seen.has(key)) seen.set(key, { trigger, camera, name: this._doorName(trigger), still: camera ? this._doorStill(trigger, camera) : null });
    }
    return [...seen.values()];
  }
  _lastRing(trigger) {
    const s = this._state(trigger);
    if (!s) return null;
    const t = trigger.startsWith('event.') ? Date.parse(s.state) : (s.state === 'on' ? Date.parse(s.last_changed) : null);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  _watchDoorbells() {
    this._doorSeen = this._doorSeen || {};
    for (const d of this._doors()) {
      const s = this._state(d.trigger);
      const was = this._doorSeen[d.trigger];
      this._doorSeen[d.trigger] = s.state;
      if (was === undefined || s.state === was || ['unavailable', 'unknown'].includes(s.state)) continue; // first look: old news
      const rang = d.trigger.startsWith('event.') ? !s.attributes.event_type || /ding|ring|press|doorbell/i.test(s.attributes.event_type) : s.state === 'on';
      if (rang) this._doorRang(d);
    }
  }
  _doorRang(d) {
    this._doorRinging = d.trigger;
    clearTimeout(this._doorT);
    this._doorT = setTimeout(() => { this._doorRinging = null; this._applyMood(); this._renderTiles(true); }, DOORBELL_MS);
    this._toast(`Someone’s at the ${d.name}`);
    this._applyMood();
    this._renderTiles(true);
    if (!this._sheet || this._sheet.kind !== 'door') this._openDoor(d, true);
  }

  // ---------- drawing the controls ----------
  _render() {
    if (!this._built || !this._hass) return;
    if (!this._fitted) { this._fitted = true; this._fit(); }
    this._watchDoorbells();
    this._renderRobotText();
    this._renderTiles();
    this._renderMusic();
    if (this._sheet && this._sheet.update) this._sheet.update();
    if (this._sheet && this._sheet.view) this._sheet.view.hass = this._hass;
    if (this._night === undefined) this._tick();
  }
  _greeting() {
    const h = new Date().getHours();
    const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const name = String((this._hass.user && this._hass.user.name) || '').trim().split(/\s+/)[0];
    return name ? `${part}, ${name}` : part;
  }
  _weatherId() {
    if (this._config.weather) return this._config.weather;
    return Object.keys(this._hass.states).find((id) => id.startsWith('weather.')) || null;
  }
  _statusLine(shown) {
    const lightsOn = shown.filter((id) => id.startsWith('light.') && this._state(id) && this._state(id).state === 'on').length;
    const parts = [lightsOn ? `${lightsOn} light${lightsOn === 1 ? '' : 's'} on` : 'All lights off'];
    const heat = shown.find((id) => id.startsWith('climate.') && this._usable(id));
    if (heat) {
      const s = this._state(heat), target = s.attributes.temperature;
      parts.push(s.state === 'off' ? 'heating off' : target != null ? `heating ${Math.round(target * 2) / 2}°` : `heating ${s.state}`);
    }
    return parts.join(' · ');
  }
  _renderRobotText() {
    const shown = this._shown();
    const hello = this._greeting(), status = this._statusLine(shown);
    const wid = this._weatherId(), w = this._state(wid);
    const temp = w && w.attributes.temperature != null ? `${Math.round(w.attributes.temperature)}°` : '';
    const icon = w ? ICON[WEATHER_ICON[w.state] || 'cloud'] : '';
    for (const r of [this._el.panel, this._el.header]) {
      this._text(r.querySelector('.hello'), hello);
      this._text(r.querySelector('.status'), status);
      const wx = r.querySelector('.wx');
      wx.hidden = !w;
      if (wx.dataset.icon !== (w ? w.state : '')) { wx.dataset.icon = w ? w.state : ''; wx.querySelector('i').innerHTML = icon; }
      this._text(wx.querySelector('span'), temp);
    }
    this._el.doorPill.hidden = !this._doors().length;
    for (const b of this.shadowRoot.querySelectorAll('.pill.talk')) b.hidden = this._config.talk === false;
  }
  _room() {
    const saved = this._choices().room;
    return saved || 'all';
  }
  _renderTiles(force) {
    const shown = this._shown(), rooms = this._rooms(shown);
    let room = this._room();
    if (room !== 'all' && !rooms.some(([id]) => id === room)) room = 'all';
    // Only redraw when something that shows has changed.
    const doors = this._doors();
    const scenes = this._sceneList();
    const key = JSON.stringify([room, rooms, shown.map((id) => { const s = this._state(id); return [id, s && s.state, s && s.attributes.friendly_name, s && s.attributes.brightness, s && s.attributes.temperature, s && s.attributes.current_temperature, s && s.attributes.hvac_action]; }),
      doors.map((d) => [d.trigger, (this._state(d.trigger) || {}).state]), this._doorRinging, scenes.map((s) => [s, (this._state(s) || {}).state, this._ranUntil && this._ranUntil[s] > Date.now()]), this._config.names]);
    if (!force && key === this._listKey) return;
    this._listKey = key;

    // rooms
    const chips = [['all', 'All']].concat(rooms);
    this._el.rooms.replaceChildren(...chips.map(([id, name]) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = name;
      b.setAttribute('aria-pressed', String(id === room));
      b.dataset.room = id;
      b.addEventListener('click', () => { this._saveChoice('room', id); this._renderTiles(true); });
      return b;
    }));

    // tiles
    const inRoom = shown.filter((id) => room === 'all' || this._areaOf(id) === room);
    const tiles = inRoom.map((id) => this._tile(id, room !== 'all'));
    this._q('.doors').replaceChildren(...doors.map((d) => this._doorTile(d)));
    if (!tiles.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = shown.length ? 'Nothing in this room. Pick another, or add things on Customise.' : 'Nothing to show yet. Tap the cog to choose what goes here.';
      this._el.tiles.replaceChildren(p);
    } else this._el.tiles.replaceChildren(...tiles);

    // scenes
    this._el.scenes.replaceChildren(...scenes.map((id) => this._sceneChip(id)));
    this._el.scenes.hidden = this._el.scenesLabel.hidden = !scenes.length;
  }
  _tile(id, inRoom) {
    const s = this._state(id), domain = id.split('.')[0], b = document.createElement('button');
    const name = this._name(id, inRoom);
    const usable = this._usable(id), a = (s && s.attributes) || {};
    b.className = 'tile';
    b.dataset.entity = id;
    let icon = ICON.plug, status = '', on = false;
    if (domain === 'light') {
      icon = /lamp/i.test(name) ? ICON.lamp : ICON.bulb;
      on = s && s.state === 'on';
      const pct = a.brightness != null ? Math.round(a.brightness / 2.55) : null;
      status = !usable ? 'Unavailable' : on ? (pct != null ? `On · ${pct}%` : 'On') : 'Off';
      if (on && pct != null) { const lvl = document.createElement('span'); lvl.className = 'lvl'; lvl.style.width = `${pct}%`; b.append(lvl); }
    } else if (domain === 'climate') {
      return this._heatTile(id, name);
    } else if (domain === 'media_player') {
      icon = ICON.tv;
      on = !!s && !['off', 'standby', 'unavailable', 'unknown'].includes(s.state);
      status = !usable && !(s && s.state === 'off') ? 'Unavailable' : on ? capFirst(s.state) : 'Off';
    } else {
      icon = domain === 'fan' ? ICON.fan : ICON.plug;
      on = s && s.state === 'on';
      status = !usable ? 'Unavailable' : on ? 'On' : 'Off';
    }
    b.insertAdjacentHTML('beforeend', `<span class="ic">${icon}</span><span><span class="nm"></span><span class="st" style="display:block"></span></span>`);
    b.querySelector('.nm').textContent = name;
    b.querySelector('.st').textContent = status;
    b.classList.toggle('on', !!on);
    b.classList.toggle('off-line', !usable && !(domain === 'media_player' && s && s.state === 'off'));
    b.setAttribute('aria-label', `${name}, ${status}`);
    b.setAttribute('aria-pressed', String(!!on));
    if (domain === 'light') this._holdOpensLight(b, id);
    else b.addEventListener('click', () => this._toggle(id));
    return b;
  }
  // A tap switches a light; holding it opens its brightness.
  _holdOpensLight(b, id) {
    let held = false, timer = null, start = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    b.addEventListener('pointerdown', (e) => {
      held = false; start = [e.clientX, e.clientY];
      cancel();
      timer = setTimeout(() => { held = true; timer = null; this._openLight(id); }, LIGHT_HOLD_MS);
    });
    b.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 12) cancel(); });
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { if (held) { e.preventDefault(); held = false; return; } this._toggle(id); });
  }
  async _toggle(id) {
    if (!this._usable(id) && !(id.startsWith('media_player.') && this._state(id))) { this._toast('That isn’t available right now'); return; }
    const domain = id.split('.')[0], s = this._state(id);
    const wasOn = domain === 'media_player' ? !['off', 'standby'].includes(s.state) : s.state === 'on';
    const service = domain === 'media_player' ? (wasOn ? 'turn_off' : 'turn_on') : 'toggle';
    if (await this._service(domain, service, { entity_id: id }) && domain === 'light') this._react(wasOn ? 'dim' : 'bright');
  }
  // ---------- the heating ----------
  // What to show: a temperature just set here wins for a few seconds, until Home Assistant catches up.
  _heatInfo(id) {
    const s = this._state(id), a = (s && s.attributes) || {};
    const min = Number(a.min_temp != null ? a.min_temp : 7), max = Number(a.max_temp != null ? a.max_temp : 30);
    const pending = this._heatPending && this._heatPending[id];
    const target = pending && pending.until > Date.now() && pending.value !== a.temperature ? pending.value : a.temperature;
    return { s, a, min, max, step: Number(a.target_temp_step) || 0.5, target: target == null ? null : Number(target), now: a.current_temperature,
      off: !s || s.state === 'off', heating: !!s && s.state !== 'off' && a.hvac_action === 'heating', ok: this._usable(id) };
  }
  _deg(v) { return v == null ? '–' : `${Math.round(Number(v) * 10) / 10}°`; }
  _heatStatus(h) {
    if (!h.ok) return 'Unavailable';
    if (h.off) return 'Off';
    return h.heating ? 'Heating now' : 'Warm enough';
  }
  _heatSet(id, value, sendNow) {
    const h = this._heatInfo(id);
    const v = Math.max(h.min, Math.min(h.max, Math.round(value / h.step) * h.step));
    const t = Math.round(v * 10) / 10;
    this._heatPending = { ...(this._heatPending || {}), [id]: { value: t, until: Date.now() + HEAT_SETTLE_MS } };
    this._paintHeat(id);
    this._heatT = this._heatT || {};
    clearTimeout(this._heatT[id]);
    this._heatT[id] = setTimeout(() => this._service('climate', 'set_temperature', { entity_id: id, temperature: t }), sendNow ? 0 : HEAT_SEND_MS);
  }
  _heatStep(id, dir) {
    const h = this._heatInfo(id);
    if (!h.ok || h.off || h.target == null) { this._toast(h.ok && h.off ? 'The heating is off. Turn it on from its dial.' : 'The heating isn’t available right now'); return; }
    this._heatSet(id, h.target + dir * h.step);
    if (dir > 0) this._react('happy', 1200);
  }
  _paintDial(box, h) {
    const place = (v) => Math.max(0, Math.min(1, (Number(v) - h.min) / ((h.max - h.min) || 1)));
    const fill = box.querySelector('.d-fill'), now = box.querySelector('.d-now'), knob = box.querySelector('.d-knob');
    fill.style.strokeDasharray = `${h.target == null || h.off ? 0 : (place(h.target) * 100).toFixed(2)} 100`;
    if (h.now != null) { const [x, y] = dialPoint(place(h.now)); now.setAttribute('cx', x.toFixed(2)); now.setAttribute('cy', y.toFixed(2)); }
    now.style.display = h.now == null ? 'none' : '';
    if (h.target != null) { const [x, y] = dialPoint(place(h.target)); knob.setAttribute('cx', x.toFixed(2)); knob.setAttribute('cy', y.toFixed(2)); }
    this._text(box.querySelector('.d-label'), h.off ? 'Heating is' : 'Set to');
    this._text(box.querySelector('.d-val'), !h.ok ? '–' : h.off ? 'Off' : this._deg(h.target));
    this._text(box.querySelector('.d-cur'), h.now != null ? `Now ${this._deg(h.now)}` : '');
  }
  // Every dial for this thermostat: its tile, and the big one if it's open.
  _paintHeat(id) {
    const h = this._heatInfo(id);
    for (const el of this.shadowRoot.querySelectorAll(`[data-heat="${id}"]`)) {
      el.classList.toggle('heating', h.ok && h.heating);
      el.classList.toggle('heat-off', h.off || !h.ok);
      el.classList.toggle('off-line', !h.ok);
      this._paintDial(el, h);
      const st = el.querySelector('.ht-st,.heat-status');
      // On the tile the dial is too small for the room's temperature, so it goes beside it.
      if (st) this._text(st, st.classList.contains('ht-st') && h.now != null && h.ok ? `${this._heatStatus(h)} · ${this._deg(h.now)} now` : this._heatStatus(h));
    }
  }
  _heatTile(id, name) {
    const el = document.createElement('div');
    el.className = 'tile heat-tile';
    el.dataset.entity = id;
    el.dataset.heat = id;
    el.innerHTML = `<button class="ht-open"><span class="dial">${DIAL_HTML}</span><span class="ht-tx"><span class="nm"></span><span class="ht-st"></span></span></button>
      <span class="ht-steps"><button class="round down" aria-label="Cooler"><i>${ICON.minus}</i></button><button class="round up" aria-label="Warmer"><i>${ICON.plus}</i></button></span>`;
    el.querySelector('.nm').textContent = name;
    el.querySelector('.ht-open').setAttribute('aria-label', `${name}: open the heating`);
    el.querySelector('.ht-open').addEventListener('click', () => this._openHeat(id));
    el.querySelector('.down').addEventListener('click', () => this._heatStep(id, -1));
    el.querySelector('.up').addEventListener('click', () => this._heatStep(id, 1));
    // painted once it's on the page
    setTimeout(() => this._paintHeat(id), 0);
    return el;
  }
  _doorTile(d) {
    const b = document.createElement('button');
    b.className = 'tile door-tile';
    b.dataset.door = d.trigger;
    if (this._doorRinging === d.trigger) b.classList.add('rang');
    const last = this._lastRing(d.trigger);
    const today = last && last.toDateString() === new Date().toDateString();
    const when = !last ? 'No rings yet' : today ? `Last ring ${clockText(last)}` : `Last ring ${last.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
    b.innerHTML = `<span class="thumb"><i>${ICON.video}</i></span><span class="dt"><span class="nm" style="display:block"></span><span class="st" style="display:block"></span></span>`;
    b.querySelector('.nm').textContent = d.name;
    b.querySelector('.st').textContent = this._doorRinging === d.trigger ? 'Ringing now' : when;
    b.setAttribute('aria-label', `${d.name}, ${b.querySelector('.st').textContent}. Opens the camera.`);
    this._thumb(b.querySelector('.thumb'), d.still);
    b.addEventListener('click', () => this._openDoor(d, false));
    return b;
  }
  // The tile's still picture, through Home Assistant (never straight from the camera's maker).
  _thumb(box, camera) {
    const s = this._state(camera);
    const pic = s && s.attributes.entity_picture;
    if (!pic || !String(pic).startsWith('/')) return;
    const img = document.createElement('img');
    img.alt = '';
    img.onerror = () => img.remove();
    // A new picture now and then, not on every update.
    const slot = Math.floor(Date.now() / THUMB_MS);
    img.src = `${pic}${pic.includes('?') ? '&' : '?'}t=${slot}`;
    box.append(img);
  }
  _sceneList() {
    const wanted = this._config.scenes;
    if (wanted === false) return [];
    const picked = this._choices().scenes; // chosen on Customise: a list, in order
    if (Array.isArray(picked)) return picked.filter((id) => this._state(id));
    if (Array.isArray(wanted)) return wanted.map((x) => (typeof x === 'string' ? x : x && x.entity)).filter((id) => id && this._state(id));
    return Object.keys(this._hass.states).filter((id) => id.startsWith('scene.')).sort((a, b) => this._name(a).localeCompare(this._name(b)));
  }
  _sceneIcon(id) {
    const name = this._name(id).toLowerCase();
    if (/\b(movie|film|tv|cinema)/.test(name)) return ICON.film;
    if (/\b(bed|night|sleep|relax|wind down)/.test(name)) return ICON.moon;
    if (/\b(morning|wake|bright)/.test(name)) return ICON.sun;
    if (/\b(leav|away|out|bye)/.test(name)) return ICON.exit;
    return ICON.scene;
  }
  _sceneChip(id) {
    const b = document.createElement('button');
    const ran = this._ranUntil && this._ranUntil[id] > Date.now();
    b.className = `chip${ran ? ' done' : ''}`;
    b.dataset.scene = id;
    b.innerHTML = `<i>${ran ? ICON.check : this._sceneIcon(id)}</i><span></span>`;
    b.querySelector('span').textContent = this._name(id);
    b.disabled = !this._state(id) || this._state(id).state === 'unavailable';
    b.addEventListener('click', async () => {
      if (!await this._service(id.startsWith('script.') ? 'script' : 'scene', 'turn_on', { entity_id: id })) return;
      this._ranUntil = { ...(this._ranUntil || {}), [id]: Date.now() + SCENE_DONE_MS };
      this._react('happy');
      this._renderTiles(true);
      setTimeout(() => this._renderTiles(true), SCENE_DONE_MS + 50);
    });
    return b;
  }

  // ---------- music: whatever Music Assistant is playing, coloured from its cover ----------
  _players() {
    return Object.keys(this._hass.states).filter((id) => id.startsWith('media_player.') && (this._state(id).attributes || {}).mass_player_type);
  }
  _musicId() {
    const players = this._players();
    const playing = players.find((id) => this._state(id).state === 'playing');
    if (playing) return playing;
    // Paused in the last half hour: still worth showing, to carry on.
    const paused = players.filter((id) => this._state(id).state === 'paused' && Date.now() - Date.parse(this._state(id).last_changed || 0) < 1800000)
      .sort((a, b) => Date.parse(this._state(b).last_changed || 0) - Date.parse(this._state(a).last_changed || 0));
    return paused[0] || null;
  }
  _picture(a) {
    if (a.entity_picture && String(a.entity_picture).startsWith('/')) return a.entity_picture;
    return a.entity_picture_local && String(a.entity_picture_local).startsWith('/') ? a.entity_picture_local : null;
  }
  _renderMusic() {
    const id = this._musicId(), s = this._state(id), a = (s && s.attributes) || {};
    this._npId = id;
    const show = !!s && !!(a.media_title || a.media_artist);
    this._el.app.classList.toggle('has-np', show);
    const playing = show && s.state === 'playing';
    if (playing !== this._musicPlaying) { this._musicPlaying = playing; if (playing && !this._voice) this._react('notes', 2000); }
    if (!show) { this._setArt(null); return; }
    const radio = a.media_duration === 0 || /^radiobrowser:/.test(a.media_content_id || '');
    this._text(this._el.npTitle, a.media_title || a.media_artist || '');
    const where = (a.friendly_name || '').replace(/^Music Assistant\s*/i, '');
    const sub = [a.media_title ? a.media_artist : '', radio ? a.media_album_name : '', where].filter(Boolean).join(' · ');
    this._text(this._el.npSub, sub);
    this._el.npMain.innerHTML = `<i>${s.state === 'playing' ? ICON.pause : ICON.play}</i>`;
    this._el.npMain.setAttribute('aria-label', s.state === 'playing' ? 'Pause' : 'Play');
    const url = this._picture(a);
    const img = this._el.npImg;
    if (url !== this._npUrl) {
      this._npUrl = url;
      img.classList.remove('on');
      if (url) { img.onload = () => img.classList.add('on'); img.onerror = () => img.classList.remove('on'); img.src = url; } else img.removeAttribute('src');
    }
    this._setArt(url);
    this._updateProgress();
  }
  _updateProgress() {
    const s = this._state(this._npId), a = (s && s.attributes) || {};
    const fill = this._el && this._el.npFill;
    if (!fill) return;
    if (!s || !a.media_duration || a.media_position == null) { fill.style.width = '0'; fill.parentElement.hidden = !s || !a.media_duration; return; }
    fill.parentElement.hidden = false;
    let pos = a.media_position;
    if (s.state === 'playing' && a.media_position_updated_at) pos += (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
    fill.style.width = `${Math.max(0, Math.min(100, (pos / a.media_duration) * 100)).toFixed(2)}%`;
  }
  _setArt(url) {
    const key = url ? (url.match(/[?&]cache=([^&]+)/) || [null, url])[1] : null;
    if (key === this._artKey) return;
    this._artKey = key;
    if (!url) { this._art = null; this._paintArt(); return; }
    const img = new Image();
    img.onload = () => {
      if (this._artKey !== key) return;
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 32;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 32, 32);
        this._art = artPalette(ctx.getImageData(0, 0, 32, 32).data);
      } catch (err) { this._art = null; }
      this._paintArt();
    };
    img.onerror = () => { if (this._artKey === key) { this._art = null; this._paintArt(); } };
    img.src = url;
  }
  _paintArt() {
    const p = this._art, np = this._el.np;
    np.style.setProperty('--np-bg', p ? p.bg : '#993556');
    np.style.setProperty('--np-ink', p ? p.ink : '#fff');
    for (const r of this._el.robots) {
      if (p) { r.style.setProperty('--art-bg', p.bg); r.style.setProperty('--art-eye', p.eye); r.style.setProperty('--art-ink', p.ink); }
    }
    this._applyMood();
  }
  async _mediaPress(service) {
    const id = this._npId;
    if (!id) return;
    if (await this._service('media_player', service, { entity_id: id })) this._react('notes', 1600);
  }

  // ---------- sheets ----------
  _openSheet(kind, title, fill, extraClass) {
    this._closeSheet();
    const sheet = this._el.sheet;
    sheet.className = `sheet ${extraClass || ''}`;
    sheet.innerHTML = `<div class="sh-top"><p class="sh-title"></p><button class="sh-x" aria-label="Close"><i>${ICON.close}</i></button></div>`;
    sheet.querySelector('.sh-title').textContent = title;
    sheet.querySelector('.sh-x').addEventListener('click', () => this._closeSheet());
    sheet.setAttribute('aria-label', title);
    this._sheet = { kind };
    fill(sheet, this._sheet);
    this._el.back.classList.add('show');
    this._el.back.setAttribute('aria-hidden', 'false');
    return this._sheet;
  }
  _closeSheet() {
    if (!this._sheet) return;
    const s = this._sheet;
    this._sheet = null;
    if (s.close) s.close();
    clearTimeout(s.sendT);
    this._el.back.classList.remove('show');
    this._el.back.setAttribute('aria-hidden', 'true');
    this._el.sheet.replaceChildren(); // stops a camera's video
  }
  _openLight(id) {
    this._openSheet('light', this._name(id), (box, sh) => {
      box.insertAdjacentHTML('beforeend', `<p class="sh-big"></p><input class="slider" type="range" min="1" max="100" step="1" aria-label="Brightness">
        <div class="sh-row temps"></div><div class="sh-row"><button class="pill off-b">Turn off</button></div>`);
      const big = box.querySelector('.sh-big'), slider = box.querySelector('.slider'), temps = box.querySelector('.temps');
      const modes = (this._state(id).attributes.supported_color_modes || []);
      if (modes.some((m) => COLOUR_TEMP_MODES.includes(m))) {
        for (const [name, k] of LIGHT_TEMPS) {
          const b = document.createElement('button');
          b.className = 'pill';
          b.textContent = name;
          b.addEventListener('click', () => this._service('light', 'turn_on', { entity_id: id, color_temp_kelvin: k }));
          temps.append(b);
        }
      } else temps.remove();
      let last = 0;
      const send = (final) => {
        clearTimeout(sh.sendT);
        const now = Date.now(), wait = final ? 0 : Math.max(0, LIGHT_SEND_MS - (now - last));
        sh.sendT = setTimeout(() => { last = Date.now(); sh.sentAt = last; this._service('light', 'turn_on', { entity_id: id, brightness_pct: Number(slider.value) }); }, wait);
      };
      slider.addEventListener('input', () => { sh.moving = true; big.textContent = `${slider.value}%`; slider.style.setProperty('--pct', `${slider.value}%`); send(false); });
      slider.addEventListener('change', () => { sh.moving = false; send(true); this._react('bright'); });
      box.querySelector('.off-b').addEventListener('click', () => { this._service('light', 'turn_off', { entity_id: id }); this._react('dim'); this._closeSheet(); });
      sh.update = () => {
        const s = this._state(id);
        if (!s || sh.moving || Date.now() - (sh.sentAt || 0) < 3000) return;
        const pct = s.state === 'on' && s.attributes.brightness != null ? Math.max(1, Math.round(s.attributes.brightness / 2.55)) : s.state === 'on' ? 100 : 0;
        big.textContent = s.state === 'on' ? `${pct}%` : 'Off';
        slider.value = String(Math.max(1, pct));
        slider.style.setProperty('--pct', `${pct}%`);
      };
      sh.update();
    });
  }
  _openHeat(id) {
    this._openSheet('heat', this._name(id), (box, sh) => {
      box.classList.add('heat-sheet');
      box.dataset.heat = id;
      box.insertAdjacentHTML('beforeend', `<div class="dial" role="slider" tabindex="0" aria-label="Set temperature">${DIAL_HTML}</div>
        <p class="heat-status"></p>
        <div class="heat-steps"><button class="down"><i>${ICON.minus}</i>Cooler</button><button class="up"><i>${ICON.plus}</i>Warmer</button></div>
        <div class="sh-row modes"></div><div class="sh-row presets"></div>`);
      const dial = box.querySelector('.dial');
      box.querySelector('.down').addEventListener('click', () => this._heatStep(id, -1));
      box.querySelector('.up').addEventListener('click', () => this._heatStep(id, 1));
      // Dragging round the dial sets the temperature; it's sent when you let go.
      const fromPointer = (e) => {
        const h = this._heatInfo(id), r = dial.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 200 - 100, y = ((e.clientY - r.top) / r.height) * 200 - 100;
        let along = (Math.atan2(y, x) * 180 / Math.PI - 135 + 720) % 360;
        if (along > 270) along = along > 315 ? 0 : 270; // the gap at the bottom: the nearer end
        return h.min + (along / 270) * (h.max - h.min);
      };
      let dragging = false;
      dial.addEventListener('pointerdown', (e) => {
        const h = this._heatInfo(id);
        if (!h.ok || h.off) return;
        dragging = true;
        try { dial.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ }
        this._heatSet(id, fromPointer(e));
      });
      dial.addEventListener('pointermove', (e) => { if (dragging) this._heatSet(id, fromPointer(e)); });
      const done = () => { if (!dragging) return; dragging = false; const h = this._heatInfo(id); if (h.target != null) this._heatSet(id, h.target, true); };
      dial.addEventListener('pointerup', done);
      dial.addEventListener('pointercancel', done);
      dial.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); this._heatStep(id, 1); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); this._heatStep(id, -1); }
      });
      const MODE_NAMES = { off: 'Off', heat: 'Heat', auto: 'Schedule', heat_cool: 'Auto', cool: 'Cool' };
      const chips = (row, values, current, label, choose) => {
        const key = JSON.stringify([values, current]);
        if (row.dataset.key === key) return;
        row.dataset.key = key;
        row.replaceChildren(...values.map((v) => {
          const b = document.createElement('button');
          b.className = 'chip';
          b.dataset.mode = v;
          b.textContent = label(v);
          b.setAttribute('aria-pressed', String(v === current));
          b.addEventListener('click', () => { if (this._heatPending) delete this._heatPending[id]; choose(v); });
          return b;
        }));
      };
      sh.update = () => {
        const s = this._state(id);
        if (!s) return;
        const a = s.attributes;
        chips(box.querySelector('.modes'), (a.hvac_modes || []).filter((m) => MODE_NAMES[m]), s.state, (m) => MODE_NAMES[m],
          (m) => this._service('climate', 'set_hvac_mode', { entity_id: id, hvac_mode: m }));
        chips(box.querySelector('.presets'), a.preset_modes || [], a.preset_mode, (p) => capFirst(String(p).replace(/_/g, ' ')),
          (p) => this._service('climate', 'set_preset_mode', { entity_id: id, preset_mode: p }));
        this._paintHeat(id);
      };
      sh.update();
    });
  }
  _openDoor(d, rang) {
    if (!d.camera) { this._toast('No camera found for that doorbell'); return; }
    this._openSheet('door', rang ? `Someone’s at the ${d.name}` : d.name, (box, sh) => {
      const video = document.createElement('div');
      video.className = 'door-video';
      video.textContent = 'Connecting to the camera…';
      box.append(video);
      this._doorVideo(d.camera, video, sh);
      sh.close = () => { if (this._doorRinging === d.trigger) { this._doorRinging = null; this._applyMood(); this._renderTiles(true); } };
    }, 'door');
  }
  // The live view through Home Assistant's own camera card, as on the Echo.
  async _doorVideo(camera, box, sh) {
    let view = null;
    try {
      const helpers = typeof window.loadCardHelpers === 'function' ? await window.loadCardHelpers() : null;
      if (helpers) {
        view = await helpers.createCardElement({ type: 'picture-entity', entity: camera, camera_view: 'live', show_name: false, show_state: false,
          aspect_ratio: '16:9', fit_mode: 'contain', tap_action: { action: 'none' }, hold_action: { action: 'none' } });
      }
    } catch (err) { view = null; }
    if (this._sheet !== sh) return; // closed meanwhile
    if (!view) {
      const token = (this._state(camera) || { attributes: {} }).attributes.access_token;
      view = document.createElement('img');
      view.alt = '';
      if (token) view.src = `/api/camera_proxy_stream/${camera}?token=${encodeURIComponent(token)}`;
    } else view.hass = this._hass;
    sh.view = view;
    box.replaceChildren(view);
  }
  _openCustomise() {
    this._openSheet('cust', 'Customise', (box) => {
      const shown = this._shown();
      const pickedScenes = this._choices().scenes;
      const scenesOn = new Set(Array.isArray(pickedScenes) ? pickedScenes : this._sceneList());
      box.insertAdjacentHTML('beforeend', `<p class="sh-sub" style="text-align:left">Choose what shows here. Kept on this screen only.</p>
        <input class="search" type="search" placeholder="Search" aria-label="Search" autocomplete="off" autocorrect="off" spellcheck="false">
        <p class="sec">Showing</p><div class="cust-list showing"></div>
        <p class="sec">Add more</p><div class="cust-list more"></div>
        <p class="sec">Scenes and scripts</p><div class="cust-list scene-list"></div>
        <div class="sh-row"><button class="pill reset">Start again</button></div>`);
      const row = (id, on, change) => {
        const r = document.createElement('div');
        r.className = 'cust-item';
        const room = this._areaName(this._areaOf(id));
        r.innerHTML = `<span class="nm"></span><span class="rm"></span><button class="tog" role="switch"></button>`;
        r.querySelector('.nm').textContent = this._name(id);
        r.querySelector('.rm').textContent = room || '';
        r.dataset.find = `${this._name(id)} ${room || ''} ${id}`.toLowerCase();
        const t = r.querySelector('.tog');
        t.dataset.entity = id;
        t.setAttribute('aria-checked', String(on));
        t.setAttribute('aria-label', `Show ${this._name(id)}`);
        t.addEventListener('click', () => { const v = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', String(v)); change(v); });
        return r;
      };
      // Rows stay where they are when switched, so nothing jumps under your finger; the lists sort again next time.
      const tileChange = (id) => (v) => {
        const list = this._shown().filter((x) => x !== id);
        if (v) list.push(id);
        this._saveChoice('tiles', list);
        this._renderTiles(true);
        this._renderRobotText();
      };
      const others = this._candidates().filter((id) => !shown.includes(id))
        .sort((x, y) => (this._areaName(this._areaOf(x)) || '~').localeCompare(this._areaName(this._areaOf(y)) || '~') || this._name(x).localeCompare(this._name(y)));
      box.querySelector('.showing').append(...shown.map((id) => row(id, true, tileChange(id))));
      box.querySelector('.more').append(...others.map((id) => row(id, false, tileChange(id))));
      const scenes = Object.keys(this._hass.states).filter((id) => /^(scene|script)\./.test(id)).sort((a, b) => this._name(a).localeCompare(this._name(b)));
      box.querySelector('.scene-list').append(...scenes.map((id) => row(id, scenesOn.has(id), (v) => {
        if (v) scenesOn.add(id); else scenesOn.delete(id);
        this._saveChoice('scenes', scenes.filter((x) => scenesOn.has(x)));
        this._renderTiles(true);
      })));
      for (const list of box.querySelectorAll('.cust-list')) {
        const none = document.createElement('p');
        none.className = 'cust-none';
        none.textContent = 'Nothing here';
        none.hidden = !!list.children.length;
        list.append(none);
      }
      const search = box.querySelector('.search');
      search.addEventListener('input', () => {
        const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        for (const list of box.querySelectorAll('.cust-list')) {
          let any = false;
          for (const r of list.querySelectorAll('.cust-item')) { const hit = words.every((w) => r.dataset.find.includes(w)); r.hidden = !hit; any = any || hit; }
          list.querySelector('.cust-none').hidden = any;
        }
      });
      box.querySelector('.reset').addEventListener('click', () => {
        try { localStorage.removeItem(SETTINGS_KEY); } catch (err) { /* nothing saved */ }
        this._listKey = null;
        this._closeSheet();
        this._renderTiles(true);
        this._renderRobotText();
        this._toast('Back to how it started');
      });
    });
  }
}

if (!customElements.get('echo-mobile-card')) customElements.define('echo-mobile-card', EchoMobileCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'echo-mobile-card')) {
  window.customCards.push({ type: 'echo-mobile-card', name: 'Echo Robot for iPad and iPhone', description: 'The robot plus your home’s controls, for a phone or tablet.' });
}
window.EchoMobileCard = { VERSION, classify, artPalette };
})();
