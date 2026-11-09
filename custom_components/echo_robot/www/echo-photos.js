/* Echo Robot photos: once the robot has sat idle for a while, a few photos from one Immich album, then the face again.
   Talking, the doorbell, music, home events, alerts, the menu or a tap all bring the robot back at once.

   The photos come through Home Assistant's echo_photos add-on, so this page never holds the Immich key and never
   contacts Immich itself: it only asks Home Assistant, with the screen's own login. Photos stay in this page's
   memory while showing and are let go after.

   Its own dashboard resource, beside echo-home-card.js (either can load first). It adds to the card from outside,
   so the card's file isn't changed. Written for Chromium 118 (the Echo's WebView): no CSS nesting, no newer syntax.

   Settings, in the card's section of the dashboard (all optional):
     photos: false        turns the photos off
     photos_after: 300    seconds of the plain idle face before photos show
     photos_every: 600    seconds between one show and the next, while it stays idle
     photos_for: 60       how long a show lasts, in seconds
     photo_seconds: 10    how long each photo stays */
(() => {
  const PHOTO_DEFAULTS = { photos: true, photos_after: 300, photos_every: 600, photos_for: 60, photo_seconds: 10 };
  const FADE_MS = 1200;            // photo to photo, and the gentle way back to the face
  const QUICK_MS = 200;            // when something needs the robot: back at once
  const TICK_MS = 1000;
  const LIST_EVERY_MS = 10 * 60000; // ask for the album again (new photos show up)
  const LIST_RETRY_MS = 2 * 60000;  // after Home Assistant or Immich didn't answer
  const LOAD_MS = 15000;           // give up on a photo that hasn't arrived by then
  const MAX_FAILS = 3;             // photos in a row that won't load before giving up on this show
  const COVER_FROM = 1.6;          // photos at least this wide for their height fill the screen; others fit inside it
  // Anything open, on screen beside the face or asleep: no photos. (has-card is an info card: a moment like the others.)
  const BUSY = /(^|-)open$|^has-(?!card$)|^talking$|^night$/;
  const API = 'echo_photos';

  const CSS = `
.photos{position:absolute;inset:0;z-index:15;background:#000;opacity:0;pointer-events:none;transition:opacity ${FADE_MS}ms ease-in-out}
.photos.on{opacity:1;pointer-events:auto}
.photos.quick{transition-duration:${QUICK_MS}ms}
.ph-slide{position:absolute;inset:0;opacity:0;transition:opacity ${FADE_MS}ms ease-in-out;overflow:hidden}
.ph-slide.front{opacity:1}
.ph-bg{position:absolute;inset:0;width:100%;height:100%;opacity:.55}
.ph-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transform-origin:50% 45%}
.ph-slide.cover .ph-img{object-fit:cover;object-position:50% 40%}
.ph-slide.cover .ph-bg{display:none}`;

  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const inTime = (promise, ms) => Promise.race([promise, wait(ms).then(() => { throw new Error('timeout'); })]);
  const shuffle = (list) => { const out = list.slice(); for (let i = out.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };

  class Photos {
    constructor(card) {
      this.card = card;
      this.ids = [];          // the album, as the add-on gave it
      this.queue = [];        // shuffled; every photo once before any comes round again
      this.listAt = 0;        // when the album was last asked for
      this.listing = null;
      this.quietSince = 0;    // since when the plain idle face has shown
      this.lastShow = 0;      // when the last show ended (or was tried)
      this.show = null;       // { until, nextAt, slides, front, fails }
      this.starting = false;
      this.el = null;
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
    get cfg() { return { ...PHOTO_DEFAULTS, ...(this.card._config || {}) }; }
    stop() {
      clearInterval(this.timer);
      if (this.observer) this.observer.disconnect();
      this.observer = null;
      this.hide(true);
    }
    // ---- is the robot just sitting there? ----
    quiet() {
      const c = this.card;
      if (!c._built || !c._hass || c._hass.connected === false || c._demo || c._doorbell) return false;
      const shell = c._el && c._el.shell;
      if (!shell || [...shell.classList].some((name) => BUSY.test(name))) return false;
      if (typeof c._ringAlert === 'function' && c._ringAlert()) return false;
      if (c._alerts && [...c._alerts.values()].some((a) => a && a.mode && a.mode !== 'hidden')) return false;
      return c._mood() === 'idle';
    }
    // Is the robot needed? Idle moments and info cards wait while photos show, so a moment starting now is
    // something that matters, such as a home event ("Sam's home").
    wanted() {
      return !this.quiet() || !!this.card._moment;
    }
    // The card shows what's happening by classes and data on its shell; any change there is checked at once.
    watch() {
      if (this.observer || !this.card._built || !this.card._el) return;
      this.observer = new MutationObserver(() => { if (this.show && this.wanted()) this.hide(true); });
      this.observer.observe(this.card._el.shell, { attributes: true, attributeFilter: ['class', 'data-mood', 'data-moment'] });
    }
    tick() {
      this.watch();
      const cfg = this.cfg, now = Date.now();
      if (cfg.photos === false) { this.hide(true); return; }
      const quiet = this.quiet();
      if (this.show) {
        if (this.wanted()) this.hide(true);
        else if (now >= this.show.until) {
          this.hide(false);
          // Back to the robot with a wink, as the photos fade.
          if (this.card._config.moments !== false && this.card._canMoment()) this.card._playMoment('wink');
        }
        else if (now >= this.show.nextAt) this.next();
        return;
      }
      if (!quiet) { this.quietSince = 0; return; }
      if (!this.quietSince) this.quietSince = now;
      this.list();
      const after = Number(cfg.photos_after) * 1000, every = Number(cfg.photos_every) * 1000;
      // An idle moment can be cut short for the photos; a home event ("Sam's home") is waited for.
      const moment = this.card._moment;
      if (this.starting || !this.ids.length || (moment && /^home/.test(moment.name || ''))) return;
      if (now - this.quietSince < after || (this.lastShow && now - this.lastShow < every)) return;
      this.begin();
    }
    // ---- the album ----
    list() {
      const now = Date.now(), due = this.ids.length ? LIST_EVERY_MS : LIST_RETRY_MS;
      if (this.listing || (this.listAt && now - this.listAt < due)) return;
      this.listAt = now;
      const hass = this.card._hass;
      this.listing = Promise.resolve().then(() => hass.callApi('GET', API)).then((answer) => {
        const ids = Array.isArray(answer && answer.photos) ? answer.photos.filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) : [];
        // Immich away for a while: the add-on still sends the list it had. Nothing at all: keep what this page had.
        if (ids.length || (answer && answer.ok)) {
          this.ids = ids;
          const known = new Set(ids);
          this.queue = this.queue.filter((id) => known.has(id));
        }
      }).catch(() => { /* Home Assistant away: asked again later (sooner while there are no photos yet) */ })
        .then(() => { this.listing = null; });
    }
    nextId() {
      if (!this.queue.length) {
        this.queue = shuffle(this.ids);
        if (this.queue.length > 1 && this.queue[this.queue.length - 1] === this.lastId) this.queue.reverse();
      }
      this.lastId = this.queue.pop();
      return this.lastId;
    }
    // One photo, ready to show: fetched with the screen's own login, decoded before it's needed.
    async load() {
      const hass = this.card._hass, id = this.nextId();
      if (!id) throw new Error('no photos');
      const path = `/api/${API}/photo/${id}`;
      let src, blobUrl = null;
      if (typeof hass.fetchWithAuth === 'function') {
        const response = await inTime(hass.fetchWithAuth(path), LOAD_MS);
        if (!response || !response.ok) throw new Error(`photo ${response && response.status}`);
        const blob = await inTime(response.blob(), LOAD_MS);
        if (!/^image\//.test(blob.type)) throw new Error('not a photo');
        src = blobUrl = URL.createObjectURL(blob);
      } else {
        const signed = await inTime(hass.callWS({ type: 'auth/sign_path', path, expires: 60 }), LOAD_MS);
        src = signed.path;
      }
      const img = new Image();
      img.className = 'ph-img';
      img.alt = '';
      img.src = src;
      try {
        await inTime(img.decode(), LOAD_MS);
        if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty photo');
      } catch (error) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        throw error;
      }
      return { id, img, blobUrl, wide: img.naturalWidth / img.naturalHeight >= COVER_FROM };
    }
    async loadSome() {
      for (let tries = 0; tries < Math.min(MAX_FAILS, Math.max(1, this.ids.length)); tries += 1) {
        try { return await this.load(); } catch (error) { /* the next one, then */ }
      }
      return null;
    }
    // ---- on screen ----
    build() {
      if (this.el && this.el.isConnected) return this.el;
      const root = this.card.shadowRoot, shell = this.card._el.shell;
      if (!root.querySelector('style[data-photos]')) {
        const style = document.createElement('style');
        style.dataset.photos = '';
        style.textContent = CSS;
        root.appendChild(style);
      }
      const el = this.el = document.createElement('div');
      el.className = 'photos';
      // Taps on a photo bring the robot back, and don't reach the robot behind (which would open the menu).
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => { e.stopPropagation(); this.hide(false); this.quietSince = Date.now(); });
      shell.appendChild(el);
      return el;
    }
    slide(photo) {
      const slide = document.createElement('div');
      slide.className = 'ph-slide' + (photo.wide ? ' cover' : '');
      // Behind a photo that doesn't fill the screen: the same photo, tiny and stretched, so it's soft and blurred.
      // Drawn once, so the Echo's slow chip has nothing to work out while it shows.
      const bg = document.createElement('canvas');
      bg.className = 'ph-bg';
      bg.width = 24;
      bg.height = 12;
      try { bg.getContext('2d').drawImage(photo.img, 0, 0, 24, 12); } catch (error) { /* plain black then */ }
      slide.append(bg, photo.img);
      slide._photo = photo;
      return slide;
    }
    drift(slide) {
      // A slow, slight zoom: done by the graphics chip alone, so it stays smooth.
      const ms = Number(this.cfg.photo_seconds) * 1000 + FADE_MS * 2;
      const img = slide._photo.img, out = Math.random() < 0.5;
      try { img.animate([{ transform: `scale(${out ? 1.06 : 1})` }, { transform: `scale(${out ? 1 : 1.06})` }], { duration: ms, easing: 'linear', fill: 'forwards' }); } catch (error) { /* still fine */ }
    }
    async begin() {
      this.starting = true;
      const photo = await this.loadSome();
      this.starting = false;
      if (!photo) { this.lastShow = Date.now(); return; } // none would load: try again next time round
      if (!this.quiet() || this.show || this.cfg.photos === false) { this.drop(photo); return; }
      if (this.card._moment) this.card._endMoment(true);
      const el = this.build(), cfg = this.cfg, now = Date.now();
      const slide = this.slide(photo);
      el.replaceChildren(slide);
      el.classList.remove('quick');
      this.show = { at: now, until: now + Number(cfg.photos_for) * 1000, nextAt: now + Number(cfg.photo_seconds) * 1000, fails: 0, front: slide, loading: false };
      this.drift(slide);
      void el.offsetWidth; // so the fade in runs
      slide.classList.add('front');
      el.classList.add('on');
    }
    async next() {
      const show = this.show;
      if (!show || show.loading) return;
      show.loading = true;
      // Only one photo in the album: it just stays.
      const single = this.ids.length <= 1;
      const photo = single ? null : await this.loadSome();
      if (this.show !== show) { this.drop(photo); return; }
      show.loading = false;
      show.nextAt = Date.now() + Number(this.cfg.photo_seconds) * 1000;
      if (single) return;
      if (!photo) {
        show.fails += 1;
        if (show.fails >= 2) this.hide(false); // the album's stopped answering: back to the robot
        return;
      }
      show.fails = 0;
      const old = show.front, slide = this.slide(photo);
      this.el.appendChild(slide);
      this.drift(slide);
      void slide.offsetWidth;
      slide.classList.add('front');
      old.classList.remove('front');
      show.front = slide;
      setTimeout(() => { if (old.isConnected) { old.remove(); this.drop(old._photo); } }, FADE_MS + 50);
    }
    drop(photo) {
      if (photo && photo.blobUrl) URL.revokeObjectURL(photo.blobUrl);
    }
    hide(quick) {
      if (!this.show) return;
      this.show = null;
      this.lastShow = Date.now();
      const el = this.el;
      if (!el) return;
      el.classList.toggle('quick', !!quick);
      el.classList.remove('on');
      const slides = [...el.children];
      setTimeout(() => {
        if (this.show) return; // a new show began meanwhile
        for (const slide of slides) { slide.remove(); this.drop(slide._photo); }
      }, (quick ? QUICK_MS : FADE_MS) + 50);
    }
  }

  function attach(Card) {
    const proto = Card.prototype;
    if (!proto || proto._photosAdded) return;
    proto._photosAdded = true;
    // No idle moments or info cards while photos show.
    const canMoment = proto._canMoment;
    proto._canMoment = function () { return !(this._photos && this._photos.show) && canMoment.apply(this, arguments); };
    const connected = proto.connectedCallback, disconnected = proto.disconnectedCallback;
    proto.connectedCallback = function () { if (connected) connected.apply(this, arguments); if (!this._photos) this._photos = new Photos(this); };
    proto.disconnectedCallback = function () { if (this._photos) { this._photos.stop(); this._photos = null; } if (disconnected) disconnected.apply(this, arguments); };
    // A card already on the page when this loaded: picked up on its next once-a-second tick.
    const tick = proto._tick;
    proto._tick = function () { if (!this._photos && this.isConnected) this._photos = new Photos(this); return tick.apply(this, arguments); };
    // A change of settings (photos: false, say) counts at once.
    const setConfig = proto.setConfig;
    proto.setConfig = function () { const out = setConfig.apply(this, arguments); if (this._photos) this._photos.tick(); return out; };
  }
  customElements.whenDefined('echo-home-card').then(() => attach(customElements.get('echo-home-card')));
  window.EchoRobotPhotos = { Photos, PHOTO_DEFAULTS };
})();
