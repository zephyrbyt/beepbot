/* Echo Robot: a full-screen robot for the Echo Show, with controls hidden behind one tap.
   Local only: no external libraries, fonts or requests. Words stay in this page's memory
   for a few seconds and are not stored anywhere new.
   Written for Chromium 118 (the Echo's WebView): no CSS nesting, no newer syntax. */
const DEFAULTS = {
  robot: 'buddy',            // 'buddy' = little full-body robot, 'face' = the whole screen is the face
  satellite: 'assist_satellite.echo_show_example_assist_satellite',
  mute: 'switch.echo_show_example_mute',
  wake_word: 'select.echo_show_example_wake_word',
  timer_ringing: 'binary_sensor.echo_show_example_timer_ringing',
  stop_ringing: 'button.echo_show_example_stop_ringing',
  weather: 'weather.forecast_home',
  player: 'media_player.living_room_speaker',
  spotify: null,             // found automatically; set this only if it isn't
  album_colours: true,       // take the screen colours from the cover of what's playing
  now_playing: true,         // show the cover, title, artist and progress while music plays
  lyrics: true,              // show time-synced lyrics while music plays (false turns them off)
  lyric_reactions: true,     // the robot reacts to words in the lyrics (false turns this off)
  lyrics_offset: 0,          // seconds; raise it if lyrics run behind the music, lower it if ahead
  radio_lyrics_offset: -3,   // the same for the radio, where the server listens to the station to line them up: what the Echo and Music Assistant hold back before playing
  pipeline: null,            // only used if the pipeline list can't be read
  night_start: '22:30',      // set either to false to turn night mode off
  night_end: '07:00',
  dark_sensor: null,         // a light sensor in the room (lux): when it's dark, night mode; the times above are then
                             // only used if the sensor stops reporting
  dark_below: 3,             // lux at or under which the room counts as dark
  doorbell: true,            // when the doorbell rings, show its camera live; true finds it, or name the doorbell's
                             // event or binary_sensor; false turns it off
  doorbell_camera: null,     // the camera to show, if it isn't found from the doorbell
  doorbell_pause: true,      // while the doorbell's video shows, pause what the Echo is playing (it carries on after);
                             // false leaves it playing, or list the players to pause
  doorbell_names: true,      // when the echo_faces add-on recognises who rang, the title says so ("Mum’s at the Front Door"),
                             // and when it sees someone added walk up without ringing, the doorbell's video comes up with
                             // their name. false always says "Someone’s". Saying it out loud is the add-on's own setting
  moments: true,             // little idle moments; false turns them off
  night_clock: true,         // at night, a big dark clock with the robot small underneath; false keeps the full face
  home_events: true,         // arrivals, heating, bedtime and morning; false turns them off
  speech_wait: false,        // for slow voices like Fable: keep thinking until the speech should be starting
  speech_wait_adjust: 0,     // seconds; raise it if words appear before the voice, lower it if after
  moment_every: 30,          // roughly how many seconds between them
  info_cards: true,          // now and then the robot steps aside to show the forecast or what's coming up; false turns them off
  vacuum_watch: true,        // while a vacuum cleans, the robot steps aside to show its live map, following it; false turns it off
  card_every: 180,           // roughly how many seconds between info cards
  alerts: true,              // timers and reminders pop up, then wait in a corner (needs the echo_robot add-on)
  heating_controls: true,    // a Heating button in the tap menu for each thermostat in "heating" (or every one); false hides it
  menu_layout: 'heat_top',   // the tap menu: 'heat_top' (heating strip above the lights), 'grid', 'split' or 'round'
  light_colour: '#ffd34d',   // the colour of a light button that's on
  menu_size: 'big',          // 'big' or 'compact' buttons
  menu_order: null,          // which buttons show, in order: [{ id: 'light.x', show: true }, ...]; set on the Customise page
  vacuums: null,             // robot vacuums in the menu: left out, every vacuum; or a list of ids (or { entity, name }); false: none
  scenes: null,              // one-tap buttons: a list of scene./script. ids (or { entity, name }), shown in the menu.
                             // Left out, every scene and script is offered on the Customise page, switched off, along
                             // with "Lights off". false: no scene buttons at all.
  chime: false,              // play a chime on this screen when a timer or reminder goes off (the Echo rings by itself)
  talk: false,               // talk to it from this screen: Space or the mic button (for a PC; needs a secure connection)
  talk_device: null,         // which device a request counts as coming from, so timers ring there; the Echo by default
  desktop: false,            // scale everything up to fill a big window
  bop: null,                 // which Bop (face character) this screen shows, by id; each screen picks its own in Settings
  bop_voices: true,          // a Bop's voice: switch this Echo to a copy of its assistant with that voice; false keeps one voice
  lights: [
    { entity: 'light.bedroom_light', name: 'Bedroom' },
    { entity: 'light.office_light', name: 'Office' },
    { entity: 'light.landing_light', name: 'Landing' },
    { entity: 'light.spare_room_light', name: 'Spare room' },
  ],
};

const svg = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  light: svg('<path d="M9 18h6m-5 3h4M8.5 14.5a6 6 0 1 1 7 0c-1 1-1.5 1.5-1.5 3h-4c0-1.5-.5-2-1.5-3Z"/>'),
  play: svg('<path fill="currentColor" d="m8 5 12 7-12 7z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  next: svg('<path fill="currentColor" d="m5 5 10 7-10 7z"/><path d="M19 5v14"/>'),
  previous: svg('<path fill="currentColor" d="m19 5-10 7 10 7z"/><path d="M5 5v14"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>'),
  cloud: svg('<path d="M7 19a5 5 0 1 1 .8-9.9A7 7 0 0 1 21 12a3.5 3.5 0 0 1-1 7Z"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'),
  radio: svg('<rect x="3" y="8" width="18" height="12" rx="2"/><path d="m7 8 9-5"/><circle cx="15" cy="14" r="3"/><path d="M6.5 12h3M6.5 16h3"/>'),
  partly: svg('<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
  partlyNight: svg('<path d="M10.19 8.5A6 6 0 0 1 16 4a6 6 0 0 0 6 6 6 6 0 0 1-3 5.2"/><path d="M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z"/>'),
  storm: svg('<path d="M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97"/><path d="m13 12-3 5h4l-3 5"/>'),
  snow: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>'),
  fog: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 17H7M17 21H9"/>'),
  wind: svg('<path d="M12.8 19.6A2 2 0 1 0 14 16H2M17.5 8a2.5 2.5 0 1 1 2 4H2M9.8 4.4A2 2 0 1 1 11 8H2"/>'),
  cloudy: svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
  showers: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 14v6M8 14v6M12 16v6"/>'),
  rain: svg('<path d="M7 15a5 5 0 1 1 .8-9.9A7 7 0 0 1 21 8a3.5 3.5 0 0 1-1 7Z"/><path d="M8 19v2m4-3v3m4-2v2"/>'),
  mic: svg('<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>'),
  micoff: svg('<path d="m3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5V4a3 3 0 0 1 6 0v6m4 1v1a7 7 0 0 1-.6 2.8M5 10v2a7 7 0 0 0 11 5.7M12 19v3m-4 0h8"/>'),
  gear: svg('<circle cx="12" cy="12" r="8.500" stroke-width="3.500" stroke-linecap="butt" stroke-dasharray="3.340 3.340"/><circle cx="12" cy="12" r="5.500" stroke-width="2.500"/>'),
  back: svg('<path stroke-width="3" d="M15 5 8 12l7 7"/>'),
  up: svg('<path stroke-width="3" d="m6 15 6-6 6 6"/>'),
  down: svg('<path stroke-width="3" d="m6 9 6 6 6-6"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  butterfly: svg('<path fill="currentColor" stroke="none" d="M12 11C9 5 5 3 3 4.500 1 6 2 11 5 12c-2 1-3 4-1 6 2 1.800 6-1 8-5 2 4 6 6.800 8 5 2-2 1-5-1-6 3-1 4-6 2-7.500C19 3 15 5 12 11Z"/>'),
  // things that appear in lyric reactions (original simple drawings)
  coin: svg('<circle fill="currentColor" stroke="none" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.500" stroke="#0003"/>'),
  gem: svg('<path fill="currentColor" stroke="none" d="M7 4h10l4 5-9 12L3 9z"/>'),
  crown: svg('<path fill="currentColor" stroke="none" d="m3 8 5 4 4-7 4 7 5-4-2 11H5z"/>'),
  flower: svg('<g fill="currentColor" stroke="none"><circle cx="12" cy="6" r="3.500"/><circle cx="18" cy="11" r="3.500"/><circle cx="15.500" cy="18" r="3.500"/><circle cx="8.500" cy="18" r="3.500"/><circle cx="6" cy="11" r="3.500"/></g><circle fill="#fff5" stroke="none" cx="12" cy="12.500" r="3"/>'),
  leaf: svg('<path fill="currentColor" stroke="none" d="M20 3C9 3 4 8 4 15c0 2 .6 3.600 1.500 5C8 12 13 9 17 8c-5 3-8 7-9.500 13C15 21 21 15 20 3Z"/>'),
  drop: svg('<path fill="currentColor" stroke="none" d="M12 2c4 6 7 9.500 7 13a7 7 0 0 1-14 0c0-3.500 3-7 7-13Z"/>'),
  flake: svg('<path d="M12 2v20M3.500 7l17 10M20.500 7l-17 10M12 6 9.500 3.500M12 6l2.500-2.500M12 18l-2.500 2.500M12 18l2.500 2.500"/>'),
  bubble: svg('<circle cx="12" cy="12" r="9"/><path d="M8 9a4.500 4.500 0 0 1 3-2.500"/>'),
  balloon: svg('<path fill="currentColor" stroke="none" d="M12 2a7 8 0 0 0-7 8c0 4.500 4 7.500 6 8.500l-1 2h4l-1-2c2-1 6-4 6-8.500a7 8 0 0 0-7-8Z"/>'),
  bolt: svg('<path fill="currentColor" stroke="none" d="M14 2 4 14h6l-1 8 11-13h-6.500z"/>'),
  ghost: svg('<path fill="currentColor" stroke="none" d="M12 2a8 8 0 0 0-8 8v11l3-2 2.500 2L12 19l2.500 2L17 19l3 2V10a8 8 0 0 0-8-8Zm-3 7a1.500 1.500 0 1 1 0 3 1.500 1.500 0 0 1 0-3Zm6 0a1.500 1.500 0 1 1 0 3 1.500 1.500 0 0 1 0-3Z"/>'),
  plane: svg('<path fill="currentColor" stroke="none" d="m2 12 19-9-4 18-5-7-3 4-1-6z"/>'),
  car: svg('<path fill="currentColor" stroke="none" d="M3 16v-4l3-6h12l3 6v4h-2a2.500 2.500 0 0 1-5 0h-4a2.500 2.500 0 0 1-5 0ZM7.500 11h9L15 8H9Z"/>'),
  rocket: svg('<path transform="rotate(90 12 12)" fill="currentColor" stroke="none" d="M12 2c3.500 3 5 7 5 11l2.500 4-4 .5-1 2h-5l-1-2-4-.5L7 13c0-4 1.500-8 5-11Zm0 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>'),
  phone: svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
  paw: svg('<g fill="currentColor" stroke="none"><circle cx="6" cy="11" r="2.200"/><circle cx="10" cy="7" r="2.200"/><circle cx="15" cy="7" r="2.200"/><circle cx="19" cy="11" r="2.200"/><path d="M12.500 11c3 0 5.500 3 5.500 5.500 0 2.500-2.500 3-5.500 2-3 1-5.500.5-5.500-2C7 14 9.500 11 12.500 11Z"/></g>'),
  fish: svg('<path transform="matrix(-1 0 0 1 24 0)" fill="currentColor" stroke="none" d="M2 12c4-6 11-6 15-1l5-4v10l-5-4c-4 5-11 5-15-1Z"/>'),
  tree: svg('<path fill="currentColor" stroke="none" d="M12 2 5 11h3l-4 6h6.500v5h3v-5H20l-4-6h3z"/>'),
  bird: svg('<path d="M2 11c3-3 7-3 10 1 3-4 7-4 10-1"/>'),
  gift: svg('<path fill="currentColor" stroke="none" d="M3 8h18v4H3zM5 13h14v8H5z"/><path stroke-width="2.500" d="M12 8v13M12 8C9 8 7 6 8 4.500S11 4 12 8c1-4 3-5 4-3.500S15 8 12 8Z"/>'),
  glass: svg('<path d="M6 3h12l-1.500 8a4.500 4.500 0 0 1-9 0ZM12 15.500V21M8 21h8"/>'),
  cup: svg('<path d="M5 8h12v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4ZM17 10h2a2.500 2.500 0 0 1 0 5h-2M9 2v3M13 2v3"/>'),
  key: svg('<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9M17 17l2.500-2.500M20 20l1.500-1.500"/>'),
  mic2: svg('<rect x="8" y="2" width="8" height="12" rx="4" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'),
  wave: svg('<path stroke-width="3" d="M2 9c2.500-3 5-3 7.500 0s5 3 7.500 0 3-2.500 5-2M2 16c2.500-3 5-3 7.500 0s5 3 7.500 0 3-2.500 5-2"/>'),
  bang: svg('<path stroke-width="4" d="M12 3v12"/><circle fill="currentColor" stroke="none" cx="12" cy="20" r="2.200"/>'),
  sparkle: svg('<path fill="currentColor" stroke="none" d="M12 2c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10Z"/>'),
  sad: svg('<circle cx="12" cy="12" r="9"/><path d="M8 16c2.500-2.500 5.500-2.500 8 0M9 9.500v.1M15 9.500v.1"/>'),
  rainbow: svg('<path stroke-width="2.500" d="M3 19a9 9 0 0 1 18 0"/><path stroke-width="2.500" opacity=".75" d="M6.500 19a5.500 5.500 0 0 1 11 0"/><path stroke-width="2.500" opacity=".5" d="M10 19a2 2 0 0 1 4 0"/>'),
  // floating props
  heart: svg('<path fill="currentColor" stroke="none" d="M12 21C4 14.5 2 10.5 3.2 7.2 4.6 3.6 10 3.4 12 7.5c2-4.1 7.4-3.9 8.8-.3C22 10.5 20 14.5 12 21Z"/>'),
  note: svg('<path d="M9 18V5l11-2v13"/><circle fill="currentColor" cx="6.5" cy="18" r="2.5"/><circle fill="currentColor" cx="17.5" cy="16" r="2.5"/>'),
  question: svg('<path stroke-width="3" d="M8 8.5a4 4 0 1 1 6 3.4c-1.300.8-2 1.600-2 3.100"/><circle fill="currentColor" stroke="none" cx="12" cy="20" r="1.800"/>'),
  z: svg('<path stroke-width="3" d="M6 5h12L6 19h12"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>'),
  vacuum: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9.5" r="2.5"/><path d="M7.5 16h9"/>'),
  camera: svg('<rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5z"/>'),
  dock: svg('<path d="M4 20h16M7 20V9l5-4 5 4v11"/><path d="M10 20v-5h4v5"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  flame: svg('<path d="M12 22c-4.200 0-7-2.900-7-6.800 0-3.300 2.200-5.600 3.800-7.600.4 1.900 1.400 3 2.700 3.300C10.800 7.600 12.200 4.600 15 2.500c0 3.200 4 5.900 4 11.300C19 18.700 16.300 22 12 22Z"/>'),
  timer: svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V10M10 2h4M18.5 6.5 20 5"/>'),
  scene: svg('<path d="M10 3c.7 3.600 2.400 5.300 6 6-3.600.7-5.300 2.400-6 6-.7-3.600-2.400-5.300-6-6 3.600-.7 5.300-2.400 6-6ZM18 14c.4 2 1.300 2.900 3.300 3.300-2 .4-2.900 1.300-3.300 3.300-.4-2-1.300-2.900-3.300-3.300 2-.4 2.900-1.300 3.300-3.300Z"/>'),
  film: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
  power: svg('<path d="M12 3v9M6.300 6.300a8 8 0 1 0 11.400 0"/>'),
  check: svg('<path stroke-width="3" d="m5 12.500 4.500 4.500L19 7"/>'),
  star: svg('<path fill="currentColor" stroke="none" d="m12 2 2.900 6.600 7.100.700-5.400 4.700 1.600 7L12 17.300 5.800 21l1.600-7L2 9.300l7.100-.700z"/>'),
};

// What each mood looks like. eye/mouth pick a drawing; props float around the head; arm is buddy-only.
const MOODS = {
  idle:      { eye: 'round',  mouth: 'smile' },
  groove:    { eye: 'round',  mouth: 'smile' },
  sleep:     { eye: 'closed', mouth: 'small', props: ['z', 'z'], anim: 'snooze' },
  listening: { eye: 'round',  mouth: 'o', anim: 'lean', arm: 'up' },
  thinking:  { eye: 'round',  mouth: 'flat', props: ['dot', 'dot', 'dot'], anim: 'ponder' },
  speaking:  { eye: 'round',  mouth: 'bars', anim: 'chat' },
  muted:     { eye: 'half',   mouth: 'flat', caption: 'Microphone off' },
  offline:   { eye: 'x',      mouth: 'flat', caption: 'Voice is offline' },
  alarm:     { eye: 'round',  mouth: 'o', props: ['clock'], anim: 'shake', arm: 'up', caption: 'Timer! Tap me to stop' },
  remind:    { eye: 'round',  mouth: 'o', props: ['bell'], anim: 'shake', arm: 'up' },
  wakeup:    { eye: 'happy',  mouth: 'grin', props: ['sun'], anim: 'hop', arm: 'wave' },
  happy:     { eye: 'happy',  mouth: 'grin', props: ['star'], anim: 'hop' },
  wave:      { eye: 'happy',  mouth: 'smile', anim: 'hop', arm: 'wave' },
  love:      { eye: 'heart',  mouth: 'smile', props: ['heart', 'heart'], anim: 'hop' },
  laugh:     { eye: 'happy',  mouth: 'grin', anim: 'giggle' },
  bright:    { eye: 'star',   mouth: 'grin', props: ['light'], anim: 'hop', arm: 'up' },
  dim:       { eye: 'half',   mouth: 'small', props: ['moon'] },
  notes:     { eye: 'happy',  mouth: 'smile', props: ['note', 'note'], anim: 'dance', arm: 'dance' },
  weather:   { eye: 'round',  mouth: 'smile', props: ['weather'], anim: 'hop' },
  clock:     { eye: 'round',  mouth: 'smile', props: ['clock'], anim: 'hop' },
  sleepy:    { eye: 'closed', mouth: 'small', props: ['z', 'z'], anim: 'snooze' },
  confused:  { eye: 'odd',    mouth: 'wiggle', props: ['question'], anim: 'tilt' },
};
// ---- Skits: the robot itself acts out a tiny story, and something small happens around it. ----
// ("Skit", so they aren't mixed up with Home Assistant scenes.) Each skit is made of the same few pieces: drawings on a layer behind the face (back), in front of it (front),
// stuck to the head (kit) or inside each eye (eyeKit); movements for the head (rb), both eyes (eyes), each eye
// (eye, eyeL, eyeR) and the mouth, written in seconds; and beats, changes of expression part-way through.
// "flip" skits can happen from either side. Only transform and opacity move, so the Echo's graphics chip does the work.
const SC_ART = {
  car: '<svg viewBox="0 0 250 110"><path fill="#ff6a45" d="M12 74c0-14 8-22 24-24l26-3c14-20 28-28 46-28h52c18 0 32 10 44 28l26 5c10 2 16 10 16 22v8c0 5-4 8-8 8H20c-5 0-8-3-8-8Z"/><path fill="#fff" opacity=".9" d="M78 47c9-13 18-19 30-19h18v19ZM140 28h20c12 0 22 6 30 19h-50Z"/><circle cx="23" cy="64" r="6" fill="#ffe680"/><path stroke="#c94a2c" stroke-width="4" stroke-linecap="round" d="M122 60h14"/></svg>',
  wheel: '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="21" fill="#1d2233"/><circle cx="22" cy="22" r="10" fill="#dfe4ee"/><path d="M22 13v18M13 22h18" stroke="#1d2233" stroke-width="4"/></svg>',
  speed: '<svg viewBox="0 0 120 80"><path fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" d="M10 12h70M34 42h82M2 70h58"/></svg>',
  // a little grey rain cloud with a cheeky face
  cloud: '<svg viewBox="0 0 380 120"><g fill="#d6dee9"><circle cx="90" cy="64" r="40"/><circle cx="176" cy="52" r="46"/><circle cx="262" cy="58" r="42"/><circle cx="322" cy="80" r="30"/><circle cx="52" cy="84" r="28"/><rect x="40" y="64" width="300" height="44" rx="22"/></g><rect x="36" y="88" width="308" height="22" rx="11" fill="#aab7ca"/><g fill="#56637a"><ellipse cx="164" cy="70" rx="7" ry="9"/><ellipse cx="214" cy="70" rx="7" ry="9"/></g><path d="M176 86q13 9 26 0" stroke="#56637a" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
  // an umbrella canopy that opens on top of its head (no handle to dangle in front of its face)
  umbrella: `<svg viewBox="0 0 640 140"><rect x="312" y="0" width="16" height="34" rx="7" fill="#3a3f52"/><path fill="#ffd34d" d="M0 130C20 60 150 30 320 30S620 60 640 130${'q-40-24-80 0'.repeat(8)}Z"/><path fill="none" stroke="#e0a400" stroke-width="6" stroke-linecap="round" d="M320 34Q290 70 240 128M320 34Q350 70 400 128M320 34Q230 56 160 128M320 34Q410 56 480 128M320 34Q170 50 80 128M320 34Q470 50 560 128"/></svg>`,
  whoosh: '<svg viewBox="0 0 18 110"><path stroke="#e6f3ff" stroke-width="8" stroke-linecap="round" d="M9 6v98"/></svg>',
  splash: '<svg viewBox="0 0 50 26"><path fill="none" stroke="#a8dcff" stroke-width="6" stroke-linecap="round" d="M8 24 2 8M25 18V2M42 24l6-16"/></svg>',
  frost: '<svg viewBox="0 0 100 120"><path fill="#bfe3fb" d="M8 64l6-7 8 7 9-9 9 8 10-9 10 10 8-8 8 10 8-8 8 6v12a40 40 0 0 1-40 40h-4A40 40 0 0 1 8 76Z"/><path stroke="#fff" stroke-width="3" stroke-linecap="round" d="M30 84v12M24 90h12M66 92v10M61 97h10M50 72v8M46 76h8"/></svg>',
  icicle: '<svg viewBox="0 0 18 46"><path fill="#bfe3fb" stroke="#fff" stroke-width="2" stroke-linejoin="round" d="M1 1h16L9 45Z"/></svg>',
  breath: '<svg viewBox="0 0 90 56"><g fill="#fff"><circle cx="24" cy="34" r="20"/><circle cx="48" cy="24" r="22"/><circle cx="68" cy="36" r="18"/></g></svg>',
  sweat: '<svg viewBox="0 0 34 48"><path fill="#8fd3ff" d="M17 2c8 13 15 21 15 30a15 15 0 0 1-30 0c0-9 7-17 15-30Z"/><path stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" d="M10 32a7 7 0 0 0 5 8"/></svg>',
  heat: '<svg viewBox="0 0 30 110"><path fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" d="M15 4Q2 21 15 38T15 72T15 106"/></svg>',
  butterfly: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 11C9 5 5 3 3 4.5 1 6 2 11 5 12c-2 1-3 4-1 6 2 1.8 6-1 8-5 2 4 6 6.8 8 5 2-2 1-5-1-6 3-1 4-6 2-7.5C19 3 15 5 12 11Z"/></svg>',
  bolt: '<svg viewBox="0 0 120 190"><path fill="#ffe14d" stroke="#fff" stroke-width="5" stroke-linejoin="round" d="M76 2 20 100h38L36 188l68-112H64L96 2Z"/></svg>',
  spark: '<svg viewBox="0 0 40 30"><path fill="none" stroke="#ffe14d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M2 26 14 6l8 16L38 4"/></svg>',
  ghost: '<svg viewBox="0 0 100 110"><path fill="#f0f4ff" d="M50 4C26 4 10 22 10 46v56l14-10 13 12 13-12 13 12 13-12 14 10V46C90 22 74 4 50 4Z"/><ellipse cx="37" cy="46" rx="6" ry="9" fill="#1d2233"/><ellipse cx="63" cy="46" rx="6" ry="9" fill="#1d2233"/></svg>',
  bang: '<svg viewBox="0 0 40 100"><path stroke="currentColor" stroke-width="15" stroke-linecap="round" d="M20 10v50"/><circle cx="20" cy="86" r="9" fill="currentColor"/></svg>',
  shock: '<svg viewBox="0 0 800 470"><path fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" d="M104 118 62 96M86 214H40M110 312l-40 22M696 118l42-22M714 214h46M690 312l40 22"/></svg>',
  z: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M6 5h12L6 19h12"/></svg>',
  fly: '<svg viewBox="0 0 36 28"><ellipse cx="11" cy="9" rx="9" ry="5.5" fill="#fff" opacity=".8" transform="rotate(-28 11 9)"/><ellipse cx="25" cy="9" rx="9" ry="5.5" fill="#fff" opacity=".8" transform="rotate(28 25 9)"/><ellipse cx="18" cy="18" rx="7" ry="8" fill="#1d2233" stroke="#fff" stroke-width="1.5"/></svg>',
  pop: '<svg viewBox="0 0 100 100"><path fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" d="M50 8v16M50 76v16M8 50h16M76 50h16M20 20l11 11M69 69l11 11M80 20 69 31M31 69 20 80"/></svg>',
  train: (() => {
    const car = (x) => `<rect x="${x - 14}" y="80" width="16" height="7" fill="#2a2f45"/><rect x="${x}" y="22" width="262" height="14" rx="7" fill="#2a2f45"/><rect x="${x + 6}" y="30" width="250" height="70" rx="10" fill="#3fb07f"/>`
      + [0, 1, 2, 3].map((j) => { const wx = x + 24 + j * 58; return `<rect x="${wx}" y="44" width="40" height="30" rx="8" fill="#fff" opacity=".9"/>` + ((x / 2 + j) % 3 ? `<rect x="${wx + 11}" y="52" width="6" height="10" rx="3" fill="#2a2f45"/><rect x="${wx + 23}" y="52" width="6" height="10" rx="3" fill="#2a2f45"/>` : ''); }).join('')
      + [40, 70, 192, 222].map((w) => `<circle cx="${x + w}" cy="104" r="10" fill="#2a2f45"/><circle cx="${x + w}" cy="104" r="4" fill="#dfe4ee"/>`).join('');
    return `<svg viewBox="0 0 1240 130"><rect x="10" y="96" width="290" height="12" rx="4" fill="#2a2f45"/><path fill="#2a2f45" d="M0 112 22 86h12v26Z"/>`
      + '<rect x="28" y="46" width="180" height="54" rx="22" fill="#e2412f"/><rect x="22" y="42" width="30" height="60" rx="10" fill="#2a2f45"/><path fill="#2a2f45" d="M58 48V22h-6V12h38v10h-6v26Z"/><path fill="#ffd34d" d="M112 47a16 16 0 0 1 32 0Z"/><circle cx="22" cy="62" r="7" fill="#ffe680"/>'
      + '<rect x="206" y="20" width="88" height="80" rx="6" fill="#e2412f"/><rect x="198" y="10" width="104" height="14" rx="5" fill="#2a2f45"/><rect x="226" y="34" width="46" height="32" rx="6" fill="#fff" opacity=".85"/>'
      + '<rect x="296" y="80" width="14" height="7" fill="#2a2f45"/><rect x="306" y="50" width="94" height="50" rx="6" fill="#2a2f45"/><path fill="#151826" d="M310 52q10-16 22-6 10-14 22-4 10-14 22-4 10-12 20 14Z"/><circle cx="330" cy="104" r="11" fill="#2a2f45"/><circle cx="380" cy="104" r="11" fill="#2a2f45"/>'
      + car(412) + car(688) + car(964) + '</svg>';
  })(),
  track: `<svg viewBox="0 0 960 16"><rect y="2" width="960" height="5" rx="2" fill="currentColor"/>${Array.from({ length: 21 }, (_, i) => `<rect x="${i * 46 + 4}" y="8" width="26" height="7" rx="2" fill="currentColor"/>`).join('')}</svg>`,
};
// One drawing on a layer: a class, where it sits, and what's inside.
const scPiece = (cls, style, inner = '') => `<i class="${cls}" style="${style}">${inner}</i>`;
// n pieces, spread out by a fixed step so they look scattered without being random.
const scMany = (n, make) => Array.from({ length: n }, (_, i) => make(i)).join('');
// Keyframes written in seconds, turned into percentages of the whole skit. A step without ":" is a transform.
// The first and last steps hold until the start and end, so nothing drifts back on its own.
const scKeys = (name, total, steps) => {
  const all = [...(steps[0][0] > 0 ? [[0, steps[0][1]]] : []), ...steps, ...(steps.at(-1)[0] < total ? [[total, steps.at(-1)[1]]] : [])];
  return `@keyframes ${name}{${all.map(([t, css]) => `${+(t / total * 100).toFixed(2)}%{${css.includes(':') ? css : `transform:${css}`}}`).join('')}}`;
};
const skSide = (px) => `calc(var(--dir)*${px})`; // a sideways distance that flips with the skit
// The robot's own reactions, reused by several scenes: a "!" beside it, a sweat drop, blushing, shock lines.
const scBang = (at) => scPiece('sk-bang', `left:70px;top:92px;animation-delay:${at}s`, SC_ART.bang); // on the front layer, beside the face
const scSweat = (at, left = 664, top = 92) => scPiece('sk-sweat', `left:${left}px;top:${top}px;animation-delay:${at}s`, SC_ART.sweat);
const scBlush = (at) => scPiece('sk-blush', `left:120px;top:300px;animation-delay:${at}s`) + scPiece('sk-blush', `left:584px;top:300px;animation-delay:${at}s`);
const scShock = (at) => scPiece('sk-shock', `left:0;top:0;animation-delay:${at}s`, SC_ART.shock);
// Rain: a little cloud follows the robot about, raining only on it. Its face ducks down and shrinks to make room for
// the cloud above it, then it dodges one way and the other, but the cloud keeps up. Two endings share this start.
const rainAt = (x, y = 100, s = '.64') => `translate(${skSide(`${x}px`)},${y}px) scale(${s})`;
const RAIN_ENDINGS = ['umbrella', 'raincloud']; // the rain story's two endings take turns
const RAIN_DUCK = 'translate(0px,100px) scale(.64)';
const rainLook = (x) => `translate(${skSide(`${x}px`)},-34px)`;
const RAIN = {
  rb: [[0, 'none'], [0.55, RAIN_DUCK], [0.9, RAIN_DUCK], [1.0, 'translate(0px,108px) scale(.67,.6)'], [1.15, RAIN_DUCK],
    [1.5, RAIN_DUCK], [1.72, rainAt(-190)], [2.4, rainAt(-190)], [2.62, rainAt(120)]],
  // looks up at the cloud; after each dodge it looks back at where the cloud is, until it catches up
  eyes: [[0, 'none'], [0.45, rainLook(0)], [0.95, rainLook(0)], [1.05, 'translate(0px,-20px)'], [1.2, rainLook(0)],
    [1.72, rainLook(36)], [2.0, rainLook(36)], [2.1, rainLook(0)], [2.62, rainLook(-36)], [2.9, rainLook(-36)], [3.0, rainLook(0)]],
  eye: [[0, 'none'], [0.95, 'none'], [1.0, 'scaleY(.5)'], [1.12, 'none']],
  // fed up when it rains on it, pleased when it dodges, fed up again when the cloud catches up
  beats: [[1000, { eye: 'half', mouth: 'frown' }], [1750, { eye: 'round', mouth: 'smile' }], [2120, { eye: 'half', mouth: 'frown' }],
    [2650, { eye: 'round', mouth: 'smile' }], [3020, { eye: 'half', mouth: 'frown' }]],
  cloud: [[0, 'translate(640px,-40px)'], [0.75, 'none'], [1.82, 'none'], [2.1, 'translateX(-190px)'], [2.72, 'translateX(-190px)'], [3.0, 'translateX(120px)']],
};
// The cloud with its rain (which moves with it); "end" is which ending, for its own timings.
const scRainCloud = (few, end, extra = '') => {
  const n = few(9);
  return scPiece(`sk-cloud sk-cloud-${end}`, 'left:290px;top:-6px', SC_ART.cloud
    + scPiece(`sk-pour sk-pour-${end}`, '', scMany(n, (i) => scPiece('sk-drop', `left:${Math.round(44 + i * 290 / (n - 1))}px;top:100px;animation-delay:-${((i * 4) % n * 0.5 / n).toFixed(2)}s`)))
    + extra);
};
const RAIN_CSS = `.sk-cloud{width:380px;height:120px}
.sk-pour{left:0;top:0;width:380px;height:120px}
.sk-drop{width:7px;height:30px;border-radius:4px;background:#a8dcff;opacity:0;animation:sk-drop .5s linear infinite}
@keyframes sk-drop{0%{opacity:0;transform:none}8%{opacity:1}100%{opacity:1;transform:translateY(400px)}}`;
const SKITS = {
  // A car zooms past: its eyes follow it, the wind blows its face sideways, and it squints and coughs in the dust.
  car: {
    ms: 3600, eye: 'round', mouth: 'o', flip: true,
    beats: [[1000, { mouth: 'wiggle' }], [2600, { eye: 'happy', mouth: 'grin' }]],
    front: (few) => scPiece('sc-car', 'left:0;top:326px', SC_ART.car + scPiece('sc-wheel', 'left:40px;top:66px', SC_ART.wheel) + scPiece('sc-wheel', 'left:174px;top:66px', SC_ART.wheel) + scPiece('sc-speed', 'left:250px;top:18px', SC_ART.speed))
      + scMany(few(7), (i) => scPiece('sc-dust', `left:${[700, 580, 450, 320, 190, 520, 360][i]}px;top:${[330, 300, 318, 296, 326, 214, 196][i]}px;animation-delay:${[0.52, 0.6, 0.68, 0.76, 0.84, 0.86, 0.92][i]}s`)),
    moves: {
      eyes: [[0, 'none'], [0.25, `translate(${skSide('44px')},12px)`], [0.48, `translate(${skSide('44px')},12px)`], [0.62, `translate(${skSide('18px')},22px)`], [0.84, `translate(${skSide('-62px')},22px)`], [1, `translate(${skSide('-70px')},16px)`], [2.3, `translate(${skSide('-46px')},10px)`], [2.8, 'none']],
      eye: [[0, 'none'], [0.9, 'none'], [1.02, 'scaleY(.3)'], [1.3, 'scaleY(.4)'], [1.6, 'scaleY(.26)'], [2.2, 'scaleY(.36)'], [2.45, 'none']],
      rb: [[0, 'none'], [0.6, 'none'], [0.72, `translateX(${skSide('-28px')}) skewX(${skSide('10deg')}) rotate(${skSide('-2deg')})`], [0.92, `translateX(${skSide('10px')}) skewX(${skSide('-4deg')})`], [1.1, `translateX(${skSide('-4px')}) skewX(${skSide('2deg')})`], [1.25, 'none'], [1.62, 'none'], [1.7, 'translateY(9px) scale(1.03,.96)'], [1.84, 'none'], [2, 'none'], [2.08, 'translateY(9px) scale(1.03,.96)'], [2.22, 'none']],
      mouth: [[0, 'none'], [1.62, 'none'], [1.7, 'scale(1.2,.75)'], [1.84, 'none'], [2, 'none'], [2.08, 'scale(1.2,.75)'], [2.22, 'none']],
    },
    css: `.sc-car{width:250px;height:110px;animation:sc-car 3.6s linear both}
.sc-wheel{width:44px;height:44px;animation:sc-spin .22s linear infinite}
.sc-speed{width:120px;height:80px;color:var(--ink);opacity:.7}
.sc-dust{width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;background:#efe2c4;opacity:0;animation:sc-dust 1.6s ease-out both}
${scKeys('sc-car', 3.6, [[0, 'translateX(1000px)'], [0.32, 'transform:translateX(1000px);animation-timing-function:cubic-bezier(.5,0,.9,.7)'], [1.15, 'translateX(-480px)']])}
@keyframes sc-spin{to{transform:rotate(-360deg)}}
@keyframes sc-dust{0%{opacity:0;transform:scale(.25)}12%{opacity:.85}100%{opacity:0;transform:translateX(-70px) scale(1.7)}}`,
  },
  // A steam train chugs past along the bottom: the robot leans up to watch, bobs to the clackety rhythm, its eyes
  // flick along the carriages (little robots ride in the windows), it toots along with the whistle and waves it off.
  train: {
    ms: 4800, eye: 'round', mouth: 'small', flip: true,
    beats: [[1350, { mouth: 'o' }], [1900, { mouth: 'smile' }], [3700, { eye: 'happy', mouth: 'grin' }]],
    back: () => scPiece('sc-track', 'left:0;top:452px', SC_ART.track),
    front: () => {
      const k = 1, wheel = (cx, cy, r) => scPiece('sc-wheel', `left:${Math.round((cx - r) * k)}px;top:${Math.round((cy - r) * k)}px;width:${Math.round(2 * r * k)}px;height:${Math.round(2 * r * k)}px`, SC_ART.wheel);
      return scPiece('sc-train', 'left:0;top:336px', SC_ART.train + wheel(60, 104, 14) + wheel(120, 100, 22) + wheel(176, 100, 22) + wheel(252, 104, 16)
        + scMany(3, (i) => scPiece('sc-chuff', `animation-delay:${(i * 0.3).toFixed(1)}s`, SC_ART.breath)) + scPiece('sc-toot', '', SC_ART.breath));
    },
    moves: (() => {
      // leans up to watch, bobs to the rhythm (with a hop for the whistle), then sways goodbye
      const up = 'translateY(-50px) scale(.88)', rb = [[0, 'none'], [0.5, up]];
      for (let t = 0.8; t < 3.75; t += 0.3) {
        if (t > 1.3 && t < 1.7) continue;
        rb.push([+t.toFixed(2), Math.round(t * 10 / 3) % 2 ? 'translateY(-43px) scale(.88)' : up]);
      }
      rb.push([1.38, up], [1.48, 'translateY(-66px) scale(.9,.86)'], [1.62, up]);
      rb.sort((a, b) => a[0] - b[0]);
      rb.push([3.8, up], [4, `${up} rotate(-3deg)`], [4.2, `${up} rotate(3deg)`], [4.6, 'none']);
      const at = (x, y = 22) => `translate(${skSide(`${x}px`)},${y}px)`;
      return {
        rb,
        eyes: [[0, 'none'], [0.4, at(46, 18)], [1, at(44)], [1.6, at(0)], [2, at(-44)], [2.1, at(40)], [2.7, at(-40)], [2.8, at(40)], [3.4, at(-40)], [3.5, at(30)], [3.9, at(-50, 18)], [4.4, 'none']],
      };
    })(),
    css: `.sc-track{width:960px;height:16px;color:var(--ink);opacity:.45}
.sc-train{width:1240px;height:130px;animation:sc-train 4.8s linear both}
.sc-chuff,.sc-toot{left:36px;top:-30px;width:70px;height:44px;opacity:0}
.sc-chuff g,.sc-toot g{fill:var(--ink)}
.sc-chuff{animation:sc-chuff .9s ease-out infinite}
.sc-toot{animation:sc-toot 1.1s 1.3s ease-out both}
${scKeys('sc-train', 4.8, [[0, 'translateX(1000px)'], [0.5, 'translateX(1000px)'], [3.95, 'translateX(-1320px)']])}
@keyframes sc-chuff{0%{opacity:0;transform:translateY(16px) scale(.4)}20%{opacity:.7}100%{opacity:0;transform:translate(70px,-110px) scale(1.6)}}
@keyframes sc-toot{0%{opacity:0;transform:translateY(10px) scale(.5)}15%{opacity:.95}100%{opacity:0;transform:translate(110px,-150px) scale(2.6)}}`,
  },
  // Rain, ending 1: after dodging fails it pops open an umbrella on its head. The rain bounces off and runs off the
  // edges, it looks smug, and the cloud huffs and gives up.
  umbrella: {
    ms: 5600, eye: 'round', mouth: 'small', flip: true,
    beats: [...RAIN.beats, [3560, { eye: 'happy', mouth: 'grin' }], [5050, { eye: 'round', mouth: 'smile' }]],
    // rain that now stops on the umbrella, with a splash where each drop lands (worked out from where the umbrella sits)
    front: (few) => scRainCloud(few, 'a', scPiece('sk-pour sk-pour-short', '', [-220, -130, -45, 45, 130, 220].map((d, i) => {
      const x = Math.round(190 + 0.64 * d), land = [172, 160, 155, 155, 160, 172][i], at = `animation-delay:-${[0, 0.21, 0.09, 0.27, 0.15, 0.04][i]}s`;
      return scPiece('sk-tap', `left:${x - 4}px;top:${land - 62}px;${at}`) + scPiece('sk-splash', `left:${x - 16}px;top:${land - 15}px;${at}`, SC_ART.splash);
    }).join(''))),
    kit: () => scPiece('sk-brolly', 'left:80px;top:-86px', SC_ART.umbrella)
      + scPiece('sk-shelter', '', scMany(4, (i) => scPiece('sk-runoff', `left:${[78, 714, 78, 714][i]}px;top:42px;animation-delay:-${[0, 0.22, 0.36, 0.5][i]}s`))),
    moves: {
      rb: [...RAIN.rb, [3.15, rainAt(120)], [3.3, rainAt(120, 108, '.66,.6')], [3.45, rainAt(120)], [3.5, rainAt(120)], [3.58, rainAt(120, 106, '.66,.61')], [3.7, rainAt(120)], [5.0, rainAt(120)], [5.5, 'none']],
      eyes: [...RAIN.eyes, [3.15, rainLook(0)], [3.3, 'translate(0px,-10px)'], [3.5, rainLook(0)], [5.0, rainLook(0)], [5.4, 'none']],
      eye: RAIN.eye,
    },
    css: `${RAIN_CSS}
.sk-cloud-a{animation:sk-cloud-a 5.6s ease-in-out both}
.sk-pour-a{animation:sk-pour-a 5.6s linear both}
.sk-pour-short,.sk-shelter{left:0;top:0;width:100%;height:100%;opacity:0;animation:sk-wet-a 5.6s linear both}
.sk-tap{width:7px;height:22px;border-radius:4px;background:#a8dcff;opacity:0;animation:sk-tap .36s linear infinite}
.sk-splash{width:32px;height:17px;opacity:0;transform-origin:50% 100%;animation:sk-splash .36s ease-out infinite}
.sk-runoff{width:9px;height:24px;border-radius:5px;background:#a8dcff;opacity:0;animation:sk-runoff .6s ease-in infinite}
.sk-brolly{width:640px;height:140px;transform-origin:50% 93%;animation:sk-brolly 5.6s ease-in-out both}
${scKeys('sk-cloud-a', 5.6, [...RAIN.cloud, [4.5, 'opacity:1;transform:translateX(120px)'], [4.62, 'opacity:1;transform:translateX(120px) scale(.9,1.1)'], [4.74, 'opacity:1;transform:translateX(120px) scale(1.06,.94)'], [4.86, 'opacity:1;transform:translateX(120px)'], [5.35, 'opacity:0;transform:translate(-120px,-150px) scale(.6)']])}
${scKeys('sk-pour-a', 5.6, [[0, 'opacity:0'], [0.8, 'opacity:0'], [0.92, 'opacity:1'], [3.45, 'opacity:1'], [3.55, 'opacity:0']])}
${scKeys('sk-wet-a', 5.6, [[0, 'opacity:0'], [3.5, 'opacity:0'], [3.6, 'opacity:1'], [4.5, 'opacity:1'], [4.6, 'opacity:0']])}
${scKeys('sk-brolly', 5.6, [[0, 'opacity:0;transform:scale(.08,.3)'], [3.45, 'opacity:0;transform:scale(.08,.3)'], [3.5, 'opacity:1;transform:scale(.3,1.1)'], [3.62, 'opacity:1;transform:scale(1.12,.86)'], [3.76, 'opacity:1;transform:scale(.96,1.05)'], [3.9, 'opacity:1;transform:none'], [4.95, 'opacity:1;transform:none'], [5.08, 'opacity:1;transform:scale(.2,1.08)'], [5.16, 'opacity:0;transform:scale(.08,.6)']])}
@keyframes sk-tap{0%{opacity:0;transform:none}15%{opacity:1}80%{opacity:1;transform:translateY(40px)}81%,100%{opacity:0;transform:translateY(40px)}}
@keyframes sk-splash{0%,78%{opacity:0;transform:scale(.3)}84%{opacity:1;transform:scale(.7)}100%{opacity:0;transform:scale(1.25)}}
@keyframes sk-runoff{0%{opacity:0;transform:none}15%{opacity:1}100%{opacity:0;transform:translateY(150px)}}`,
  },
  // Rain, ending 2: after dodging fails it glares, takes a big breath and blows the cloud away, then shakes itself
  // dry like a dog.
  raincloud: {
    ms: 5600, eye: 'round', mouth: 'small', flip: true,
    beats: [...RAIN.beats, [3250, { eye: 'angry', mouth: 'flat' }], [3420, { mouth: 'o' }], [4020, { eye: 'round', mouth: 'smile' }], [4300, { eye: 'squeeze', mouth: 'flat' }], [4830, { eye: 'happy', mouth: 'grin' }]],
    front: (few) => scRainCloud(few, 'b') + scPiece('sk-gust', 'left:555px;top:380px;animation-delay:3.58s', SC_ART.breath) + scMany(3, (i) => scPiece('sk-whoosh', `left:${[542, 582, 622][i]}px;top:300px;animation-delay:${[3.6, 3.56, 3.64][i]}s`, SC_ART.whoosh))
      + scMany(8, (i) => scPiece('sk-shed', `left:${[318, 306, 322, 312, 630, 642, 626, 636][i]}px;top:${[236, 290, 346, 400][i % 4]}px;--dx:${(i < 4 ? -1 : 1) * [110, 130, 120, 90][i % 4]}px;--dy:${[-50, -10, 30, 60][i % 4]}px;animation-delay:${(4.32 + (i % 4) * 0.08).toFixed(2)}s`)),
    moves: {
      rb: (() => {
        const shake = (deg) => `${RAIN_DUCK} rotate(${deg}deg)`;
        return [...RAIN.rb, [3.15, rainAt(120)], [3.45, rainAt(120, 80, '.69,.71')], [3.62, rainAt(120, 106, '.63,.6')], [3.9, rainAt(120)], [4.05, rainAt(120)], [4.28, shake(0)],
          [4.38, shake(-8)], [4.46, shake(8)], [4.54, shake(-7)], [4.62, shake(6)], [4.7, shake(-3)], [4.78, shake(0)], [4.95, shake(0)], [5.35, 'none']];
      })(),
      eyes: [...RAIN.eyes, [3.15, rainLook(0)], [3.9, rainLook(0)], [4.05, rainLook(0)], [4.25, 'none']],
      eye: RAIN.eye,
    },
    css: `${RAIN_CSS}
.sk-cloud-b{animation:sk-cloud-b 5.6s ease-in-out both}
.sk-pour-b{animation:sk-pour-b 5.6s linear both}
.sk-gust{width:90px;height:56px;opacity:0;animation:sk-gust .45s ease-out both}
.sk-whoosh{width:18px;height:110px;opacity:0;animation:sk-whoosh .4s ease-out both}
.sk-shed{width:20px;height:20px;border-radius:50%;background:#a8dcff;opacity:0;animation:sk-shed .5s ease-out forwards}
${scKeys('sk-cloud-b', 5.6, [...RAIN.cloud, [3.66, 'opacity:1;transform:translateX(120px)'], [3.76, 'opacity:1;transform:translate(130px,-8px) scale(.88,1.1)'], [4.3, 'opacity:1;transform:translate(520px,-40px) rotate(14deg) scale(.85)'], [4.42, 'opacity:0;transform:translate(600px,-60px) rotate(18deg) scale(.8)']])}
${scKeys('sk-pour-b', 5.6, [[0, 'opacity:0'], [0.8, 'opacity:0'], [0.92, 'opacity:1'], [3.66, 'opacity:1'], [3.76, 'opacity:0']])}
@keyframes sk-gust{0%{opacity:0;transform:scale(.4)}20%{opacity:.8}100%{opacity:0;transform:translateY(-150px) scale(1.2)}}
@keyframes sk-whoosh{0%{opacity:0;transform:translateY(40px) scaleY(.3)}25%{opacity:.9}100%{opacity:0;transform:translateY(-200px) scaleY(1.2)}}
@keyframes sk-shed{0%{opacity:1;transform:none}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}`,
  },
  // Bitter cold: it shivers with chattering teeth, frost creeps over its eyes, an icicle grows, it puffs out a cloud
  // of breath, then shakes the whole lot off.
  cold: {
    ms: 4400, eye: 'round', mouth: 'wiggle',
    beats: [[3650, { eye: 'happy', mouth: 'small' }]],
    back: (few) => scMany(few(12), (i) => scPiece('sc-snow', `left:${(i * 43 + 3) % 100}%;animation-delay:-${(i * 0.37).toFixed(2)}s`)),
    eyeKit: () => scPiece('sk-frost', '', SC_ART.frost),
    kit: () => scPiece('sk-icicle', 'left:456px;top:370px', SC_ART.icicle) + scPiece('sk-breath', 'left:352px;top:300px;animation-delay:1.9s', SC_ART.breath) + scPiece('sk-breath', 'left:372px;top:304px;animation-delay:2.6s', SC_ART.breath),
    moves: {
      rb: 'sc-shiver .14s linear .3s 21, sc-shake-off .8s ease-in-out 3.3s forwards',
      mouth: 'sc-chatter .09s linear .3s 32 alternate',
    },
    css: `.sc-snow{top:-20px;width:16px;height:16px;border-radius:50%;background:var(--ink);opacity:.85;animation:sc-snow 3.4s linear infinite}
.sk-frost{left:0;top:0;width:100%;height:100%;transform-origin:50% 97%;animation:sk-frost 4.4s ease-out both}
.sk-icicle{width:18px;height:46px;transform-origin:50% 0;animation:sk-icicle 4.4s ease-in-out both}
.sk-breath{width:90px;height:56px;opacity:0;animation:sk-breath 1.3s ease-out both}
@keyframes sc-snow{from{transform:translate(0,0)}50%{transform:translate(26px,250px)}to{transform:translate(-10px,510px)}}
@keyframes sc-shiver{0%,100%{transform:none}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes sc-shake-off{0%,100%{transform:none}15%{transform:translateX(-14px) rotate(-7deg)}35%{transform:translateX(12px) rotate(6deg)}55%{transform:translateX(-8px) rotate(-4deg)}75%{transform:rotate(2deg)}}
@keyframes sc-chatter{from{transform:none}to{transform:scale(1.06,.55)}}
${scKeys('sk-frost', 4.4, [[0, 'opacity:0;transform:scale(.15)'], [0.4, 'opacity:0;transform:scale(.15)'], [0.7, 'opacity:1;transform:scale(.4)'], [1.7, 'opacity:1;transform:none'], [3.3, 'opacity:1;transform:none'], [3.55, 'opacity:0;transform:translateY(14px)']])}
${scKeys('sk-icicle', 4.4, [[0, 'opacity:0;transform:scaleY(0)'], [1.2, 'opacity:1;transform:scaleY(0)'], [2.2, 'opacity:1;transform:none'], [3.35, 'opacity:1;transform:none'], [3.7, 'opacity:0;transform:translateY(70px) rotate(20deg)']])}
@keyframes sk-breath{0%{opacity:0;transform:scale(.3)}20%{opacity:.85}100%{opacity:0;transform:translateY(-60px) scale(1.3)}}`,
  },
  // Melting in the heat: heat haze rises, it pants and sags, sweat runs down its face, then it shakes the drops off.
  hot: {
    ms: 4400, eye: 'half', mouth: 'o',
    beats: [[2900, { eye: 'squeeze', mouth: 'wiggle' }], [3650, { eye: 'half', mouth: 'small' }]],
    back: () => scMany(5, (i) => scPiece('sc-heat', `left:${[8, 25, 46, 68, 86][i]}%;animation-delay:${[0, 0.7, 0.35, 1.05, 0.5][i]}s`, SC_ART.heat)),
    kit: () => scSweat(0.6) + scSweat(1.5, 104, 130),
    front: () => scMany(6, (i) => scPiece('sc-flick', `left:${[220, 200, 240, 740, 760, 720][i]}px;top:${[190, 260, 130, 190, 260, 130][i]}px;--dx:${[-90, -110, -70, 90, 110, 70][i]}px;--dy:${[-30, 20, -70, -30, 20, -70][i]}px`)),
    moves: {
      rb: [[0, 'none'], [0.3, 'none'], [1.6, 'translateY(26px) scale(1.06,.88)'], [2.6, 'translateY(30px) scale(1.07,.86)'], [2.9, 'none'], [3.05, 'rotate(-6deg)'], [3.25, 'rotate(6deg)'], [3.45, 'rotate(-3deg)'], [3.6, 'none']],
      eye: [[0, 'none'], [0.3, 'none'], [1.6, 'translateY(16px) scaleY(.84)'], [2.7, 'translateY(18px) scaleY(.82)'], [2.9, 'none']],
      mouth: 'sc-pant .32s ease-in-out .3s 8 alternate',
    },
    css: `.sc-heat{top:340px;width:30px;height:110px;color:var(--ink);opacity:0;animation:sc-heat 1.8s ease-in infinite}
.sk-sweat{width:42px;height:60px;opacity:0;animation:sk-sweat 1.6s ease-in both}
.sc-flick{width:14px;height:14px;border-radius:50%;background:#8fd3ff;opacity:0;animation:sc-flick .55s 2.95s ease-out forwards}
@keyframes sc-heat{0%{opacity:0;transform:none}30%{opacity:.35}100%{opacity:0;transform:translateY(-280px) scaleX(1.6)}}
@keyframes sk-sweat{0%{opacity:0;transform:scale(.3)}15%{opacity:1;transform:none}75%{opacity:1;transform:translateY(150px)}100%{opacity:0;transform:translateY(220px) scale(.7)}}
@keyframes sc-flick{0%{opacity:1;transform:none}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
@keyframes sc-pant{from{transform:none}to{transform:scale(1.12,1.25)}}`,
  },
  // A butterfly flutters round its head and lands on its nose: the robot goes cross-eyed, giggles, and it flies off.
  butterfly: {
    ms: 6400, eye: 'round', mouth: 'o',
    beats: [[2800, { mouth: 'small' }], [3800, { mouth: 'wiggle' }], [4700, { eye: 'happy', mouth: 'grin' }]],
    front: () => scPiece('sc-bfly', '', `<b>${SC_ART.butterfly}</b>`),
    moves: {
      eyes: [[0, 'none'], [0.3, 'translate(-60px,-12px)'], [0.7, 'translate(-50px,-24px)'], [1.3, 'translate(-25px,-3px)'], [1.9, 'translate(23px,-21px)'], [2.4, 'translate(13px,2px)'], [2.75, 'translateY(16px)'], [4.6, 'translateY(16px)'], [5, 'translate(23px,-13px)'], [5.6, 'translate(53px,-29px)'], [6.05, 'translate(60px,-34px)'], [6.4, 'none']],
      eyeL: [[0, 'none'], [2.75, 'none'], [3, 'translateX(44px) scale(.9)'], [4.5, 'translateX(44px) scale(.9)'], [4.75, 'none']],
      eyeR: [[0, 'none'], [2.75, 'none'], [3, 'translateX(-44px) scale(.9)'], [4.5, 'translateX(-44px) scale(.9)'], [4.75, 'none']],
      rb: [[0, 'none'], [3.8, 'none'], [3.9, 'rotate(-2deg)'], [4, 'rotate(2deg)'], [4.1, 'rotate(-2deg)'], [4.2, 'rotate(2deg)'], [4.3, 'rotate(-1deg)'], [4.4, 'none']],
    },
    css: `.sc-bfly{left:0;top:0;width:76px;height:76px;color:#ffd34d;animation:sc-bfly 6.4s ease-in-out both}
.sc-bfly b{display:block;width:100%;height:100%;animation:sc-flap .16s linear 0s 17 alternate,sc-flap .6s ease-in-out 2.75s 3 alternate,sc-flap .16s linear 4.6s infinite alternate}
@keyframes sc-flap{from{transform:none}to{transform:scaleX(.4)}}
${scKeys('sc-bfly', 6.4, [[0, 'translate(-120px,142px)'], [0.7, 'translate(142px,52px)'], [1.3, 'translate(292px,182px)'], [1.9, 'translate(582px,72px)'], [2.4, 'translate(522px,212px)'], [2.75, 'translate(442px,262px)'], [4.6, 'translate(442px,262px)'], [5, 'translate(582px,122px)'], [5.6, 'translate(762px,22px)'], [6.1, 'translate(1060px,-100px)']])}`,
  },
  // Struck by lightning: a flash, its eyes go to crosses, it fizzes with sparks and a puff of smoke, then blinks back.
  zap: {
    ms: 3400, eye: 'round', mouth: 'o',
    beats: [[180, { eye: 'x', mouth: 'wiggle' }], [1600, { eye: 'round', mouth: 'o' }], [2500, { eye: 'happy', mouth: 'small' }]],
    front: () => scPiece('sc-bolt', 'left:420px;top:-40px', SC_ART.bolt) + scPiece('sc-flash', 'left:0;top:0'),
    kit: () => scMany(4, (i) => scPiece('sk-spark', `left:${[110, 650, 84, 676][i]}px;top:${[40, 30, 290, 280][i]}px;animation-delay:${[0.35, 0.45, 0.55, 0.4][i]}s`, SC_ART.spark))
      + scMany(3, (i) => scPiece('sk-smoke', `left:${[372, 404, 350][i]}px;top:${[40, 30, 22][i]}px;animation-delay:${[1.1, 1.35, 1.6][i]}s`)),
    moves: {
      rb: 'sc-jitter .08s linear .3s 14 alternate',
      eye: [[0, 'opacity:1'], [0.35, 'opacity:1'], [0.45, 'opacity:.3'], [0.5, 'opacity:1'], [0.62, 'opacity:.4'], [0.7, 'opacity:1'], [1, 'opacity:.5'], [1.05, 'opacity:1']],
    },
    css: `.sc-bolt{width:120px;height:190px;transform-origin:50% 0;opacity:0;animation:sc-bolt 3.4s linear both}
.sc-flash{width:960px;height:470px;background:#fff;opacity:0;animation:sc-flash 3.4s linear both}
.sk-spark{width:60px;height:45px;opacity:0;animation:sk-spark .3s steps(2,jump-none) 4}
.sk-smoke{width:72px;height:72px;border-radius:50%;background:#e2e6ee;opacity:0;animation:sk-smoke 1.4s ease-out both}
@keyframes sc-jitter{from{transform:translate(-5px,2px) rotate(-1deg)}to{transform:translate(5px,-3px) rotate(1deg)}}
${scKeys('sc-bolt', 3.4, [[0, 'opacity:0;transform:scaleY(0)'], [0.24, 'opacity:0;transform:scaleY(0)'], [0.3, 'opacity:1;transform:none'], [0.38, 'opacity:.2;transform:none'], [0.44, 'opacity:1;transform:none'], [0.6, 'opacity:1;transform:none'], [0.75, 'opacity:0;transform:none']])}
${scKeys('sc-flash', 3.4, [[0, 'opacity:0'], [0.28, 'opacity:0'], [0.31, 'opacity:.55'], [0.4, 'opacity:0'], [0.46, 'opacity:.3'], [0.55, 'opacity:0']])}
@keyframes sk-spark{from{opacity:1}to{opacity:0}}
@keyframes sk-smoke{0%{opacity:0;transform:scale(.4)}15%{opacity:.85}100%{opacity:0;transform:translateY(-60px) scale(1.5)}}`,
  },
  // A ghost rises up beside it. The robot slowly looks round, the ghost shouts boo, and the robot jumps out of its skin.
  ghost: {
    ms: 4800, eye: 'round', mouth: 'small', flip: true,
    beats: [[1000, { mouth: 'flat' }], [2000, { mouth: 'o' }], [3300, { mouth: 'wiggle' }], [4200, { eye: 'happy', mouth: 'small' }]],
    back: () => scPiece('sc-ghost', 'left:770px;top:140px', `<b>${SC_ART.ghost}<u></u></b>`),
    front: () => scBang(2.1),
    kit: () => scSweat(3.2) + scShock(2.1),
    moves: {
      eyes: [[0, 'none'], [1, 'none'], [1.75, `translateX(${skSide('54px')})`], [2.05, `translateX(${skSide('54px')})`], [2.15, 'translateY(-10px)'], [3.2, 'none'], [3.5, `translateX(${skSide('30px')})`], [3.9, 'none']],
      eye: [[0, 'none'], [2.05, 'none'], [2.12, 'scale(1.26)'], [2.6, 'scale(1.2)'], [3, 'none']],
      rb: [[0, 'none'], [2.05, 'none'], [2.15, 'translateY(-50px) scale(1.07)'], [2.4, 'translateY(-32px) scale(1.05)'], [2.6, 'none'], [2.7, 'translateX(-4px)'], [2.8, 'translateX(4px)'], [2.9, 'translateX(-4px)'], [3, 'translateX(4px)'], [3.1, 'translateX(-3px)'], [3.2, 'none']],
    },
    css: `.sc-ghost{width:170px;height:187px;animation:sc-ghost 4.8s ease-in-out both}
.sc-ghost b{display:block;width:100%;height:100%;animation:sc-ghost-sway 1s ease-in-out infinite alternate}
.sc-ghost u{position:absolute;left:76px;top:110px;width:18px;height:22px;border-radius:50%;background:#1d2233;transform:scale(.6);animation:sc-boo 4.8s ease-in-out both}
@keyframes sc-ghost-sway{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
${scKeys('sc-ghost', 4.8, [[0, 'opacity:0;transform:translateY(330px)'], [0.4, 'opacity:0;transform:translateY(330px)'], [1.4, 'opacity:.92;transform:none'], [1.9, 'opacity:.92;transform:translate(-10px,-8px)'], [2.05, 'opacity:.95;transform:translate(-90px,10px) scale(1.35)'], [2.5, 'opacity:.92;transform:translate(-60px,0) scale(1.2)'], [3.1, 'opacity:.9;transform:translate(30px,-60px)'], [3.7, 'opacity:0;transform:translate(60px,-160px)']])}
${scKeys('sc-boo', 4.8, [[0, 'transform:scale(.6)'], [1.95, 'transform:scale(.6)'], [2.05, 'transform:scale(1.5,1.8)'], [2.6, 'transform:scale(1.4,1.6)'], [2.8, 'transform:scale(.6)']])}`,
  },
  // Ah... ah... CHOO! A big build-up, a sneeze that throws its head forward, a shake, a sniff.
  sneeze: {
    ms: 3400, eye: 'half', mouth: 'o',
    beats: [[950, { eye: 'squeeze' }], [1420, { mouth: 'grin' }], [2300, { eye: 'round', mouth: 'small' }], [2900, { eye: 'happy', mouth: 'smile' }]],
    front: () => scMany(12, (i) => { const a = Math.PI * (0.08 + (i / 11) * 0.84), r = 120 + ((i * 53) % 90); return scPiece('sc-spray', `left:480px;top:374px;--dx:${Math.round(Math.cos(a) * r * 1.6)}px;--dy:${Math.round(Math.sin(a) * r * 0.7)}px`); }),
    moves: {
      rb: [[0, 'none'], [0.5, `rotate(${skSide('-3deg')}) translateY(-8px) scale(1.02)`], [0.75, `rotate(${skSide('-3deg')}) translateY(-8px) scale(1.02)`], [1.25, `rotate(${skSide('-6deg')}) translateY(-16px) scale(1.05)`], [1.4, `rotate(${skSide('-6.5deg')}) translateY(-18px) scale(1.05)`], [1.48, `rotate(${skSide('4deg')}) translateY(18px) scale(1.08,.92)`], [1.62, `rotate(${skSide('2deg')}) translateY(6px) scale(1.02,.98)`], [1.8, 'rotate(-4deg)'], [1.95, 'rotate(4deg)'], [2.1, 'rotate(-2deg)'], [2.25, 'none']],
      mouth: [[0, 'scale(.6)'], [0.5, 'scale(.85)'], [0.75, 'scale(.85)'], [1.25, 'scale(1.15,1.3)'], [1.45, 'scale(1.2,1.35)'], [1.52, 'none']],
    },
    css: `.sc-spray{width:13px;height:13px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--eye);opacity:0;animation:sc-spray .6s 1.48s ease-out forwards}
@keyframes sc-spray{0%{opacity:.9;transform:none}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}`,
  },
  // Hiccups: hic! hic! hic! It looks relieved they've stopped... hic!
  hiccup: {
    ms: 4600, eye: 'round', mouth: 'small',
    beats: [[2950, { eye: 'happy', mouth: 'smile' }], [3720, { eye: 'round', mouth: 'flat' }]],
    kit: () => [0.5, 1.5, 2.4, 3.7].map((at) => scPiece('sk-hic', `left:381px;top:344px;animation-delay:${at}s`)).join(''),
    moves: (() => {
      const hics = [0.5, 1.5, 2.4, 3.7], rb = [[0, 'none']], eye = [[0, 'none']], mouth = [[0, 'none']];
      for (const h of hics) {
        rb.push([h, 'none'], [h + 0.07, 'translateY(-26px) scale(.96,1.06)'], [h + 0.2, 'translateY(3px) scale(1.03,.97)'], [h + 0.32, 'none']);
        eye.push([h, 'none'], [h + 0.06, 'scale(1.14)'], [h + 0.26, 'none']);
        mouth.push([h, 'none'], [h + 0.06, 'scale(.6,1.6)'], [h + 0.26, 'none']);
      }
      return { rb, eye, mouth };
    })(),
    css: `.sk-hic{width:38px;height:38px;border-radius:50%;border:4px solid var(--eye);box-sizing:border-box;opacity:0;animation:sk-hic .7s ease-out both}
@keyframes sk-hic{0%{opacity:0;transform:scale(.3)}20%{opacity:1;transform:translateY(-22px)}100%{opacity:0;transform:translate(10px,-56px) scale(1.5)}}`,
  },
  // Startled: it watches a bubble float up, the bubble pops in its face, and it leaps. Then a nervous sweat and a blush.
  startle: {
    ms: 3800, eye: 'round', mouth: 'small', flip: true,
    beats: [[520, { mouth: 'o' }], [1700, { mouth: 'wiggle' }], [2550, { eye: 'happy', mouth: 'small' }]],
    back: () => scPiece('sc-bubble', 'left:790px;top:290px') + scPiece('sc-pop', 'left:794px;top:178px', SC_ART.pop),
    front: () => scBang(0.64),
    kit: () => scShock(0.64) + scSweat(1.7) + scBlush(2.6),
    moves: {
      eyes: [[0, 'none'], [0.3, `translate(${skSide('46px')},14px)`], [0.6, `translate(${skSide('42px')},4px)`], [0.7, 'translateY(-8px)'], [1.4, 'none']],
      eye: [[0, 'none'], [0.62, 'none'], [0.68, 'scale(1.28)'], [1.4, 'scale(1.2)'], [1.8, 'none']],
      rb: [[0, 'none'], [0.6, 'none'], [0.68, 'translateY(-54px) scale(1.08)'], [0.9, 'translateY(-40px) scale(1.06)'], [1.1, 'translateY(4px) scale(1.02,.97)'], [1.25, 'none'], [1.35, 'translateX(-3px)'], [1.45, 'translateX(3px)'], [1.55, 'translateX(-3px)'], [1.65, 'translateX(3px)'], [1.75, 'none']],
    },
    css: `.sc-bubble{width:96px;height:96px;border-radius:50%;border:5px solid var(--ink);box-sizing:border-box;box-shadow:inset 14px -14px 0 -8px rgba(255,255,255,.35);animation:sc-bubble 3.8s ease-out both}
.sc-pop{width:120px;height:120px;color:var(--ink);opacity:0;animation:sc-pop 3.8s ease-out both}
${scKeys('sc-bubble', 3.8, [[0, 'opacity:0;transform:translateY(120px) scale(.6)'], [0.15, 'opacity:.9;transform:translateY(80px) scale(.8)'], [0.6, 'opacity:.9;transform:translate(-14px,-80px)'], [0.64, 'opacity:.6;transform:translate(-14px,-84px) scale(1.25)'], [0.7, 'opacity:0;transform:translate(-14px,-84px) scale(1.4)']])}
${scKeys('sc-pop', 3.8, [[0, 'opacity:0;transform:scale(.4)'], [0.62, 'opacity:0;transform:scale(.4)'], [0.66, 'opacity:1;transform:scale(.8)'], [0.95, 'opacity:0;transform:scale(1.3)']])}`,
  },
  // Nodding off: its eyes droop, its head sinks, a sleep bubble grows and shrinks... pop! It jolts awake and
  // looks round to see if anyone noticed.
  nodoff: {
    ms: 5600, eye: 'round', mouth: 'small', flip: true,
    beats: [[400, { eye: 'half' }], [1700, { eye: 'closed' }], [3420, { eye: 'round', mouth: 'o' }], [4950, { eye: 'happy', mouth: 'small' }]],
    kit: () => scPiece('sk-snooze', 'left:470px;top:300px') + scMany(2, (i) => scPiece('sk-z', `left:${[560, 610][i]}px;top:${[150, 110][i]}px;animation-delay:${[2, 2.5][i]}s`, SC_ART.z)),
    moves: {
      rb: [[0, 'none'], [0.5, 'none'], [1.6, `translateY(18px) rotate(${skSide('3deg')})`], [1.75, `translateY(10px) rotate(${skSide('2deg')})`], [2.6, `translateY(26px) rotate(${skSide('4deg')}) scale(.98)`], [3.4, `translateY(30px) rotate(${skSide('5deg')}) scale(.98)`], [3.5, 'translateY(-28px) scale(1.05)'], [3.7, 'translateY(4px)'], [3.85, 'none']],
      eye: [[0, 'none'], [3.5, 'none'], [3.56, 'scale(1.18)'], [3.9, 'none']],
      eyes: [[0, 'none'], [3.9, 'none'], [4.1, `translateX(${skSide('-54px')})`], [4.4, `translateX(${skSide('-54px')})`], [4.6, `translateX(${skSide('54px')})`], [4.9, `translateX(${skSide('54px')})`], [5.1, 'none']],
    },
    css: `.sk-snooze{width:92px;height:92px;margin-top:-92px;border-radius:50%;border:4px solid var(--eye);box-sizing:border-box;background:rgba(255,255,255,.22);transform-origin:0 100%;opacity:0;animation:sk-snooze 5.6s ease-in-out both}
.sk-z{width:60px;height:60px;color:var(--eye);opacity:0;animation:sk-z 1.4s ease-out both}
${scKeys('sk-snooze', 5.6, [[0, 'opacity:0;transform:scale(.2)'], [1.8, 'opacity:0;transform:scale(.2)'], [2, 'opacity:.9;transform:scale(.4)'], [2.4, 'opacity:.9;transform:none'], [2.8, 'opacity:.9;transform:scale(.6)'], [3.2, 'opacity:.9;transform:scale(1.15)'], [3.42, 'opacity:.9;transform:scale(1.25)'], [3.5, 'opacity:0;transform:scale(1.7)']])}
@keyframes sk-z{0%{opacity:0;transform:scale(.4)}25%{opacity:.9}100%{opacity:0;transform:translate(30px,-90px) scale(1.1)}}`,
  },
  // Peekaboo: it hides off the edge of the screen, peeks back in with one eye, has a look round, ducks out, and pops back.
  peek: {
    ms: 5400, eye: 'round', mouth: 'small', flip: true,
    beats: [[1300, { mouth: 'o' }], [3800, { eye: 'happy', mouth: 'grin' }], [4900, { eye: 'round', mouth: 'smile' }]],
    moves: {
      rb: [[0, 'none'], [0.2, `translateX(${skSide('-30px')})`], [0.75, `translateX(${skSide('780px')})`], [1.4, `translateX(${skSide('780px')}) rotate(${skSide('-14deg')})`], [1.9, `translateX(${skSide('575px')}) rotate(${skSide('-14deg')})`], [3.2, `translateX(${skSide('575px')}) rotate(${skSide('-14deg')})`], [3.45, `translateX(${skSide('780px')}) rotate(${skSide('-14deg')})`], [3.7, `translateX(${skSide('780px')})`], [4.15, `translateX(${skSide('-40px')})`], [4.35, `translateX(${skSide('14px')})`], [4.5, 'none']],
      eyes: [[0, 'none'], [1.9, 'none'], [2.2, `translateX(${skSide('-40px')})`], [2.6, `translate(${skSide('-40px')},-24px)`], [2.9, `translate(${skSide('-50px')},10px)`], [3.2, 'none']],
      eye: [[0, 'none'], [2.7, 'none'], [2.76, 'scaleY(.08)'], [2.86, 'none']],
    },
    css: '',
  },
  // A fly buzzes about. Its eyes chase it, it lands on top of one eye and gets blinked off, then the robot snaps at it,
  // misses, glares after it, and shrugs.
  flychase: {
    ms: 6600, eye: 'round', mouth: 'small', flip: true,
    beats: [[2500, { mouth: 'flat' }], [4200, { mouth: 'o' }], [4480, { mouth: 'flat' }], [5000, { eye: 'angry', mouth: 'frown' }], [5900, { eye: 'happy', mouth: 'small' }]],
    front: () => scPiece('sc-fly', '', `<b>${SC_ART.fly}</b>`),
    moves: {
      eyes: [[0, 'none'], [0.3, 'translate(-60px,-14px)'], [0.5, 'translate(-47px,-24px)'], [0.8, 'translate(-30px,-9px)'], [1.1, 'translate(-42px,3px)'], [1.5, 'translate(-10px,-19px)'], [1.8, 'translate(13px,-6px)'], [2.1, 'translate(37px,-21px)'], [2.4, 'translate(14px,-22px)'], [3.55, 'translate(14px,-22px)'], [3.8, 'translate(13px,-37px)'], [4.1, 'translate(-10px,-9px)'], [4.35, 'translateY(16px)'], [4.55, 'translateY(20px)'], [4.8, 'translate(-25px,30px)'], [5.2, 'translate(-60px,11px)'], [5.6, 'translate(-70px,20px)'], [5.9, 'translate(-70px,20px)'], [6.3, 'none']],
      eyeL: [[0, 'none'], [2.4, 'none'], [2.6, 'translate(26px,-12px)'], [3.5, 'translate(26px,-12px)'], [3.7, 'none']],
      eyeR: [[0, 'none'], [2.4, 'none'], [2.6, 'translateY(8px) scaleY(.6)'], [3.5, 'translateY(8px) scaleY(.6)'], [3.54, 'scaleY(.08)'], [3.66, 'none']],
      rb: [[0, 'none'], [4.45, 'none'], [4.55, 'translateY(22px) scale(1.04,.94)'], [4.7, 'translateY(-4px)'], [4.85, 'none'], [5.9, 'none'], [6.05, 'translateY(-10px)'], [6.25, 'none']],
    },
    css: `.sc-fly{left:0;top:0;width:46px;height:36px;animation:sc-fly 6.6s ease-in-out both}
.sc-fly b{display:block;width:100%;height:100%;animation:sc-buzz .07s linear infinite alternate}
@keyframes sc-buzz{from{transform:translate(-2px,1px)}to{transform:translate(2px,-2px)}}
${scKeys('sc-fly', 6.6, [[0, 'translate(-60px,128px)'], [0.5, 'translate(182px,78px)'], [0.8, 'translate(282px,168px)'], [1.1, 'translate(212px,238px)'], [1.5, 'translate(402px,108px)'], [1.8, 'translate(542px,188px)'], [2.1, 'translate(682px,98px)'], [2.4, 'translate(632px,52px)'], [3.55, 'translate(632px,52px)'], [3.8, 'translate(542px,-2px)'], [4.1, 'translate(402px,168px)'], [4.35, 'translate(452px,318px)'], [4.5, 'translate(462px,336px)'], [4.8, 'translate(312px,408px)'], [5.2, 'translate(102px,288px)'], [5.6, 'translate(-80px,368px)']])}`,
  },
};
// Turn each skit's movements into CSS: ".shell[data-skit=car] .rb{animation:...}" plus its keyframes.
// A moment that plays a skit: its length and starting look come from the skit.
const skit = (name, extra) => ({ ms: SKITS[name].ms, eye: SKITS[name].eye, mouth: SKITS[name].mouth, skit: name, ...extra });
const SC_PARTS = { rb: '.rb', eyes: '.eyes', eye: '.eye', eyeL: '.eye.l', eyeR: '.eye.r', mouth: '.mouth' };
const SKIT_STYLE = `.shell{--dir:1}.shell[data-flip]{--dir:-1}
.skit{position:absolute;left:-480px;top:-235px;width:960px;height:470px;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .4s}
.skit.on{opacity:1}
.shell[data-flip] .skit{transform:scaleX(-1)}
.kit{position:absolute;left:0;top:0;width:800px;height:470px;pointer-events:none;opacity:0;transition:opacity .3s}
.kit.on{opacity:1}
[data-robot=buddy] .kit{display:none}
.eye-kit{position:absolute;inset:0;pointer-events:none}
[data-eye=squeeze] .eye g.squeeze{display:block}
.eye.r g.squeeze{transform:scaleX(-1);transform-origin:50px 60px}
.skit i,.kit i,.eye-kit i,.skit b{position:absolute;display:block}
.skit svg,.kit svg,.eye-kit svg{display:block;width:100%;height:100%;overflow:visible}
.sk-bang{width:44px;height:110px;color:var(--eye);opacity:0;animation:sk-bang .9s ease-out both}
.sk-shock{width:800px;height:470px;color:var(--eye);opacity:0;animation:sk-shock .6s ease-out both}
.sk-blush{width:96px;height:40px;border-radius:50%;background:#ff7a9c;opacity:0;animation:sk-blush 1.2s ease-in-out both}
@keyframes sk-bang{0%{opacity:0;transform:translateY(20px) scale(.3)}20%{opacity:1;transform:scale(1.25)}35%{transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
@keyframes sk-shock{0%{opacity:0;transform:scale(.9)}25%{opacity:.9}100%{opacity:0;transform:scale(1.08)}}
@keyframes sk-blush{0%{opacity:0}35%,75%{opacity:.6}100%{opacity:0}}
${Object.entries(SKITS).map(([name, s]) => {
    const secs = (s.ms / 1000).toFixed(1);
    return Object.entries(s.moves || {}).map(([part, how]) => {
      const sel = `.shell[data-skit=${name}] ${SC_PARTS[part]}`;
      if (typeof how === 'string') return `${sel}{animation:${how}}`;
      return `${sel}{animation:sc-${name}-${part} ${secs}s ease-in-out both}\n${scKeys(`sc-${name}-${part}`, s.ms / 1000, how)}`;
    }).join('\n') + '\n' + (s.css || '');
  }).join('\n')}`;
// Idle moments: something small happens every now and then. "ms" is how long it lasts.
const MOMENTS = {
  // real information, shown in its eyes
  clock:    { ms: 5000, eye: 'none', mouth: 'smile', readout: true },
  date:     { ms: 4000, eye: 'none', mouth: 'smile', readout: true },
  temp:     { ms: 5000, eye: 'none', mouth: 'smile', readout: true },
  weather:  { ms: 7000, eye: 'round', mouth: 'smile' },  // the look is replaced by WEATHER_LOOK
  // info cards: the robot steps aside and glances at a card beside it
  cardToday: { ms: 12000, eye: 'round', mouth: 'smile', look: 'card', card: true },
  cardWeek:  { ms: 12000, eye: 'round', mouth: 'smile', look: 'card', card: true },
  cardSoon:  { ms: 12000, eye: 'round', mouth: 'smile', look: 'card', card: true },
  cardVacuum: { ms: 14000, eye: 'round', mouth: 'grin', look: 'card', card: true },
  // just being itself
  wink:     { ms: 2000, eye: 'wink', mouth: 'grin', anim: 'hop' },
  yawn:     { ms: 3600, eye: 'half', mouth: 'o', anim: 'stretch' },
  hum:      { ms: 5000, eye: 'happy', mouth: 'small', props: ['note', 'note'], anim: 'sway', arm: 'dance' },
  giggle:   { ms: 2600, eye: 'happy', mouth: 'grin', anim: 'giggle' },
  heart:    { ms: 2800, eye: 'heart', mouth: 'smile', props: ['heart', 'heart'], anim: 'hop' },
  daydream: { ms: 5000, eye: 'round', mouth: 'small', props: ['star', 'heart', 'star'] },
  sneeze:   skit('sneeze'),
  peek:     skit('peek'),
  fly:      skit('butterfly'),
  star:     { ms: 3000, eye: 'round', mouth: 'o', fx: 'shooting' },
  spin:     { ms: 2000, eye: 'happy', mouth: 'grin', anim: 'spin' },
  nod:      skit('nodoff'),
};
// While music plays it mostly just listens, with a different small move now and then. These keep the album colours.
Object.assign(MOMENTS, {
  vibeBop:    { ms: 4000, eye: 'happy', mouth: 'smile', anim: 'bop' },
  vibeSway:   { ms: 5200, eye: 'closed', mouth: 'small', anim: 'sway' },
  vibeHop:    { ms: 1700, eye: 'happy', mouth: 'grin', anim: 'hop' },
  vibeWink:   { ms: 1800, eye: 'wink', mouth: 'smile' },
  vibeTilt:   { ms: 3400, eye: 'round', mouth: 'smile', anim: 'tilt' },
  vibeHum:    { ms: 4600, eye: 'happy', mouth: 'small', props: ['note', 'note'], anim: 'sway' },
  vibeGlance: { ms: 4000, eye: 'round', mouth: 'small', look: 'drift' },
  vibeStars:  { ms: 2200, eye: 'star', mouth: 'grin', anim: 'hop' },
  vibeHeart:  { ms: 2600, eye: 'heart', mouth: 'smile', props: ['heart'] },
  vibeDrowsy: { ms: 4400, eye: 'half', mouth: 'small', anim: 'nod' },
  vibeDance:  { ms: 3000, eye: 'happy', mouth: 'grin', props: ['note'], anim: 'dance', arm: 'dance' },
});
// Reactions to words in the lyrics, most distinctive first: a line with two themes gets the one higher up.
// They keep the album colours. Each entry is a look and an effect, plus the words that set it off.
const fall = (icon, colour, n = 12, size = 40) => ({ kind: 'fall', icon, colour, n, size });
const rise = (icon, colour, n = 12, size = 40) => ({ kind: 'rise', icon, colour, n, size });
const drift = (icon, colour, n = 7, size = 56) => ({ kind: 'drift', icon, colour, n, size });
const twinkle = (icon, colour, n = 14, size = 30) => ({ kind: 'twinkle', icon, colour, n, size });
const burst = (icon, colour, n = 12, size = 40) => ({ kind: 'burst', icon, colour, n, size });
const sweep = (icon, colour, size = 96) => ({ kind: 'sweep', icon, colour, n: 1, size });
const rings = (colour) => ({ kind: 'rings', colour, n: 3 });
const REACTIONS = [
  ['lyricStorm', { eye: 'round', mouth: 'o', look: 'up', fx: 'storm', tint: '#1b1140', words: 'storm stormy thunder hurricane tornado typhoon tempest' }],
  ['lyricBolt', { ...skit('zap'), words: 'lightning electric electricity shock voltage spark sparks thunderbolt' }],
  ['lyricHeartbreak', { eye: 'half', mouth: 'frown', anim: 'nod', fx: fall('heart', '#6d7c9e', 9, 40), tint: '#26324f', words: 'heartbreak heartbroken heartache breakup broken betray betrayal cheated cheating' }],
  ['lyricFire', { eye: 'star', mouth: 'o', fx: 'embers', anim: 'giggle', tint: '#ff5a1f', words: 'fire flame burn blaze inferno ember ash ashes smoke smoking lava volcano wildfire ignite matches gasoline' }],
  ['lyricHell', { eye: 'angry', mouth: 'grin', fx: rise('bolt', '#ff4d3a', 10, 34), tint: '#a80f0f', words: 'devil hell demon demons satan sinner sin wicked evil' }],
  ['lyricHeaven', { eye: 'happy', mouth: 'smile', look: 'up', fx: twinkle('sparkle', '#fff4b8', 14, 34), tint: '#fff4cc', words: 'heaven angel angels halo holy pray prayer praying amen god lord church miracle blessed soul' }],
  ['lyricGhost', { ...skit('ghost', { tint: '#10152e' }), words: 'ghost ghosts haunt haunted spirit spooky graveyard grave cemetery zombie vampire witch monster monsters' }],
  ['lyricDeath', { eye: 'x', mouth: 'flat', anim: 'nod', fx: drift('ghost', '#b9c2d8', 3, 64), tint: '#0a0a12', words: 'death dead die dying funeral coffin dyin kill killer murder bleed bleeding blood' }],
  ['lyricAngry', { eye: 'angry', mouth: 'frown', anim: 'shake', fx: burst('bolt', '#ff5a3c', 9, 38), tint: '#b3121d', words: 'angry anger rage furious mad hate hated fight fighting war battle enemy enemies revenge punch bullet bullets gun guns' }],
  ['lyricScream', { eye: 'round', mouth: 'grin', anim: 'shake', fx: burst('bang', '#ffffff', 8, 52), words: 'scream screaming shout shouting yell yelling loud louder roar howl' }],
  ['lyricFear', { eye: 'odd', mouth: 'wiggle', anim: 'shiver', tint: '#20153a', fx: twinkle('bang', '#ffffff', 5, 40), words: 'scared afraid fear frightened terrified panic nightmare nightmares trembling shaking danger dangerous' }],
  ['lyricCrazy', { eye: 'spiral', mouth: 'wiggle', anim: 'spin', fx: burst('star', '#ffd34d', 10, 34), words: 'crazy insane madness dizzy spinning spin wild psycho lunatic drunk hypnotized' }],
  ['lyricSad', { eye: 'half', mouth: 'frown', anim: 'nod', fx: fall('drop', '#8ec5ff', 8, 28), tint: '#1e2a4a', words: 'cry tear sad sadness lonely alone goodbye sorrow grief weep weeping pain hurt hurting sorry regret miss missing empty misery depressed lost' }],
  ['lyricRain', { ...skit('umbrella', { tint: '#16314f', endings: RAIN_ENDINGS }), words: 'rain rainy raindrop drizzle downpour umbrella puddle monsoon wet soaked' }],
  ['lyricSnow', { eye: 'happy', mouth: 'o', look: 'up', fx: fall('flake', '#ffffff', 13, 34), tint: '#bcdcff', words: 'snow snowflake snowman winter december christmas xmas sleigh santa' }],
  ['lyricCold', { ...skit('cold', { tint: '#bcdcff' }), words: 'cold chill freeze freezing frozen ice icy frost blizzard shiver' }],
  ['lyricOcean', { eye: 'round', mouth: 'smile', fx: rise('bubble', '#bfe9ff', 13, 40), tint: '#0a6ea8', words: 'ocean sea wave tide water river lake drown drowning swim swimming sail sailing boat ship shore beach island sailor mermaid deep underwater' }],
  ['lyricFish', { eye: 'round', mouth: 'o', fx: sweep('fish', '#ffb15c', 110), tint: '#0a6ea8', words: 'fish fishing shark whale dolphin' }],
  ['lyricGold', { eye: 'coin', mouth: 'grin', fx: twinkle('sparkle', '#ffd34d', 15, 34), tint: '#a97400', words: 'gold golden diamond diamonds jewel jewels silver pearl pearls ruby crystal treasure shiny glitter glitters sparkle sparkling' }],
  ['lyricMoney', { eye: 'coin', mouth: 'grin', anim: 'hop', fx: fall('coin', '#ffd34d', 14, 38), words: 'money cash dollar dollars pound pounds rich wealth bank paid pay paycheck million millions billion fortune wallet coin casino gamble jackpot' }],
  ['lyricCrown', { eye: 'star', mouth: 'smile', fx: burst('crown', '#ffd34d', 8, 46), words: 'king queen prince princess crown throne royal kingdom empire majesty castle' }],
  ['lyricParty', { eye: 'happy', mouth: 'grin', anim: 'dance', arm: 'dance', fx: 'confetti', words: 'party celebrate celebration confetti fiesta carnival festival champagne cheers' }],
  ['lyricBirthday', { eye: 'happy', mouth: 'grin', anim: 'bounce', fx: rise('balloon', '#ff7aa8', 9, 56), words: 'birthday balloon balloons cake candle candles gift gifts present presents surprise' }],
  ['lyricDance', { eye: 'happy', mouth: 'grin', anim: 'dance', arm: 'dance', fx: drift('note', '#ffffff', 6, 44), words: 'dance dancer groove disco boogie shake twist tango waltz ballroom jive salsa moves rhythm' }],
  ['lyricMusic', { eye: 'happy', mouth: 'small', anim: 'sway', fx: drift('note', '#ffffff', 7, 44), words: 'music song sing singing singer melody tune guitar piano violin band radio record jukebox chorus harmony lullaby concert stage microphone mic' }],
  ['lyricBeat', { eye: 'round', mouth: 'grin', anim: 'pulse', fx: rings('#ffffff'), words: 'beat beats drum drums bass heartbeat pulse pounding bang boom' }],
  ['lyricSun', { eye: 'happy', mouth: 'grin', fx: 'sun', anim: 'sway', tint: '#ffb300', words: 'sun sunny sunshine summer sunlight sunrise sunset dawn daylight tan heatwave' }],
  ['lyricRainbow', { eye: 'star', mouth: 'grin', fx: rise('rainbow', '#ffffff', 5, 110), tint: '#ff5fa2', words: 'rainbow rainbows colour colours color colors unicorn' }],
  ['lyricHot', { ...skit('hot', { tint: '#ff4b1f' }), words: 'hot heat sweat sweating sweaty boiling desert steam' }],
  ['lyricStars', { eye: 'star', mouth: 'smile', look: 'up', fx: twinkle('star', '#ffffff', 16, 26), tint: '#0a0f3c', words: 'star starlight galaxy universe cosmic constellation heavens' }],
  ['lyricMoon', { eye: 'round', mouth: 'small', look: 'up', props: ['moon'], fx: 'night', tint: '#0a0f3c', words: 'moon moonlight midnight night tonight lunar werewolf' }],
  ['lyricSpace', { eye: 'round', mouth: 'o', fx: sweep('rocket', '#ffffff', 120), tint: '#050a2e', words: 'rocket space astronaut planet planets mars saturn orbit alien aliens spaceship' }],
  ['lyricShooting', { ms: 2400, eye: 'round', mouth: 'o', fx: 'shooting', words: 'wish wishes wishing comet meteor shooting' }],
  ['lyricWind', { eye: 'half', mouth: 'wiggle', fx: 'wind', anim: 'tilt', words: 'wind windy breeze blow blowing gust whisper whispers' }],
  ['lyricFly', { ...skit('butterfly'), words: 'butterfly butterflies wing flutter' }],
  ['lyricBirds', { eye: 'happy', mouth: 'small', look: 'up', fx: drift('bird', '#ffffff', 7, 54), words: 'bird fly flying flew sparrow eagle dove crow feather feathers free freedom sky skies cloud clouds' }],
  ['lyricPlane', { eye: 'round', mouth: 'smile', fx: sweep('plane', '#ffffff', 110), words: 'plane airplane jet airport pilot flight' }],
  ['lyricCar', { ...skit('car'), words: 'car cars drive driving driver highway road roads motorway cadillac engine truck speed racing race freeway ride riding' }],
  ['lyricTrain', { ...skit('train'), words: 'train trains railway station bus taxi journey travel travelling' }],
  ['lyricSpring', { eye: 'happy', mouth: 'smile', fx: fall('flower', '#ff9ecb', 12, 36), tint: '#58a94a', words: 'flower flowers rose roses spring garden petal petals daisy lily tulip bloom blossom sunflower' }],
  ['lyricAutumn', { eye: 'round', mouth: 'small', fx: fall('leaf', '#e88a2c', 12, 38), tint: '#7a3d0a', words: 'autumn leaf leaves october september harvest' }],
  ['lyricForest', { eye: 'round', mouth: 'smile', fx: twinkle('tree', '#3ea76a', 10, 60), tint: '#134b2a', words: 'tree trees forest woods jungle mountain mountains valley hill nature wilderness' }],
  ['lyricPets', { eye: 'happy', mouth: 'smile', anim: 'bounce', fx: rise('paw', '#ffffff', 9, 40), words: 'dog dogs puppy cat cats kitten kitty animal animals horse pony rabbit bunny tiger lion bear wolf wolves' }],
  ['lyricDrink', { eye: 'half', mouth: 'grin', anim: 'wobble', fx: rise('bubble', '#ffe6a3', 12, 30), tint: '#a86a00', words: 'beer wine whiskey vodka tequila rum cocktail bar pub bartender bottle shot shots toast' }],
  ['lyricGlass', { eye: 'happy', mouth: 'smile', fx: burst('glass', '#ffffff', 7, 44), words: 'glass cup drink drinking drunken sip' }],
  ['lyricCoffee', { eye: 'round', mouth: 'small', anim: 'shiver', fx: rise('cup', '#d8b48a', 6, 44), words: 'coffee tea caffeine breakfast morning' }],
  ['lyricPhone', { eye: 'round', mouth: 'smile', fx: burst('phone', '#ffffff', 6, 44), anim: 'shiver', words: 'phone call calling ring ringing telephone text message voicemail dial' }],
  ['lyricClock', { eye: 'round', mouth: 'flat', props: ['clock'], fx: twinkle('clock', '#ffffff', 8, 40), words: 'clock tick ticking hour hours minute minutes yesterday tomorrow forever waiting late' }],
  ['lyricKey', { eye: 'round', mouth: 'smile', fx: burst('key', '#ffd34d', 6, 44), words: 'key keys lock locked door doors open opened opening gate' }],
  ['lyricFood', { eye: 'happy', mouth: 'grin', anim: 'bounce', fx: burst('sparkle', '#ffd34d', 8, 30), words: 'sugar sweet candy cherry chocolate pizza eat eating hungry starving feast' }],
  ['lyricLight', { eye: 'star', mouth: 'smile', fx: rings('#ffffff'), tint: '#ffffff', words: 'light lights shine shining glow glowing bright brighter spotlight neon flashlight beam fireworks firework' }],
  ['lyricDark', { eye: 'half', mouth: 'flat', tint: '#000000', fx: twinkle('sparkle', '#8f96b8', 6, 18), words: 'dark darkness shadow shadows black blackout gloom' }],
  ['lyricMagic', { eye: 'star', mouth: 'o', anim: 'pulse', fx: burst('sparkle', '#c9a7ff', 13, 34), tint: '#5a2ea6', words: 'magic spell spells wizard magical fairy fairies mystery enchanted dreamer' }],
  ['lyricLove', { eye: 'heart', mouth: 'smile', props: ['heart', 'heart'], anim: 'hop', fx: rise('heart', '#ff6f91', 11, 40), tint: '#c93a63', words: 'love lover heart kiss darling sweetheart honey romance romantic valentine embrace hug adore cherish beloved wedding marry married bride soulmate girlfriend boyfriend' }],
  ['lyricHappy', { eye: 'happy', mouth: 'grin', anim: 'hop', fx: burst('star', '#ffffff', 10, 30), words: 'happy happiness smile laugh joy joyful glad cheerful lucky fun funny delight paradise perfect beautiful wonderful amazing' }],
  ['lyricWow', { eye: 'round', mouth: 'o', anim: 'jump', fx: burst('bang', '#ffd34d', 5, 50), words: 'wow whoa woah omg unbelievable incredible' }],
  ['lyricQuestion', { eye: 'odd', mouth: 'wiggle', anim: 'tilt', props: ['question', 'question'], fx: twinkle('question', '#ffffff', 6, 36), words: 'why wonder wondering confused question answer maybe understand' }],
  ['lyricSleep', { eye: 'closed', mouth: 'small', anim: 'nod', props: ['z', 'z'], tint: '#0a0f3c', fx: rise('z', '#c9d4ff', 6, 34), words: 'sleep asleep dream dreaming tired bed pillow goodnight yawn sleepwalk' }],
  ['lyricRun', { eye: 'round', mouth: 'o', anim: 'shake', fx: drift('sparkle', '#ffffff', 6, 30), words: 'run running chase chasing escape hurry runaway' }],
  ['lyricJump', { eye: 'happy', mouth: 'grin', anim: 'jump', fx: burst('star', '#ffd34d', 9, 30), words: 'jump jumping leap bounce bouncing hop' }],
  ['lyricHigh', { eye: 'star', mouth: 'smile', look: 'up', fx: rise('star', '#ffffff', 9, 30), words: 'high higher highest rise rising climb climbing heights above soar soaring' }],
  ['lyricFalling', { eye: 'odd', mouth: 'o', anim: 'wobble', fx: fall('star', '#ffffff', 9, 30), words: 'fall fallen falling crash crashing tumble collapse sinking gravity' }],
  ['lyricHello', { eye: 'happy', mouth: 'smile', anim: 'hop', arm: 'wave', fx: burst('sparkle', '#ffffff', 8, 28), words: 'hello hey hi welcome hiya' }],
  ['lyricHome', { eye: 'happy', mouth: 'small', anim: 'sway', tint: '#b86b2c', fx: rise('heart', '#ffd9a8', 6, 30), words: 'home house family mother father mama papa daddy mum brother sister friend friends together' }],
  ['lyricCity', { eye: 'round', mouth: 'smile', fx: twinkle('sparkle', '#ffe08a', 12, 22), words: 'city cities town street streets downtown london paris york tokyo broadway' }],
];
for (const [name, reaction] of REACTIONS) {
  const { words, ...look } = reaction;
  MOMENTS[name] = { ms: 3200, ...look };
}
// Things happening around the home, all from what Home Assistant already knows.
Object.assign(MOMENTS, {
  homeArrive:  { ms: 4400, eye: 'happy', mouth: 'grin', anim: 'hop', arm: 'wave', tint: '#d9672e', fx: rise('heart', '#ffc2d1', 8, 32) },
  homeHeat:    { ms: 4000, eye: 'happy', mouth: 'smile', anim: 'sway', tint: '#ff7a2e', fx: 'embers' },
  homeMorning: { ms: 4400, eye: 'half', mouth: 'o', anim: 'stretch', tint: '#ffb300', fx: 'sun' },
  homeYawn:    { ms: 3600, eye: 'half', mouth: 'o', anim: 'stretch', tint: '#1a1650' },
  homeDrowsy:  { ms: 4200, eye: 'half', mouth: 'small', anim: 'nod', props: ['z'], tint: '#1a1650' },
  homeNodOff:  { ms: 4600, eye: 'closed', mouth: 'small', anim: 'nod', props: ['z', 'z'], tint: '#0a0f3c', fx: rise('z', '#c9d4ff', 5, 32) },
});
const HOME_WAIT_MS = 60000, MORNING_WAIT_MS = 600000, ARRIVE_GROUP_MS = 2000;
// A location blip isn't an arrival: they must have been away a while, and aren't greeted twice in a row.
const ARRIVE_AWAY_MS = 300000, ARRIVE_GAP_MS = 1800000;
// Thermostats switch on and off all the time, so only mention it now and then.
const HEAT_GAP_MS = 1800000;
const WIND_DOWN_MINS = 30, NODDING_MINS = 15;
const WIND_DOWN = ['homeYawn', 'homeDrowsy'], NODDING = ['homeDrowsy', 'homeNodOff'];
// More idle moments: each has its own background colour. "track" means its eyes follow what's crossing the screen.
const IDLES = [
  // things going past
  ['idlePlane', { bg: '#2a6f97', ms: 3400, eye: 'round', mouth: 'o', track: true, fx: sweep('plane', '#ffffff', 110) }],
  ['idleRocket', { bg: '#1b1f5e', ms: 3400, eye: 'star', mouth: 'o', track: true, fx: sweep('rocket', '#ffffff', 120) }],
  ['idleFish', { bg: '#0a7a8c', ms: 3400, eye: 'round', mouth: 'small', track: true, fx: sweep('fish', '#ffb15c', 110) }],
  ['idleCar', { bg: '#8a3b12', ...skit('car') }],
  ['idleBirds', { bg: '#38709c', ms: 5000, eye: 'happy', mouth: 'small', look: 'drift', fx: drift('bird', '#ffffff', 7, 54) }],
  ['idleSea', { bg: '#0a5f8a', ms: 5000, eye: 'round', mouth: 'smile', anim: 'sway', fx: drift('wave', '#bfe9ff', 6, 70) }],
  ['idleGhost', { bg: '#241a45', ...skit('ghost') }],
  // weather and seasons
  ['idleSnow', { bg: '#3a6ea5', ms: 4600, eye: 'happy', mouth: 'o', look: 'up', fx: fall('flake', '#ffffff', 13, 34) }],
  ['idleLeaves', { bg: '#8a4b16', ms: 4600, eye: 'round', mouth: 'small', anim: 'sway', fx: fall('leaf', '#f0a33c', 12, 38) }],
  ['idlePetals', { bg: '#a8447a', ms: 4600, eye: 'happy', mouth: 'smile', fx: fall('flower', '#ffd1e6', 12, 34) }],
  ['idleCold', { bg: '#2b6b9e', ...skit('cold') }],
  ['idleHot', { bg: '#b8481f', ...skit('hot') }],
  ['idleRainbow', { bg: '#5b2a9d', ms: 4400, eye: 'star', mouth: 'grin', fx: rise('rainbow', '#ffffff', 5, 110) }],
  ['idleForest', { bg: '#14532d', ms: 4400, eye: 'happy', mouth: 'small', fx: twinkle('tree', '#4ec27f', 10, 60) }],
  ['idleStarry', { bg: '#0b1040', ms: 4800, eye: 'star', mouth: 'smile', look: 'up', fx: twinkle('star', '#ffffff', 16, 26) }],
  // things floating and popping
  ['idleBubbles', { bg: '#0f6e9c', ms: 4400, eye: 'round', mouth: 'o', look: 'up', fx: rise('bubble', '#bfe9ff', 13, 40) }],
  ['idleBalloons', { bg: '#7c2d91', ms: 4400, eye: 'happy', mouth: 'grin', look: 'up', fx: rise('balloon', '#ff9ec4', 9, 56) }],
  ['idleConfetti', { bg: '#3d2a8c', ms: 3800, eye: 'happy', mouth: 'grin', anim: 'dance', arm: 'dance', fx: 'confetti' }],
  ['idleGift', { bg: '#a32a4a', ms: 3000, eye: 'star', mouth: 'grin', anim: 'hop', fx: burst('gift', '#ffe08a', 7, 46) }],
  ['idleBloom', { bg: '#2f7d4f', ms: 3000, eye: 'star', mouth: 'grin', anim: 'pulse', fx: burst('flower', '#ffc2dc', 10, 42) }],
  ['idleCrown', { bg: '#6d2a8f', ms: 3000, eye: 'star', mouth: 'smile', fx: burst('crown', '#ffd34d', 8, 46) }],
  ['idleSparkle', { bg: '#4c2a9c', ms: 3000, eye: 'star', mouth: 'o', anim: 'pulse', fx: burst('sparkle', '#ffe08a', 13, 34) }],
  ['idleMagic', { bg: '#4a1f8f', ms: 4000, eye: 'star', mouth: 'o', fx: rise('sparkle', '#d9c2ff', 11, 32) }],
  ['idleCoins', { bg: '#7a5a00', ms: 3800, eye: 'coin', mouth: 'grin', anim: 'hop', fx: fall('coin', '#ffd34d', 14, 38) }],
  ['idlePaws', { bg: '#6b4226', ms: 3800, eye: 'round', mouth: 'smile', anim: 'bounce', fx: rise('paw', '#f3dcc4', 9, 40) }],
  // moods and little bits of business
  ['idleIdea', { bg: '#8a5f00', ms: 3200, eye: 'star', mouth: 'grin', props: ['light'], anim: 'hop', fx: rings('#ffe08a') }],
  ['idleQuestion', { bg: '#2c5f7c', ms: 3400, eye: 'odd', mouth: 'wiggle', anim: 'tilt', props: ['question'], fx: twinkle('question', '#ffffff', 6, 36) }],
  ['idleBoo', { bg: '#4a1d6b', ms: 2800, eye: 'round', mouth: 'o', anim: 'jump', fx: burst('bang', '#ffd34d', 6, 50) }],
  ['idleDizzy', { bg: '#8c2f6d', ms: 3200, eye: 'spiral', mouth: 'wiggle', anim: 'roll', fx: burst('star', '#ffd34d', 10, 34) }],
  ['idleGrumpy', { bg: '#8f1f1f', ms: 2600, eye: 'angry', mouth: 'frown', anim: 'shake' }],
  ['idleShy', { bg: '#b0476a', ms: 3600, eye: 'happy', mouth: 'small', anim: 'shy', props: ['heart'] }],
  ['idleCoffee', { bg: '#5c3a1e', ms: 3800, eye: 'half', mouth: 'small', fx: rise('cup', '#d8b48a', 6, 44) }],
  ['idlePhone', { bg: '#24506b', ms: 2800, eye: 'round', mouth: 'smile', anim: 'shiver', fx: burst('phone', '#ffffff', 6, 44) }],
  ['idleClock', { bg: '#2a3f6e', ms: 3400, eye: 'round', mouth: 'flat', props: ['clock'], fx: twinkle('clock', '#ffffff', 8, 40) }],
  ['idleBeat', { bg: '#7a1f5a', ms: 3200, eye: 'round', mouth: 'grin', anim: 'pulse', fx: rings('#ffffff') }],
  // the whole face moving about
  ['idleSquish', { bg: '#a85400', ms: 2200, eye: 'happy', mouth: 'grin', anim: 'squish' }],
  ['idleBounce', { bg: '#0f7a5a', ms: 3000, eye: 'happy', mouth: 'grin', anim: 'bounce' }],
  ['idleJump', { bg: '#a63a8a', ms: 2800, eye: 'happy', mouth: 'grin', anim: 'jump', fx: burst('star', '#ffffff', 8, 30) }],
  ['idleWobble', { bg: '#6a3fb5', ms: 3200, eye: 'odd', mouth: 'wiggle', anim: 'wobble' }],
  ['idleRoll', { bg: '#1e7a8c', ms: 2600, eye: 'happy', mouth: 'grin', anim: 'roll' }],
  ['idleHide', { bg: '#3b3f8f', ms: 3600, eye: 'round', mouth: 'small', anim: 'hide' }],
  ['idleDrop', { bg: '#7a2e8f', ms: 3400, eye: 'round', mouth: 'o', anim: 'drop' }],
  ['idlePuff', { bg: '#bd3a58', ms: 2800, eye: 'round', mouth: 'o', anim: 'puff' }],
  ['idleSidestep', { bg: '#2f6f4f', ms: 3000, eye: 'happy', mouth: 'smile', anim: 'sidestep' }],
  ['idleFloat', { bg: '#1f4f8f', ms: 4800, eye: 'closed', mouth: 'small', anim: 'floaty', props: ['z'] }],
  // little stories
  ['idleTrain', { bg: '#3d5a80', ...skit('train') }],
  ['idleRain', { bg: '#35627f', ...skit('umbrella', { endings: RAIN_ENDINGS }) }],
  ['idleHiccup', { bg: '#2e7d6b', ...skit('hiccup') }],
  ['idleStartle', { bg: '#9c3d6e', ...skit('startle') }],
  ['idleFlyChase', { bg: '#5a6e1e', ...skit('flychase') }],
];
for (const [name, { bg, track, ...look }] of IDLES) MOMENTS[name] = look;
const IDLE_STYLE = IDLES.map(([name, { bg, track }]) => `[data-moment=${name}]{--bg:${bg};--eye:#fff;--glow:#fff}${track ? `[data-moment=${name}] .eyes{animation:track-sweep 2.8s ease-in-out both}` : ''}`).join('\n');
const LYRIC_WORDS = new Map();
REACTIONS.forEach(([name, reaction], rank) => {
  for (const word of reaction.words.split(' ')) {
    if (!LYRIC_WORDS.has(word)) LYRIC_WORDS.set(word, { name, rank });
  }
});
const NOT_WORDS = /^(not|no|never|dont|don't|don’t|cant|can't|can’t|wont|won't|won’t|without|aint|ain't|ain’t)$/;
const cleanWord = (word) => String(word).toLowerCase().replace(/’/g, "'").replace(/^[^a-z']+|[^a-z']+$/g, '').replace(/^'+|'+$/g, '');
// Finds a word in the table, allowing for "dancin", "fires", "burned", "running" and "love's", without
// mistaking "hoping" for "hop" or "caring" for "car": those short words would be spelled "hopping" and "carring".
const canDropEnding = (stem) => stem.length > 4 || !/[^aeiou][aeiou][^aeiouwxy]$/.test(stem);
const LOOKS_LIKE_ONLY = /^(bulletin|latin|rosin|tannin|bearing|spacing|winding|gated|dogged)$/;
function findLyricWord(word) {
  if (!word || LOOKS_LIKE_ONLY.test(word)) return null;
  if (LYRIC_WORDS.has(word)) return LYRIC_WORDS.get(word);
  const base = word.replace(/'s$/, '');
  const options = [base];
  const whole = base.length > 4 && base.endsWith('in') ? `${base}g` : base;
  if (whole !== base) options.push(whole);
  if (whole.endsWith('ies') || whole.endsWith('ied')) options.push(`${whole.slice(0, -3)}y`);
  if (/(s|x|z|ch|sh|o)es$/.test(whole)) options.push(whole.slice(0, -2));
  if (whole.endsWith('s') && !whole.endsWith('ss')) options.push(whole.slice(0, -1));
  const ending = whole.endsWith('ing') ? 3 : whole.endsWith('ed') ? 2 : 0;
  if (ending) {
    const stem = whole.slice(0, -ending);
    if (canDropEnding(stem)) options.push(stem);
    options.push(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) options.push(stem.slice(0, -1));
  }
  for (const option of options) {
    if (option.length > 2 && LYRIC_WORDS.has(option)) return LYRIC_WORDS.get(option);
  }
  return null;
}
const LYRIC_GAP_MS = 5000, LYRIC_SAME_GAP_MS = 15000;
const MUSIC_MOMENTS = ['vibeBop', 'vibeSway', 'vibeHop', 'vibeWink', 'vibeTilt', 'vibeHum', 'vibeGlance', 'vibeStars', 'vibeHeart', 'vibeDrowsy', 'vibeDance'];
const INFO_MOMENTS = ['clock', 'weather', 'temp', 'date'];
const CARDS = ['cardToday', 'cardWeek', 'cardSoon', 'cardVacuum'];
// A vacuum's state, as words. Busy ones (cleaning, going home) light their menu button.
const VAC_WORDS = { cleaning: 'Cleaning', docked: 'Docked', returning: 'Going home', paused: 'Paused', idle: 'Idle', error: 'Problem' };
// What TapoVac's Status sensor says, in plain words. Home Assistant's own state is just "docked" for all the dock's jobs.
const VAC_STATUS_WORDS = {
  'emptying dust': 'Emptying the bin', 'washing mop': 'Washing the mop', 'drying mop': 'Drying the mop',
  'attaching mop': 'Attaching the mop', 'removing mop': 'Removing the mop', 'cutting hair': 'Cutting tangled hair',
  charging: 'Charging', charged: 'Docked', mapping: 'Mapping', exploring: 'Exploring', 'going to point': 'Going to a spot',
  'remote control': 'Remote control', sleeping: 'Asleep', standby: 'Idle',
};
// The dock's short jobs during or around a clean (the Omni goes back mid-clean to wash its mop). Drying the mop is
// left out: it takes hours.
const VAC_DOCK_JOBS = new Set(['emptying dust', 'washing mop', 'attaching mop', 'removing mop', 'cutting hair']);
const VW_NP_GAP = 16; // gap between the side map and the now-playing bar
const VAC_MAP_MS = 6000, VAC_MAP_IDLE_MS = 60000; // how often the map picture refreshes: while cleaning, and otherwise
const MAP_JOIN = 3; // map cropping: shapes this many cells apart (out of 120 across) count as one, so door gaps don't split rooms off
const ROBOT_RIM = [51, 181, 238]; // the blue rim TapoVac draws round the robot on its map
const FOLLOW_ROBOT_PX = 44;       // the close-up that follows the robot: how big the robot looks, in screen pixels
const FOLLOW_ZOOM_MAX = 6;        // ...never enlarged more than this
const FOLLOW_GLIDE_MS = 700;      // ...and how long it takes to glide to where the robot has moved
const MAP_KEEP_SHARE = 0.08; // map cropping: shapes smaller than this share of the house (labels, legends) are left out
const CARD_HOURS = 4, CARD_DAYS = 4, CARD_SOON = 3, CARD_SOON_HOURS = 36;
const PLAY_MOMENTS = ['wink', 'yawn', 'hum', 'giggle', 'heart', 'daydream', 'sneeze', 'peek', 'fly', 'star', 'spin', 'nod', ...IDLES.map(([name]) => name)];
// How it looks while the real weather happens around it.
const WEATHER_LOOK = {
  rain:  { eye: 'round', mouth: 'flat', look: 'up' },
  storm: { eye: 'round', mouth: 'o', look: 'up' },
  snow:  { eye: 'happy', mouth: 'o', look: 'up' },
  sun:   { eye: 'happy', mouth: 'grin', anim: 'sway' },
  cloud: { eye: 'round', mouth: 'smile', look: 'drift' },
  fog:   { eye: 'half', mouth: 'small' },
  wind:  { eye: 'half', mouth: 'wiggle', anim: 'tilt' },
  night: { eye: 'round', mouth: 'small', look: 'up' },
};
const WEATHER_KIND = {
  rainy: 'rain', pouring: 'rain', hail: 'rain', 'lightning-rainy': 'storm', lightning: 'storm',
  snowy: 'snow', 'snowy-rainy': 'snow', sunny: 'sun', cloudy: 'cloud', partlycloudy: 'cloud',
  fog: 'fog', windy: 'wind', 'windy-variant': 'wind', 'clear-night': 'night',
};
const DEMO = ['idle', 'listening', 'thinking', 'speaking', 'happy', 'wave', 'love', 'laugh', 'bright', 'dim', 'notes', 'confused', 'sleepy', 'muted', 'offline', 'alarm', ...INFO_MOMENTS, ...PLAY_MOMENTS];
const SWAP_MS = 140, BLEND_MS = 320, WASH_MS = 700, FX_FADE_MS = 500;
const MEDIA_NEEDS = { media_previous_track: 16, media_next_track: 32, media_play_pause: 1 | 16384 };
const SEEK_FEATURE = 2, NP_PAUSE_KEEP_MS = 300000;
const LYRIC_TICK_MS = 60, LYRIC_FADE_MS = 80, LINE_LEAD_S = 0.35, WORD_LEAD_S = 0.04, LYRIC_STEP_S = 0.1, LYRIC_ADJUST_KEY = 'echo-robot-lyrics-timing';
// Radio: its delay is bigger and less certain, so its timing is set separately, in bigger steps.
// What some streams send when there's no song or programme name.
const RADIO_FILLER = /^\s*(no desc(ription)?|unknown|untitled|n\/?a|-+|\.+)\s*$/i;
// Radio lyrics: when to ask the server to listen after the station changes song, and how often to try again.
// The radio's starting delay, matching radio_lyrics_offset. Timing saved against an earlier default is converted
// once, so what you set stays where it was. -3: the Echo plays about 3.5 seconds behind what the server can hear
// (Music Assistant's and the Echo's own buffering), measured once the station's catch-up burst was matched.
const RADIO_DEFAULT_S = -3, RADIO_DEFAULT_KEY = 'echo-robot-lyrics-timing-radio-default';
const RADIO_JOIN_MS = 20000;
const DOORBELL_MS = 90000; // how long the doorbell's camera stays up (longer if it rings again)
const DOOR_VISITOR_EARLY_MS = 30000; // a name the add-on found for a ring this much before the one showing is an earlier visit
const DOOR_SOUND_TRY_MS = 30000; // how long to keep trying to turn the doorbell's sound on while the video connects
const DOOR_SOUND_WAIT_MS = 600;  // after unmuting: a video stopped by then means the screen won't play sound untapped
const DARK_AFTER_MS = 60000, LIGHT_AFTER_MS = 15000; // how long the room must stay dark, or light, to switch
const FX_WITH_WORDS = 0.6; // share of an effect's pieces drawn while word-by-word lyrics show
const RADIO_SYNC_FIRST_MS = 12000, RADIO_SYNC_RETRY_MS = 20000, RADIO_SYNC_TRIES = 4, RADIO_CHECK_MS = 30000;
// Stations that send their own clock (Heart, and Global's others) say when the song began: asked for straight away.
const RADIO_SYNC_QUICK_MS = 3000, RADIO_CHECK_STATION_MS = 3000;
// Then listening again and again while the song plays (each listen takes about 20 seconds): radio edits often cut part
// of a song, which moves the lyrics on from there. A listen that disagrees is checked again straight away, and the
// lyrics are hidden meanwhile if it says they're well out, rather than showing the wrong words.
const RADIO_FOLLOW_MS = 10000, RADIO_FOLLOWS = 14, RADIO_CONFIRM_MS = 4000, RADIO_UNSURE_MS = 3000;
const RADIO_STEP_S = 0.5, RADIO_ADJUST_LIMIT_S = 15, LYRIC_ADJUST_LIMIT_S = 3, SONG_ADJUST_SAVE_MS = 1500;
const SPEECH_BASE_S = 0.52, SPEECH_PER_CHAR_S = 0.0387, SPEECH_NO_REPLY_S = 2.5, SPEECH_MAX_S = 8, SPEECH_READY_S = 0.15, SPEECH_REMEMBERED_CHARS = 40;
const HEAT_SEND_MS = 900, HEAT_SETTLE_MS = 6000;
const SCENE_DONE_MS = 1600;  // how long a scene button shows its tick after running
// Holding a light button opens its page. While you drag, the bulb is told at most this often; the new number
// shows until Home Assistant catches up, or this long.
const LIGHT_HOLD_MS = 550, LIGHT_SEND_MS = 350, LIGHT_SETTLE_MS = 5000;
const LIGHT_TEMPS = [['Warm', 2700, '#ffb35c'], ['Daylight', 4000, '#fff1d6'], ['Cool', 6000, '#cfe3ff']];
const LIGHT_HUES = [['Red', 0], ['Orange', 28], ['Green', 125], ['Blue', 220], ['Purple', 275], ['Pink', 320]];
const COLOUR_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
const MENU_LAYOUTS = ['heat_top', 'grid', 'split', 'round'];
const LIGHT_COLOURS = [['#ffd34d', 'Yellow'], ['#7fd8ff', 'Sky blue'], ['#b8f28c', 'Mint'], ['#f5a3ff', 'Pink'], ['#ffffff', 'White']];
const WEATHER_WORDS = { 'clear-night': 'Clear', cloudy: 'Cloudy', exceptional: 'Unusual', fog: 'Fog', hail: 'Hail', lightning: 'Storms', 'lightning-rainy': 'Storms', partlycloudy: 'Partly cloudy', pouring: 'Pouring', rainy: 'Rain', snowy: 'Snow', 'snowy-rainy': 'Sleet', sunny: 'Sunny', windy: 'Windy', 'windy-variant': 'Windy' };
const SETTINGS_KEY = 'echo-robot-settings', BRIGHT_MIN = 0.1, BRIGHT_RESTORE_MS = 4000, BRIGHT_SEND_MS = 120, SETTINGS_MS = 60000;
const ALERT_POP_MS = 4000, ALERT_OPEN_MS = 8000, ALERT_DONE_MS = 60000, ALERT_SOON_MS = 3600000, ALERT_SNOOZE_MIN = 10, ALERT_GONE_MS = 400, CHIME_EVERY_MS = 2500;
// An alarm waits out of sight until its light starts coming up, then sits in the corner; snoozing gives 9 minutes.
const ALARM_SOON_MS = 15 * 60000, ALARM_SNOOZE_MIN = 9;
const DOCK_TOP = 84, DOCK_GAP = 8, DOCK_RIGHT = 22, POP_TOP = 16;
const TALK_HOLD_MS = 700, TALK_LISTEN_MS = 15000, TALK_START_MS = 10000, TALK_CONVERSATION_MS = 300000, TALK_FAIL_SHOW_MS = 3000;
const LINGER_MS = 5000, WORDS_AFTER_MS = 8000, CONTROLS_MS = 25000, POLL_MS = 450, VOICE_LIMIT_MS = 45000, HOLD_MS = 1200;

// ---- colours from album art ----
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
/** Picks a background and an eye colour from a cover's pixels (RGBA), always readable against white text. */
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
    // Favour colourful areas; a plain white or black border shouldn't win just for being large.
    return { c, sat, score: b.n * (0.12 + sat) * (light < 0.08 || light > 0.94 ? 0.25 : 1) };
  }).sort((x, y) => y.score - x.score);
  if (!colours.length) return null;
  const base = colours[0];
  // Bright covers stay bright, with dark eyes and text, rather than being dragged down to something muddy.
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

// ---- lyrics: fetched by the echo_lyrics add-on on the server, parsed and shown here as plain text ----
function lyricTime(value) {
  if (value == null || value === '') return NaN;
  const text = String(value).trim();
  if (text.endsWith('s')) return parseFloat(text);
  return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}
function tidyLines(lines) {
  return lines.filter((l) => Number.isFinite(l.b) && l.t).sort((x, y) => x.b - y.b).slice(0, 1500)
    .map((l) => ({ ...l, t: l.t.slice(0, 300) }));
}
/** Better Lyrics format (TTML), which times each word. Background vocals are left out so one clear line shows at a time. */
function parseTtml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const isBackground = (el) => el.getAttribute('ttm:role') === 'x-bg';
  return tidyLines([...doc.getElementsByTagNameNS('*', 'p')].map((p) => {
    const words = [];
    let text = '', allTimed = true;
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          text += child.nodeValue;
          // Spaces sit between the words, so they go on the end of the word before.
          if (words.length) words[words.length - 1].t += child.nodeValue;
          else if (child.nodeValue.trim()) allTimed = false;
        } else if (child.nodeType === 1 && !isBackground(child)) {
          const inner = child.getElementsByTagNameNS('*', 'span').length;
          if (inner) { walk(child); continue; }
          const word = { b: lyricTime(child.getAttribute('begin')), e: lyricTime(child.getAttribute('end')), t: child.textContent };
          text += word.t;
          if (!Number.isFinite(word.b)) allTimed = false;
          words.push(word);
        }
      }
    };
    walk(p);
    const spans = [...p.getElementsByTagNameNS('*', 'span')];
    const line = {
      b: lyricTime(p.getAttribute('begin') ?? spans[0]?.getAttribute('begin')),
      e: lyricTime(p.getAttribute('end') ?? spans[spans.length - 1]?.getAttribute('end')),
      t: text.replace(/\s+/g, ' ').trim(),
    };
    if (allTimed && words.length) line.w = words.map((w) => ({ b: w.b, e: w.e, t: w.t.replace(/\s+/g, ' ').replace(/^ /, '') }));
    return line;
  }));
}
/** LRCLIB format (LRC): [mm:ss.xx]words */
function parseLrc(text) {
  const lines = [];
  for (const row of String(text).split(/\r?\n/)) {
    const match = row.match(/^((?:\[\d+:\d+(?:[.:]\d+)?\])+)(.*)$/);
    if (!match) continue;
    for (const stamp of match[1].match(/\d+:\d+(?:[.:]\d+)?/g)) lines.push({ b: lyricTime(stamp.replace(/:(\d+)[:.](\d+)$/, ':$1.$2')), t: match[2].trim(), blank: !match[2].trim() });
  }
  lines.sort((x, y) => x.b - y.b);
  // A blank timed row marks the end of the line before it.
  lines.forEach((l, i) => { if (lines[i + 1]) l.e = lines[i + 1].b; });
  return tidyLines(lines.filter((l) => !l.blank));
}
/** Every element under node, looking inside Home Assistant's components (their shadow roots) too. */
function deepFind(node, test, out = [], depth = 0) {
  if (!node || depth > 16) return out;
  if (node.nodeType === 1 && test(node)) out.push(node);
  if (node.shadowRoot) deepFind(node.shadowRoot, test, out, depth + 1);
  for (const child of node.children || []) deepFind(child, test, out, depth + 1);
  return out;
}
// Home Assistant's camera players, which keep their own "muted" setting and pass it to their video.
const isStreamPart = (el) => /^HA-(CAMERA-STREAM|WEB-RTC-PLAYER|HLS-PLAYER)$/.test(el.tagName);
const isVideo = (el) => el.tagName === 'VIDEO';

/**
 * Where the floor plan is in a vacuum's map picture: everything that isn't the background colour (taken from the
 * top-left corner), with a little margin. Vacuum maps usually have a wide empty border, so cropping it off lets
 * the house fill the space. The whole picture if it can't be read.
 */
/** A picture's pixels, read once and kept with it. Null if the page isn't allowed to read it. */
function readMap(img) {
  if (img._pixels !== undefined) return img._pixels;
  try {
    const w = img.naturalWidth, h = img.naturalHeight, work = document.createElement('canvas');
    work.width = w; work.height = h;
    const g = work.getContext('2d');
    g.drawImage(img, 0, 0);
    img._pixels = { d: g.getImageData(0, 0, w, h).data, w, h };
  } catch (err) {
    img._pixels = null;
  }
  return img._pixels;
}
/**
 * Where the robot is on a TapoVac map picture: it's drawn as a disc with a bright blue rim. Returns its middle
 * and size in picture pixels, or null if it isn't there. Ring-shaped and roughly round, so a blue room or line
 * isn't mistaken for it.
 */
function findRobot(img) {
  const px = readMap(img);
  if (!px) return null;
  const { d, w, h } = px, cell = 6, gw = Math.ceil(w / cell), cells = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 200 || Math.abs(d[i] - ROBOT_RIM[0]) + Math.abs(d[i + 1] - ROBOT_RIM[1]) + Math.abs(d[i + 2] - ROBOT_RIM[2]) > 60) continue;
      const c = ((y / cell) | 0) * gw + ((x / cell) | 0), s = cells.get(c);
      if (s) { s.n += 1; s.x0 = Math.min(s.x0, x); s.x1 = Math.max(s.x1, x); s.y0 = Math.min(s.y0, y); s.y1 = Math.max(s.y1, y); }
      else cells.set(c, { n: 1, x0: x, x1: x, y0: y, y1: y });
    }
  }
  if (!cells.size || cells.size > 4000) return null; // nothing blue, or blue everywhere
  // Cells that touch make one shape; the best ring-shaped one is the robot.
  const done = new Set();
  let best = null;
  for (const start of cells.keys()) {
    if (done.has(start)) continue;
    const todo = [start], shape = { n: 0, x0: w, x1: 0, y0: h, y1: 0 };
    done.add(start);
    while (todo.length) {
      const c = todo.pop(), s = cells.get(c), cx = c % gw, cy = (c - cx) / gw;
      shape.n += s.n; shape.x0 = Math.min(shape.x0, s.x0); shape.x1 = Math.max(shape.x1, s.x1); shape.y0 = Math.min(shape.y0, s.y0); shape.y1 = Math.max(shape.y1, s.y1);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = (cy + dy) * gw + (cx + dx);
          if (cx + dx >= 0 && cx + dx < gw && cells.has(k) && !done.has(k)) { done.add(k); todo.push(k); }
        }
      }
    }
    const bw = shape.x1 - shape.x0 + 1, bh = shape.y1 - shape.y0 + 1, ratio = bw / bh;
    const ring = bw >= 6 && bh >= 6 && bw <= 160 && bh <= 160 && ratio > 0.6 && ratio < 1.6 && shape.n < bw * bh * 0.8 && shape.n >= 8;
    if (ring && (!best || shape.n > best.n)) best = shape;
  }
  return best ? { x: (best.x0 + best.x1 + 1) / 2, y: (best.y0 + best.y1 + 1) / 2, d: Math.max(best.x1 - best.x0, best.y1 - best.y0) + 1 } : null;
}
/**
 * A spot in the vacuum's millimetres, as a pixel on its map picture, from what TapoVac's map camera publishes:
 * its three calibration points (an exact conversion) or else its map geometry. Null if it publishes neither.
 */
function mapPoint(attrs, mm) {
  const cal = attrs.calibration_points;
  if (Array.isArray(cal) && cal.length >= 3) {
    const [a, b, c] = cal.map((p) => [Number(p.vacuum?.x), Number(p.vacuum?.y), Number(p.map?.x), Number(p.map?.y)]);
    const det = a[0] * (b[1] - c[1]) - a[1] * (b[0] - c[0]) + (b[0] * c[1] - c[0] * b[1]);
    if (Number.isFinite(det) && Math.abs(det) > 1e-9) {
      // Solves map = p*x + q*y + r for each of the map's x and y, through the three points.
      const solve = (k) => {
        const p = (a[k] * (b[1] - c[1]) - a[1] * (b[k] - c[k]) + (b[k] * c[1] - c[k] * b[1])) / det;
        const q = (a[0] * (b[k] - c[k]) - a[k] * (b[0] - c[0]) + (b[0] * c[k] - c[0] * b[k])) / det;
        const r = (a[0] * (b[1] * c[k] - c[1] * b[k]) - a[1] * (b[0] * c[k] - c[0] * b[k]) + a[k] * (b[0] * c[1] - c[0] * b[1])) / det;
        return p * mm[0] + q * mm[1] + r;
      };
      return { x: solve(2), y: solve(3) };
    }
  }
  const g = attrs.map_geometry || {}, res = Number(g.resolution_mm), per = Number(g.scale_px_per_cell) || 4;
  const origin = g.real_origin_mm, grid = g.grid_size;
  if (!(res > 0) || !Array.isArray(origin) || !Array.isArray(grid)) return null;
  return { x: ((mm[0] - origin[0]) / res) * per + per / 2, y: (grid[1] - 1 - (mm[1] - origin[1]) / res) * per + per / 2 };
}
function mapBounds(img) {
  const w = img.naturalWidth, h = img.naturalHeight, whole = { x: 0, y: 0, w, h };
  if (img._bounds) return img._bounds;
  try {
    const px = readMap(img);
    if (!px) return whole;
    const d = px.d, at = (x, y) => (y * w + x) * 4;
    // The background: the commonest colour around the edge, plus a second one if it's common too (a grid or
    // checked background). See-through is always background.
    const tally = new Map(), edge = Math.max(1, Math.floor(Math.max(w, h) / 300));
    let edges = 0;
    const count = (i) => {
      edges += 1;
      const key = d[i + 3] < 16 ? 'clear' : `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
      const t = tally.get(key) || { n: 0, i };
      t.n += 1;
      tally.set(key, t);
    };
    for (let x = 0; x < w; x += edge) { count(at(x, 0)); count(at(x, h - 1)); }
    for (let y = 0; y < h; y += edge) { count(at(0, y)); count(at(w - 1, y)); }
    const bgs = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)
      .filter(([key, t], k) => key !== 'clear' && (k === 0 || t.n >= edges * 0.15)).slice(0, 2)
      .map(([, t]) => [d[t.i], d[t.i + 1], d[t.i + 2]]);
    const isBg = (i) => d[i + 3] < 16 || bgs.some((b) => Math.abs(d[i] - b[0]) + Math.abs(d[i + 1] - b[1]) + Math.abs(d[i + 2] - b[2]) < 40);
    // Marked on a coarse grid of cells, then grouped into shapes that touch (gaps of up to MAP_JOIN cells count
    // as touching). The house is the big shape; a map name, legend, scale or far-off icon is a small one, left out.
    const cell = Math.max(1, Math.ceil(Math.max(w, h) / 120)), gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    // A cell counts if it's well filled in (rooms are), so thin lines across the whole picture (a grid) don't join
    // everything into one shape. A map drawn only in thin lines falls back to counting any mark.
    const step = Math.max(1, Math.floor(Math.min(w, h) / 600)), seen = new Uint16Array(gw * gh), hit = new Uint16Array(gw * gh);
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const c = ((y / cell) | 0) * gw + ((x / cell) | 0);
        seen[c] += 1;
        if (!isBg(at(x, y))) hit[c] += 1;
      }
    }
    let full = hit.map((n, c) => (n >= seen[c] * 0.3 && n > 0 ? 1 : 0));
    if (full.reduce((a, b) => a + b, 0) < 12) full = hit.map((n) => (n > 0 ? 1 : 0));
    const group = new Int32Array(gw * gh).fill(-1), sizes = [];
    for (let start = 0; start < full.length; start++) {
      if (!full[start] || group[start] >= 0) continue;
      const id = sizes.length, todo = [start];
      group[start] = id;
      let n = 0;
      while (todo.length) {
        const c = todo.pop(), cx = c % gw, cy = (c - cx) / gw;
        n += 1;
        for (let dy = -MAP_JOIN; dy <= MAP_JOIN; dy++) {
          for (let dx = -MAP_JOIN; dx <= MAP_JOIN; dx++) {
            const x = cx + dx, y = cy + dy, k = y * gw + x;
            if (x >= 0 && y >= 0 && x < gw && y < gh && full[k] && group[k] < 0) { group[k] = id; todo.push(k); }
          }
        }
      }
      sizes.push(n);
    }
    if (!sizes.length) return whole;
    const keep = Math.max(...sizes) * MAP_KEEP_SHARE;
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1;
    for (let k = 0; k < full.length; k++) {
      if (group[k] < 0 || sizes[group[k]] < keep) continue;
      const cx = k % gw, cy = (k - cx) / gw;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
    }
    const px0 = x0 * cell, py0 = y0 * cell, px1 = Math.min(w, (x1 + 1) * cell), py1 = Math.min(h, (y1 + 1) * cell);
    const m = Math.round(Math.max(px1 - px0, py1 - py0) * 0.04);
    const left = Math.max(0, px0 - m), top = Math.max(0, py0 - m);
    return (img._bounds = { x: left, y: top, w: Math.min(w, px1 + m) - left, h: Math.min(h, py1 + m) - top });
  } catch (err) {
    return whole; // a picture the page isn't allowed to read: shown whole
  }
}
/**
 * Draws a map picture, cropped to the floor plan, as big as the canvas allows. Big enlargements stay crisp.
 * With a view ({ x, y, zoom }: a spot on the picture and screen pixels per picture pixel), it's a close-up
 * around that spot instead, kept within the house where it can be. Returns the middle actually shown.
 */
function paintMap(img, canvas, view = null) {
  const box = mapBounds(img), r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, cw, ch);
  const fits = Math.min(cw / box.w, ch / box.h);
  if (view) {
    const scale = Math.max(fits, view.zoom * dpr), sw = cw / scale, sh = ch / scale;
    // Centred on the spot, but not past the house's edge (unless the house is smaller than the view).
    const keep = (at, size, start, length) => (size >= length ? start + length / 2 : Math.min(Math.max(at, start + size / 2), start + length - size / 2));
    const x = keep(view.x, sw, box.x, box.w), y = keep(view.y, sh, box.y, box.h);
    g.imageSmoothingEnabled = scale < 1.5;
    g.drawImage(img, x - sw / 2, y - sh / 2, sw, sh, 0, 0, cw, ch);
    return { x, y };
  }
  const dw = box.w * fits, dh = box.h * fits;
  g.imageSmoothingEnabled = fits < 1.5;
  g.drawImage(img, box.x, box.y, box.w, box.h, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}
function lyricLines(result) {
  if (!result || !result.source) return [];
  try { return result.ttml ? parseTtml(result.ttml) : result.lrc ? parseLrc(result.lrc) : []; } catch (err) { return []; }
}
const songTime = (seconds) => {
  const whole = Math.floor(seconds), hours = Math.floor(whole / 3600), mins = Math.floor((whole % 3600) / 60), secs = String(whole % 60).padStart(2, '0');
  return hours ? `${hours}:${String(mins).padStart(2, '0')}:${secs}` : `${mins}:${secs}`;
};
/**
 * When a line takes over from the one before. Soon enough to be read before it's sung, but not before the
 * previous line's last word has finished filling, unless the singing leaves no time for that.
 */
function lyricSwitchAt(lines, i) {
  const line = lines[i], before = lines[i - 1];
  const early = line.b - LINE_LEAD_S;
  if (!before || !before.w) return early;
  const last = before.w[before.w.length - 1];
  const sung = Number.isFinite(last.e) ? last.e : before.e;
  return Number.isFinite(sung) ? Math.max(early, Math.min(sung, line.b - 0.1)) : early;
}
/** Which line to show at this moment, -1 for a gap, and whether a line is near enough to make room for. */
function lyricAt(lines, position) {
  let index = -1;
  for (let i = 0; i < lines.length && lines[i].b - LINE_LEAD_S <= position; i += 1) {
    if (lyricSwitchAt(lines, i) <= position) index = i;
  }
  const next = lines[index + 1];
  const nextAt = next ? lyricSwitchAt(lines, index + 1) : Infinity;
  const soon = nextAt - position < 5;
  if (index < 0) return { index: -1, near: soon };
  const line = lines[index];
  const finish = Number.isFinite(line.e) ? line.e : line.b + 6;
  const hold = Math.min(finish + 1.2, nextAt);
  return { index: position < hold ? index : -1, near: position < hold + 3 || soon };
}

/** Finds a theme in a line. Skips negatives like "no rain". Returns the strongest theme and the word that sets it off. */
function lyricReaction(text) {
  const words = String(text || '').split(/\s+/).map(cleanWord);
  let best = null;
  words.forEach((word, i) => {
    const hit = findLyricWord(word);
    if (!hit || NOT_WORDS.test(words[i - 1] || '') || NOT_WORDS.test(words[i - 2] || '')) return;
    if (!best || hit.rank < best.rank) best = { reaction: hit.name, word, rank: hit.rank };
  });
  return best ? { reaction: best.reaction, word: best.word } : null;
}

/** Works out how the robot should react from the words and Home Assistant's own result. */
function classify(said, responseType, code, failed) {
  const t = (said || '').toLowerCase();
  if (failed || responseType === 'error' || code) return 'confused';
  if (/\b(thank|thanks|thankyou|cheers|good (robot|boy|girl)|love you|well done|nice one)\b/.test(t)) return 'love';
  if (/\b(good ?night|go to sleep|bed ?time)\b/.test(t)) return 'sleepy';
  if (/\b(hello|hi|hey|hiya|good (morning|afternoon|evening)|how are you)\b/.test(t)) return 'wave';
  if (/\b(joke|funny|laugh)\b/.test(t)) return 'laugh';
  if (/\b(music|song|play|pause|skip|next track|volume|sonos)\b/.test(t)) return 'notes';
  if (/\b(lights?|lamps?|bright|dim)\b/.test(t)) return /\b(off|dim)\b/.test(t) ? 'dim' : 'bright';
  if (/\b(weather|rain|raining|forecast|temperature|cold|hot|sunny)\b/.test(t)) return 'weather';
  if (/\b(time|date|day|timers?|alarms?|remind)\b/.test(t)) return 'clock';
  return responseType ? 'happy' : '';
}

// Prepared in advance by the voice connector, so these start straight away. Keep in step with OPENERS in echo_voice_bridge.py.
// The switches on the Settings page. Choices are saved on this screen, and win over the dashboard's settings.
const SETTING_SWITCHES = [['lyrics', 'Lyrics'], ['lyric_reactions', 'Lyric reactions'], ['album_colours', 'Album colours'], ['now_playing', 'Now-playing bar'], ['moments', 'Idle animations'], ['info_cards', 'Weather & info cards'], ['vacuum_watch', 'Hoover map while cleaning'], ['doorbell', 'Doorbell video'], ['doorbell_names', 'Doorbell names'], ['home_events', 'Home events'], ['night_mode', 'Night mode'], ['night_clock', 'Night clock'], ['alerts', 'Timers & reminders']];
const OPENERS = ['Sure thing.', 'Okay.', 'Of course.', 'No problem.', 'Let me see.', 'Right then.', 'Alright.', 'Here we go.'];
/** How many characters the voice must prepare before its first sound, following the connector's own splitting. */
function firstSpokenLength(reply) {
  const text = String(reply || '').trim();
  let sentence = text;
  for (const match of text.matchAll(/[.!?]+(?=\s|$)/g)) {
    const piece = text.slice(0, match.index + match[0].length);
    if (piece.length >= 12 || OPENERS.includes(piece)) { sentence = piece; break; }
  }
  if (sentence.length <= 70) return sentence.length;
  const pieces = [];
  for (const part of sentence.split(/(?<=[,;:])\s+/)) {
    if (pieces.length && pieces[pieces.length - 1].length < 35) pieces[pieces.length - 1] += ` ${part}`;
    else pieces.push(part);
  }
  if (pieces.length > 1 && pieces[pieces.length - 1].length < 35) {
    const last = pieces.pop();
    pieces[pieces.length - 1] += ` ${last}`;
  }
  return pieces[0].length;
}
/** Seconds until the voice should start. Measured with the Fable voice on a small server: typically within 0.1s. */
function speechWaitSeconds(reply, saidBefore) {
  if (!reply) return SPEECH_NO_REPLY_S;
  const text = String(reply).trim();
  if (OPENERS.some((opener) => text === opener || text.startsWith(`${opener} `))) return SPEECH_READY_S;
  if (saidBefore && text.length <= SPEECH_REMEMBERED_CHARS && saidBefore.has(text)) return SPEECH_READY_S;
  return Math.min(SPEECH_MAX_S, SPEECH_BASE_S + SPEECH_PER_CHAR_S * firstSpokenLength(reply));
}
/** Reads the words out of one pipeline run's events (format from assist_pipeline/run.py). */
function readRun(events) {
  const out = { said: '', reply: '', type: '', code: '', failed: false, finished: false, satellite: null };
  for (const e of events || []) {
    const d = e.data || {};
    if (e.type === 'run-start') out.satellite = d.satellite_id || null;
    if (e.type === 'stt-end') out.said = (d.stt_output && d.stt_output.text) || '';
    if (e.type === 'intent-end') {
      const r = (d.intent_output && d.intent_output.response) || {};
      out.reply = (r.speech && r.speech.plain && r.speech.plain.speech) || '';
      out.type = r.response_type || '';
      out.code = (r.data && r.data.code) || '';
      out.finished = true;
    }
    if (e.type === 'error') { out.failed = true; out.finished = true; }
    if (e.type === 'run-end') out.finished = true;
  }
  return out;
}

// ---- timers and reminders: wording ----
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** "9:58", or "1:02:03" for long ones. */
function clockLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
/** "10 minute", "1 hour", "90 second", "1 hour 30 minute". */
function lengthWords(seconds) {
  const s = Math.round(seconds || 0), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (!h && !m) return `${sec} second`;
  if (!h && sec && m < 2) return `${s} second`;
  return [h && `${h} hour`, m && `${m} minute`, sec && `${sec} second`].filter(Boolean).join(' ');
}
function timerLabel(t) {
  if (t.name) return `${capFirst(t.name)} timer`;
  if (t.command) return capFirst(t.command);
  return `${lengthWords(t.total)} timer`;
}
function shortLabel(text, max = 14) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return (cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut) + '…';
}
/** When a reminder is due, as the screen shows it: "in 12 min", "18:30", "Tomorrow 09:00", "Mon 10:00". */
function dueWords(due, now) {
  const left = due - now;
  if (left < 3600000) return left < 60000 ? 'in under a minute' : `in ${Math.round(left / 60000)} min`;
  const d = new Date(due), today = new Date(now);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (days <= 0) return time;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`;
}

// Turns the PC's microphone into the 16 kHz, 16-bit sound Home Assistant's speech recognition expects.
const MIC_WORKLET = `class EchoRobotMic extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / 16000; this.pos = 0; this.sum = 0; this.count = 0; this.out = new Int16Array(1280); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.count++; this.pos += 1;
      if (this.pos >= this.step) {
        this.pos -= this.step;
        const v = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0; this.count = 0;
        this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === this.out.length) { this.port.postMessage(this.out.buffer, [this.out.buffer]); this.out = new Int16Array(1280); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('echo-robot-mic', EchoRobotMic);`;

const STYLE = `
:host{display:block;height:100%;color-scheme:dark;font-family:var(--echo-font,Roboto,sans-serif)}
*{box-sizing:border-box;margin:0}
button{border:0;background:none;color:inherit;font:inherit;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button:active{transform:scale(.96)}
button:disabled{opacity:.35;cursor:default}
svg{display:block;width:100%;height:100%}

/* ---------- palette: the whole screen changes colour with the mood, so it reads across a room ---------- */
.shell{--bg:var(--rest,#0d1120);--ink:#fff;--eye:var(--bop-eye,#74e6dc);--glow:var(--bop-eye,#74e6dc);--prop:#fff;
  position:relative;overflow:hidden;width:100%;height:100vh;background:var(--bg);color:var(--ink);
  user-select:none;-webkit-user-select:none;touch-action:manipulation}
[data-mood=groove]{--bg:#141a38;--eye:#8fb4ff;--glow:#8fb4ff}
[data-mood=sleep],[data-mood=sleepy]{--bg:#070913;--eye:#54668a;--glow:#6d80a8;--ink:#8d9ab8;--prop:#6d80a8}
[data-mood=listening]{--bg:#ffc933;--ink:#1a1400;--eye:#1a1400;--glow:#ffc933;--prop:#1a1400}
[data-mood=thinking]{--bg:#5b3fd6;--eye:#fff;--glow:#cdbfff}
[data-mood=speaking]{--bg:#0b7f5e;--eye:#fff;--glow:#7bf2c0}
[data-mood=muted]{--bg:#2a2e40;--eye:#98a0b8;--glow:#98a0b8;--ink:#d6daea}
[data-mood=offline]{--bg:#1b1c24;--eye:#6a6d7c;--glow:#6a6d7c;--ink:#b5b8c6}
[data-mood=alarm]{--bg:#c92a2e;--eye:#fff;--glow:#ffb0b0}
[data-mood=happy]{--bg:#0b7f5e;--eye:#fff;--glow:#7bf2c0}
[data-mood=wave],[data-mood=love],[data-mood=laugh]{--bg:#c93a63;--eye:#fff;--glow:#ffc2d2}
[data-mood=bright]{--bg:#ffe39a;--ink:#2a1e00;--eye:#2a1e00;--glow:#ffd24d;--prop:#b57a00}
[data-mood=dim]{--bg:#0d1120;--eye:#5f7aa6;--glow:#7f9bc8;--ink:#b9c6df;--prop:#7f9bc8}
[data-mood=notes]{--bg:#1561b8;--eye:#fff;--glow:#a8d4ff}
[data-mood=weather]{--bg:#2469a8;--eye:#fff;--glow:#b5dcff}
[data-mood=clock]{--bg:#3b4663;--eye:#fff;--glow:#c6d2ee}
[data-mood=confused],[data-react=confused]{--bg:#ee8a3c;--ink:#241000;--eye:#241000;--glow:#ffd0a0;--prop:#241000}
.wash{position:absolute;inset:0;z-index:0;opacity:0;pointer-events:none;will-change:opacity}
.veil{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 1.5s;z-index:30}
.night .veil{opacity:.5}

/* ---------- corners: the only things on screen besides the robot ---------- */
.time{position:absolute;left:38px;top:12px;font-size:56px;font-weight:700;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums;z-index:5}
.date{position:absolute;left:40px;top:68px;font-size:24px;font-weight:600;line-height:1.1;white-space:nowrap;z-index:5}
.has-words .date,[data-readout=on] .date{opacity:0}
.nightclock{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;padding-top:calc(var(--s,1)*46px);color:#aeb8d0;opacity:0;pointer-events:none;transition:opacity .6s,transform 2s linear;font-variant-numeric:tabular-nums}
.nc-time{font-size:calc(var(--s,1)*190px);font-weight:700;letter-spacing:-.02em;line-height:1}
.nc-date{font-size:calc(var(--s,1)*36px);font-weight:600;line-height:1.3;margin-top:calc(var(--s,1)*2px)}
.temp{position:absolute;right:38px;top:30px;display:flex;align-items:center;gap:10px;font-size:44px;font-weight:700;line-height:1;z-index:5}
.temp span:first-child{width:48px;height:48px}
.corner{color:color-mix(in srgb,var(--ink) 92%,var(--bg));transition:opacity .3s,color .5s}
.has-words .corner{opacity:0}
.caption{position:absolute;left:26px;bottom:18px;font-size:30px;font-weight:700;line-height:1.1;z-index:5;max-width:60%}
.caption:empty{display:none}

/* ---------- words: only while you're talking to it ---------- */
.words{position:absolute;right:30px;top:0;bottom:0;width:53%;display:flex;flex-direction:column;justify-content:center;gap:16px;
  opacity:0;transform:translateX(30px);transition:opacity .25s,transform .25s;pointer-events:none;z-index:6}
.has-words .words{opacity:1;transform:none}
.said{font-size:30px;font-weight:500;line-height:1.2;opacity:.85}
.said:empty,.reply:empty{display:none}
.reply{font-size:42px;font-weight:700;line-height:1.14;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:6;overflow:hidden}
.reply.long{font-size:30px;line-height:1.2;-webkit-line-clamp:8}

/* ---------- lyrics: the line being sung, large, with the next one waiting underneath ---------- */
.lyric{position:absolute;right:30px;top:0;bottom:0;width:53%;display:flex;flex-direction:column;justify-content:center;gap:12px;pointer-events:none;z-index:6;opacity:0;transition:opacity .2s;will-change:opacity}
.lyric.show{opacity:1}
/* Info cards: the forecast or what's coming up, beside the face for a few seconds. */
.icard{position:absolute;right:30px;top:0;bottom:0;width:53%;display:flex;flex-direction:column;justify-content:center;gap:16px;pointer-events:none;z-index:6;opacity:0;transform:translateX(30px);transition:opacity .5s,transform .5s;will-change:opacity}
.has-card .icard{opacity:1;transform:none}
.has-card .temp{opacity:0}
/* The live map while a vacuum cleans: beside the face whenever nothing else (words, lyrics, a card, the menu, a pop-up) wants that side. */
.vwatch{position:absolute;right:30px;top:96px;bottom:26px;width:53%;display:flex;flex-direction:column;gap:12px;z-index:6;opacity:0;transform:translateX(30px);transition:opacity .5s,transform .5s;pointer-events:none}
.vw-line{font-size:28px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:color-mix(in srgb,var(--ink) 80%,var(--bg))}
.vw-map{position:relative;flex:1 1 auto;min-height:0;border-radius:18px;overflow:hidden;background:rgba(0,0,0,.18)}
.vw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.vw-canvas[hidden]{display:none}
/* Above the now-playing bar, measured (its real top, plus a gap), so the bar never covers the map. */
.has-np .vwatch{bottom:var(--vw-np,132px)}
.has-dock .vwatch{top:calc(var(--dock-h,0px) + ${DOCK_TOP + 12}px)}
.icard svg{display:block;width:100%;height:100%}
.ic-label{font-size:28px;font-weight:700;line-height:1;color:color-mix(in srgb,var(--ink) 62%,var(--bg))}
.ic-now{display:flex;align-items:center;gap:20px}
.ic-big{width:92px;height:92px;flex:none}
.ic-deg{font-size:84px;font-weight:700;line-height:1;letter-spacing:-.02em;flex:none}
.ic-txt{display:flex;flex-direction:column;gap:6px;min-width:0}
.ic-what{font-size:32px;font-weight:700;line-height:1.15;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.ic-sub{font-size:26px;font-weight:600;line-height:1.2;color:color-mix(in srgb,var(--ink) 70%,var(--bg))}
.ic-sub:empty{display:none}
.ic-cols{display:flex;gap:10px}
.ic-col{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px}
.ic-col .ic-ic{width:52px;height:52px}
.ic-days .ic-ic{width:64px;height:64px}
.ic-t{font-size:26px;font-weight:600;line-height:1.1;color:color-mix(in srgb,var(--ink) 70%,var(--bg))}
.ic-hi{font-size:32px;font-weight:700;line-height:1.1}
.ic-lo{font-size:26px;font-weight:600;line-height:1.1;color:color-mix(in srgb,var(--ink) 62%,var(--bg))}
.ic-row{display:flex;align-items:center;gap:18px}
.ic-row .ic-ic{width:44px;height:44px;flex:none}
.ic-row .ic-what{display:block;white-space:nowrap;text-overflow:ellipsis}
[data-look=card] .eyes{transform:translateX(26px)}
.has-words .lyric{opacity:0}
.lyric p{margin:0;transform-origin:0 50%}
.lyric .cur{font-size:46px;font-weight:700;line-height:1.16;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;padding:2px 0}
.lyric.long .cur{font-size:34px;line-height:1.2;-webkit-line-clamp:5}
.lyric .next{font-size:28px;font-weight:600;line-height:1.2;color:color-mix(in srgb,var(--ink) 42%,var(--bg));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lyric .next:empty{display:none}
/* The outgoing lines are an exact copy in the same place, so nothing jumps when they take over. */
.lyric .prev{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:12px;opacity:0;pointer-events:none}
.lyric .was-cur{font-size:46px;font-weight:700;line-height:1.16;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;padding:2px 0}
.lyric .prev.long .was-cur{font-size:34px;line-height:1.2;-webkit-line-clamp:5}
.lyric .prev.lifted .was-cur{transform:translateY(-3px)}
.lyric .was-next{font-size:28px;font-weight:600;line-height:1.2;color:color-mix(in srgb,var(--ink) 42%,var(--bg));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lyric .was-next:empty{display:none}
.lyric .prev.go{animation:lines-out .12s ease-out both}
.lyric .cur.go{animation:line-in .22s cubic-bezier(.2,.8,.3,1) .12s both}
.lyric .next.go{animation:next-in .22s cubic-bezier(.2,.8,.3,1) .12s both}
@keyframes lines-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-14px)}}
@keyframes line-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes next-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
/* A soft edge sweeps across each word for exactly as long as it's sung. Words of one sung word stay together. */
.lyric .wg{font-style:normal;white-space:nowrap}
.lyric .w{display:inline-block;--unsung:color-mix(in srgb,var(--ink) 40%,var(--bg));background-image:linear-gradient(90deg,var(--ink) 0,var(--ink) 45%,var(--unsung) 55%,var(--unsung) 100%);background-size:225% 100%;background-position:100% 0;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;padding:.06em 0;margin:-.06em 0;transition:background-position 0s linear,transform .4s ease-out}
.lyric .w.on{background-position:0 0;transform:translateY(-3px)}
/* While an effect plays, words light in one step: a sweep redraws the text every frame, which on top of an effect
   is too much for the Echo. */
.fx-busy .lyric .w{transition:none!important}
.fx-busy .lyric .w.on{transform:none}

/* ---------- now playing: cover, title, artist and progress, for as long as music is on ---------- */
.np{position:absolute;left:12px;right:12px;bottom:10px;height:100px;display:flex;align-items:center;gap:18px;padding:12px 24px 12px 12px;border-radius:20px;background:color-mix(in srgb,var(--ink) 11%,var(--bg));z-index:7;opacity:0;visibility:hidden;transform:translateY(24px);transition:opacity .3s,transform .3s,visibility 0s .3s,background-color .7s;touch-action:none}
.np-tint{position:absolute;inset:0;border-radius:inherit;z-index:-1;opacity:0;pointer-events:none}
.has-np .np{opacity:1;visibility:visible;transform:none;transition:opacity .3s,transform .3s,background-color .7s}
.np-art{position:relative;flex-shrink:0;width:76px;height:76px;border-radius:14px;overflow:hidden;background:color-mix(in srgb,var(--ink) 16%,transparent);color:var(--ink)}
.np-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s}
.np-art img.on{opacity:1}
.np-art span{position:absolute;inset:20px;opacity:.6}
.np-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.np-btns{display:flex;align-items:center;gap:4px;flex-shrink:0}
.np-b{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;color:var(--ink)}
.np-b span{width:36px;height:36px;pointer-events:none}
.np-b.main{background:var(--ink);color:var(--bg)}
.np-b.off,.round.off{opacity:.4}
.np-text{display:flex;align-items:baseline;gap:12px;min-width:0;line-height:1.2}
.np-title{font-size:28px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0;max-width:70%}
.np-artist{font-size:24px;font-weight:500;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 0;min-width:0}
.np-row{display:flex;align-items:center;gap:12px;height:40px}
.np-now,.np-end{flex-shrink:0;width:66px;font-size:24px;font-weight:500;font-variant-numeric:tabular-nums}
.np-end{text-align:right}
.np-bar{position:relative;flex:1;height:44px;margin:-2px 0;cursor:pointer}
.np-line,.np-fill{position:absolute;left:0;right:0;top:18px;height:8px;border-radius:4px}
.np-line{background:color-mix(in srgb,var(--ink) 24%,transparent)}
.np-fill{background:var(--ink);transform-origin:0 50%;transform:scaleX(0);transition:transform 1s linear;will-change:transform}
.np-dot{position:absolute;left:0;top:12px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:var(--ink);transition:transform 1s linear;will-change:transform}
.np.no-seek .np-dot{display:none}
.np.no-seek .np-bar{cursor:default}
.np.no-time .np-row{display:none}
.np.dragging .np-fill,.np.dragging .np-dot{transition:none}
.np.dragging .np-dot{width:28px;height:28px;margin-left:-14px;top:8px}
/* Make room above the bar. */
.has-np .words,.has-np .lyric{bottom:112px}
.has-np .caption{bottom:124px}
.has-np .rings{top:calc(50% - 56px)}

/* ---------- the robot ---------- *//* ---------- the robot ---------- */
.stage{position:absolute;left:50%;top:50%;width:0;height:0;transform:translate(0,0) scale(var(--s,1));transition:transform .35s cubic-bezier(.3,1.3,.5,1);z-index:2}
.blend{position:absolute;will-change:transform}
.rb{position:absolute;inset:0;will-change:transform}
.part{position:absolute}
.props{position:absolute;pointer-events:none}
.p{position:absolute;color:var(--prop);opacity:0;will-change:transform,opacity}
.face{position:absolute;left:0;top:0;width:600px;height:350px}
.eye{position:absolute;top:0;width:200px;height:240px;color:var(--eye);will-change:transform;transition:transform .25s,color .3s}
.eye svg,.readout{transition:transform .13s ease-in,opacity .13s;transform-origin:50% 50%}
.mouth svg,.bars{transition:transform .13s ease-in,opacity .13s}
.props{transition:opacity .13s}
.swap .eye svg,.swap .readout{transform:scaleY(.05)}
.swap .mouth svg,.swap .bars{transform:scale(.25,.1);opacity:0}
.swap .props{opacity:0}
.eye.l{left:30px}.eye.r{left:370px}
.eye g{display:none}
.eye .fill{fill:currentColor;stroke:none}
.eye .line{fill:none;stroke:currentColor;stroke-width:21;stroke-linecap:round;stroke-linejoin:round}
.eyes-blend{position:absolute;inset:0;will-change:transform}
.eyes{position:absolute;inset:0;will-change:transform;transition:transform .28s ease-out}
[data-eye=round] .eye g.round,[data-eye=odd] .eye g.round,[data-eye=happy] .eye g.happy,[data-eye=closed] .eye g.closed,
[data-eye=heart] .eye g.heart,[data-eye=star] .eye g.star,[data-eye=x] .eye g.x,[data-eye=half] .eye g.half{display:block}
.mouth{position:absolute;left:210px;top:262px;width:180px;height:80px;color:var(--eye);transition:color .3s}
.mouth svg{position:absolute;inset:0;display:none}
.mouth .stroke{fill:none;stroke:currentColor;stroke-width:18;stroke-linecap:round;stroke-linejoin:round}
.mouth .solid{fill:currentColor}
[data-mouth=smile] .mouth .smile,[data-mouth=small] .mouth .small,[data-mouth=flat] .mouth .flat,[data-mouth=o] .mouth .o,
[data-mouth=grin] .mouth .grin,[data-mouth=wiggle] .mouth .wiggle,[data-mouth=frown] .mouth .frown{display:block}
.bars{position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:12px}
[data-mouth=bars] .bars{display:flex}
.bars i{width:24px;height:80px;border-radius:12px;background:currentColor;will-change:transform;animation:talk .42s ease-in-out infinite alternate}
.bars i:nth-child(2){animation-delay:-.17s}.bars i:nth-child(3){animation-delay:-.31s}.bars i:nth-child(4){animation-delay:-.08s}.bars i:nth-child(5){animation-delay:-.24s}

/* look 1: the whole screen is the face */
[data-robot=face] .body,[data-robot=face] .shadow,[data-robot=face] .arm,[data-robot=face] .ear,[data-robot=face] .antenna,[data-robot=face] .neck{display:none}
[data-robot=face] .blend{left:-400px;top:-235px;width:800px;height:470px}
[data-robot=face] .head{position:absolute;left:0;top:0;width:800px;height:470px}
[data-robot=face] .visor{position:absolute;left:100px;top:66px;width:600px;height:350px}
[data-robot=face] .props{left:0;top:0;width:800px;height:470px}
[data-robot=face] .p{width:84px;height:84px}
[data-robot=face] .p1{left:358px;top:34px}[data-robot=face] .p2{left:690px;top:120px}[data-robot=face] .p3{left:30px;top:120px}
[data-robot=face].has-words .stage,[data-robot=face].has-lyrics .stage,[data-robot=face].has-card .stage{transform:translate(-268px,0) scale(calc(var(--s,1)*.56))}
[data-robot=face].has-np .stage{transform:translate(0,-56px) scale(calc(var(--s,1)*.76))}
[data-robot=face].has-np.has-words .stage,[data-robot=face].has-np.has-lyrics .stage{transform:translate(-268px,-30px) scale(calc(var(--s,1)*.52))}

/* look 2: a little robot with a body. Shapes are plain CSS so each moving part stays cheap to animate. */
[data-robot=buddy] .blend{left:-170px;top:-205px;width:340px;height:436px}
[data-robot=buddy] .stage{transform:scale(calc(var(--s,1)*.9))}
[data-robot=buddy].has-words .stage,[data-robot=buddy].has-lyrics .stage,[data-robot=buddy].has-card .stage{transform:translate(-262px,0) scale(calc(var(--s,1)*.84))}
[data-robot=buddy].has-np .stage{transform:translate(0,-56px) scale(calc(var(--s,1)*.68))}
[data-robot=buddy].has-np.has-words .stage,[data-robot=buddy].has-np.has-lyrics .stage{transform:translate(-262px,-56px) scale(calc(var(--s,1)*.66))}
/* Night clock: the robot sleeps small at the bottom, under a big dark clock. */
.night-clock[data-mood=sleep]:not(.has-words) .nightclock{opacity:1}
.night-clock[data-mood=sleep]:not(.has-words) .time,.night-clock[data-mood=sleep]:not(.has-words) .date{opacity:0}
.night-clock[data-mood=sleep]:not(.has-words) .np{opacity:0;visibility:hidden}
.night-clock[data-mood=sleep]:not(.has-words) .stage{transform:translate(0,calc(var(--s,1)*160px)) scale(calc(var(--s,1)*.24))}
[data-robot=buddy].night-clock[data-mood=sleep]:not(.has-words) .stage{transform:translate(0,calc(var(--s,1)*165px)) scale(calc(var(--s,1)*.24))}
.night-clock.night .veil{opacity:.3}
.shadow{position:absolute;left:66px;top:412px;width:208px;height:20px;border-radius:50%;background:#000;opacity:.25;will-change:transform}
.body{position:absolute;left:0;top:0;width:340px;height:436px;pointer-events:none}
.torso{position:absolute;left:92px;top:262px;width:156px;height:122px;border-radius:46px 46px 40px 40px;background:#f4ead6;box-shadow:inset 0 -12px 0 #dfd2b6}
.chest{position:absolute;left:52px;top:26px;width:52px;height:52px;border-radius:50%;background:#14182b;display:grid;place-items:center}
.chest:after{content:'';width:28px;height:28px;border-radius:50%;background:var(--glow);animation:pulse 2.4s ease-in-out infinite}
.foot{position:absolute;top:380px;width:58px;height:34px;border-radius:18px 18px 12px 12px;background:#ff6a45;box-shadow:inset 0 -8px 0 #d94f2d}
.foot.l{left:102px}.foot.r{left:180px}
.arm{position:absolute;top:272px;width:30px;height:92px;border-radius:15px;background:#ff6a45;transform-origin:50% 14px;will-change:transform;transition:transform .3s;box-shadow:inset -5px 0 0 #d94f2d}
.arm:after{content:'';position:absolute;left:-5px;bottom:-10px;width:40px;height:40px;border-radius:50%;background:#f4ead6;box-shadow:inset 0 -7px 0 #dfd2b6}
.arm.l{left:62px;transform:rotate(14deg)}.arm.r{left:248px;transform:rotate(-14deg)}
[data-robot=buddy] .head{position:absolute;left:30px;top:44px;width:280px;height:222px;border-radius:92px;background:#f4ead6;box-shadow:inset 0 -14px 0 #dfd2b6;will-change:transform;transform-origin:50% 90%}
.neck{position:absolute;left:140px;top:250px;width:60px;height:24px;background:#b9ab8d;border-radius:8px}
.ear{position:absolute;top:82px;width:34px;height:66px;border-radius:17px;background:#ff6a45;box-shadow:inset 0 -6px 0 #d94f2d}
.ear.l{left:-20px}.ear.r{right:-20px}
.antenna{position:absolute;left:132px;top:-42px;width:16px;height:52px;background:#b9ab8d;border-radius:8px;transform-origin:50% 100%;will-change:transform}
.antenna:after{content:'';position:absolute;left:-13px;top:-16px;width:42px;height:42px;border-radius:50%;background:var(--glow);box-shadow:0 0 0 7px #14182b}
[data-robot=buddy] .visor{position:absolute;left:24px;top:24px;width:232px;height:164px;border-radius:66px;background:#14182b;overflow:hidden}
[data-robot=buddy] .face{transform:scale(.33);transform-origin:0 0;left:17px;top:24px;--eye:var(--glow);--eye-c:var(--glow)}
[data-robot=buddy] .eye,[data-robot=buddy] .mouth{color:var(--glow)}
[data-robot=buddy] .props{left:0;top:0;width:340px;height:300px}
[data-robot=buddy] .p{width:58px;height:58px}
[data-robot=buddy] .p1{left:262px;top:2px}[data-robot=buddy] .p2{left:-6px;top:30px}[data-robot=buddy] .p3{left:300px;top:96px}

/* ---------- movement. Only transform and opacity animate, which the Echo's GPU can do on its own. ---------- */
.rb{animation:breathe 4.6s ease-in-out infinite}
[data-eye=round] .eye,[data-eye=odd] .eye,[data-eye=tall] .eye,[data-eye=dots] .eye{animation:blink 6.3s infinite}
[data-eye=round] .eye.r,[data-eye=odd] .eye.r,[data-eye=tall] .eye.r,[data-eye=dots] .eye.r{animation-delay:.05s}
[data-anim=lean] .rb{animation:lean .9s ease-in-out infinite alternate}
[data-mood=listening] .eye{animation:none;transform:scale(1.1)}
[data-anim=ponder] .eyes{animation:ponder 2.2s ease-in-out infinite}
[data-anim=ponder] .eye{animation:none;transform:scale(.82)}
[data-anim=chat] .rb{animation:chat .7s ease-in-out infinite alternate}
[data-anim=hop] .rb{animation:hop .75s cubic-bezier(.3,.6,.4,1) 2}
[data-anim=dance] .rb{animation:dance 1s ease-in-out infinite}
[data-anim=shake] .rb{animation:shake .36s linear infinite}
[data-anim=giggle] .rb{animation:giggle .68s ease-in-out infinite}
[data-anim=snooze] .rb{animation:snooze 5s ease-in-out infinite}
[data-anim=tilt] .rb{animation:tilt 3.200s ease-in-out infinite}
[data-eye=odd] .eye.r{animation:none;transform:scale(.68) translateY(26px)}
[data-eye=odd] .eye.l{animation:none;transform:scale(1.1)}
[data-arm=up] .arm.l{transform:rotate(118deg)}
[data-arm=up] .arm.r{transform:rotate(-118deg)}
[data-arm=wave] .arm.r{animation:wave .5s ease-in-out infinite alternate}
[data-arm=dance] .arm.l{animation:swing-l 1s ease-in-out infinite}
[data-arm=dance] .arm.r{animation:swing-r 1s ease-in-out infinite}
[data-mood=listening] .antenna,[data-mood=alarm] .antenna{animation:perk .5s ease-in-out infinite alternate}
.p.on{animation:float 2.6s ease-out infinite}
.p2.on{animation-delay:.9s}.p3.on{animation-delay:1.6s}
.p.dot{border-radius:50%;background:var(--prop)}
.p.dot.on{animation:dots 1.1s ease-in-out infinite}
.p2.dot.on{animation-delay:.18s}.p3.dot.on{animation-delay:.36s}
[data-robot=face] .p.dot{width:34px;height:34px;top:18px}
[data-robot=face] .p1.dot{left:330px}[data-robot=face] .p2.dot{left:383px}[data-robot=face] .p3.dot{left:436px}
[data-robot=buddy] .p.dot{width:22px;height:22px;top:10px}
[data-robot=buddy] .p1.dot{left:244px}[data-robot=buddy] .p2.dot{left:276px}[data-robot=buddy] .p3.dot{left:308px}
.rings{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;z-index:1;pointer-events:none}
.rings i{position:absolute;left:-250px;top:-250px;width:500px;height:500px;border-radius:50%;border:10px solid var(--ink);opacity:0;will-change:transform,opacity}
[data-mood=listening] .rings{opacity:1}
[data-mood=listening] .rings i{animation:ring 1.8s ease-out infinite}
[data-mood=listening] .rings i:nth-child(2){animation-delay:.6s}
[data-mood=listening] .rings i:nth-child(3){animation-delay:1.2s}
@keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes blink{0%,44%,47%,100%{transform:scaleY(1)}45.5%{transform:scaleY(.06)}}
@keyframes lean{from{transform:scale(1) translateY(0)}to{transform:scale(1.05) translateY(-5px)}}
@keyframes ponder{0%,100%{transform:translate(-34px,-26px)}50%{transform:translate(34px,-26px)}}
@keyframes chat{from{transform:translateY(0) rotate(0)}to{transform:translateY(-6px) rotate(.8deg)}}
@keyframes hop{0%,100%{transform:translateY(0) scale(1,1)}15%{transform:translateY(0) scale(1.05,.93)}55%{transform:translateY(-26px) scale(.97,1.04)}}
@keyframes dance{0%,50%,100%{transform:rotate(0) translateY(0)}25%{transform:rotate(-5deg) translateY(-12px)}75%{transform:rotate(5deg) translateY(-12px)}}
@keyframes shake{0%,50%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-5px) rotate(-1.200deg)}75%{transform:translateX(5px) rotate(1.200deg)}}
@keyframes giggle{0%,50%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-8px) rotate(-2deg)}75%{transform:translateY(-8px) rotate(2deg)}}
@keyframes snooze{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(4px) scale(1,.985)}}
@keyframes tilt{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
@keyframes wave{from{transform:rotate(-95deg)}to{transform:rotate(-135deg)}}
@keyframes swing-l{0%,100%{transform:rotate(30deg)}50%{transform:rotate(105deg)}}
@keyframes swing-r{0%,100%{transform:rotate(-105deg)}50%{transform:rotate(-30deg)}}
@keyframes perk{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
@keyframes talk{from{transform:scaleY(.4)}to{transform:scaleY(1)}}
@keyframes pulse{0%,100%{transform:scale(.8);opacity:.75}50%{transform:scale(1);opacity:1}}
@keyframes float{0%{opacity:0;transform:translateY(22px) scale(.6)}18%{opacity:1;transform:translateY(0) scale(1)}80%{opacity:1;transform:translateY(-14px) scale(1)}100%{opacity:0;transform:translateY(-34px) scale(1)}}
@keyframes dots{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-16px)}}
@keyframes ring{0%{opacity:0;transform:scale(.45)}20%{opacity:.34}100%{opacity:0;transform:scale(1.5)}}

/* ---------- colours from the album cover ---------- */
.shell[data-art=on][data-mood=groove]{--bg:var(--art-bg);--ink:var(--art-ink);--eye:var(--art-eye);--glow:var(--art-eye);--prop:var(--art-eye)}

/* ---------- idle moments ---------- */
/* Resting colour drifts with the time of day. */
[data-daypart=morning]{--rest:#123a52}
[data-daypart=day]{--rest:#14315e}
[data-daypart=evening]{--rest:#2c1a44}
/* Each moment washes the whole screen in its own colour. */
[data-moment=clock]{--bg:#2147b8;--eye:#fff;--glow:#bcd0ff}
[data-moment=date]{--bg:#0f766e;--eye:#fff;--glow:#a5f3e8}
[data-moment=wink]{--bg:#b83280;--eye:#fff;--glow:#ffc2e2}
[data-moment=yawn]{--bg:#4a3a8f;--eye:#fff;--glow:#cfc6ff}
[data-moment=hum]{--bg:#1561b8;--eye:#fff;--glow:#a8d4ff}
[data-moment=giggle]{--bg:#c2410c;--eye:#fff;--glow:#ffd0a8}
[data-moment=heart]{--bg:#c93a63;--eye:#fff;--glow:#ffc2d2}
[data-moment=daydream]{--bg:#3d3a9e;--eye:#fff;--glow:#cfd0ff}
[data-moment=sneeze]{--bg:#1f7a4d;--eye:#fff;--glow:#a8f0c8}
[data-moment=peek]{--bg:#7b2cbf;--eye:#fff;--glow:#e0c2ff}
[data-moment=fly]{--bg:#1a75a8;--eye:#fff;--glow:#b5e4ff}
[data-moment=star]{--bg:#10143a;--eye:#fff;--glow:#d6dcff}
[data-moment=spin]{--bg:#a8326b;--eye:#fff;--glow:#ffc2dc}
[data-moment=nod]{--bg:#2a2e40;--eye:#c5cbdd;--glow:#c5cbdd}
/* The real temperature sets the colour: cold blue through to hot red. */
[data-sky=cold]{--bg:#1f5fb0;--eye:#fff;--glow:#b5d6ff}
[data-sky=mild]{--bg:#0f7c73;--eye:#fff;--glow:#a5f3e8}
[data-sky=warm]{--bg:#c2570c;--eye:#fff;--glow:#ffd6a8}
[data-sky=hot]{--bg:#c0392b;--eye:#fff;--glow:#ffc0b8}
/* The real weather sets the colour too. */
[data-sky=rain]{--bg:#2c4a6e;--eye:#fff;--glow:#bcd8f5}
[data-sky=storm]{--bg:#241b4a;--eye:#fff;--glow:#cfc6ff}
[data-sky=snow]{--bg:#3f6f9e;--eye:#fff;--glow:#d8ecff}
[data-sky=sun]{--bg:#ffb703;--ink:#241a00;--eye:#241a00;--glow:#ffb703;--prop:#241a00}
[data-sky=cloud]{--bg:#4b6a8a;--eye:#fff;--glow:#d3e2f2}
[data-sky=fog]{--bg:#5b6675;--eye:#fff;--glow:#dfe5ec}
[data-sky=wind]{--bg:#0f7c73;--eye:#fff;--glow:#a5f3e8}
[data-sky=night]{--bg:#0b1040;--eye:#fff;--glow:#cfd6ff}
[data-eye=wink] .eye.l g.round,[data-eye=wink] .eye.r g.closed,[data-eye=coin] .eye g.coin,[data-eye=angry] .eye g.angry,[data-eye=spiral] .eye g.spiral{display:block}
.eye.r g.angry{transform:scaleX(-1);transform-origin:50px 60px}
.readout{position:absolute;left:0;top:0;width:600px;height:240px;display:none;color:var(--eye)}
[data-readout=on] .readout{display:block}
[data-readout=on] .corner{opacity:0}
.ro{position:absolute;top:0;height:240px;display:flex;align-items:center;justify-content:center;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
.ro.l{left:-30px;width:300px}.ro.r{left:330px;width:300px}.ro.c{left:270px;width:60px;animation:colon 1s steps(2,jump-none) infinite}
.ro svg{width:190px;height:190px}
.fx{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1;container-type:size;opacity:0;transition:opacity .5s;will-change:opacity}
.fx.on{opacity:1}
.has-lyrics .fx.on{opacity:.7}
.fx i{position:absolute;display:block;will-change:transform,opacity}
.fx .drop{top:-40px;width:7px;height:38px;border-radius:4px;background:var(--ink);opacity:.5;animation:fall .7s linear infinite}
.fx .flake{top:-20px;width:16px;height:16px;border-radius:50%;background:var(--ink);opacity:.8;animation:snow 3.4s linear infinite}
.fx .cloud{left:0;width:190px;height:190px;color:var(--ink);opacity:.2;animation:drift 8s linear both}
.fx .cloud svg,.fx .sun svg,.fx .flyer svg,.fx .shoot svg{display:block;width:100%;height:100%}
.fx .cloud svg path{fill:currentColor}
.fx .sun{left:50%;top:8px;width:130px;height:130px;margin-left:-65px;color:#fff;animation:rays 7s linear infinite}
.fx .twinkle{width:12px;height:12px;border-radius:50%;background:var(--ink);animation:twinkle 1.8s ease-in-out infinite}
.fx .gust{left:0;height:6px;width:190px;border-radius:3px;background:var(--ink);opacity:.35;animation:gust .9s linear infinite}
.fx .mist{left:-10%;width:120%;height:70px;border-radius:35px;background:var(--ink);opacity:.1;animation:mist 7s ease-in-out infinite alternate}
.fx .ember{bottom:-24px;width:14px;height:14px;border-radius:50%;background:#ff9d3c;opacity:0;animation:ember 2s ease-out infinite}
.wash-colour{position:absolute;inset:0;z-index:1;opacity:0;pointer-events:none;will-change:opacity}
.fx .pt{color:var(--c,var(--ink))}
.fx .pt svg{display:block;width:100%;height:100%}
.fx .pt-fall{top:-70px;animation:pt-fall 2.800s linear infinite}
.fx .pt-rise{bottom:-70px;animation:pt-rise 3s linear infinite}
.fx .pt-drift{left:0;animation:pt-drift 4.200s linear infinite}
.fx .pt-twinkle{animation:pt-twinkle 1.600s ease-in-out infinite}
.fx .pt-burst{opacity:0;animation:pt-burst 1.500s cubic-bezier(.2,.7,.3,1) both}
.fx .pt-sweep{left:0;animation:pt-sweep 2.800s ease-in-out both}
.fx .pt-ring{width:240px;height:240px;margin:-120px 0 0 -120px;border-radius:50%;border:8px solid var(--c);opacity:0;animation:pt-ring 1.400s ease-out infinite}
.fx .confetti{top:-24px;width:12px;height:18px;border-radius:2px;animation:pt-fall 2.200s linear infinite}
.fx .flash{inset:0;background:#fff;opacity:0;animation:flash 3.3s linear infinite}
.fx .flyer{left:0;top:0;width:100px;height:100px;color:#ffd34d;animation:flyer 7s ease-in-out both}
.fx .flyer b{display:block;width:100%;height:100%;animation:flap .16s linear infinite alternate}
.fx .shoot{left:0;top:0;width:120px;height:120px;color:#ffd34d;animation:shoot 1.5s .5s cubic-bezier(.3,.1,.8,.9) both}
[data-look=up] .eyes{transform:translateY(-30px)}
[data-look=drift] .eyes{animation:track-drift 7s ease-in-out both}
[data-moment=daydream] .eyes{transform:translate(-26px,-30px)}
[data-moment=fly] .eyes,[data-moment=lyricFly] .eyes{animation:track-fly 7s ease-in-out both}
[data-moment=star] .eyes,[data-moment=lyricShooting] .eyes{animation:track-star 1.5s .5s cubic-bezier(.3,.1,.8,.9) both}
[data-moment=peek] .eyes{animation:peek 4.2s ease-in-out both}
[data-moment=yawn] .mouth,[data-moment=homeYawn] .mouth,[data-moment=homeMorning] .mouth{animation:yawn 3.6s ease-in-out both}
[data-anim=stretch] .rb{animation:stretch 3.6s ease-in-out both}
[data-anim=sway] .rb{animation:sway 2.800s ease-in-out infinite}
[data-anim=bop] .rb{animation:bop .8s ease-in-out infinite}
[data-anim=bounce] .rb{animation:bounce 1s ease-in-out 3}
[data-anim=wobble] .rb{animation:wobble 1.600s ease-in-out infinite}
[data-anim=shiver] .rb{animation:shiver .22s linear infinite}
[data-anim=pulse] .rb{animation:pulse2 .6s ease-in-out infinite}
[data-anim=jump] .rb{animation:jump .9s ease-out 3}
[data-anim=squish] .rb{animation:squish 1s ease-in-out 2}
[data-anim=roll] .rb{animation:roll 2.200s cubic-bezier(.45,0,.55,1) both}
[data-anim=shy] .rb{animation:shy 3.400s ease-in-out both}
[data-anim=hide] .rb{animation:hide 3.400s ease-in-out both}
[data-anim=drop] .rb{animation:drop 3.200s ease-in-out both}
[data-anim=puff] .rb{animation:puff 2.600s ease-in-out both}
[data-anim=sidestep] .rb{animation:sidestep 2.800s ease-in-out both}
[data-anim=floaty] .rb{animation:floaty 2.400s ease-in-out infinite}
[data-anim=spin] .rb{animation:spin 1.3s cubic-bezier(.5,0,.3,1.2) .2s both}
[data-anim=nod] .rb{animation:nod 4.4s ease-in-out both}
[data-anim=sneeze] .rb{animation:sneeze 2.4s ease-in both}
@keyframes bop{0%,100%{transform:translateY(0)}50%{transform:translateY(9px)}}
@keyframes colon{from{opacity:1}to{opacity:.25}}
@keyframes fall{from{transform:translateY(0) rotate(8deg)}to{transform:translate(-60px,110cqh) rotate(8deg)}}
@keyframes snow{from{transform:translate(0,0)}50%{transform:translate(26px,55cqh)}to{transform:translate(-10px,110cqh)}}
@keyframes drift{from{transform:translateX(-200px)}to{transform:translateX(105cqw)}}
@keyframes rays{to{transform:rotate(360deg)}}
@keyframes twinkle{0%,100%{opacity:.15;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
@keyframes gust{from{transform:translateX(-200px)}to{transform:translateX(105cqw)}}
@keyframes mist{from{transform:translateX(-5%)}to{transform:translateX(5%)}}
@keyframes track-sweep{0%{transform:translateX(-52px)}100%{transform:translateX(52px)}}
@keyframes squish{0%,100%{transform:scale(1,1)}20%{transform:scale(1.18,.78)}40%{transform:scale(.88,1.14)}60%{transform:scale(1.08,.92)}80%{transform:scale(.97,1.03)}}
@keyframes roll{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes shy{0%,100%{transform:none}25%,75%{transform:translate(-60px,34px) scale(.84)}}
@keyframes hide{0%,100%{transform:none}30%,62%{transform:translateX(-1100px)}}
@keyframes drop{0%,100%{transform:none}22%,42%{transform:translateY(-800px)}68%{transform:translateY(0) scale(1.1,.85)}84%{transform:scale(.95,1.05)}}
@keyframes puff{0%,100%{transform:scale(1)}55%{transform:scale(1.28)}68%{transform:scale(1.32)}}
@keyframes sidestep{0%,100%{transform:translateX(0)}25%{transform:translateX(-70px)}75%{transform:translateX(70px)}}
@keyframes floaty{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-26px) rotate(3deg)}}
@keyframes pt-fall{from{transform:translateY(0) rotate(0)}to{transform:translateY(calc(100cqh + 90px)) rotate(200deg)}}
@keyframes pt-rise{0%{transform:translateY(0);opacity:0}12%{opacity:1}85%{opacity:1}100%{transform:translateY(calc(-100cqh - 90px));opacity:0}}
@keyframes pt-drift{from{transform:translateX(-120px)}to{transform:translateX(calc(100cqw + 120px))}}
@keyframes pt-twinkle{0%,100%{opacity:.15;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
@keyframes pt-burst{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}15%{opacity:1}75%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(1)}}
@keyframes pt-sweep{from{transform:translateX(-150px)}to{transform:translateX(calc(100cqw + 150px))}}
@keyframes pt-ring{0%{opacity:0;transform:scale(.35)}25%{opacity:.5}100%{opacity:0;transform:scale(1.9)}}
@keyframes bounce{0%,100%{transform:translateY(0) scale(1,1)}30%{transform:translateY(-22px) scale(.97,1.03)}60%{transform:translateY(0) scale(1.04,.95)}80%{transform:translateY(-8px)}}
@keyframes wobble{0%,100%{transform:rotate(0) translateX(0)}25%{transform:rotate(-6deg) translateX(-10px)}75%{transform:rotate(6deg) translateX(10px)}}
@keyframes shiver{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
@keyframes pulse2{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes jump{0%,100%{transform:translateY(0)}40%{transform:translateY(-46px)}70%{transform:translateY(0)}85%{transform:translateY(-10px)}}
@keyframes ember{0%{opacity:0;transform:translateY(0) scale(1)}15%{opacity:.95}100%{opacity:0;transform:translateY(-70cqh) scale(.3)}}
@keyframes flash{0%,91%,94%,97%,100%{opacity:0}92.5%{opacity:.5}95.5%{opacity:.25}}
@keyframes flyer{0%{transform:translate(-80px,34cqh)}20%{transform:translate(24cqw,6cqh)}40%{transform:translate(46cqw,54cqh)}60%{transform:translate(62cqw,12cqh)}80%{transform:translate(82cqw,48cqh)}100%{transform:translate(105cqw,14cqh)}}
@keyframes flap{from{transform:scaleX(1)}to{transform:scaleX(.45)}}
@keyframes shoot{from{transform:translate(-100px,4cqh) rotate(0)}to{transform:translate(105cqw,38cqh) rotate(300deg)}}
@keyframes track-fly{0%{transform:translate(-58px,0)}20%{transform:translate(-30px,-24px)}40%{transform:translate(-4px,18px)}60%{transform:translate(18px,-20px)}80%{transform:translate(44px,14px)}100%{transform:translate(58px,-16px)}}
@keyframes track-star{from{transform:translate(-58px,-26px)}to{transform:translate(58px,4px)}}
@keyframes track-drift{from{transform:translate(-40px,-22px)}to{transform:translate(40px,-22px)}}
@keyframes peek{0%{transform:translateX(0)}28%{transform:translateX(-1000px)}48%{transform:translateX(-1000px)}48.100%{transform:translateX(1000px)}70%{transform:translateX(1000px)}92%,100%{transform:translateX(0)}}
@keyframes yawn{0%,100%{transform:scale(.7)}45%,62%{transform:scale(1.6,2)}}
@keyframes stretch{0%,100%{transform:scale(1,1)}45%,62%{transform:scale(.97,1.05) translateY(-8px)}}
@keyframes sway{0%,100%{transform:rotate(0)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes nod{0%,100%{transform:translateY(0) rotate(0)}40%{transform:translateY(26px) rotate(-2deg)}48%{transform:translateY(-8px)}70%{transform:translateY(20px) rotate(2deg)}78%{transform:translateY(-6px)}}
@keyframes sneeze{0%{transform:scale(1)}55%{transform:scale(.97) translateY(-14px)}62%{transform:scale(1.08) translateY(12px)}70%{transform:translateX(-7px)}78%{transform:translateX(7px)}86%{transform:translateX(-4px)}100%{transform:none}}

/* ---------- controls: hidden until you tap ---------- */
.controls{position:absolute;inset:0;z-index:20;background:#0d1120;color:#fff;padding:14px;display:flex;flex-direction:column;gap:12px;
  opacity:0;visibility:hidden;transform:translateY(16px);transition:opacity .18s,transform .18s,visibility 0s .18s}
.open .controls{opacity:1;visibility:visible;transform:none;transition:opacity .18s,transform .18s}
/* ---------- the tap menu: heating strip or side column, then the buttons; layout chosen on the Customise page ---------- */
.menu{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}
.menu[data-layout=split]{flex-direction:row}
.menu-strip,.menu-side{display:none}
.menu.has-strip .menu-strip{display:block;flex-shrink:0;height:150px}
.menu.compact.has-strip .menu-strip{height:112px}
.menu.has-side .menu-side{display:flex;flex-direction:column;gap:12px;width:330px;flex-shrink:0}
.hpanel{border-radius:26px;background:#1d2238;color:#fff;display:flex;align-items:center;transition:background-color .2s}
.hpanel.on{background:#ff8a3d;color:#2a1000}
.hpanel-strip{height:100%;gap:18px;padding:0 18px 0 6px}
.hp-open{flex:1;min-width:0;align-self:stretch;display:flex;align-items:center;gap:16px;padding:0 0 0 20px;border-radius:22px;text-align:left}
.hp-ic{width:52px;height:52px;flex-shrink:0}
.hp-tx{min-width:0;display:flex;flex-direction:column;gap:2px}
.hp-title{font-size:26px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hp-sub{font-size:24px;opacity:.85}
.hp-set{display:flex;align-items:center;gap:14px}
.hp-step{width:96px;height:96px;border-radius:50%;background:rgba(255,255,255,.1);font-size:56px;font-weight:500;line-height:1}
.hpanel.on .hp-step{background:rgba(42,16,0,.14)}
.hp-step:disabled{opacity:.3}
.hp-target{width:150px;display:flex;flex-direction:column;align-items:center;line-height:1;font-variant-numeric:tabular-nums}
.hp-label{font-size:22px;opacity:.8}
.hp-label:empty{display:none}
.hp-val{font-size:72px;font-weight:700;letter-spacing:-.02em}
.hpanel.off .hp-val{font-size:44px;opacity:.75}
.menu.compact .hp-step{width:76px;height:76px;font-size:46px}
.menu.compact .hp-val{font-size:56px}
.menu.compact .hp-ic{width:40px;height:40px}
/* in the split layout's side column: the same pieces, stacked */
.hpanel-card{flex:1;min-height:0;flex-direction:column;align-items:stretch;justify-content:space-between;padding:14px 16px 16px}
.hpanel-card .hp-open{flex:0 0 auto;padding:0;gap:10px}
.hpanel-card .hp-ic{width:32px;height:32px}
.hpanel-card .hp-set{justify-content:space-between}
.hpanel-card .hp-step{width:72px;height:72px;font-size:44px}
.hpanel-card .hp-target{width:auto}
.hpanel-card .hp-val{font-size:64px}
.wcard{height:92px;flex-shrink:0;border-radius:26px;background:#1d2238;display:flex;align-items:center;gap:16px;padding:0 22px}
.wcard .ic{width:42px;height:42px;flex-shrink:0}
.wcard .tx{display:flex;align-items:baseline;gap:14px}
.wcard .nm{font-size:40px;font-weight:700}
.wcard .st{font-size:24px;opacity:.8}
.wtile{background:#16305a}
/* round: a row of circles with names underneath */
.lights[data-n=round]>:first-child{margin-left:auto}.lights[data-n=round]>:last-child{margin-right:auto}
.lights[data-n=round]{display:flex;align-items:center;justify-content:flex-start;gap:24px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:pan-x;padding:0 6px}
.lights[data-n=round]::-webkit-scrollbar{display:none}
.lights .rtile,.lights .rtile.on{background:none;color:inherit;border-radius:0;padding:0;flex-shrink:0;align-items:center;justify-content:center;gap:12px}
.rt-dot{width:132px;height:132px;box-sizing:border-box;border-radius:50%;border:3px solid #39405f;display:grid;place-items:center;transition:background-color .15s}
.rt-dot svg{width:52px;height:52px}
.rtile.on .rt-dot{background:var(--on,#ffd34d);border-color:transparent;color:#241a00}
.rtile.heat-on .rt-dot{background:#ff8a3d;color:#2a1000}
.rt-big{font-size:44px;font-weight:700;font-variant-numeric:tabular-nums}
.rtile .nm{font-size:24px;font-weight:500;max-width:200px}
.menu.compact .rt-dot{width:104px;height:104px}
.menu.compact .rt-big{font-size:36px}
.menu.compact .rt-dot svg{width:42px;height:42px}
.lights[data-n=row]{grid-template-columns:none;grid-auto-flow:column;grid-template-rows:minmax(0,1fr);grid-auto-columns:calc((100% - 36px) / 4.3);overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;touch-action:pan-x;overscroll-behavior:contain}
.lights[data-n=row]::-webkit-scrollbar{display:none}
.lights[data-n=row] .tile{scroll-snap-align:start}
.short .menu.has-strip .menu-strip{height:122px}
.short .menu.compact.has-strip .menu-strip{height:104px}
.short .hp-step{width:80px;height:80px;font-size:48px}
.short .hp-val{font-size:60px}
.short .hpanel-card .hp-step{width:58px;height:58px;font-size:36px}
.short .hpanel-card .hp-val{font-size:48px}
.short .hpanel-card{padding:10px 14px 12px}
.short .wcard{height:76px}
/* under the heating strip on a short screen: icon beside the name, so the words fit */
.short .menu.has-strip .lights .tile:not(.rtile){flex-direction:row;align-items:center;justify-content:flex-start;gap:14px;padding:10px 18px}
.short .menu.has-strip .lights .ic{width:40px;height:40px;flex-shrink:0}
.short .menu.has-strip .lights .nm{font-size:26px}
.short .menu.has-strip .lights .st{font-size:24px}
/* compact: smaller buttons, icon beside the name */
.menu.compact .lights .tile:not(.rtile){padding:10px 16px}
.lights{flex:1;min-height:0;display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:12px}
/* 5 to 8 lights: two rows of smaller buttons, icon beside the name. More than 8: two rows you swipe sideways,
   with the next column peeking in so it's clear there are more. */
.lights[data-n=many],.lights[data-n=scroll]{grid-template-rows:repeat(2,minmax(0,1fr))}
.lights[data-n=scroll]{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:calc((100% - 36px) / 4.3);overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x mandatory;scrollbar-width:none;touch-action:pan-x;overscroll-behavior:contain}
/* Split: the buttons share the screen with the heating card, so about two across, the next peeking in. */
.menu[data-layout=split] .lights[data-n=scroll]{grid-auto-columns:calc((100% - 12px) / 2.2)}
.lights[data-n=scroll]::-webkit-scrollbar{display:none}
.lights[data-n=scroll] .tile{scroll-snap-align:start}
.lights[data-n=many] .tile,.lights[data-n=scroll] .tile{flex-direction:row;align-items:center;justify-content:flex-start;gap:14px;padding:12px 18px;border-radius:22px}
.lights[data-n=many] .ic,.lights[data-n=scroll] .ic{width:40px;height:40px;flex-shrink:0}
/* Still readable across a room: nothing under 24px. */
.lights[data-n=many] .nm,.lights[data-n=scroll] .nm{font-size:26px}
.lights[data-n=many] .st,.lights[data-n=scroll] .st{font-size:24px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .tx{min-width:0;max-width:100%}
.tile .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile{border-radius:26px;background:#1d2238;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;padding:18px 20px;text-align:left;min-height:0;transition:background-color .15s,color .15s}
.tile .ic{width:48px;height:48px}
.tile .nm{font-size:30px;font-weight:700;line-height:1.1}
.tile .st{font-size:24px;font-weight:500;opacity:.8;margin-top:2px}
.tile.on{background:var(--on,#ffd34d);color:#241a00}
.tile{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
/* a scene has no On/Off line, so a long name may take two lines instead of being cut short */
.scene-tile .nm{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow-wrap:break-word}
.scene-tile .st:empty{display:none}
.settings{position:absolute;inset:0;background:#0d1120;padding:12px 14px 0;display:flex;flex-direction:column;gap:6px;opacity:0;visibility:hidden;transform:translateX(30px);transition:opacity .18s,transform .18s,visibility 0s .18s}
.settings-open .settings{opacity:1;visibility:visible;transform:none;transition:opacity .18s,transform .18s}
.set-head{flex-shrink:0;display:flex;align-items:center;gap:16px}
.set-back{width:72px;height:72px}
.set-head h2{margin:0;font-size:36px;font-weight:700}
.set-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;display:flex;flex-direction:column;gap:6px;padding:2px 4px 14px}
.set-row{flex-shrink:0;display:flex;align-items:center;gap:16px;height:68px}
.set-name{flex-shrink:0;width:170px;font-size:28px;font-weight:700}
.set-range{flex:1;min-width:0;touch-action:none}
.set-val{flex-shrink:0;width:92px;text-align:right;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.set-note{margin:0;font-size:22px;opacity:.75}
.set-note:empty{display:none}
.set-grid{flex-shrink:0;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
.set-t{height:76px;border-radius:22px;background:#1d2238;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 20px;font-size:26px;font-weight:600;text-align:left}
.set-t span{pointer-events:none}
.set-t i{flex-shrink:0;width:64px;height:36px;border-radius:18px;background:#39405f;position:relative;pointer-events:none;transition:background .15s}
.set-t i:after{content:'';position:absolute;left:4px;top:4px;width:28px;height:28px;border-radius:50%;background:#fff;transition:transform .15s}
.set-t[aria-pressed=true] i{background:#35c27a}
.set-t[aria-pressed=true] i:after{transform:translateX(28px)}
.set-select{flex:1;min-width:0;height:60px;border:0;border-radius:18px;background:#1d2238;color:#fff;font:inherit;font-size:26px;font-weight:600;padding:0 14px}
.set-style{flex-shrink:0;display:flex;align-items:center;gap:10px;height:84px}
.set-pick{flex:1;height:68px;border-radius:22px;background:#1d2238;font-size:26px;font-weight:600}
.set-pick[aria-pressed=true]{background:#fff;color:#0d1120}
/* ---------- heating page ---------- */
.heat-tile.on{background:#ff8a3d;color:#2a1000}
/* Robot vacuums: a button each in the menu (lit while busy), and a page with the live map and controls. */
.vac-tile.on{background:#5fd0ff;color:#04202c}
.vac{position:absolute;inset:0;background:#0d1120;padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;opacity:0;visibility:hidden;transform:translateX(30px);transition:opacity .18s,transform .18s,visibility 0s .18s}
.vac-open .vac{opacity:1;visibility:visible;transform:none;transition:opacity .18s,transform .18s}
.vac-name{flex-shrink:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vac-body{flex:1;min-height:0;display:flex;gap:20px}
.vac-map{position:relative;flex:1;min-width:0;height:100%;border-radius:22px;background:#161b2e;overflow:hidden;display:grid;place-items:center}
.vac-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.vac-canvas[hidden]{display:none}
.vac-nomap{font-size:24px;font-weight:600;color:#8d96b3}
.vac-canvas:not([hidden]) + .vac-nomap{display:none}
/* Tap the map: it fills the whole page; tap again for the controls. */
.vac-zoom{position:absolute;right:12px;bottom:12px;z-index:1;width:48px;height:48px;border-radius:24px;background:rgba(13,17,32,.72);color:#fff;display:grid;place-items:center;pointer-events:none}
.vac-zoom svg{width:28px;height:28px}
.vac-canvas[hidden] ~ .vac-zoom{display:none}
.vac.vac-big .vac-map{position:absolute;left:14px;right:14px;top:12px;bottom:14px;z-index:3;height:auto}
.vac-side{flex-shrink:0;width:300px;display:flex;flex-direction:column;justify-content:center;gap:14px}
.vac-status{margin:0;font-size:32px;font-weight:700;line-height:1.1}
.vac.busy .vac-status{color:#5fd0ff}
.vac.problem .vac-status{color:#ff8f8f}
.vac-sub{margin:0;font-size:24px;font-weight:600;color:#aab2c8;line-height:1.2}
.vac-sub:empty{display:none}
.vac-acts{display:flex;flex-direction:column;gap:12px;flex-shrink:0}
.vac-act{min-width:0;height:100px;border-radius:24px;background:#1d2238;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
.vac-act.main{background:#fff;color:#0d1120}
.vac-act:disabled{opacity:.35}
.va-ic{width:36px;height:36px}
.va-ic svg{display:block;width:100%;height:100%}
.va-tx{font-size:26px;font-weight:700}
.vac-pick .heat-chip{font-size:24px}
.icard .ic-map{display:block;width:100%;height:300px;border-radius:18px;background:rgba(0,0,0,.18)}
:is([data-mood=idle],[data-mood=groove]).has-vac:not(.has-words,.has-lyrics,.has-card,.night,.open,.vac-open,.has-pop,.door-open) .vwatch{opacity:1;transform:none;pointer-events:auto}
[data-robot=face]:is([data-mood=idle],[data-mood=groove]).has-vac:not(.has-words,.has-lyrics,.has-card,.night,.open,.vac-open,.has-pop,.door-open) .stage{transform:translate(-268px,0) scale(calc(var(--s,1)*.56))}
[data-robot=face]:is([data-mood=idle],[data-mood=groove]).has-vac:not(.has-words,.has-lyrics,.has-card,.night,.open,.vac-open,.has-pop,.door-open).has-np .stage{transform:translate(-268px,-30px) scale(calc(var(--s,1)*.52))}
[data-robot=buddy]:is([data-mood=idle],[data-mood=groove]).has-vac:not(.has-words,.has-lyrics,.has-card,.night,.open,.vac-open,.has-pop,.door-open) .stage{transform:translate(-262px,0) scale(calc(var(--s,1)*.84))}
[data-robot=buddy]:is([data-mood=idle],[data-mood=groove]).has-vac:not(.has-words,.has-lyrics,.has-card,.night,.open,.vac-open,.has-pop,.door-open).has-np .stage{transform:translate(-262px,-56px) scale(calc(var(--s,1)*.66))}
.heat{position:absolute;inset:0;background:#0d1120;padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;opacity:0;visibility:hidden;transform:translateX(30px);transition:opacity .18s,transform .18s,visibility 0s .18s}
.heat-open .heat{opacity:1;visibility:visible;transform:none;transition:opacity .18s,transform .18s}
/* ---------- a light's own page: hold its button in the menu ---------- */
.lpage{position:absolute;inset:0;background:#0d1120;padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;opacity:0;visibility:hidden;transform:translateX(30px);transition:opacity .18s,transform .18s,visibility 0s .18s}
.light-open .lpage{opacity:1;visibility:visible;transform:none;transition:opacity .18s,transform .18s}
.lp-name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-power{margin-left:auto;flex-shrink:0;height:72px;min-width:150px;padding:0 26px;border-radius:36px;background:#1d2238;font-size:28px;font-weight:700}
.lp-power[aria-pressed=true]{background:var(--on,#ffd34d);color:#241a00}
.lp-power:disabled{opacity:.35}
.lp-body{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:18px}
.lp-row{display:flex;align-items:center;gap:16px}
.lp-step{width:104px;height:104px;font-size:56px;font-weight:500;line-height:1}
.lp-step:disabled,.lp-bright[aria-disabled=true]{opacity:.35}
.lp-bright{position:relative;flex:1;min-width:0;height:150px;border-radius:30px;background:#1d2238;overflow:hidden;touch-action:none;cursor:pointer;-webkit-user-select:none;user-select:none}
/* the words are drawn twice: light on the dark part, dark on the filled part, so they read at any brightness */
.lp-in{position:absolute;left:0;top:0;bottom:0;width:100%;display:flex;align-items:center;gap:16px;padding:0 28px;box-sizing:border-box;pointer-events:none}
.lp-fill{position:absolute;left:0;top:0;bottom:0;width:0;overflow:hidden;background:var(--on,#ffd34d);color:#241a00;pointer-events:none}
.lp-ic{width:52px;height:52px;flex-shrink:0}
.lp-val{font-size:56px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.lp-note{margin:0;font-size:24px;opacity:.8}
.lp-note:empty{display:none}
.lp-colours{display:flex;align-items:center;gap:10px;overflow-x:auto;scrollbar-width:none;touch-action:pan-x;flex-shrink:0;padding:9px 9px}
.lp-colours::-webkit-scrollbar{display:none}
.lp-colours:empty{display:none}
.lp-temp{flex-shrink:0;height:68px;padding:0 18px;border-radius:34px;background:#1d2238;font-size:24px;font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:8px}
.lp-temp i{width:18px;height:18px;border-radius:50%;flex-shrink:0}
.lp-swatch{flex-shrink:0;width:64px;height:64px;border-radius:50%}
.lp-temp[aria-pressed=true]{background:#fff;color:#0d1120}
.lp-swatch[aria-pressed=true]{box-shadow:0 0 0 4px #0d1120,0 0 0 8px #fff}
.lp-gap{flex-shrink:0;width:2px;height:48px;background:#39405f;margin:0 4px}
.short .lp-bright{height:120px}
.short .lp-step{width:88px;height:88px;font-size:48px}
.short .lp-body{gap:12px}
.heat-pick{display:flex;gap:10px;margin-left:auto;overflow-x:auto;scrollbar-width:none}
.heat-pick::-webkit-scrollbar{display:none}
.heat-body{flex:1;min-height:0;display:flex;gap:26px;align-items:center}
.heat-dial{position:relative;height:100%;max-height:330px;aspect-ratio:1;flex-shrink:0}
.heat-dial svg{width:100%;height:100%;display:block}
.hd-track,.hd-fill{fill:none;stroke-width:16;stroke-linecap:round}
.hd-track{stroke:#262c47}
.hd-fill{stroke:#ffb37a;transition:stroke-dasharray .25s,stroke .3s}
.heat.heating .hd-fill{stroke:#ff8a3d}
.heat.off .hd-fill{opacity:0}
.hd-now{fill:#fff;stroke:#0d1120;stroke-width:4}
.hd-mid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;font-variant-numeric:tabular-nums}
.hd-label{font-size:22px;opacity:.7}
.hd-target{font-size:76px;font-weight:700;letter-spacing:-.02em}
.heat.off .hd-target{font-size:56px;opacity:.75}
.hd-cur{font-size:24px;font-weight:600;opacity:.85;margin-top:4px}
.heat-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:14px}
.heat-status{margin:0;font-size:26px;font-weight:600}
.heat.heating .heat-status{color:#ffb37a}
.heat-steps{display:flex;gap:14px}
.heat-step{flex:1;height:104px;border-radius:26px;background:#1d2238;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.heat-step b{font-size:58px;line-height:.9;font-weight:600}
.heat-step span{font-size:20px;opacity:.75}
.heat-step:active{background:#2b3254}
.heat-step:disabled{opacity:.35}
.heat-chips{display:flex;flex-wrap:wrap;gap:10px}
.heat-chips:empty{display:none}
.heat-chip{flex-shrink:0;height:60px;padding:0 22px;border-radius:30px;background:#1d2238;font-size:23px;font-weight:600;white-space:nowrap}
.heat-chip[aria-pressed=true]{background:#fff;color:#0d1120}
/* ---------- Customise menu ---------- */
.set-link{flex-shrink:0;height:76px;border-radius:22px;background:#1d2238;display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-size:26px;font-weight:600;margin-top:6px}
.set-link span:last-child{font-size:40px;line-height:1;opacity:.7}
.cust{position:absolute;inset:0;background:#0d1120;padding:12px 14px 0;display:flex;flex-direction:column;gap:6px;opacity:0;visibility:hidden;transform:translateX(30px);transition:opacity .18s,transform .18s,visibility 0s .18s}
.cust-open .cust{opacity:1;visibility:visible;transform:none;transition:opacity .18s,transform .18s}
.cust-h{flex-shrink:0;font-size:22px;font-weight:700;color:#aab2c8;margin-top:10px}
.cust-layouts{flex-shrink:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.cust-layout{height:104px;border-radius:20px;background:#1d2238;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:22px;font-weight:600}
.cust-layout[aria-pressed=true]{background:#fff;color:#0d1120}
.cl-art{width:64px;height:38px;display:flex;flex-direction:column;gap:3px}
.cl-art i{display:block;background:currentColor;opacity:.45;border-radius:3px}
.cl-wide{flex:1;background:#ff8a3d!important;opacity:1!important}
.cl-row{flex:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px}
.cl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}
.cl-split{flex-direction:row}
.cl-col{width:20px;background:#ff8a3d!important;opacity:1!important}
.cl-grid2{flex:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}
.cl-round{flex-direction:row;align-items:center;justify-content:space-between}
.cl-round i{width:13px;height:13px;border-radius:50%}
.cust-colours{flex-shrink:0;display:flex;gap:14px;padding:4px 2px}
.cust-swatch{width:64px;height:64px;border-radius:50%}
.cust-swatch[aria-pressed=true]{box-shadow:0 0 0 4px #0d1120,0 0 0 7px #fff}
.cust-sizes{flex-shrink:0;display:flex;gap:10px}
.cust-pick{flex:1;height:64px;border-radius:22px;background:#1d2238;font-size:24px;font-weight:600}
.cust-pick[aria-pressed=true]{background:#fff;color:#0d1120}
.cust-items{flex-shrink:0;display:flex;flex-direction:column;gap:8px;padding-bottom:6px}
.cust-row{height:72px;border-radius:20px;background:#1d2238;display:flex;align-items:center;gap:10px;padding:0 10px 0 20px}
.cust-row.hidden .cust-name{opacity:.55}
.cust-name{flex:1;min-width:0;font-size:24px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cust-kind{font-size:22px;color:#aab2c8}
.cust-move{width:56px;height:56px;border-radius:50%;background:#2b3254;display:grid;place-items:center}
.cust-move svg{width:28px;height:28px;pointer-events:none}
.cust-move:disabled{opacity:.25}
.cust-sw{width:76px;height:44px;border-radius:22px;background:#39405f;position:relative;flex-shrink:0;margin-left:6px}
.cust-sw:after{content:'';position:absolute;left:5px;top:5px;width:34px;height:34px;border-radius:50%;background:#fff;transition:transform .15s}
.cust-sw[aria-pressed=true]{background:#35c27a}
.cust-sw[aria-pressed=true]:after{transform:translateX(32px)}
.dimmer{position:absolute;inset:0;z-index:29;background:#000;opacity:0;pointer-events:none}
.adjust{display:none;flex-shrink:0;align-items:center;gap:10px;height:62px}
.has-lines .adjust{display:flex}
.adjust .now{flex:1;min-width:0;font-size:24px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:8px}
.adjust .val{width:92px;text-align:center;font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.adjust button{height:62px;width:124px;flex-shrink:0;border-radius:31px;background:#1d2238;font-size:24px;font-weight:700}
.bar{flex-shrink:0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;height:104px}
/* Media buttons in the middle; the microphone on the left, Settings and close on the right. */
.bar-m{display:flex;gap:16px}
.bar-l{justify-self:start}
.bar-r{justify-self:end;display:flex;gap:10px}
.set-range{-webkit-appearance:none;appearance:none;width:100%;height:56px;background:transparent;margin:0;display:block}
.set-range::-webkit-slider-runnable-track{height:14px;border-radius:7px;background:#39405f}
.set-range::-moz-range-track{height:14px;border-radius:7px;background:#39405f}
.set-range::-webkit-slider-thumb{-webkit-appearance:none;width:42px;height:42px;margin-top:-14px;border-radius:50%;background:#fff}
.set-range::-moz-range-thumb{width:42px;height:42px;border:0;border-radius:50%;background:#fff}
.round{width:88px;height:88px;flex-shrink:0;border-radius:50%;background:#1d2238;display:grid;place-items:center}
.round span{width:42px;height:42px;pointer-events:none}
.round.main{background:#fff;color:#0d1120}
.round.micbtn[aria-pressed=true]{background:#e5484d}
.toast{position:absolute;left:50%;bottom:130px;transform:translateX(-50%);background:#fff;color:#111;font-size:24px;font-weight:600;padding:12px 22px;border-radius:16px;opacity:0;pointer-events:none;transition:opacity .15s;z-index:25;max-width:86%;text-align:center;width:max-content}
.toast.show{opacity:1}

/* ---------- timers and reminders: pop up at the top, then wait as a small pill in the corner ---------- */
[data-mood=remind]{--bg:#d9822b;--eye:#fff;--glow:#ffd8a8}
/* The doorbell: its camera, live, over everything until closed. */
.door{position:absolute;inset:12px;z-index:30;display:flex;flex-direction:column;border-radius:28px;background:#05070d;color:#fff;opacity:0;pointer-events:none;transition:opacity .25s}
.door-open .door{opacity:1;pointer-events:auto}
.door-head{flex-shrink:0;display:flex;align-items:center;gap:14px;height:68px;padding:0 10px 0 22px}
.door-ic{width:34px;height:34px;flex-shrink:0}
.door-ic svg{display:block;width:100%;height:100%}
.door-title{flex:1;min-width:0;font-size:30px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.door-x{flex-shrink:0;height:54px;padding:0 28px;border-radius:27px;background:#fff;color:#111;font-size:26px;font-weight:700}
.door-sound{display:none;flex-shrink:0;height:54px;padding:0 24px;border-radius:27px;background:transparent;color:#fff;border:2px solid #fff;font-size:26px;font-weight:700}
.door-quiet .door-sound{display:block}
.door-video{flex:1;min-height:0;margin:0 10px 10px;border-radius:20px;overflow:hidden;background:#111;display:flex;align-items:center;justify-content:center}
.door-video > *{width:100%;max-height:100%}
.door-video img{display:block;width:100%;height:100%;object-fit:contain}
.door-wait{font-size:26px;font-weight:600;color:#aab2c8}
.alerts{position:absolute;inset:0;z-index:8;pointer-events:none;transition:opacity .25s}
.open .alerts{opacity:0}
.open .al{pointer-events:none}
.al{position:absolute;left:0;top:0;display:flex;align-items:center;height:44px;padding:0 16px 0 12px;border-radius:22px;
  background:#151a2e;color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.12);white-space:nowrap;pointer-events:auto;cursor:pointer;
  transform-origin:0 0;opacity:0;transition:transform .5s cubic-bezier(.3,1.15,.5,1),opacity .3s;will-change:transform,opacity;font-variant-numeric:tabular-nums}
.al.in{opacity:1}
.al.gone{opacity:0;pointer-events:none}
.al.paused{color:#aab2c8}
.al-row{display:flex;align-items:center;gap:12px;min-width:0}
.al-ic{width:26px;height:26px;flex-shrink:0}
.al-main{display:flex;flex-direction:column;min-width:0;line-height:1.1}
.al-title{font-size:22px;font-weight:700;overflow:hidden;text-overflow:ellipsis}
.al-title:empty{display:none}
.al-sub{display:none;font-size:20px;font-weight:600;opacity:.8}
.al-time{font-size:24px;font-weight:700}
.al-time:empty{display:none}
.al-btns{display:none;gap:10px;margin-left:6px}
.al-b{height:52px;padding:0 20px;border-radius:26px;background:rgba(255,255,255,.14);color:inherit;font:inherit;font-size:20px;font-weight:700;border:0;cursor:pointer}
.al-b.main{background:#fff;color:#111}
.al.centre{flex-direction:column;justify-content:center;height:auto;min-height:72px;padding:12px 24px;border-radius:28px;gap:8px;max-width:600px;white-space:normal}
.al.centre .al-row{gap:16px;max-width:100%}
.al.centre .al-ic{width:38px;height:38px}
.al.centre .al-title{font-size:30px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.al.centre .al-sub:not(:empty){display:block}
.al.centre .al-time{font-size:38px}
.al.centre .al-btns:not(:empty){display:flex;justify-content:center;margin:2px 0 2px}
/* Something in the middle: the robot steps back a little to make room, as it does for the music bar. */
[data-robot=face].has-pop .stage{transform:translate(0,64px) scale(calc(var(--s,1)*.62))}
[data-robot=buddy].has-pop .stage{transform:translate(0,64px) scale(calc(var(--s,1)*.6))}
[data-robot=face].has-pop.has-np .stage,[data-robot=buddy].has-pop.has-np .stage{transform:translate(0,30px) scale(calc(var(--s,1)*.5))}
[data-robot=face].has-pop.has-words .stage,[data-robot=face].has-pop.has-lyrics .stage{transform:translate(-268px,40px) scale(calc(var(--s,1)*.5))}
[data-robot=buddy].has-pop.has-words .stage,[data-robot=buddy].has-pop.has-lyrics .stage{transform:translate(-262px,40px) scale(calc(var(--s,1)*.7))}
.al.ring{background:#fff;color:#111;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.al.ring .al-b{background:#eceef3}
.al.ring .al-b.main{background:#111;color:#fff}
.al.ring:before{content:'';position:absolute;inset:-8px;border-radius:36px;border:4px solid #fff;opacity:0;animation:al-pulse 1.6s ease-out infinite;pointer-events:none}
@keyframes al-pulse{0%{opacity:.7;transform:scale(.97)}100%{opacity:0;transform:scale(1.08)}}
.al.missed{color:#ffd29a}
.has-dock .words,.has-dock .lyric{top:calc(var(--dock-h,0px) + ${DOCK_TOP}px)}

/* ---------- talking from a PC ---------- */
.talkbtn{display:none;position:absolute;right:20px;bottom:20px;width:64px;height:64px;border-radius:50%;border:0;padding:0;cursor:pointer;
  background:#151a2e;color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.12);opacity:.5;z-index:8;place-items:center;transition:opacity .2s,bottom .3s}
.talkbtn span{width:30px;height:30px;pointer-events:none}
.talk-mode .talkbtn{display:grid}
.talk-mode .talkbtn:hover,.talk-mode .talkbtn:focus-visible{opacity:1}
.talking .talkbtn{opacity:1;background:#fff;color:#111}
.has-np .talkbtn{bottom:122px}
.open .talkbtn{display:none}
.talkhint{position:absolute;right:96px;bottom:36px;font-size:18px;font-weight:600;opacity:0;transition:opacity .3s;z-index:8;pointer-events:none}
.talk-mode .talkbtn:hover + .talkhint{opacity:.8}
.has-np .talkhint{bottom:138px}
@media(max-width:700px){.lights[data-n=few]{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
`;

// ---- Bops: characters a screen can pick, or make. A Bop is a face only: a colour, eyes, a mouth and extras, plus a
// personality (how it talks back; the echo_robot add-on adds it to the assistant's instructions) and a voice.
// Its eyes and mouth take the place of the plain round eyes and the plain smile everywhere. Anything special a moment
// shows (hearts, stars, a big grin, the talking mouth) stays the moment's, so every reaction still reads.
const BOP_EYE_PATHS = {
  round: '<rect class="fill" x="8" y="4" width="84" height="112" rx="40"/>',
  tall: '<rect class="fill" x="25" y="-6" width="50" height="132" rx="25"/>',
  dots: '<circle class="fill" cx="50" cy="64" r="25"/>',
  happy: '<path class="line" d="M12 82Q50-6 88 82"/>',
  sleepy: '<path class="fill" d="M6 56H94A44 44 0 0 1 6 56Z"/>',
  closed: '<path class="line" d="M12 50Q50 96 88 50"/>',
  star: '<path class="fill" d="M50 4 63 42 100 44 71 68 82 108 50 85 18 108 29 68 0 44 37 42Z"/>',
};
const BOP_MOUTH_PATHS = {
  smile: '<path class="stroke" d="M30 16Q90 90 150 16"/>',
  grin: '<path class="solid" d="M24 8H156Q150 78 90 78 30 78 24 8Z"/>',
  small: '<path class="stroke" d="M64 28Q90 52 116 28"/>',
  o: '<ellipse class="solid" cx="90" cy="40" rx="26" ry="36"/>',
  flat: '<path class="stroke" d="M52 40H128"/>',
  cat: '<path class="stroke" d="M38 24Q50 66 90 36Q130 66 142 24"/>',
};
const BOP_EYES = Object.keys(BOP_EYE_PATHS), BOP_MOUTHS = Object.keys(BOP_MOUTH_PATHS), BOP_EXTRAS = ['brows', 'blush', 'freckles', 'glasses'];
const BOP_WORDS = { round: 'Round', tall: 'Tall', dots: 'Dots', happy: 'Happy', sleepy: 'Sleepy', closed: 'Closed', star: 'Star', smile: 'Smile', grin: 'Grin', small: 'Small', o: 'Ooh', flat: 'Flat', cat: 'Cat', brows: 'Eyebrows', blush: 'Blush', freckles: 'Freckles', glasses: 'Glasses' };
const BOP_MOODS = [['cheerful', 'Cheerful', 'Warm and upbeat'], ['bubbly', 'Bubbly', 'Excitable, chatty'], ['grumpy', 'Grumpy', 'Dry, mutters'], ['posh', 'Posh', 'Terribly polite'], ['sleepy', 'Sleepy', 'Slow and dozy'], ['cheeky', 'Cheeky', 'Teases a bit']];
// The voices the voice connector offers (voice-bridge/echo_voice_bridge.py VOICES), as picked from samples.
const BOP_VOICES = [['bm_fable', 'Fable', 'British man'], ['bm_lewis', 'Lewis', 'British man'], ['af_sarah', 'Sarah', 'US woman'], ['af_sky', 'Sky', 'US woman'], ['am_echo', 'Echo', 'US man'], ['am_onyx', 'Onyx', 'US man'], ['am_santa', 'Santa', 'US man']];
const BOP_COLOURS = [['#3b3fb8', 'Blue'], ['#1b2f5e', 'Navy'], ['#3a2a7a', 'Purple'], ['#c2407a', 'Pink'], ['#7a1f2b', 'Maroon'], ['#c45a12', 'Orange'], ['#8a6a00', 'Mustard'], ['#0f6e56', 'Green'], ['#1f7a8c', 'Teal'], ['#0d1120', 'Night']];
const BOP_PRESETS = [
  { id: 'beep', name: 'Beep', bg: '#3b3fb8', eye: 'round', mouth: 'smile', extras: [], mood: 'cheerful', voice: 'bm_fable' },
  { id: 'bop', name: 'Bop', bg: '#c2407a', eye: 'happy', mouth: 'grin', extras: ['blush'], mood: 'bubbly', voice: 'af_sky' },
  { id: 'grumbles', name: 'Grumbles', bg: '#7a1f2b', eye: 'sleepy', mouth: 'flat', extras: ['brows'], mood: 'grumpy', voice: 'am_onyx' },
  { id: 'sirbleep', name: 'Sir Bleep', bg: '#1b2f5e', eye: 'dots', mouth: 'small', extras: ['glasses', 'brows'], mood: 'posh', voice: 'bm_lewis' },
  { id: 'dozy', name: 'Dozy', bg: '#3a2a7a', eye: 'closed', mouth: 'o', extras: [], mood: 'sleepy', voice: 'af_sarah' },
  { id: 'sparky', name: 'Sparky', bg: '#c45a12', eye: 'star', mouth: 'cat', extras: ['freckles'], mood: 'cheeky', voice: 'am_echo' },
];
const BOP_DEFAULT = 'beep', BOP_NAME_MAX = 16, BOP_MAX = 40, BOP_LOCAL_KEY = 'echo-robot-bops';
const BOP_NEW_NAMES = ['Blip', 'Zippy', 'Pip', 'Widget', 'Nova', 'Boop', 'Chip', 'Ziggy', 'Bleepo', 'Sprocket'];
const BOP_ICON = { pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/>'), plus: svg('<path d="M12 5v14M5 12h14"/>') };
const BOP_EXTRA_PICS = {
  brows: '<svg viewBox="0 0 120 40" aria-hidden="true"><rect x="4" y="12" width="44" height="12" rx="6" fill="currentColor" transform="rotate(-8 26 18)"/><rect x="72" y="12" width="44" height="12" rx="6" fill="currentColor" transform="rotate(8 94 18)"/></svg>',
  blush: '<svg viewBox="0 0 120 40" aria-hidden="true"><ellipse cx="26" cy="20" rx="22" ry="11" fill="#ff8fbc"/><ellipse cx="94" cy="20" rx="22" ry="11" fill="#ff8fbc"/></svg>',
  freckles: '<svg viewBox="0 0 120 40" aria-hidden="true"><g fill="#e8a06a"><circle cx="14" cy="14" r="5"/><circle cx="26" cy="26" r="5"/><circle cx="38" cy="15" r="5"/><circle cx="82" cy="15" r="5"/><circle cx="94" cy="26" r="5"/><circle cx="106" cy="14" r="5"/></g></svg>',
  glasses: '<svg viewBox="0 0 120 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="6"><circle cx="30" cy="22" r="16"/><circle cx="90" cy="22" r="16"/><path d="M46 20q14-8 28 0"/></g></svg>',
};
const BOP_LINES = { cheerful: 'Morning! Lovely day for it. Whatever “it” is.', bubbly: 'Ooh, is that a new song? Turn it up, turn it UP!', grumpy: 'It’s raining. Of course it’s raining.', posh: 'Splendid. Shall I dim the lights for you, old bean?', sleepy: 'Mm… five more minutes… zzz', cheeky: 'Bet I can guess your next song. Nope. Wrong. Again?' };
// Music moments each personality picks from, and the idle moments it does more or less of. Cheerful does everything.
const BOP_MUSIC = {
  bubbly: ['vibeHop', 'vibeStars', 'vibeHeart', 'vibeDance', 'vibeBop', 'vibeWink'],
  grumpy: ['vibeTilt', 'vibeGlance', 'vibeDrowsy', 'vibeSway'],
  posh: ['vibeHum', 'vibeSway', 'vibeGlance', 'vibeTilt'],
  sleepy: ['vibeDrowsy', 'yawn', 'vibeSway', 'vibeHum'],
  cheeky: ['vibeWink', 'vibeTilt', 'vibeStars', 'vibeGlance', 'vibeBop'],
};
const BOP_PLAY_MORE = { bubbly: ['spin', 'giggle', 'heart'], posh: ['hum', 'daydream'], sleepy: ['yawn', 'nod', 'daydream'], cheeky: ['wink', 'peek', 'giggle'] };
const BOP_PLAY_LESS = { grumpy: ['giggle', 'heart', 'spin', 'wink'], posh: ['spin'], sleepy: ['spin'] };
// Eyebrows: how high they sit for each eye shape (face units), and how each personality holds them: [turn, up] left and right.
const BOP_BROW_Y = { round: -44, tall: -62, dots: 28, happy: 20, sleepy: 54, closed: 52, star: -40, heart: -14, half: 56, x: 10, squeeze: 14, angry: 22, coin: -48, spiral: -10 };
const BOP_BROW = { cheerful: [[-5, -8], [5, -8]], bubbly: [[-7, -14], [7, -14]], grumpy: [[16, 10], [-16, 10]], posh: [[-5, -10], [5, 2]], sleepy: [[-9, 8], [9, 8]], cheeky: [[8, 6], [-12, -20]] };
const bopAwake = (eye) => (eye === 'closed' ? 'sleepy' : eye); // shut eyes open a little when something's going on
// A Bop as saved, checked: anything odd is put right rather than trusted (the list comes from Home Assistant or this screen).
function cleanBop(b) {
  if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(b.id)) return null;
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, BOP_NAME_MAX);
  if (!name) return null;
  return {
    id: b.id, name,
    bg: /^#[0-9a-f]{6}$/i.test(b.bg || '') ? b.bg.toLowerCase() : BOP_PRESETS[0].bg,
    eye: BOP_EYES.includes(b.eye) ? b.eye : 'round',
    mouth: BOP_MOUTHS.includes(b.mouth) ? b.mouth : 'smile',
    extras: BOP_EXTRAS.filter((x) => Array.isArray(b.extras) && b.extras.includes(x)),
    mood: BOP_MOODS.some(([m]) => m === b.mood) ? b.mood : 'cheerful',
    voice: typeof b.voice === 'string' && /^[\w.-]{1,40}$/.test(b.voice) ? b.voice : BOP_PRESETS[0].voice,
  };
}
// The extras, in face units (600×350): glasses and eyebrows go with the eyes, blush and freckles on the cheeks.
// "still" draws the eyebrows in place (for the small faces); on the live face, CSS places them, so they can move.
function bopKit(b, still) {
  const has = (x) => b.extras.includes(x);
  let eyes = '', cheeks = '';
  if (has('glasses')) eyes += '<g class="bop-glass"><circle cx="130" cy="122" r="116"/><circle cx="470" cy="122" r="116"/><path class="bop-glass-line" d="M246 110Q300 82 354 110M14 100-34 82M586 100 634 82"/></g>';
  if (has('brows')) {
    const y = has('glasses') ? -22 : (BOP_BROW_Y[b.eye] ?? -44);
    const hold = BOP_BROW[b.mood] || BOP_BROW.cheerful;
    const brow = (side, x, [turn, up]) => `<rect class="brow ${side}" x="${x}" y="0" width="124" height="24" rx="12"${still ? ` style="transform:translateY(${up}px) rotate(${turn}deg)"` : ''}/>`;
    eyes += `<g class="brows"${still ? ` style="transform:translateY(${y}px)"` : ''}>${brow('l', 68, hold[0])}${brow('r', 408, hold[1])}</g>`;
  }
  if (has('blush')) cheeks += '<g class="bop-blush"><ellipse cx="92" cy="278" rx="56" ry="25"/><ellipse cx="508" cy="278" rx="56" ry="25"/></g>';
  if (has('freckles')) cheeks += `<g class="bop-freckles">${[[66, 262], [92, 284], [118, 264], [534, 262], [508, 284], [482, 264]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7.5"/>`).join('')}</g>`;
  return { eyes, cheeks };
}
// A small still face, for the Bops page and the maker. scale is of the 600×350 face.
function bopFace(b, scale) {
  const kit = bopKit(b, true), eye = BOP_EYE_PATHS[b.eye];
  return `<span class="bf" style="width:${Math.round(600 * scale)}px;height:${Math.round(350 * scale)}px"><span class="bf-in" style="transform:scale(${scale})">`
    + `<svg class="bf-eye l" viewBox="0 0 100 120">${eye}</svg><svg class="bf-eye r" viewBox="0 0 100 120">${eye}</svg>`
    + `<svg class="bf-kit" viewBox="0 0 600 350">${kit.eyes}${kit.cheeks}</svg><svg class="bf-mouth" viewBox="0 0 180 80">${BOP_MOUTH_PATHS[b.mouth]}</svg></span></span>`;
}
const BOP_STYLE = `
/* ---------- Bops: on the face ---------- */
[data-eye=tall] .eye g.tall,[data-eye=dots] .eye g.dots,[data-eye=sleepy] .eye g.sleepy,[data-mouth=cat] .mouth .cat{display:block}
.shell[data-beye]:not([data-beye=round])[data-eye=odd] .eye g.round,.shell[data-beye]:not([data-beye=round])[data-eye=wink] .eye.l g.round{display:none}
${['tall', 'dots', 'happy', 'sleepy', 'star'].map((s) => `.shell[data-beye=${s}][data-eye=odd] .eye g.${s},.shell[data-beye=${s}][data-eye=wink] .eye.l g.${s}{display:block}`).join('\n')}
.bop-eyes,.bop-cheeks{position:absolute;left:0;top:0;width:600px;height:350px;overflow:visible;pointer-events:none;display:none;color:var(--eye);transition:opacity .13s,color .3s}
[data-robot=face][data-bop] .bop-eyes,[data-robot=face][data-bop] .bop-cheeks{display:block}
[data-eye=none] .bop-eyes{opacity:0}
.bop-glass{fill:currentColor;fill-opacity:.1;stroke:currentColor;stroke-width:13;stroke-linecap:round}
.bop-glass .bop-glass-line{fill:none}
.brows{transition:transform .25s}
.brow{fill:currentColor;transform-box:fill-box;transform-origin:center;transform:translateY(calc(var(--y,0px) + var(--up,0px))) rotate(var(--r,0deg));transition:transform .35s}
.bop-blush{fill:#ff8fbc;opacity:.62}
.bop-freckles{fill:#ffd9b6}
${Object.entries(BOP_BROW_Y).map(([e, y]) => `.shell[data-eye=${e}] .bop-eyes .brows{transform:translateY(${y}px)}`).join('')}
${['odd', 'wink'].map((e) => ['tall', 'dots', 'happy', 'sleepy', 'star'].map((s) => `.shell[data-eye=${e}][data-beye=${s}] .bop-eyes .brows{transform:translateY(${BOP_BROW_Y[s]}px)}`).join('')).join('')}
.shell[data-bop][data-robot] .bop-eyes.glasses .brows{transform:translateY(-22px)}
${Object.entries(BOP_BROW).map(([m, [[lt, lu], [rt, ru]]]) => `.shell[data-bop=${m}] .bop-eyes .brow.l{--r:${lt}deg;--y:${lu}px}.shell[data-bop=${m}] .bop-eyes .brow.r{--r:${rt}deg;--y:${ru}px}`).join('')}
.shell[data-mood=listening] .bop-eyes .brow{--up:-14px}
.shell[data-mood=thinking] .bop-eyes .brow.r{--up:-22px;--r:-6deg}
.shell:is([data-mood=alarm],[data-mood=remind],[data-mood=wakeup]) .bop-eyes .brow{--up:-30px}
.shell[data-eye=heart] .bop-eyes .brow{--up:-14px}
.shell[data-mood=confused] .bop-eyes .brow.l{--r:12deg}.shell[data-mood=confused] .bop-eyes .brow.r{--r:-14deg;--up:-16px}
.shell[data-eye=angry] .bop-eyes .brow.l{--r:18deg}.shell[data-eye=angry] .bop-eyes .brow.r{--r:-18deg}
/* Its colour replaces the plain background while resting with music on, too (not over album colours or a moment). */
.shell[data-robot=face][data-bop][data-mood=groove]:not([data-art=on]):is([data-moment=""],:not([data-moment])){--bg:var(--rest);--eye:#fff;--glow:#fff;--prop:#fff}
/* the small still faces */
.bf{position:relative;display:block;flex-shrink:0;color:#fff;pointer-events:none}
.bf-in{position:absolute;left:0;top:0;width:600px;height:350px;transform-origin:0 0}
.bf-eye{position:absolute;top:0;width:200px;height:240px;overflow:visible}
.bf-eye.l{left:30px}.bf-eye.r{left:370px}
.bf-mouth{position:absolute;left:210px;top:262px;width:180px;height:80px;overflow:visible}
.bf-kit{position:absolute;left:0;top:0;width:600px;height:350px;overflow:visible}
.bf .fill,.bf .solid{fill:currentColor}
.bf .line{fill:none;stroke:currentColor;stroke-width:21;stroke-linecap:round;stroke-linejoin:round}
.bf .stroke{fill:none;stroke:currentColor;stroke-width:18;stroke-linecap:round;stroke-linejoin:round}
/* ---------- Bops: the Settings row, the Bops page and the maker ---------- */
.set-link.bop-link{justify-content:flex-start;gap:16px;padding-left:12px}
.bop-link .bop-dot{width:88px;height:56px;border-radius:16px;flex-shrink:0;position:relative;overflow:hidden}
.bop-link .bop-dot .bf{position:absolute;left:14px;top:10px}
.bop-link .bop-label{flex:1;text-align:left}
.bops,.bopm{position:absolute;inset:0;background:#0d1120;padding:12px 14px 0;display:flex;flex-direction:column;gap:10px;opacity:0;visibility:hidden;transform:translateX(30px);transition:opacity .18s,transform .18s,visibility 0s .18s}
.bops-open .bops,.bopm-open .bopm{opacity:1;visibility:visible;transform:none;transition:opacity .18s,transform .18s}
.bops .set-head h2{flex:1}
.bops-now{font-size:24px;color:#aab2c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}
.bops-grid{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-content:start;padding:2px 2px 14px}
.bop-tile{position:relative;height:166px;border-radius:22px;background:#1d2238;overflow:hidden}
.bop-use{position:absolute;inset:0;display:flex;flex-direction:column;text-align:left}
.bop-thumb{position:relative;height:112px;width:100%;flex-shrink:0;overflow:hidden}
.bop-thumb .bf{position:absolute;left:50%;top:20px;margin-left:-78px}
.bop-tname{flex:1;width:100%;display:flex;align-items:center;padding:0 64px 0 16px;font-size:26px;font-weight:700;min-width:0}
.bop-tname span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bop-tile[aria-current=true]{outline:5px solid #fff;outline-offset:-5px}
.bop-tile[aria-current=true] .bop-tname{background:#fff;color:#0d1120}
.bop-edit{position:absolute;right:8px;bottom:5px;width:44px;height:44px;border-radius:50%;background:rgba(120,130,170,.26);display:grid;place-items:center}
.bop-tile[aria-current=true] .bop-edit{background:#dfe3ef;color:#0d1120}
.bop-edit span,.bop-new span.ic{width:24px;height:24px;pointer-events:none}
.bop-new{height:166px;border-radius:22px;box-shadow:inset 0 0 0 4px #39405f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:26px;font-weight:700}
.bop-new span.ic{width:44px;height:44px}
.bopm-head{flex-shrink:0;display:flex;align-items:center;gap:12px;height:72px}
.bopm-name{flex:1;min-width:0;height:64px;border-radius:20px;background:#1d2238;display:flex;align-items:center;gap:10px;padding:0 18px}
.bopm-name span{width:30px;height:30px;opacity:.7;flex-shrink:0}
.bopm-name input{flex:1;min-width:0;width:100%;border:0;background:transparent;color:#fff;font:inherit;font-size:32px;font-weight:700;padding:0;outline:none}
.bop-pill{height:64px;border-radius:22px;padding:0 24px;font-size:26px;font-weight:700;background:#1d2238;flex-shrink:0;white-space:nowrap}
.bop-pill.main{background:#fff;color:#0d1120}
.bop-pill.warn{background:#e5484d}
.bop-pill[hidden]{display:none}
.bopm-body{flex:1;min-height:0;display:flex;gap:12px;padding-bottom:14px}
.bopm-prev{width:336px;flex-shrink:0;border-radius:24px;position:relative;overflow:hidden;transition:background-color .35s}
.bopm-prev .bf{position:absolute;left:24px;top:40px;animation:breathe 4.6s ease-in-out infinite}
.bopm-say{position:absolute;left:14px;right:14px;bottom:14px;background:#fff;color:#1d1a3a;font-size:24px;line-height:1.25;padding:12px 16px;border-radius:20px 20px 20px 6px}
.short .bopm-say{display:none}
.bopm-tabs{width:196px;flex-shrink:0;display:flex;flex-direction:column;gap:6px}
.bopm-tab{flex:1;max-height:64px;border-radius:18px;color:#cfd5e6;font-size:26px;font-weight:600;text-align:left;padding:0 18px}
.bopm-tab[aria-selected=true]{background:#fff;color:#0d1120}
.bopm-panel{flex:1;min-width:0;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;display:grid;gap:10px;align-content:start;grid-template-columns:repeat(3,minmax(0,1fr))}
.bopm-panel[data-tab=colour]{grid-template-columns:repeat(5,minmax(0,1fr));padding:10px}
.bopm-panel[data-tab=extras],.bopm-panel[data-tab=mood]{grid-template-columns:repeat(2,minmax(0,1fr))}
.bopm-panel[data-tab=voice]{grid-template-columns:repeat(2,minmax(0,1fr))}
.bop-sw{width:64px;height:64px;border-radius:50%;justify-self:center}
.bop-sw[data-v="#0d1120"]{box-shadow:inset 0 0 0 3px #39405f}
.bop-sw[aria-pressed=true]{box-shadow:0 0 0 4px #0d1120,0 0 0 8px #fff}
.bop-opt{height:104px;border-radius:20px;background:#1d2238;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:24px;font-weight:600;padding:6px}
.bop-opt svg{height:44px;width:auto;overflow:visible;pointer-events:none}
.bop-opt .fill,.bop-opt .solid{fill:currentColor}
.bop-opt .line{fill:none;stroke:currentColor;stroke-width:21;stroke-linecap:round;stroke-linejoin:round}
.bop-opt .stroke{fill:none;stroke:currentColor;stroke-width:18;stroke-linecap:round;stroke-linejoin:round}
.bop-opt[aria-pressed=true]{background:#fff;color:#0d1120}
.bop-opt.wide{align-items:flex-start;padding:0 20px;gap:2px}
.bop-opt.wide small{font-size:24px;font-weight:400;opacity:.7}
.bop-voice{height:80px;border-radius:20px;background:#1d2238;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:0 16px;font-size:26px;font-weight:700;text-align:left}
.bop-voice small{font-size:24px;font-weight:400;opacity:.7;white-space:nowrap}
.bop-voice[aria-pressed=true]{background:#fff;color:#0d1120}
.bopm-note{grid-column:1/-1;margin:0;font-size:24px;line-height:1.25;color:#aab2c8}
.bopm-note:empty{display:none}
`;

const EYE_SVG = `<svg viewBox="0 0 100 120">
  <g class="round"><rect class="fill" x="8" y="4" width="84" height="112" rx="40"/></g>
  <g class="tall">${BOP_EYE_PATHS.tall}</g><g class="dots">${BOP_EYE_PATHS.dots}</g><g class="sleepy">${BOP_EYE_PATHS.sleepy}</g>
  <g class="happy"><path class="line" d="M12 82Q50-6 88 82"/></g>
  <g class="closed"><path class="line" d="M12 50Q50 96 88 50"/></g>
  <g class="heart"><path class="fill" d="M50 112C6 76 0 46 12 26 26 6 46 14 50 36 54 14 74 6 88 26 100 46 94 76 50 112Z"/></g>
  <g class="star"><path class="fill" d="M50 4 63 42 100 44 71 68 82 108 50 85 18 108 29 68 0 44 37 42Z"/></g>
  <g class="x"><path class="line" d="M16 28 84 96M84 28 16 96"/></g>
  <g class="half"><rect class="fill" x="8" y="50" width="84" height="62" rx="28"/></g>
  <g class="coin"><circle class="fill" cx="50" cy="60" r="44"/></g>
  <g class="angry"><path class="fill" d="M6 34 94 62V90A36 28 0 0 1 22 90Z"/></g>
  <g class="spiral"><path class="line" style="stroke-width:12" d="M50 60c6-6 14 0 10 8-6 10-24 6-24-10 0-18 26-24 38-8 12 18-2 44-26 42C26 90 12 68 22 44"/></g>
  <g class="squeeze"><path class="line" d="M24 30 80 60 24 90"/></g>
</svg>`;

class EchoHomeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = { ...DEFAULTS };
    this._core = 'unknown';
    this._voice = null;
    this._react = '';
    this._lingerUntil = 0;
    this._wordsBlocked = false;
    this._seenRun = undefined;
  }
  static getStubConfig() { return {}; }
  getCardSize() { return 9; }
  getGridOptions() { return { columns: 'full', rows: 'auto' }; }
  setConfig(config) { this._dashboardConfig = config; this._config = { ...DEFAULTS, ...config, ...this._choices() }; this._lightsKey = null; this._wasNight = undefined; if (this._built) { this._el.shell.dataset.robot = this._config.robot; this._el.shell.classList.toggle('night', this._isNight(new Date())); this._el.shell.classList.toggle('talk-mode', !!this._config.talk); this._h = 0; this._fit(); this._update(); } if (this.isConnected) this._scheduleMoment(); }
  set hass(value) { this._hass = value; this._build(); this._update(); }
  connectedCallback() {
    this._build();
    if (!this._onKey) {
      this._onKey = (e) => this._talkKey(e);
      this._onResize = () => { this._h = 0; this._fit(); this._layoutAlerts(); };
      // The PC app's talk key, which works even while another program is in front.
      this._onAppTalk = () => { if (this._config.talk && this.isConnected) this._talkPress(); };
    }
    window.addEventListener('echo-robot-talk', this._onAppTalk);
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKey);
    window.addEventListener('resize', this._onResize);
    clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), 1000);
    this._tick();
    this._scheduleGlance();
    this._scheduleMoment();
  }
  disconnectedCallback() {
    if (this._onKey) {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('keyup', this._onKey);
      window.removeEventListener('echo-robot-talk', this._onAppTalk);
      window.removeEventListener('resize', this._onResize);
    }
    this._stopAlerts();
    this._stopBops();
    this._stopForecast();
    if (this._talk) this._talkFinish(this._talk, 0);
    clearInterval(this._timer);
    [this._alertT, this._lingerT, this._wordsT, this._controlsT, this._pollT, this._holdT, this._demoT, this._glanceT, this._toastT, this._momentT, this._radioSyncT, this._doorT, this._vacMapT, this._vacWatchT, this._nextT, this._swapT, this._fxT, this._lyricSwapT, this._skitT, ...(this._beatT || [])].forEach(clearTimeout);
    clearInterval(this._lyricTimer);
    this._lyricTimer = null;
    this._swapT = null;
  }
  _state(id) { return id && this._hass && this._hass.states ? this._hass.states[id] : undefined; }
  _usable(id) { const s = this._state(id); return !!s && !['unavailable', 'unknown'].includes(s.state); }
  _setText(el, text) { if (el.textContent !== text) el.textContent = text; }
  _setData(el, key, value) { if (el.dataset[key] !== value) el.dataset[key] = value; }

  _build() {
    if (this._built) return;
    this._built = true;
    const q = (s) => this.shadowRoot.querySelector(s);
    this.shadowRoot.innerHTML = `<style>${STYLE}${IDLE_STYLE}${SKIT_STYLE}${BOP_STYLE}</style>
    <div class="shell" data-robot="${this._config.robot}" data-mood="idle" data-eye="round" data-mouth="smile" role="application" aria-label="Robot. Tap for controls.">
      <div class="wash"></div>
      <div class="rings"><i></i><i></i><i></i></div>
      <div class="stage"><div class="skit skit-back"></div><div class="blend"><div class="rb">
        <div class="shadow"></div>
        <div class="body">
          <div class="neck"></div>
          <div class="arm l"></div><div class="arm r"></div>
          <div class="torso"><div class="chest"></div></div>
          <div class="foot l"></div><div class="foot r"></div>
        </div>
        <div class="head">
          <div class="antenna"></div><div class="ear l"></div><div class="ear r"></div>
          <div class="visor"><div class="face">
            <div class="eyes-blend"><div class="eyes"><div class="eye l">${EYE_SVG}<div class="eye-kit"></div></div><div class="eye r">${EYE_SVG}<div class="eye-kit"></div></div><svg class="bop-eyes" viewBox="0 0 600 350" aria-hidden="true"></svg></div></div><svg class="bop-cheeks" viewBox="0 0 600 350" aria-hidden="true"></svg>
            <div class="readout"><span class="ro l"></span><span class="ro c"></span><span class="ro r"></span></div>
            <div class="mouth">
              <svg class="smile" viewBox="0 0 180 80"><path class="stroke" d="M30 16Q90 90 150 16"/></svg>
              <svg class="small" viewBox="0 0 180 80"><path class="stroke" d="M64 28Q90 52 116 28"/></svg>
              <svg class="flat" viewBox="0 0 180 80"><path class="stroke" d="M52 40H128"/></svg>
              <svg class="o" viewBox="0 0 180 80"><ellipse class="solid" cx="90" cy="40" rx="26" ry="36"/></svg>
              <svg class="grin" viewBox="0 0 180 80"><path class="solid" d="M24 8H156Q150 78 90 78 30 78 24 8Z"/></svg>
              <svg class="frown" viewBox="0 0 180 80"><path class="stroke" d="M44 62Q90 18 136 62"/></svg>
              <svg class="wiggle" viewBox="0 0 180 80"><path class="stroke" d="M22 44Q44 8 66 44T110 44 158 40"/></svg>
              <svg class="cat" viewBox="0 0 180 80">${BOP_MOUTH_PATHS.cat}</svg>
              <div class="bars"><i></i><i></i><i></i><i></i><i></i></div>
            </div>
          </div></div>
          <div class="kit"></div>
        </div>
        <div class="props"><div class="p p1"></div><div class="p p2"></div><div class="p p3"></div></div>
      </div></div><div class="skit skit-front"></div></div>
      <div class="wash-colour"></div>
      <div class="fx"></div>
      <div class="time corner"></div>
      <div class="date corner"></div>
      <div class="nightclock" aria-hidden="true"><div class="nc-time"></div><div class="nc-date"></div></div>
      <div class="temp corner"><span></span><span></span></div>
      <div class="caption"></div>
      <div class="words" aria-live="polite"><p class="said"></p><p class="reply"></p></div>
      <div class="lyric"><p class="cur"></p><p class="next"></p><div class="prev"><p class="was-cur"></p><p class="was-next"></p></div></div>
      <div class="icard" aria-live="polite"></div>
      <div class="vwatch" role="button" aria-label="The vacuum's live map. Opens its controls."><div class="vw-line"></div><div class="vw-map"><canvas class="vw-canvas" hidden></canvas></div></div>
      <div class="np"role="group" aria-label="Now playing">
        <div class="np-tint"></div>
        <div class="np-art"><span>${ICON.note}</span><img alt=""></div>
        <div class="np-info">
          <div class="np-text"><span class="np-title"></span><span class="np-artist"></span></div>
          <div class="np-row"><span class="np-now"></span><div class="np-bar" role="slider" aria-label="Song position"><div class="np-line"></div><div class="np-fill"></div><div class="np-dot"></div></div><span class="np-end"></span></div>
        </div>
        <div class="np-btns">
          <button class="np-b" data-np="media_previous_track" aria-label="Previous track"><span>${ICON.previous}</span></button>
          <button class="np-b main" data-np="media_play_pause" aria-label="Play or pause"><span>${ICON.play}</span></button>
          <button class="np-b" data-np="media_next_track" aria-label="Next track"><span>${ICON.next}</span></button>
        </div>
      </div>
      <div class="veil"></div>
      <div class="controls" aria-hidden="true">
        <div class="menu"><div class="menu-strip"></div><div class="menu-side"></div><div class="lights"></div></div>
        <div class="bar">
          <div class="bar-l"><button class="round micbtn" aria-label="Microphone" aria-pressed="false"><span>${ICON.mic}</span></button></div>
          <div class="bar-m">
            <button class="round" data-media="media_previous_track" aria-label="Previous track"><span>${ICON.previous}</span></button>
            <button class="round main" data-media="media_play_pause" aria-label="Play or pause"><span>${ICON.play}</span></button>
            <button class="round" data-media="media_next_track" aria-label="Next track"><span>${ICON.next}</span></button>
          </div>
          <div class="bar-r">
            <button class="round gearbtn" aria-label="Settings"><span>${ICON.gear}</span></button>
            <button class="round closebtn" aria-label="Close controls"><span>${ICON.close}</span></button>
          </div>
        </div>
        <div class="heat" role="dialog" aria-label="Heating" aria-hidden="true">
          <div class="set-head"><button class="round heat-back" aria-label="Back"><span>${ICON.back}</span></button><h2>Heating</h2><div class="heat-pick"></div></div>
          <div class="heat-body">
            <div class="heat-dial">
              <svg viewBox="0 0 200 200" aria-hidden="true"><path class="hd-track" d="M43.43 156.57A80 80 0 1 1 156.57 156.57"/><path class="hd-fill" pathLength="100" d="M43.43 156.57A80 80 0 1 1 156.57 156.57"/><circle class="hd-now" r="7" cx="43.43" cy="156.57"/></svg>
              <div class="hd-mid"><span class="hd-label">Set to</span><span class="hd-target"></span><span class="hd-cur"></span></div>
            </div>
            <div class="heat-side">
              <p class="heat-status"></p>
              <div class="heat-steps"><button class="heat-step" data-step="-1" aria-label="Cooler"><b>−</b><span>Cooler</span></button><button class="heat-step" data-step="1" aria-label="Warmer"><b>+</b><span>Warmer</span></button></div>
              <div class="heat-chips heat-modes" role="group" aria-label="Mode"></div>
              <div class="heat-chips heat-presets" role="group" aria-label="Preset"></div>
            </div>
          </div>
        </div>
        <div class="vac" role="dialog" aria-label="Vacuum" aria-hidden="true">
          <div class="set-head"><button class="round vac-back" aria-label="Back"><span>${ICON.back}</span></button><h2 class="vac-name"></h2><div class="heat-pick vac-pick"></div></div>
          <div class="vac-body">
            <div class="vac-map" role="button" aria-label="Enlarge the map"><canvas class="vac-canvas" hidden></canvas><span class="vac-nomap">No map yet</span><span class="vac-zoom">${ICON.expand}</span></div>
            <div class="vac-side">
              <p class="vac-status"></p>
              <p class="vac-sub"></p>
              <div class="vac-acts">
                <button class="vac-act main" data-act="go"><span class="va-ic"></span><span class="va-tx"></span></button>
                <button class="vac-act" data-act="dock"><span class="va-ic">${ICON.dock}</span><span class="va-tx">Dock</span></button>
              </div>
            </div>
          </div>
        </div>
        <div class="lpage" role="dialog" aria-label="Light" aria-hidden="true">
          <div class="set-head"><button class="round lp-back" aria-label="Back"><span>${ICON.back}</span></button><h2 class="lp-name"></h2><button class="lp-power" aria-pressed="false"></button></div>
          <div class="lp-body">
            <div class="lp-row">
              <button class="round lp-step" data-step="-1" aria-label="Dimmer">−</button>
              <div class="lp-bright" role="slider" aria-label="Brightness" aria-valuemin="1" aria-valuemax="100" tabindex="0"><div class="lp-in"><span class="lp-ic">${ICON.light}</span><span class="lp-val"></span></div><div class="lp-fill"><div class="lp-in" aria-hidden="true"><span class="lp-ic">${ICON.light}</span><span class="lp-val"></span></div></div></div>
              <button class="round lp-step" data-step="1" aria-label="Brighter">+</button>
            </div>
            <p class="lp-note"></p>
            <div class="lp-colours" role="group" aria-label="Colour"></div>
          </div>
        </div>
        <div class="settings" role="dialog" aria-label="Settings" aria-hidden="true">
          <div class="set-head"><button class="round set-back" aria-label="Back"><span>${ICON.back}</span></button><h2>Settings</h2></div>
          <div class="set-body">
            <button class="set-link bop-link" aria-label="Choose this screen’s Bop"><span class="bop-dot"></span><span class="bop-label"></span><span aria-hidden="true">›</span></button>
            <label class="set-row"><span class="set-name">Brightness</span><input class="set-range" data-bright="brightness" type="range" min="10" max="100" aria-label="Brightness"><span class="set-val"></span></label>
            <label class="set-row"><span class="set-name">At night</span><input class="set-range" data-bright="night_brightness" type="range" min="10" max="100" aria-label="Brightness at night"><span class="set-val"></span></label>
            <label class="set-row"><span class="set-name">Room light</span><select class="set-select" data-choice="dark_sensor" aria-label="Room light sensor"></select></label>
            <p class="set-note"></p>
            <div class="adjust">
              <span class="now"></span>
              <button class="sooner" aria-label="Show lyrics earlier">Earlier</button>
              <span class="val"></span>
              <button class="later" aria-label="Show lyrics later">Later</button>
            </div>
            <button class="set-link cust-open"><span>Customise menu</span><span aria-hidden="true">›</span></button>
            <div class="set-grid">${SETTING_SWITCHES.map(([key, label]) => `<button class="set-t" data-setting="${key}" aria-pressed="true"><span>${label}</span><i></i></button>`).join('')}</div>
            <div class="set-style"><span class="set-name">Robot</span><button class="set-pick" data-robot="face">Face</button><button class="set-pick" data-robot="buddy">Full body</button></div>
          </div>
        </div>
        <div class="cust" role="dialog" aria-label="Customise menu" aria-hidden="true">
          <div class="set-head"><button class="round cust-back" aria-label="Back"><span>${ICON.back}</span></button><h2>Customise menu</h2></div>
          <div class="set-body cust-body">
            <span class="cust-h">Layout</span>
            <div class="cust-layouts">
              <button class="cust-layout" data-layout="heat_top"><span class="cl-art"><i class="cl-wide"></i><span class="cl-row"><i></i><i></i><i></i><i></i></span></span>Heating on top</button>
              <button class="cust-layout" data-layout="grid"><span class="cl-art cl-grid"><i></i><i></i><i></i><i></i><i></i><i></i></span>Grid</button>
              <button class="cust-layout" data-layout="split"><span class="cl-art cl-split"><i class="cl-col"></i><span class="cl-grid2"><i></i><i></i><i></i><i></i></span></span>Split</button>
              <button class="cust-layout" data-layout="round"><span class="cl-art cl-round"><i></i><i></i><i></i><i></i></span>Round</button>
            </div>
            <span class="cust-h">Light colour when on</span>
            <div class="cust-colours">${LIGHT_COLOURS.map(([c, name]) => `<button class="cust-swatch" data-colour="${c}" aria-label="${name}" style="background:${c}"></button>`).join('')}</div>
            <span class="cust-h">Button size</span>
            <div class="cust-sizes"><button class="cust-pick" data-size="big">Big</button><button class="cust-pick" data-size="compact">Compact</button></div>
            <span class="cust-h">Show in the menu</span>
            <div class="cust-items"></div>
          </div>
        </div>
        <div class="bops" role="dialog" aria-label="Bops" aria-hidden="true">
          <div class="set-head"><button class="round bops-back" aria-label="Back"><span>${ICON.back}</span></button><h2>Bops</h2><span class="bops-now"></span></div>
          <div class="bops-grid"></div>
        </div>
        <div class="bopm" role="dialog" aria-label="Bop maker" aria-hidden="true">
          <div class="bopm-head"><button class="round bopm-back" aria-label="Back"><span>${ICON.back}</span></button>
            <label class="bopm-name"><span>${BOP_ICON.pencil}</span><input class="bopm-input" maxlength="${BOP_NAME_MAX}" aria-label="Name" autocomplete="off" spellcheck="false"></label>
            <button class="bop-pill bopm-copy">Copy</button><button class="bop-pill bopm-del">Delete</button><button class="bop-pill main bopm-save">Save</button></div>
          <div class="bopm-body">
            <div class="bopm-prev"><span class="bopm-face"></span><p class="bopm-say"></p></div>
            <div class="bopm-tabs" role="tablist">${[['colour', 'Colour'], ['eyes', 'Eyes'], ['mouth', 'Mouth'], ['extras', 'Extras'], ['mood', 'Personality'], ['voice', 'Voice']].map(([k, n]) => `<button class="bopm-tab" role="tab" data-tab="${k}">${n}</button>`).join('')}</div>
            <div class="bopm-panel" role="tabpanel"></div>
          </div>
        </div>
      </div>
      <div class="alerts" aria-live="polite"></div>
      <div class="door" role="dialog" aria-label="Doorbell" aria-hidden="true">
        <div class="door-head"><span class="door-ic">${ICON.bell}</span><span class="door-title">Someone’s at the door</span><button class="door-sound">Sound on</button><button class="door-x">Close</button></div>
        <div class="door-video"></div>
      </div>
      <button class="talkbtn" aria-label="Talk to the robot (Space)"><span>${ICON.mic}</span></button><span class="talkhint">Hold Space or click to talk</span>
      <div class="dimmer"></div>
      <div class="toast" role="status"></div>
    </div>`;
    this._el = {
      shell: q('.shell'), stage: q('.stage'), time: q('.time'), date: q('.date'), nightClock: q('.nightclock'), ncTime: q('.nc-time'), ncDate: q('.nc-date'), temp: q('.temp'), caption: q('.caption'),
      said: q('.said'), reply: q('.reply'), eyes: q('.eyes'), eyesBlend: q('.eyes-blend'), rb: q('.rb'), blend: q('.blend'), wash: q('.wash'), dimmer: q('.dimmer'), tint: q('.wash-colour'), npTint: q('.np-tint'), controls: q('.controls'), lights: q('.lights'), menu: q('.menu'), menuStrip: q('.menu-strip'), menuSide: q('.menu-side'),
      mic: q('.micbtn'), toast: q('.toast'), playBtn: q('.bar .main'),
      props: [q('.p1'), q('.p2'), q('.p3')], fx: q('.fx'), skit: { back: q('.skit-back'), front: q('.skit-front'), kit: q('.kit'), eyes: [...this.shadowRoot.querySelectorAll('.eye-kit')] }, door: q('.door'), doorVideo: q('.door-video'), doorTitle: q('.door-title'), icard: q('.icard'), vwatch: q('.vwatch'), vwLine: q('.vw-line'), vwCanvas: q('.vw-canvas'), lyric: q('.lyric'), lyricText: q('.lyric .cur'), lyricNext: q('.lyric .next'), lyricPrev: q('.lyric .prev'), lyricWasCur: q('.was-cur'), lyricWasNext: q('.was-next'), np: q('.np'), npImg: q('.np-art img'), npArtIcon: q('.np-art span'), npTitle: q('.np-title'), npArtist: q('.np-artist'), npNow: q('.np-now'), npEnd: q('.np-end'), npBar: q('.np-bar'), npFill: q('.np-fill'), npDot: q('.np-dot'), lyricNow: q('.adjust .now'), lyricVal: q('.adjust .val'),
      ro: { l: q('.ro.l'), c: q('.ro.c'), r: q('.ro.r') },
      alerts: q('.alerts'), talkBtn: q('.talkbtn'),
    };
    this._alerts = new Map();
    this._dismissed = new Set();
    const talkBtn = this._el.talkBtn;
    talkBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._talkPress(); });
    ['pointerup', 'pointercancel'].forEach((n) => talkBtn.addEventListener(n, (e) => { e.stopPropagation(); this._talkRelease(); }));
    talkBtn.addEventListener('click', (e) => e.stopPropagation());
    const shell = this._el.shell;
    // Tap anywhere: stop a ringing timer, otherwise open the controls. Hold: tour of every reaction.
    shell.addEventListener('pointerdown', (e) => {
      if (this._el.controls.contains(e.target) || this._el.np.contains(e.target)) return;
      clearTimeout(this._holdT);
      this._held = false;
      this._holdT = setTimeout(() => { this._held = true; this._startDemo(); }, HOLD_MS);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => shell.addEventListener(n, () => clearTimeout(this._holdT)));
    shell.addEventListener('click', (e) => {
      if (this._el.controls.contains(e.target) || this._el.np.contains(e.target)) return;
      if (this._held) { this._held = false; return; }
      if (this._demo) { this._stopDemo(); return; }
      const ring = this._ringAlert();
      if (ring) { this._alertAction(ring, ring.kind === 'reminder' ? 'done' : 'stop'); return; }
      if (this._ringing) { this._press(this._config.stop_ringing); return; }
      this._openControls(true);
    });
    this._el.controls.addEventListener('pointerdown', () => this._openControls(true));
    this._el.vwatch.addEventListener('pointerdown', (e) => e.stopPropagation());
    this._el.vwatch.addEventListener('click', (e) => { e.stopPropagation(); if (this._vacWatch) this._openVac(this._vacWatch); });
    q('.closebtn').addEventListener('click', () => this._openControls(false));
    this._wireSettings(q);
    // The doorbell panel: Close, and taps on it don't reach the robot behind (which would open the menu).
    for (const kind of ['pointerdown', 'click']) this._el.door.addEventListener(kind, (e) => e.stopPropagation());
    q('.door-x').addEventListener('click', () => this._closeDoorbell());
    q('.door-sound').addEventListener('click', () => this._doorSoundOn());
    this._wireHeat(q);
    this._wireVac(q);
    this._wireLight(q);
    this._wireCust(q);
    this._wireBops(q);
    this._wireSeek();
    [this._el.np, this._el.controls].forEach((panel) => {
      panel.addEventListener('click', (e) => e.stopPropagation());
      panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    this.shadowRoot.querySelectorAll('[data-np]').forEach((b) => b.addEventListener('click', () => this._mediaPress(b.dataset.np)));
    q('.sooner').addEventListener('click', () => this._nudgeLyrics(LYRIC_STEP_S));
    q('.later').addEventListener('click', () => this._nudgeLyrics(-LYRIC_STEP_S));
    this._nudgeLyrics(0);
    this._applyBrightness(true);
    this._el.mic.addEventListener('click', () => this._service('switch', 'toggle', this._config.mute));
    this.shadowRoot.querySelectorAll('[data-media]').forEach((b) => b.addEventListener('click', () => this._mediaPress(b.dataset.media)));
    this._tick();
  }

  _tick() {
    if (!this._built) return;
    const now = new Date();
    const clockText = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    this._setText(this._el.time, clockText);
    this._setText(this._el.date, now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', ''));
    this._setText(this._el.ncTime, clockText);
    this._setText(this._el.ncDate, now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''));
    this._el.shell.classList.toggle('night-clock', this._config.night_clock !== false);
    // Drifts a little each minute, so the same pixels aren't lit in the same place all night.
    const minute = now.getHours() * 60 + now.getMinutes();
    this._el.nightClock.style.transform = `translate(${Math.round(Math.sin(minute / 7) * 18)}px,${Math.round(Math.cos(minute / 11) * 8)}px)`;
    this._fit();
    this._updateNowPlaying();
    this._el.shell.classList.toggle('night', this._isNight(now));
    const hour = now.getHours();
    this._setData(this._el.shell, 'daypart', hour >= 6 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'day' : hour >= 17 && hour < 22 ? 'evening' : 'late');
    this._el.shell.classList.toggle('talk-mode', !!this._config.talk);
    this._apply();
    this._homeTick();
    this._layoutAlerts();
    // On the hour, show the time.
    if (now.getMinutes() === 0 && this._hourShown !== now.getHours() && this._canMoment()) {
      this._hourShown = now.getHours();
      this._playMoment('clock');
    }
  }
  // Night mode steps aside for the doorbell, and while a vacuum cleans (a clean at night was started by someone
  // awake, who wants to watch it), then comes back.
  _isNight(now) {
    if (this._doorbell || this._vacAwake()) return false;
    return this._baseNight(now);
  }
  _vacAwake() { return this._config.vacuum_watch !== false && !!this._vacWatchId(); }
  _baseNight(now) {
    if (this._config.night_mode === false) return false;
    const dark = this._roomDark();
    if (dark !== null) return dark;
    const { night_start: a, night_end: b } = this._config;
    if (!a || !b) return false;
    const mins = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
    const n = now.getHours() * 60 + now.getMinutes(), s = mins(a), e = mins(b);
    return s <= e ? n >= s && n < e : n >= s || n < e;
  }
  // Dark or not, from the room's light sensor, or null if there isn't one (or it isn't reporting). It has to stay
  // dark for a minute, or light for a few seconds, before it changes, and getting light needs a bit more light
  // than getting dark, so dusk or a passing car's lights don't make it flicker.
  _roomDark() {
    const id = this._config.dark_sensor;
    if (!id || !this._usable(id)) return null;
    const lux = Number(this._state(id).state), below = Number(this._config.dark_below);
    if (!Number.isFinite(lux)) return null;
    const limit = Number.isFinite(below) ? below : 3;
    if (this._dark === undefined) this._dark = lux <= limit; // starting up: no waiting
    const want = this._dark ? lux <= limit * 2 + 2 : lux <= limit;
    if (want === this._dark) { this._darkChange = 0; return this._dark; }
    if (!this._darkChange) this._darkChange = Date.now();
    if (Date.now() - this._darkChange >= (want ? DARK_AFTER_MS : LIGHT_AFTER_MS)) {
      this._dark = want;
      this._darkChange = 0;
    }
    return this._dark;
  }
  // Fill what's left of the screen under Home Assistant's header, whether or not the header is showing.
  _fit() {
    const shell = this._el.shell, top = Math.max(0, this.getBoundingClientRect().top);
    const h = Math.max(200, Math.floor((window.visualViewport ? window.visualViewport.height : window.innerHeight) - top));
    const w = this.getBoundingClientRect().width || window.innerWidth;
    if (h === this._h && w === this._w) return;
    this._h = h; this._w = w;
    // On a big PC window, everything is drawn larger, as though the screen were an Echo up close.
    const zoom = this._config.desktop ? Math.max(1, Math.min(2.5, w / 960, h / 540)) : 1;
    shell.style.zoom = zoom === 1 ? '' : zoom.toFixed(3);
    const sw = w / zoom, sh = h / zoom;
    this._sw = sw;
    shell.style.height = sh + 'px';
    shell.classList.toggle('short', sh < 440); // Home Assistant's header is showing: less room in the menu
    // A taller window than the Echo's doesn't make the face bigger, so it keeps clear of the corners.
    const s = Math.min(sw / 800, sh / 470, this._config.desktop ? 1 : Infinity).toFixed(3);
    this._el.stage.style.setProperty('--s', s);
    this._el.nightClock.style.setProperty('--s', s);
    this._layoutAlerts(true);
    this._placeVacWatch();
  }
  // Small signs of life when idle: glance around now and then.
  _scheduleGlance() {
    clearTimeout(this._glanceT);
    this._glanceT = setTimeout(() => {
      const idle = this._built && !this._moment && ['idle', 'groove'].includes(this._el.shell.dataset.mood);
      if (idle) {
        const x = [-46, 46, -26, 30][Math.floor(Math.random() * 4)], y = [-8, 8, 0][Math.floor(Math.random() * 3)];
        this._el.eyes.style.transform = `translate(${x}px,${y}px)`;
        setTimeout(() => { if (this._built) this._el.eyes.style.transform = ''; }, 900 + Math.random() * 1200);
      }
      this._scheduleGlance();
    }, 5000 + Math.random() * 9000);
  }

  // ---- real Home Assistant state -> robot ----
  _update() {
    if (!this._built || !this._hass) return;
    const sat = this._state(this._config.satellite);
    const connected = this._hass.connected !== false;
    let satCore = !connected || !sat || ['unavailable', 'unknown'].includes(sat.state) ? 'offline' : sat.state;
    if (satCore === 'offline' && connected && this._config.talk) satCore = 'idle'; // the PC can still be talked to
    const core = this._talk ? this._talk.core : satCore;
    const active = ['listening', 'processing', 'responding'].includes(core);
    const wasActive = ['listening', 'processing', 'responding'].includes(this._core);
    if (core !== 'responding') this._respondingAt = 0;
    else if (!this._respondingAt) this._respondingAt = Date.now();
    if (active && !wasActive) this._voiceStart();
    if (!active && wasActive) this._voiceEnd();
    if (active && this._voice) this._showVoice();
    this._core = core;
    this._muted = this._state(this._config.mute)?.state === 'on';
    this._ringing = this._state(this._config.timer_ringing)?.state === 'on';
    this._watchAlerts();
    this._watchBops();
    this._applyBop();
    this._watchForecast();
    this._watchHome();
    this._watchDoorbell();
    this._holdForSpeech();
    if (this._seenRun === undefined && !this._wordsBlocked) this._primeWords();
    this._apply();
    this._updateArt();
    this._updateNowPlaying();
    this._updateLyrics();
    this._updateCorners();
    this._updateControls();
    this._updateVacWatch();
  }
  _mood() {
    if (this._demo) return this._demo;
    const ring = this._ringAlert();
    if (ring) return ring.kind !== 'reminder' ? 'alarm' : ring.data.kind === 'alarm' ? 'wakeup' : 'remind';
    if (this._ringing) return 'alarm';
    if (this._core === 'offline') return 'offline';
    if (this._core === 'listening') return 'listening';
    if (this._core === 'processing') return 'thinking';
    if (this._core === 'responding') return this._speechLeft() > 0 ? 'thinking' : 'speaking';
    if (this._muted) return 'muted';
    if (this._react && Date.now() < this._lingerUntil) return this._react;
    if (this._musicId()) return 'groove';
    if (this._el.shell.classList.contains('night')) return 'sleep';
    return 'idle';
  }
  _apply() {
    if (!this._built) return;
    const shell = this._el.shell, mood = this._mood();
    if (this._moment && !['idle', 'groove'].includes(mood)) this._endMoment(false);
    // While talking, the face and props come from what was said, but the mouth keeps moving.
    const overlay = mood === 'speaking' && this._react ? this._react : '';
    const moment = this._moment;
    const look = moment ? moment.look : MOODS[overlay || mood] || MOODS.idle;
    const wantAnim = mood === 'speaking' ? 'chat' : look.anim || '';
    const momentName = moment ? moment.name : '';
    const wantLook = look.look || '';
    const wantSky = moment && moment.sky ? moment.sky : '';
    const colourChanging = shell.dataset.mood !== mood || (shell.dataset.moment || '') !== momentName || (shell.dataset.sky || '') !== wantSky || (shell.dataset.react || '') !== overlay;
    const before = colourChanging ? this._seenColour() : null;
    // Hand over movement smoothly: start from wherever the old movement had got to.
    if ((shell.dataset.anim || '') !== wantAnim) this._blend(this._el.blend, this._el.rb);
    if ((shell.dataset.moment || '') !== momentName || (shell.dataset.look || '') !== wantLook) this._blend(this._el.eyesBlend, this._el.eyes);
    this._setData(shell, 'mood', mood);
    this._setData(shell, 'moment', momentName);
    this._setData(shell, 'look', wantLook);
    this._setData(shell, 'sky', wantSky);
    this._setData(shell, 'react', overlay);
    this._setData(shell, 'anim', wantAnim);
    this._setData(shell, 'arm', look.arm || '');
    if (colourChanging) this._wash(before);
    this._setFace({ eye: look.eye, mouth: mood === 'speaking' ? 'bars' : look.mouth, readout: moment && moment.look.readout ? 'on' : '', props: look.props || [] });
    const base = MOODS[mood] || {};
    // A ringing pop-up already says what's going off, so the caption would only repeat it.
    const caption = this._ringAlert() ? '' : base.caption;
    this._setText(this._el.caption, this._demo ? (moment ? moment.name : mood) : (moment && moment.caption) || caption || '');
  }
  // The old colour stays on a layer above the new one and fades out. Fading a layer is done by the graphics chip
  // alone, so it stays smooth on the Echo's slow processor, where repainting the whole screen would not.
  _seenColour() {
    // The colour actually on screen, including any fade still running, so a quick second change doesn't jump.
    // While the page is still loading, the Echo's browser can report "transparent" or nothing: use the page colour.
    const rgb = (s) => { const n = String(s || '').match(/[\d.]+/g); return n && n.length >= 3 ? n.slice(0, 3).map(Number) : [13, 17, 32]; };
    const under = rgb(getComputedStyle(this._el.shell).backgroundColor);
    const washing = getComputedStyle(this._el.wash);
    const over = rgb(washing.backgroundColor), amount = Number(washing.opacity) || 0;
    return `rgb(${under.map((v, i) => Math.round(v * (1 - amount) + over[i] * amount)).join(',')})`;
  }
  _wash(before) {
    const after = getComputedStyle(this._el.shell).backgroundColor;
    if (!before || before.replace(/\s/g, '') === after.replace(/\s/g, '')) return;
    const wash = this._el.wash;
    wash.style.backgroundColor = before;
    wash.getAnimations().forEach((a) => a.cancel());
    wash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: WASH_MS, easing: 'ease-in-out' });
  }
  // Keep the outer layer where the inner movement was, then ease it back to nothing while the new movement starts.
  _blend(outer, inner) {
    const was = new DOMMatrix(getComputedStyle(outer).transform).multiply(new DOMMatrix(getComputedStyle(inner).transform));
    outer.getAnimations().forEach((a) => a.cancel());
    if (was.isIdentity) return;
    outer.animate([{ transform: was.toString() }, { transform: 'none' }], { duration: BLEND_MS, easing: 'ease-out' });
  }
  // Shapes can't morph, so they do what a blink does: close, change while closed, and open.
  _setFace(next) {
    next = this._bopFace(next);
    this._nextFace = next;
    const shell = this._el.shell;
    const same = shell.dataset.eye === next.eye && shell.dataset.mouth === next.mouth && (shell.dataset.readout || '') === next.readout && next.props.join() === this._propsKey;
    if (same) return;
    if (this._swapT) return; // already closed: the latest look is used when it opens
    if (!this._faceShown) { this._faceShown = true; this._showFace(); return; }
    shell.classList.add('swap');
    this._swapT = setTimeout(() => {
      this._swapT = null;
      this._showFace();
      void shell.offsetWidth; // let the closed state land so opening animates
      shell.classList.remove('swap');
    }, SWAP_MS);
  }
  _showFace() {
    const shell = this._el.shell, f = this._nextFace;
    this._setData(shell, 'eye', f.eye);
    this._setData(shell, 'mouth', f.mouth);
    this._setData(shell, 'readout', f.readout);
    this._setProps(f.props);
  }
  _setProps(names) {
    const key = names.join();
    if (key === this._propsKey) return;
    this._propsKey = key;
    this._el.props.forEach((el, i) => {
      const n = names[i];
      el.className = `p p${i + 1}${n ? ' on' : ''}${n === 'dot' ? ' dot' : ''}`;
      el.innerHTML = !n || n === 'dot' ? '' : n === 'weather' ? this._weatherIcon() : ICON[n] || '';
    });
  }
  _weatherIcon() {
    const s = this._state(this._config.weather)?.state || '';
    if (s === 'sunny') return ICON.sun;
    if (s === 'clear-night') return ICON.moon;
    if (/rain|pour|hail|lightning|snow/.test(s)) return ICON.rain;
    return ICON.cloud;
  }
  _updateCorners() {
    const w = this._state(this._config.weather), ok = this._usable(this._config.weather) && w.attributes.temperature != null;
    const key = ok ? `${w.state}|${Math.round(w.attributes.temperature)}` : '';
    if (key === this._tempKey) return;
    this._tempKey = key;
    const [icon, text] = this._el.temp.children;
    icon.innerHTML = ok ? this._weatherIcon() : '';
    text.textContent = ok ? `${Math.round(w.attributes.temperature)}°` : '';
  }

  // ---- music: Spotify if it's playing anywhere on your account, otherwise the Sonos ----
  _spotifyIds() {
    if (this._config.spotify) return [this._config.spotify];
    const states = this._hass?.states || {}, count = Object.keys(states).length;
    if (count !== this._spotifyCount) {
      this._spotifyCount = count;
      this._spotifyList = Object.keys(states).filter((id) => id.startsWith('media_player.') && (id.includes('spotify') || /spotify/i.test(states[id].attributes?.friendly_name || '')));
    }
    return this._spotifyList;
  }
  // Music Assistant's players say so in their details. It's listed first, as it's what plays on the Echo itself.
  _assistantIds() {
    const states = this._hass?.states || {}, count = Object.keys(states).length;
    if (count !== this._assistantCount) {
      this._assistantCount = count;
      this._assistantList = Object.keys(states).filter((id) => id.startsWith('media_player.') && states[id].attributes?.mass_player_type);
    }
    return this._assistantList;
  }
  _musicId() {
    const assistant = this._assistantIds().find((id) => this._state(id)?.state === 'playing');
    if (assistant) return assistant;
    const spotify = this._spotifyIds().find((id) => this._state(id)?.state === 'playing');
    if (spotify) return spotify;
    return this._state(this._config.player)?.state === 'playing' ? this._config.player : null;
  }
  // The tap screen's music buttons follow whatever is playing.
  _controlledId() {
    const id = this._musicId() || this._nowPlayingId() || this._config.player;
    // Spotify refuses control of some devices. If the Sonos is what's actually playing, use its own controls instead.
    const sonos = this._config.player;
    if (id !== sonos && !this._canControl(id) && this._state(sonos)?.state === 'playing' && this._canControl(sonos)) return sonos;
    return id;
  }
  _canControl(id) { return !!(Number(this._state(id)?.attributes.supported_features || 0) & (1 | 16 | 32 | 16384)); }
  // Buttons stay tappable when a player refuses a command, so a tap can say why instead of doing nothing.
  _mediaPress(service) {
    const id = this._controlledId(), features = Number(this._state(id)?.attributes.supported_features || 0);
    if (!(features & MEDIA_NEEDS[service])) {
      this._toast(id.includes('spotify') || /spotify/i.test(this._state(id)?.attributes.friendly_name || '') ? 'Spotify doesn’t allow control of this device' : 'This player doesn’t allow that');
      return;
    }
    this._service('media_player', service, id);
  }
  // A picture from an outside address (a song's cover on the radio, say) also comes with a copy Home Assistant
  // fetches itself, entity_picture_local, so the Echo still only ever talks to Home Assistant.
  _picture(attrs) {
    const own = attrs.entity_picture, local = attrs.entity_picture_local;
    if (own && String(own).startsWith('/')) return own;
    return local && String(local).startsWith('/') ? local : null;
  }
  _updateArt() {
    const id = this._config.album_colours === false ? null : this._musicId();
    const url = id ? this._picture(this._state(id).attributes) : null;
    // Only pictures Home Assistant serves itself: the Echo never contacts an outside server for a cover.
    if (!url || !url.startsWith('/')) { this._clearArt(); return; }
    // The link's token changes every few minutes; "cache" only changes when the picture does.
    const key = (url.match(/[?&]cache=([^&]+)/) || [null, url])[1];
    if (key === this._artKey) return;
    this._artKey = key;
    const img = new Image();
    img.onerror = () => { if (this._artKey === key) this._clearArt(true); };
    img.onload = () => {
      if (this._artKey !== key) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 32, 32);
        const palette = artPalette(ctx.getImageData(0, 0, 32, 32).data);
        if (palette) this._applyArt(palette); else this._clearArt(true);
      } catch (err) { this._clearArt(true); }
    };
    img.src = url;
  }
  _applyArt(palette) {
    const shell = this._el.shell, before = this._seenColour();
    shell.style.setProperty('--art-bg', palette.bg);
    shell.style.setProperty('--art-eye', palette.eye);
    shell.style.setProperty('--art-ink', palette.ink);
    this._setData(shell, 'art', 'on');
    this._wash(before);
  }
  _clearArt(keepKey) {
    if (!keepKey) this._artKey = null;
    const shell = this._el.shell;
    if (shell.dataset.art !== 'on') return;
    const before = this._seenColour();
    this._setData(shell, 'art', '');
    this._wash(before);
  }

  // ---- lyrics ----
  _updateLyrics() {
    const id = this._config.lyrics === false ? null : this._musicId();
    const attrs = id ? this._state(id).attributes : null;
    this._watchRadioSong(id, attrs);
    // On the radio, only a song seen starting has a known position, so one already playing when you tune in is skipped.
    const radio = !!this._radio, timed = !radio || !!this._radio.synced;
    const song = attrs && attrs.media_content_type !== 'podcast' && attrs.media_title && attrs.media_artist && timed
      && !(radio && (RADIO_FILLER.test(attrs.media_title) || RADIO_FILLER.test(attrs.media_artist)));
    if (!song) { this._stopLyrics(); return; }
    const key = `${attrs.media_title}|${attrs.media_artist}${radio ? `|${this._radio.serial}` : ''}`;
    if (key !== this._lyricKey) {
      this._lyricKey = key;
      this._setLyricLines([]);
      this._songClock = null;
      this._showLyric(null, false);
      // A radio station's name sits where the album would be, so it's left out of the search.
      const query = new URLSearchParams({ title: attrs.media_title, artist: attrs.media_artist, album: radio ? '' : attrs.media_album_name || '', duration: String(Math.round(attrs.media_duration || 0)) });
      Promise.resolve(this._hass.callApi('GET', `echo_lyrics?${query}`))
        .then((result) => { if (this._lyricKey === key) this._setLyricLines(lyricLines(result)); })
        .catch(() => { if (this._lyricKey === key) this._setLyricLines([]); });
    }
    if (!this._lyricTimer) this._lyricTimer = setInterval(() => this._lyricTick(), LYRIC_TICK_MS);
  }
  _setLyricLines(lines) {
    this._lyricLines = lines;
    this._el.shell.classList.toggle('has-lines', lines.length > 0);
  }
  _stopLyrics() {
    clearInterval(this._lyricTimer);
    this._lyricTimer = null;
    this._songClock = null;
    this._setLyricLines(this._lyricLines || []);
    this._showLyric(null, false);
  }
  // Timing you set on the tap screen. It's only a preference for this screen, so losing it does no harm.
  // The radio has its own, as its delay is nothing like a streaming service's.
  // A radio song the station names exactly (Heart's track numbers) has its own timing, kept on the server for every
  // time it plays: until you set one, it's the radio's.
  _adjustKey() { return this._radio ? `${LYRIC_ADJUST_KEY}-radio` : LYRIC_ADJUST_KEY; }
  _songAdjusts() { return !!(this._radio && this._radio.track); }
  _lyricAdjust() {
    if (this._songAdjusts() && Number.isFinite(this._radio.adjust)) return this._radio.adjust;
    const key = this._adjustKey();
    this._adjusts = this._adjusts || {};
    if (!(key in this._adjusts)) {
      let saved = 0;
      try {
        saved = Number(localStorage.getItem(key)) || 0;
        // Radio timing was set against whatever the default was then (none at first), so it's moved over once when
        // the default changes, keeping the total the same.
        const was = localStorage.getItem(RADIO_DEFAULT_KEY);
        if (key.endsWith('-radio') && Number(was) !== RADIO_DEFAULT_S) {
          if (localStorage.getItem(key) !== null) saved = Math.round((saved + (Number(was) || 0) - RADIO_DEFAULT_S) * 10) / 10;
          localStorage.setItem(key, String(saved));
          localStorage.setItem(RADIO_DEFAULT_KEY, String(RADIO_DEFAULT_S));
        }
      } catch (err) { /* keeps working for this session */ }
      this._adjusts[key] = saved;
    }
    return this._adjusts[key];
  }
  _nudgeLyrics(step) {
    if (this._songAdjusts()) {
      // Just this song, in fine steps: the station's clock makes it close already, and songs differ a little.
      const song = this._radio, value = Math.max(-RADIO_ADJUST_LIMIT_S, Math.min(RADIO_ADJUST_LIMIT_S, Math.round((this._lyricAdjust() + step) * 10) / 10));
      if (step) {
        song.adjust = value;
        song.adjustTapped = true;
        clearTimeout(this._songAdjustT);
        // Saved once the tapping stops, for this song even if the next one has begun by then.
        this._songAdjustT = setTimeout(() => {
          Promise.resolve(this._hass && this._hass.callApi('POST', 'echo_lyrics/radio_sync', { track: song.track, adjust: song.adjust })).catch(() => {});
        }, SONG_ADJUST_SAVE_MS);
      }
      this._el.lyricVal.textContent = `${value > 0 ? '+' : ''}${value.toFixed(1)}s`;
      return;
    }
    const radio = !!this._radio, limit = radio ? RADIO_ADJUST_LIMIT_S : LYRIC_ADJUST_LIMIT_S;
    const size = radio ? step * (RADIO_STEP_S / LYRIC_STEP_S) : step, key = this._adjustKey();
    const value = Math.max(-limit, Math.min(limit, Math.round((this._lyricAdjust() + size) * 10) / 10));
    this._adjusts[key] = value;
    try { localStorage.setItem(key, String(value)); } catch (err) { /* keeps working for this session */ }
    this._el.lyricVal.textContent = `${value > 0 ? '+' : ''}${value.toFixed(1)}s`;
  }
  // ---- the radio ----
  _isRadio(attrs) {
    const id = String(attrs.media_content_id || '');
    return attrs.media_content_type === 'radio' || /^radiobrowser:\/\/|:\/\/radio\//.test(id) || (/^https?:\/\//.test(id) && !Number(attrs.media_duration));
  }
  // The station's name: Music Assistant puts it where the album goes. A BBC stream played from its own address
  // only has the address, so the name is worked out from that.
  _stationName(attrs) {
    const tidy = (text) => {
      const t = String(text || '').trim(), bbc = t.match(/^bbc_radio_([a-z0-9_]+)$/i);
      if (bbc) return `BBC Radio ${bbc[1].toLowerCase().split('_').map(capFirst).join(' ')}`;
      return /^[a-z0-9]+(_[a-z0-9]+)+$/i.test(t) ? t.split('_').map(capFirst).join(' ') : t; // "heart_east" -> "Heart East"
    };
    if (attrs.media_album_name && !RADIO_FILLER.test(attrs.media_album_name)) return tidy(attrs.media_album_name);
    const bbc = String(attrs.media_content_id || '').match(/(bbc_radio_[a-z0-9_]+?)(?:\.m3u8|\/|$)/);
    return bbc ? tidy(bbc[1]) : '';
  }
  // Notices a radio song starting. The station's "new song" signal is often late, so the server then listens to
  // the station to find where the song really is (echo_lyrics/radio_sync), and lyrics only show once it has.
  // Tuning in, or coming back from a pause, joins a song part-way: it listens for that one too, without a guess.
  _watchRadioSong(id, attrs) {
    const was = this._radio;
    if (!attrs || !this._isRadio(attrs) || this._state(id).state !== 'playing') {
      this._radio = null;
    } else {
      const stream = `${id}|${attrs.media_content_id}`, song = `${attrs.media_title}|${attrs.media_artist}`;
      const real = !!attrs.media_artist && !RADIO_FILLER.test(attrs.media_title) && !RADIO_FILLER.test(attrs.media_artist);
      const fresh = (since) => ({ stream, song, since, synced: false, tries: 0, serial: (this._radioSerial = (this._radioSerial || 0) + 1), joined: was && was.stream === stream ? was.joined : Date.now(), heard: real || !!(was && was.stream === stream && was.heard) });
      if (!was || was.stream !== stream) this._radio = fresh(null);
      // Tuning in, the station's name often shows for a moment before the song's: that first song is one joined
      // part-way, not one just starting.
      else if (was.song !== song) this._radio = fresh(!was.heard && Date.now() - was.joined < RADIO_JOIN_MS ? null : Date.now());
    }
    if (this._radio !== was) {
      clearTimeout(this._radioSyncT);
      const songNow = this._radio && attrs.media_artist && !RADIO_FILLER.test(attrs.media_title) && !RADIO_FILLER.test(attrs.media_artist);
      if (songNow && this._config.lyrics !== false) this._bookRadio(() => this._syncRadio('quick'), RADIO_SYNC_QUICK_MS);
    }
    if (this._radio !== was && this._built) this._nudgeLyrics(0); // show the right timing for what's playing
  }
  // Only one listen is ever booked: a new booking replaces any earlier one.
  _bookRadio(run, ms) {
    clearTimeout(this._radioSyncT);
    this._radioSyncT = setTimeout(run, ms);
  }
  // 'quick' asks for the station's own clock (only some stations have one); without it, 'first' lines the song up
  // by listening; 'check' listens again half a minute later; then 'follow' listens every half minute or so while the
  // song plays, so a wrong first answer (or a radio edit that skips a part) is caught and corrected.
  _syncRadio(mode = 'first') {
    if (mode === true) mode = 'check';
    const radio = this._radio, id = this._musicId(), later = mode === 'check' || mode === 'follow';
    const allowed = mode === 'quick' ? radio && !radio.synced && !radio.quickTried : mode === 'first' ? !radio?.synced : mode === 'check' ? radio?.synced && !radio.checked : radio?.synced && (radio.follows || 0) < RADIO_FOLLOWS;
    if (!radio || !id || !this._hass || !allowed) return;
    const attrs = this._state(id).attributes;
    if (mode === 'quick') radio.quickTried = true;
    else if (mode === 'first') radio.tries += 1;
    else if (mode === 'check') radio.checked = true;
    else radio.follows = (radio.follows || 0) + 1;
    const query = { content_id: attrs.media_content_id, title: attrs.media_title, artist: attrs.media_artist };
    if (radio.since) query.expect = ((Date.now() - radio.since) / 1000).toFixed(1);
    if (mode === 'quick') query.quick = '1';
    if (mode === 'check') query.again = '1';
    if (mode === 'follow') query.follow = '1';
    const keepFollowing = (r) => {
      if (later && this._radio === radio) this._bookRadio(() => this._syncRadio('follow'), r && r.pending ? RADIO_CONFIRM_MS : RADIO_FOLLOW_MS);
    };
    const retry = () => {
      if (this._radio === radio && radio.tries < RADIO_SYNC_TRIES) this._bookRadio(() => this._syncRadio(), RADIO_SYNC_RETRY_MS);
    };
    // No station clock: listen at the usual time after the song changed.
    const listenSoon = () => {
      if (this._radio === radio && !radio.synced) this._bookRadio(() => this._syncRadio(), Math.max(1000, RADIO_SYNC_FIRST_MS - RADIO_SYNC_QUICK_MS));
    };
    Promise.resolve(this._hass.callApi('GET', `echo_lyrics/radio_sync?${new URLSearchParams(query)}`)).then((r) => {
      if (this._radio !== radio) return;
      if (r && r.ok && Number.isFinite(r.started)) {
        // The server's clock may differ from this screen's, so its "now" is used to convert. Each answer takes a
        // moment to arrive, which makes the difference look smaller than it is, by a varying amount: the largest
        // seen is the truest, so that one is kept (looked at afresh every half hour, in case either clock is set).
        const seen = Number.isFinite(r.now) ? r.now - Date.now() : 0, clock = this._clockGap;
        if (!clock || seen > clock.gap || Math.abs(seen - clock.gap) > 5000 || Date.now() - clock.at > 1800000) this._clockGap = { gap: seen, at: Date.now() };
        // Only a changed answer moves the lyrics: the same one again leaves them exactly where they are.
        if (!radio.synced || r.started !== radio.serverStarted) {
          radio.serverStarted = r.started;
          radio.since = r.started - this._clockGap.gap;
        }
        // Where this track's radio edit is known to cut, and the timing from each cut on: the lyrics jump there.
        radio.plan = (Array.isArray(r.later) ? r.later : [])
          .filter((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]))
          .map(([at, started]) => [at - this._clockGap.gap, started - this._clockGap.gap]);
        // A listen that says the lyrics are well out, waiting to be confirmed: nothing shown until it is (or isn't).
        radio.unsure = !!(r.pending && Number.isFinite(r.pending.started) && Math.abs(r.pending.started - r.started) > RADIO_UNSURE_MS);
        // A song timed only by the station's clock that listening has never checked: its lyrics may be for another
        // version, so they wait for this play's first listen to agree (or put them right). Checked songs show at once.
        radio.unchecked = r.how === 'station' && r.confirmed === false;
        // The station's number for the track, and the timing you set for it before (unless you've just tapped).
        if (typeof r.track === 'string' && /^[\w-]{1,40}$/.test(r.track) && !radio.track) radio.track = r.track;
        if (radio.track && !radio.adjustTapped && Number.isFinite(r.adjust)) radio.adjust = r.adjust;
        if (this._built) this._nudgeLyrics(0);
        if (!radio.synced) {
          radio.synced = true;
          // A time from the station's clock is checked by listening soon after: the lyrics may be for a version
          // with a longer or shorter intro (the server then remembers that for next time the song plays).
          this._bookRadio(() => this._syncRadio('check'), r.how === 'station' ? RADIO_CHECK_STATION_MS : RADIO_CHECK_MS);
        }
        keepFollowing(r);
        this._updateLyrics();
      } else if (later) {
        keepFollowing();
      } else if (mode === 'quick') {
        listenSoon();
      } else if (!(r && r.final)) {
        retry();
      }
    }).catch((err) => {
      if (later) keepFollowing();
      else if (mode === 'quick') listenSoon();
      else if (!(err && (err.status_code === 404 || err.status_code === 400))) retry(); // 404: an older add-on, without it
    });
  }
  // Where the song is now. Spotify's position is rounded to whole seconds, so each report is up to half a second
  // out in a different direction. Averaging the reports cancels that, and a big change means you skipped or seeked.
  _songPosition(attrs) {
    if (this._radio) {
      if (!this._radio.synced || this._radio.unsure || this._radio.unchecked) return null;
      const off = Number(this._config.radio_lyrics_offset || 0) + this._lyricAdjust(), now = Date.now();
      // A known radio-edit cut: from the moment the Echo plays it, the timing after the cut.
      let since = this._radio.since;
      for (const [at, after] of this._radio.plan || []) if (now + off * 1000 >= at) since = after;
      return (now - since) / 1000 + off;
    }
    if (typeof attrs.media_position !== 'number' || !attrs.media_position_updated_at) return null;
    let started = Date.parse(attrs.media_position_updated_at) - attrs.media_position * 1000;
    if (!Number.isFinite(started)) return null;
    const sought = this._seekTo;
    if (sought) {
      const expected = sought.at - sought.position * 1000;
      if (Math.abs(started - expected) < 3000 || Date.now() - sought.at > 35000) this._seekTo = null;
      else started = expected;
    }
    let clock = this._songClock;
    if (!clock || Math.abs(started - clock.started) > 1500) {
      clock = { started, reports: 1, at: attrs.media_position_updated_at };
      this._songClock = clock;
    } else if (clock.at !== attrs.media_position_updated_at) {
      clock.reports = Math.min(clock.reports + 1, 8);
      clock.started += (started - clock.started) / clock.reports;
      clock.at = attrs.media_position_updated_at;
    }
    const position = (Date.now() - clock.started) / 1000 + Number(this._config.lyrics_offset || 0) + this._lyricAdjust();
    return attrs.media_duration && position > attrs.media_duration + 1 + this._lyricAdjust() ? null : position;
  }
  _lyricTick() {
    const id = this._musicId(), lines = this._lyricLines || [];
    const attrs = id ? this._state(id).attributes : null;
    const position = attrs && lines.length && this._el.shell.dataset.mood === 'groove' ? this._songPosition(attrs) : null;
    if (position === null) { this._showLyric(null, false); return; }
    const { index, near } = lyricAt(lines, position);
    this._showLyric(index >= 0 ? lines[index] : null, near);
    this._lightWords(position + WORD_LEAD_S);
  }
  _showLyric(line, near) {
    this._el.shell.classList.toggle('has-lyrics', !!near || !!line);
    const was = this._lyricLine || null;
    if (line === was) return;
    this._lyricLine = line;
    this._setText(this._el.lyricNow, line ? line.t : '');
    const box = this._el.lyric;
    clearTimeout(this._lyricSwapT);
    if (!line) {
      box.classList.remove('show');
      this._lyricSwapT = setTimeout(() => this._renderLyric(null, null), 220);
      return;
    }
    // Copy what's showing now, exactly as it stands, before the new lines replace it.
    if (was) {
      const prev = this._el.lyricPrev;
      this._el.lyricWasCur.textContent = was.t;
      this._el.lyricWasNext.textContent = this._el.lyricNext.textContent;
      prev.classList.toggle('long', box.classList.contains('long'));
      prev.classList.toggle('lifted', !!was.w);
    }
    const lines = this._lyricLines || [];
    this._renderLyric(line, lines[lines.indexOf(line) + 1] || null);
    this._prepareLyricReaction(line);
    const replay = (el) => { el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); };
    replay(this._el.lyricText);
    replay(this._el.lyricNext);
    if (was) replay(this._el.lyricPrev);
    box.classList.add('show');
  }
  // Always plain text: nothing from outside can run as code.
  _renderLyric(line, next) {
    const box = this._el.lyric, target = this._el.lyricText;
    this._wordsLit = 0;
    this._wordEls = null;
    box.classList.toggle('long', !!line && line.t.length > 60);
    box.classList.toggle('words', !!line && !!line.w);
    this._el.lyricNext.textContent = next ? next.t : '';
    if (line && line.w) {
      target.replaceChildren();
      this._wordEls = [];
      let group = null;
      for (const word of line.w) {
        if (!group) { group = document.createElement('i'); group.className = 'wg'; target.append(group); }
        const el = document.createElement('span');
        el.className = 'w';
        el.textContent = word.t.trimEnd();
        group.append(el);
        this._wordEls.push(el);
        // A word ending in a space finishes a sung word; pieces with no space between them stay together.
        if (word.t.endsWith(' ')) { target.append(' '); group = null; }
      }
    } else {
      target.textContent = line ? line.t : '';
    }
  }
  // ---- reacting to the words being sung ----
  _prepareLyricReaction(line) {
    this._pendingReaction = null;
    if (this._config.lyric_reactions === false || !line) return;
    const found = lyricReaction(line.t);
    if (!found) return;
    if (!line.w) { this._reactToLyric(found.reaction); return; } // no word timing: react as the line appears
    const index = line.w.findIndex((w) => cleanWord(w.t) === found.word);
    if (index < 0) { this._reactToLyric(found.reaction); return; }
    this._pendingReaction = { reaction: found.reaction, index };
  }
  _lyricWordReached(line, lit) {
    const pending = this._pendingReaction;
    if (pending && lit > pending.index) {
      this._pendingReaction = null;
      this._reactToLyric(pending.reaction);
    }
  }
  _reactToLyric(reaction) {
    // Never while talking or using the controls, not constantly, and not the same thing every chorus.
    const shell = this._el.shell, now = Date.now();
    if (this._demo || this._mood() !== 'groove' || shell.classList.contains('open') || shell.classList.contains('has-words') || this._homeMomentOn()) return;
    if (now - (this._lastLyricReaction || 0) < LYRIC_GAP_MS) return;
    this._lyricSeen = this._lyricSeen || {};
    if (now - (this._lyricSeen[reaction] || 0) < LYRIC_SAME_GAP_MS) return;
    this._lastLyricReaction = now;
    this._lyricSeen[reaction] = now;
    this._playMoment(reaction);
  }
  _lightWords(position) {
    const line = this._lyricLine, els = this._wordEls;
    if (!line || !line.w || !els || els.length !== line.w.length) return;
    let lit = 0;
    while (lit < line.w.length && line.w[lit].b <= position) lit += 1;
    const before = this._wordsLit || 0;
    if (lit === before) return;
    this._lyricWordReached(line, lit);
    els.forEach((el, i) => {
      if (i < lit && !el.classList.contains('on')) {
        const word = line.w[i], next = line.w[i + 1];
        const finish = Number.isFinite(word.e) ? word.e : next ? next.b : word.b + 0.3;
        // Sweep for as long as the word lasts; a word we've jumped past just fills quickly.
        const left = i === lit - 1 ? finish - position : 0.08;
        el.style.transitionDuration = `${Math.min(4, Math.max(0.08, left)).toFixed(2)}s, .4s`;
        el.classList.add('on');
      } else if (i >= lit && el.classList.contains('on')) {
        el.style.transitionDuration = '0s, .1s';
        el.classList.remove('on');
      }
    });
    this._wordsLit = lit;
  }

  // ---- now playing bar ----
  // What to show: whatever is playing, or for five minutes what was just paused.
  _nowPlayingId() {
    const id = this._musicId();
    if (id) { this._npLast = id; this._npPausedAt = 0; return id; }
    const last = this._npLast;
    if (!last || this._state(last)?.state !== 'paused') return null;
    if (!this._npPausedAt) this._npPausedAt = Date.now();
    return Date.now() - this._npPausedAt < NP_PAUSE_KEEP_MS ? last : null;
  }
  _updateNowPlaying() {
    if (!this._built || !this._hass) return;
    const shell = this._el.shell, id = this._config.now_playing === false ? null : this._nowPlayingId();
    const attrs = id ? this._state(id).attributes : null;
    const show = !!attrs && !!attrs.media_title;
    shell.classList.toggle('has-np', show);
    if (!show) return;
    // On the radio, the station goes after the artist. While the presenter talks there's often no song, just the station.
    const radio = this._isRadio(attrs), station = radio ? this._stationName(attrs) : '';
    const filler = (t) => !t || RADIO_FILLER.test(t) || /:\/\/|\.m3u8|\.isml/i.test(t);
    const title = radio && filler(attrs.media_title) ? station || 'Radio' : attrs.media_title;
    const artist = radio && filler(attrs.media_artist) ? '' : attrs.media_artist;
    const under = radio ? [artist, station].filter((x, i, all) => x && x !== title && all.indexOf(x) === i).join(' · ') : attrs.media_artist || '';
    this._setText(this._el.npTitle, title);
    this._setText(this._el.npArtist, under);
    // With no picture, the empty square shows a radio for the radio and a note for music.
    if (radio !== this._npRadioIcon) {
      this._npRadioIcon = radio;
      this._el.npArtIcon.innerHTML = radio ? ICON.radio : ICON.note;
    }
    this._updateCover(this._picture(attrs));
    const duration = Number(attrs.media_duration) || 0;
    const canSeek = !!(Number(attrs.supported_features || 0) & SEEK_FEATURE) && duration > 0 && this._state(id).state === 'playing';
    this._el.np.classList.toggle('no-seek', !canSeek);
    this._el.np.classList.toggle('no-time', !duration);
    const controlled = Number(this._state(this._controlledId())?.attributes.supported_features || 0);
    this.shadowRoot.querySelectorAll('[data-np]').forEach((b) => b.classList.toggle('off', !(controlled & MEDIA_NEEDS[b.dataset.np])));
    const playing = this._state(id).state === 'playing';
    if (playing !== this._npPlaying) {
      this._npPlaying = playing;
      this.shadowRoot.querySelector('.np-b.main span').innerHTML = playing ? ICON.pause : ICON.play;
    }
    if (!duration || this._seeking) return;
    this._setProgress(this._barPosition(id, attrs), duration);
  }
  _barPosition(id, attrs) {
    if (typeof attrs.media_position !== 'number') return 0;
    if (this._state(id).state !== 'playing' || !attrs.media_position_updated_at) return attrs.media_position;
    return attrs.media_position + (Date.now() - Date.parse(attrs.media_position_updated_at)) / 1000;
  }
  _setProgress(position, duration) {
    const at = Math.max(0, Math.min(position, duration)), share = at / duration;
    this._el.npFill.style.transform = `scaleX(${share.toFixed(4)})`;
    this._el.npDot.style.transform = `translateX(${(share * this._el.npBar.clientWidth).toFixed(1)}px)`;
    this._setText(this._el.npNow, songTime(at));
    this._setText(this._el.npEnd, songTime(duration));
  }
  // Only pictures Home Assistant serves itself, as with the colours.
  _updateCover(url) {
    const img = this._el.npImg;
    const safe = url && url.startsWith('/') ? url : '';
    const key = safe ? (safe.match(/[?&]cache=([^&]+)/) || [null, safe])[1] : '';
    if (key === this._coverKey) return;
    this._coverKey = key;
    img.classList.remove('on');
    if (!safe) { img.removeAttribute('src'); return; }
    img.onload = () => { if (this._coverKey === key) img.classList.add('on'); };
    img.onerror = () => img.classList.remove('on');
    img.src = safe;
  }
  // Tap or drag along the bar to move through the song.
  _wireSeek() {
    const bar = this._el.npBar, np = this._el.np;
    const share = (e) => { const box = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)); };
    const preview = (e) => {
      const id = this._musicId(), duration = id ? Number(this._state(id).attributes.media_duration) || 0 : 0;
      if (duration) this._setProgress(share(e) * duration, duration);
    };
    bar.addEventListener('pointerdown', (e) => {
      if (np.classList.contains('no-seek')) return;
      this._seeking = true;
      np.classList.add('dragging');
      try { bar.setPointerCapture(e.pointerId); } catch (err) { /* still works for a tap */ }
      preview(e);
    });
    bar.addEventListener('pointermove', (e) => { if (this._seeking) preview(e); });
    const finish = (e, commit) => {
      if (!this._seeking) return;
      this._seeking = false;
      np.classList.remove('dragging');
      const id = this._musicId();
      if (!commit || !id) return;
      const duration = Number(this._state(id).attributes.media_duration) || 0, position = Math.round(share(e) * duration);
      // Lyrics move straight away rather than waiting for Spotify's next report.
      this._songClock = null;
      this._seekTo = { id, position, at: Date.now() };
      this._service('media_player', 'media_seek', id, { seek_position: position });
    };
    bar.addEventListener('pointerup', (e) => finish(e, true));
    bar.addEventListener('pointercancel', (e) => finish(e, false));
  }

  // ---- idle moments ----
  _scheduleMoment() {
    clearTimeout(this._nextT);
    if (this._config.moments === false && this._config.info_cards === false) return;
    const every = Number(this._config.moment_every) || 30;
    // Moves during music come a little more often than idle moments, but always with rests between.
    const pace = this._built && this._el.shell.dataset.mood === 'groove' ? 0.45 : 1;
    this._nextT = setTimeout(() => { this._autoMoment(); this._scheduleMoment(); }, every * pace * (0.7 + Math.random() * 0.8) * 1000);
  }
  _canMoment() {
    if (!this._built || this._moment || this._demo || !this._hass) return false;
    const shell = this._el.shell;
    return !shell.classList.contains('open') && !shell.classList.contains('has-words') && ['idle', 'groove'].includes(this._mood());
  }
  _pick(list) {
    this._bags = this._bags || {};
    const key = list.join();
    if (!this._bags[key] || !this._bags[key].length) {
      this._bags[key] = list.slice().sort(() => Math.random() - 0.5);
      if (this._lastMoment && this._bags[key][this._bags[key].length - 1] === this._lastMoment) this._bags[key].reverse();
    }
    return this._bags[key].pop();
  }
  _autoMoment() {
    if (!this._canMoment()) return;
    if (this._mood() === 'groove') {
      if (this._config.moments !== false) this._playMoment(this._pick(this._bopMoments(MUSIC_MOMENTS, 'music')));
      return;
    }
    if (this._cardDue() && this._showCard()) return;
    if (this._config.moments === false || this._el.shell.classList.contains('has-vac')) return;
    const toBed = this._config.home_events === false ? null : this._minutesToBedtime(new Date());
    if (toBed !== null && toBed <= WIND_DOWN_MINS) {
      this._playMoment(this._pick(toBed <= NODDING_MINS ? NODDING : WIND_DOWN));
      return;
    }
    // Take turns: something of its own, then something useful.
    this._turn = !this._turn;
    const info = INFO_MOMENTS.filter((n) => n === 'clock' || n === 'date' || this._usable(this._config.weather));
    this._playMoment(this._pick(this._turn ? this._bopMoments(PLAY_MOMENTS, 'play') : info));
  }
  // ---- info cards: the forecast and what's coming up ----
  // Home Assistant already fetches the forecast for its weather entity, so nothing new leaves the house.
  _watchForecast() {
    const conn = this._hass && this._hass.connection, id = this._config.weather;
    const on = this._config.info_cards !== false && id && this._usable(id);
    const features = on ? Number(this._state(id).attributes.supported_features) || 0 : 0;
    // Asked again if what the weather can forecast changes (it can, while Home Assistant is starting).
    const want = on ? `${id}|${features}` : '';
    if (want === (this._forecastFor || '')) return;
    this._stopForecast();
    if (!want || !conn || typeof conn.subscribeMessage !== 'function') return;
    this._forecastFor = want;
    const forecast = this._forecast;
    // Home Assistant's weather features: 1 = daily forecast, 2 = hourly.
    this._forecastSubs = [['daily', 1], ['hourly', 2]].filter(([, bit]) => features & bit).map(([type]) =>
      conn.subscribeMessage((d) => { if (d && Array.isArray(d.forecast)) forecast[type] = d.forecast; },
        { type: 'weather/subscribe_forecast', entity_id: id, forecast_type: type }).catch(() => null));
  }
  _stopForecast() {
    for (const sub of this._forecastSubs || []) sub.then((unsub) => { if (typeof unsub === 'function') unsub(); }).catch(() => {});
    this._forecastSubs = [];
    this._forecastFor = '';
    this._forecast = {};
  }
  // Only on the plain idle face, with nothing else beside it or popping up.
  _cardDue() {
    if (this._config.info_cards === false || this._mood() !== 'idle') return false;
    const shell = this._el.shell;
    if (['has-np', 'has-lyrics', 'has-dock', 'night'].some((c) => shell.classList.contains(c))) return false;
    if (this._alerts && [...this._alerts.values()].some((a) => a.mode && a.mode !== 'hidden')) return false;
    const busy = this._vacuums().some((v) => this._vacBusy(v));
    const every = (Number(this._config.card_every) || 180) * 1000 * (busy ? 0.5 : 1);
    if (!this._cardAt) this._cardAt = Date.now() - every / 2; // the first one comes a little sooner
    return Date.now() - this._cardAt >= every;
  }
  // Takes turns; one with nothing to say (no alarms or reminders coming up, say) is skipped.
  _showCard() {
    this._cardAt = Date.now();
    for (let i = 1; i <= CARDS.length; i += 1) {
      const turn = ((this._cardTurn ?? -1) + i) % CARDS.length;
      if (this._playMoment(CARDS[turn])) { this._cardTurn = turn; return true; }
    }
    return false;
  }
  _condIcon(condition, night) {
    const s = String(condition || '');
    if (s === 'sunny') return night ? ICON.moon : ICON.sun;
    if (s === 'clear-night') return ICON.moon;
    if (s === 'partlycloudy') return night ? ICON.partlyNight : ICON.partly;
    if (/lightning/.test(s)) return ICON.storm;
    if (/snow/.test(s)) return ICON.snow;
    if (/rain|pour|hail/.test(s)) return ICON.showers;
    if (s === 'fog') return ICON.fog;
    if (/wind/.test(s)) return ICON.wind;
    return ICON.cloudy;
  }
  _sunDown(at) {
    const sun = this._state('sun.sun');
    if (sun && at === undefined) return sun.state === 'below_horizon';
    const h = new Date(at ?? Date.now()).getHours();
    return h < 7 || h >= 19;
  }
  /** Fills in the card. Returns what the moment needs, or null when there's nothing worth showing. */
  _fillCard(name, now) {
    const el = this._el.icard, w = this._state(this._config.weather), fc = this._forecast || {};
    const dayOf = (t) => new Date(t).toDateString(), today = now.toDateString();
    const wet = (x) => /rain|pour|hail|lightning|snow/.test(x.condition || '') || (x.precipitation_probability ?? 0) >= 50;
    const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const deg = (v) => (v == null ? '' : this._deg(Math.round(v)));
    if (name === 'cardToday') {
      if (!this._usable(this._config.weather) || w.attributes.temperature == null) return null;
      const day = (fc.daily || []).find((x) => dayOf(x.datetime) === today);
      const ahead = (fc.hourly || []).filter((x) => Date.parse(x.datetime) > now.getTime());
      const range = day ? [day.temperature != null && `High ${deg(day.temperature)}`, day.templow != null && `Low ${deg(day.templow)}`].filter(Boolean).join(' · ') : '';
      // Rain coming, or stopping, in the next 12 hours.
      let hint = '';
      const soon = ahead.slice(0, 12), raining = /rain|pour|hail|lightning|snow/.test(w.state);
      const turn = soon.find((x) => wet(x) !== raining);
      if (turn) {
        const what = /snow/.test(raining ? w.state : turn.condition || '') ? 'Snow' : 'Rain';
        hint = raining ? `${what} stopping by ${hhmm(turn.datetime)}` : `${what} likely from ${hhmm(turn.datetime)}`;
      }
      const hours = ahead.filter((x) => new Date(x.datetime).getHours() % 3 === 0).slice(0, CARD_HOURS);
      el.innerHTML = `<div class="ic-label">Today</div>
        <div class="ic-now"><span class="ic-big">${this._condIcon(w.state, this._sunDown())}</span><span class="ic-deg">${deg(w.attributes.temperature)}</span>
          <span class="ic-txt"><span class="ic-what">${esc(WEATHER_WORDS[w.state] || capFirst(String(w.state).replace(/[-_]/g, ' ')))}</span><span class="ic-sub">${esc(range)}</span></span></div>
        ${hint ? `<div class="ic-sub">${esc(hint)}</div>` : ''}
        ${hours.length >= 3 ? `<div class="ic-cols">${hours.map((x) => `<div class="ic-col"><span class="ic-t">${hhmm(x.datetime)}</span><span class="ic-ic">${this._condIcon(x.condition, this._sunDown(x.datetime))}</span><span class="ic-hi">${deg(x.temperature)}</span></div>`).join('')}</div>` : ''}`;
      return { sky: WEATHER_KIND[w.state] || 'cloud' };
    }
    if (name === 'cardWeek') {
      const days = (fc.daily || []).filter((x) => Date.parse(x.datetime) > now.getTime() && dayOf(x.datetime) !== today).slice(0, CARD_DAYS);
      if (days.length < 3) return null;
      el.innerHTML = `<div class="ic-label">Next few days</div>
        <div class="ic-cols ic-days">${days.map((x) => `<div class="ic-col"><span class="ic-t">${new Date(x.datetime).toLocaleDateString('en-GB', { weekday: 'short' })}</span><span class="ic-ic">${this._condIcon(x.condition)}</span><span class="ic-hi">${deg(x.temperature)}</span><span class="ic-lo">${deg(x.templow)}</span></div>`).join('')}</div>`;
      return {};
    }
    if (name === 'cardVacuum') {
      const id = this._vacuums().find((v) => this._vacBusy(v));
      if (!id || this._vacWatch) return null; // the live map is already showing
      this._vacMapTick = Date.now(); // a fresh picture each time
      const info = this._vacInfo(id);
      el.innerHTML = `<div class="ic-label">${esc(this._vacuums().length > 1 ? this._vacName(id) : 'Hoovering')}</div>
        <div class="ic-what">${esc(info.line)}</div>
        ${this._vacMapUrl(id) ? '<canvas class="ic-map"></canvas>' : ''}`;
      const map = el.querySelector('.ic-map');
      if (map) this._drawVacMap(id, map).then((drawn) => { if (!drawn) map.remove(); }); // no map: just the words
      return {};
    }
    if (name === 'cardSoon') {
      const clock = this._serverNow();
      const items = ((this._alertData && this._alertData.reminders) || [])
        .filter((r) => r.status === 'pending' && r.due > clock && r.due - clock < CARD_SOON_HOURS * 3600000)
        .sort((a, b) => a.due - b.due).slice(0, CARD_SOON);
      if (!items.length) return null;
      const when = (due) => { const t = dueWords(due, clock); return /^\d/.test(t) ? `Today ${t}` : capFirst(t); };
      el.innerHTML = `<div class="ic-label">Coming up</div>${items.map((r) => `<div class="ic-row"><span class="ic-ic">${r.kind === 'alarm' ? ICON.sun : ICON.bell}</span>
        <span class="ic-txt"><span class="ic-what">${esc(r.kind === 'alarm' ? 'Alarm' : capFirst(r.text || 'Reminder'))}</span><span class="ic-sub">${esc(when(r.due))}</span></span></div>`).join('')}`;
      return {};
    }
    return null;
  }
  // ---- the doorbell ----
  // Which doorbell signals to watch: the one named, or every doorbell event (Ring's "ding") and doorbell sensor.
  _doorbellIds() {
    const states = this._hass?.states || {}, count = Object.keys(states).length, named = this._config.doorbell;
    if (typeof named === 'string') return [named];
    if (count !== this._doorCount) {
      this._doorCount = count;
      this._doorList = Object.keys(states).filter((id) => {
        const a = states[id].attributes || {};
        if (id.startsWith('event.')) return a.device_class === 'doorbell' || (Array.isArray(a.event_types) && a.event_types.some((t) => /^(ding|ring|doorbell)$/i.test(t)));
        return id.startsWith('binary_sensor.') && (a.device_class === 'doorbell' || /_ding$|_doorbell$/.test(id));
      });
    }
    return this._doorList;
  }
  _watchDoorbell() {
    if (this._config.doorbell === false || !this._hass) return;
    this._doorSeen = this._doorSeen || {};
    for (const id of this._doorbellIds()) {
      const s = this._state(id);
      if (!s) continue;
      const was = this._doorSeen[id];
      this._doorSeen[id] = s.state;
      if (was === undefined || s.state === was || ['unavailable', 'unknown'].includes(s.state)) continue; // first look: old news
      const rang = id.startsWith('event.')
        ? !s.attributes.event_type || /ding|ring|press|doorbell/i.test(s.attributes.event_type)
        : s.state === 'on';
      if (rang) this._openDoorbell(id);
    }
    this._watchWalkUps();
    if (this._doorbell && this._doorbell.view) this._doorbell.view.hass = this._hass;
    if (this._doorbell) this._doorVisitor();
  }
  // The camera: the one named, or the doorbell's own (its live view if it has one).
  _doorbellCamera(trigger) {
    if (this._config.doorbell_camera) return this._config.doorbell_camera;
    const states = this._hass.states, registry = this._hass.entities || {};
    const device = registry[trigger] && registry[trigger].device_id;
    const own = Object.keys(states).filter((id) => id.startsWith('camera.') && device && registry[id] && registry[id].device_id === device);
    // Cameras named like the door, from any source: a doorbell seen through a bridge (ring-mqtt) only has still
    // snapshots of its own, while Home Assistant's Ring integration has the live view of the same door.
    const stem = trigger.split('.')[1].replace(/_(ding|doorbell|ring|button|press|pressed)$/, '');
    const named = Object.keys(states).filter((id) => id.startsWith('camera.') && id.split('.')[1].startsWith(stem));
    // Best first: a live view (Ring's streams over WebRTC without saying it can "stream", so the name counts most),
    // then one that says it streams, then the doorbell's own. Never a still picture if there's anything better:
    // snapshots (ring-mqtt's camera) and last recordings, or anything through MQTT, which can only send stills.
    const score = (id) => {
      const name = id.split('.')[1], entry = registry[id] || {};
      return (/live/.test(name) ? 8 : 0) + ((((states[id] || {}).attributes || {}).supported_features || 0) & 2 ? 4 : 0)
        + (own.includes(id) ? 1 : 0) - (/snapshot|still|last_recording|recording|_image$/.test(name) ? 16 : 0) - (entry.platform === 'mqtt' ? 16 : 0);
    };
    const all = [...new Set([...own, ...named])];
    return all.sort((a, b) => score(b) - score(a))[0] || null;
  }
  // Which door, from the doorbell's name ("Front Door Ding" -> "Front Door").
  _doorName(trigger) {
    return String(this._state(trigger)?.attributes.friendly_name || '').replace(/\s*(ding|doorbell|ring|button|pressed)$/i, '').trim();
  }
  _doorRangTitle(trigger) {
    const name = this._doorName(trigger);
    return name ? `Someone’s at the ${name}` : 'Someone’s at the door';
  }
  // ---- who's at the door: the echo_faces add-on's sensor names who rang, only when it's sure ----
  /** When the doorbell rang, by Home Assistant's clock (the same clock the add-on uses), so screens' clocks don't matter. */
  _rangAt(trigger) {
    const s = this._state(trigger), at = s ? Date.parse(s.last_updated || s.last_changed) : NaN;
    return Number.isFinite(at) ? at : Date.now();
  }
  /** The add-on's sensors, one per doorbell. */
  _doorVisitorSensors() {
    const states = this._hass?.states || {}, count = Object.keys(states).length;
    if (count !== this._visitorCount) {
      this._visitorCount = count;
      this._visitorList = Object.keys(states).filter((id) => id.startsWith('sensor.') && (states[id].attributes || {}).echo_faces === true);
    }
    return this._visitorList;
  }
  /** The add-on's sensor for this doorbell: the one listing it among its rings, else the one for the same door. */
  _doorVisitorSensor(trigger) {
    const list = this._doorVisitorSensors(), door = this._doorName(trigger).toLowerCase();
    return list.find((id) => [].concat(this._state(id)?.attributes.rings || []).includes(trigger))
      || list.find((id) => door && String(this._state(id)?.attributes.door || '').toLowerCase() === door) || null;
  }
  /** "Mum’s at the Front Door", "Mum and Sam are at the Front Door", "Mum and someone else are at the Front Door". */
  _doorNamesTitle(names, others, trigger) {
    const all = names.map(String).concat(others > 0 ? ['someone else'] : []);
    const who = all.length === 1 ? all[0] : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
    const place = this._doorName(trigger) || 'door';
    return all.length === 1 ? `${who}’s at the ${place}` : `${who} are at the ${place}`;
  }
  /** Who rang, as a title, or null if nobody's been recognised for this ring. */
  _doorVisitorTitle(trigger, rangAt) {
    if (this._config.doorbell_names === false || !trigger || !rangAt) return null;
    const id = this._doorVisitorSensor(trigger), a = id && this._state(id)?.attributes;
    if (!a || a.status !== 'known' || !Array.isArray(a.names) || !a.names.length) return null;
    const at = Date.parse(a.rang_at);
    if (!Number.isFinite(at) || at < rangAt - DOOR_VISITOR_EARLY_MS) return null; // from an earlier visit
    return this._doorNamesTitle(a.names, a.others, trigger);
  }
  /** The add-on hasn't answered for this ring yet: still checking, or not heard of it yet. */
  _doorRingPending(trigger, rangAt) {
    const id = this._doorVisitorSensor(trigger), a = id && this._state(id)?.attributes;
    if (!a) return false;
    const at = Date.parse(a.rang_at);
    return a.status === 'checking' || !Number.isFinite(at) || at < rangAt - DOOR_VISITOR_EARLY_MS;
  }
  /** Keeps the title in step: the name once known; back to "Someone’s" if a newer ring turns out to be someone else.
   *  Seen walking up and then rang: their name stays while that ring is being checked. */
  _doorVisitor() {
    const door = this._doorbell;
    if (!door || (!door.rang && !door.walkUp)) return; // opened from the menu, and nobody has rung or walked up
    if (!door.rang) { this._setText(this._el.doorTitle, door.walkUp); return; }
    let title = this._doorVisitorTitle(door.rang, door.rangAt);
    if (!title && door.walkUp && this._config.doorbell_names !== false && this._doorRingPending(door.rang, door.rangAt)) title = door.walkUp;
    this._setText(this._el.doorTitle, title || this._doorRangTitle(door.rang));
  }
  /** Someone added walks up without ringing: the add-on names them (only people it's sure of, never strangers), and
   *  the doorbell's video comes up as for a ring, titled with their name. */
  _watchWalkUps() {
    if (this._config.doorbell_names === false) return;
    this._walkSeen = this._walkSeen || {};
    for (const id of this._doorVisitorSensors()) {
      const a = this._state(id)?.attributes || {};
      const at = a.how === 'walk_up' && a.status === 'known' && Array.isArray(a.names) && a.names.length ? String(a.seen_at || '') : '';
      const was = this._walkSeen[id];
      this._walkSeen[id] = at;
      if (was === undefined || !at || at === was) continue; // first look: old news
      const rings = [].concat(a.rings || []).map(String), ours = this._doorbellIds();
      const trigger = rings.find((r) => ours.includes(r) && this._state(r)) || rings.find((r) => this._state(r));
      if (trigger) this._openDoorbell(trigger, 'walk_up', null, this._doorNamesTitle(a.names, a.others, trigger));
    }
  }
  /** One menu button per doorbell camera (a doorbell seen through two integrations is still one door). */
  _doors() {
    if (this._config.doorbell === false || !this._hass) return [];
    const seen = new Map();
    for (const trigger of this._doorbellIds()) {
      if (!this._state(trigger)) continue;
      const camera = this._doorbellCamera(trigger);
      if (camera && this._state(camera) && !seen.has(camera)) seen.set(camera, { id: `door:${camera}`, kind: 'door', trigger, camera });
    }
    return [...seen.values()];
  }
  // how: 'ring' when it rang, 'walk_up' when the add-on saw someone added walk up (walkUp: the title with their name),
  // 'menu' when opened from the tap menu to have a look.
  _openDoorbell(trigger, how = 'ring', camera = null, walkUp = null) {
    const shell = this._el.shell, open = this._doorbell;
    clearTimeout(this._doorT);
    this._doorT = setTimeout(() => this._closeDoorbell(), DOORBELL_MS);
    if (open) { // rang again (or rang while having a look): stays up longer
      open.until = Date.now() + DOORBELL_MS;
      if (how === 'ring') {
        Object.assign(open, { rang: trigger, rangAt: this._rangAt(trigger) });
        this._setText(this._el.doorTitle, this._doorRangTitle(trigger));
        this._doorVisitor();
      } else if (how === 'walk_up') {
        open.walkUp = walkUp;
        this._doorVisitor();
      }
      return;
    }
    if (shell.classList.contains('open')) this._openControls(false);
    camera = camera || this._doorbellCamera(trigger);
    const door = this._doorbell = { trigger, camera, how, until: Date.now() + DOORBELL_MS, view: null, paused: [],
      rang: how === 'ring' ? trigger : null, rangAt: how === 'ring' ? this._rangAt(trigger) : 0, walkUp: how === 'walk_up' ? walkUp : null };
    shell.classList.add('door-open');
    shell.classList.remove('door-quiet');
    this._el.door.setAttribute('aria-hidden', 'false');
    this._setText(this._el.doorTitle, how === 'menu' ? this._doorName(trigger) || 'Doorbell' : how === 'walk_up' ? walkUp : this._doorRangTitle(trigger));
    this._doorVisitor();
    const box = this._el.doorVideo, wait = document.createElement('span');
    wait.className = 'door-wait';
    wait.textContent = camera ? 'Connecting to the camera…' : 'No camera found for the doorbell';
    box.replaceChildren(wait);
    if (camera) {
      this._doorPause(door); // so the doorbell can be heard
      this._doorbellVideo(camera);
    }
    this._tick(); // out of night mode at once, so the screen is bright
  }
  // ---- the doorbell's sound: what the Echo is playing pauses while it shows, and carries on after ----
  /** The Echo's own players: on the same device as its voice, or named like it. Not other rooms' speakers. */
  _echoPlayers() {
    const wanted = this._config.doorbell_pause;
    if (wanted === false || !this._hass) return [];
    if (Array.isArray(wanted)) return wanted.filter((id) => this._state(id));
    const states = this._hass.states, registry = this._hass.entities || {}, satellite = this._config.satellite;
    const device = satellite && registry[satellite] && registry[satellite].device_id;
    const stem = satellite ? satellite.split('.')[1].replace(/_assist_satellite$/, '') : null;
    return Object.keys(states).filter((id) => id.startsWith('media_player.')
      && ((device && registry[id] && registry[id].device_id === device) || (stem && id.split('.')[1].startsWith(stem))));
  }
  _doorPause(door) {
    const playing = this._echoPlayers().filter((id) => this._state(id)?.state === 'playing');
    // Music Assistant plays through the Echo's own player: pausing it is enough (and it resumes properly).
    const assistant = playing.filter((id) => this._state(id).attributes.mass_player_type);
    door.paused = assistant.length ? assistant : playing;
    for (const id of door.paused) Promise.resolve(this._hass.callService('media_player', 'media_pause', { entity_id: id })).catch(() => {});
  }
  _doorResume(door) {
    for (const id of door.paused || []) {
      // Only if it's still paused: if someone started something else meanwhile, that's left alone.
      if (['paused', 'idle'].includes(this._state(id)?.state)) {
        Promise.resolve(this._hass.callService('media_player', 'media_play', { entity_id: id })).catch(() => {});
      }
    }
    door.paused = [];
  }
  // Home Assistant's camera card starts muted. Turn its sound on; if the screen won't play sound until it's been
  // tapped, keep the picture going quietly and offer "Sound on" (a tap is allowed to start sound).
  _doorSound(door) {
    clearInterval(this._doorSoundT);
    const until = Date.now() + DOOR_SOUND_TRY_MS;
    const tick = () => {
      if (this._doorbell !== door || Date.now() > until) { clearInterval(this._doorSoundT); return; }
      if (!door.view || door.quiet) return;
      for (const el of deepFind(door.view, isStreamPart)) if (el.muted) el.muted = false;
      for (const v of deepFind(door.view, isVideo)) {
        if (!v.muted && !v.paused) { v._echoHeard = true; continue; }
        if (v.muted && !v.paused && !v._echoTried) { v._echoTried = Date.now(); v.muted = false; continue; }
        if (!v._echoHeard && v._echoTried && v.paused && Date.now() - v._echoTried > DOOR_SOUND_WAIT_MS) {
          door.quiet = true;
          for (const el of deepFind(door.view, isStreamPart)) el.muted = true;
          v.muted = true;
          Promise.resolve(v.play && v.play()).catch(() => {});
          this._el.shell.classList.add('door-quiet');
        }
      }
    };
    this._doorSoundT = setInterval(tick, 400);
  }
  _doorSoundOn() {
    const door = this._doorbell;
    if (!door || !door.view) return;
    door.quiet = false;
    this._el.shell.classList.remove('door-quiet');
    for (const el of deepFind(door.view, isStreamPart)) el.muted = false;
    for (const v of deepFind(door.view, isVideo)) {
      v.muted = false;
      v._echoTried = Date.now();
      v._echoHeard = false;
      Promise.resolve(v.play && v.play()).catch(() => {});
    }
    this._doorSound(door); // checks it took
  }
  // Live, through Home Assistant's own camera card (it handles Ring's live video). Without the card helpers (an
  // old Home Assistant), a moving picture through Home Assistant instead.
  async _doorbellVideo(camera) {
    const door = this._doorbell, box = this._el.doorVideo;
    let view = null;
    try {
      const helpers = typeof window.loadCardHelpers === 'function' ? await window.loadCardHelpers() : null;
      if (helpers) {
        const r = box.getBoundingClientRect(), ratio = r.width && r.height ? `${Math.round(r.width)}:${Math.round(r.height)}` : '16:9';
        view = await helpers.createCardElement({ type: 'picture-entity', entity: camera, camera_view: 'live', show_name: false, show_state: false,
          aspect_ratio: ratio, fit_mode: 'contain', tap_action: { action: 'none' }, hold_action: { action: 'none' } });
      }
    } catch (err) { view = null; }
    if (this._doorbell !== door) return; // closed meanwhile
    if (!view) {
      const token = this._state(camera)?.attributes.access_token;
      view = document.createElement('img');
      view.alt = '';
      if (token) view.src = `/api/camera_proxy_stream/${camera}?token=${encodeURIComponent(token)}`;
    } else {
      view.hass = this._hass;
    }
    door.view = view;
    box.replaceChildren(view);
    this._doorSound(door);
  }
  _closeDoorbell() {
    clearTimeout(this._doorT);
    clearInterval(this._doorSoundT);
    const door = this._doorbell;
    if (!door) return;
    this._doorbell = null;
    this._doorResume(door);
    this._el.shell.classList.remove('door-open', 'door-quiet');
    this._el.door.setAttribute('aria-hidden', 'true');
    this._el.doorVideo.replaceChildren(); // stops the video
    this._tick();
  }
  // ---- things happening around the home ----
  _watchHome() {
    if (this._config.home_events === false || !this._hass) return;
    const states = this._hass.states, now = Date.now();
    if (!this._homeList || now - this._homeListAt > 60000) {
      const ids = Object.keys(states);
      this._homeList = {
        people: this._config.people || ids.filter((id) => id.startsWith('person.')),
        heaters: this._config.heating || ids.filter((id) => id.startsWith('climate.')),
      };
      this._homeListAt = now;
    }
    this._homeSeen = this._homeSeen || {};
    this._arrivedAt = this._arrivedAt || {};
    const seen = this._homeSeen;
    const real = (entity) => entity && !['unavailable', 'unknown'].includes(entity.state);
    for (const id of this._homeList.people) {
      const entity = states[id];
      if (!real(entity)) continue; // a restart doesn't count as going anywhere
      const was = seen[id];
      seen[id] = { state: entity.state, since: Date.parse(entity.last_changed) || 0 };
      if (!was || entity.state !== 'home' || was.state === 'home') continue;
      if (now - was.since < ARRIVE_AWAY_MS || now - (this._arrivedAt[id] || 0) < ARRIVE_GAP_MS) continue;
      this._arrivedAt[id] = now;
      this._queueArrival(String(entity.attributes.friendly_name || id.split('.')[1]).split(/[\s_]+/)[0]);
    }
    for (const id of this._homeList.heaters) {
      const entity = states[id];
      if (!real(entity)) continue;
      const action = entity.attributes.hvac_action;
      const heating = action ? action === 'heating' : entity.state === 'heat';
      const was = seen[id];
      seen[id] = heating;
      if (was !== false || !heating || now - (this._heatedAt || 0) < HEAT_GAP_MS) continue;
      this._heatedAt = now;
      this._queueHome({ name: 'homeHeat', caption: 'Heating’s on' });
    }
  }
  _queueHome(item, waitMs = HOME_WAIT_MS) {
    const at = item.at || Date.now();
    this._homeQueue = this._homeQueue || [];
    this._homeQueue.push({ ...item, at, until: at + waitMs });
  }
  // People who get in together are greeted together.
  _queueArrival(person) {
    const waiting = (this._homeQueue || []).find((item) => item.people);
    if (waiting) waiting.people.push(person);
    else this._queueHome({ name: 'homeArrive', people: [person], at: Date.now() + ARRIVE_GROUP_MS });
  }
  _homeTick() {
    const night = this._el.shell.classList.contains('night');
    if (night !== this._brightNight) { this._brightNight = night; this._nightChanged(night); }
    // Only the real end of the night says good morning, not night mode stepping aside for the doorbell or a clean.
    const real = this._baseNight(new Date());
    if (this._wasNight && !real && !this._doorbell && this._config.home_events !== false) this._queueHome({ name: 'homeMorning', caption: 'Good morning' }, MORNING_WAIT_MS);
    this._wasNight = real;
    const queue = this._homeQueue;
    if (!queue || !queue.length) return;
    const now = Date.now();
    while (queue.length && now > queue[0].until) queue.shift();
    if (!queue.length || now < queue[0].at || !this._canHomeEvent()) return;
    const item = queue.shift();
    let caption = item.caption;
    if (item.people) {
      const names = item.people;
      caption = names.length === 1 ? `${names[0]}’s home` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are home`;
    }
    this._playMoment(item.name, caption);
  }
  // Same rules as idle moments, except that it takes over from a lyric or idle moment. It waits for another home one.
  _canHomeEvent() {
    if (!this._built || this._demo || !this._hass || this._homeMomentOn()) return false;
    const shell = this._el.shell;
    return !shell.classList.contains('open') && !shell.classList.contains('has-words') && ['idle', 'groove'].includes(this._mood());
  }
  _homeMomentOn() {
    return !!this._moment && this._moment.name.startsWith('home');
  }
  // How long until night mode starts, if that's soon. Null at night, or with night mode turned off.
  _minutesToBedtime(now) {
    const start = this._config.night_start;
    if (!start || !this._config.night_end || this._baseNight(now)) return null;
    const [h, m] = String(start).split(':').map(Number);
    return (h * 60 + (m || 0) - (now.getHours() * 60 + now.getMinutes()) + 1440) % 1440;
  }
  _playMoment(name, caption) {
    const base = MOMENTS[name];
    if (!base) return false;
    this._endMoment(false);
    const moment = { name, look: base };
    if (caption) moment.caption = caption;
    const now = new Date(), weather = this._state(this._config.weather);
    if (base.card) {
      const card = this._fillCard(name, now);
      if (!card) return false;
      if (card.sky) moment.sky = card.sky;
      this._el.shell.classList.add('has-card');
    } else if (name === 'clock') {
      const [h, m] = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).split(':');
      this._readout(h, ':', m);
    } else if (name === 'date') {
      this._readout(now.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(), '', String(now.getDate()));
    } else if (name === 'temp') {
      const degrees = Math.round(weather?.attributes.temperature ?? 0);
      moment.sky = degrees <= 5 ? 'cold' : degrees <= 15 ? 'mild' : degrees <= 24 ? 'warm' : 'hot';
      this._readout(this._weatherIcon(), '', `${degrees}°`, true);
    } else if (name === 'weather') {
      const kind = WEATHER_KIND[weather?.state] || 'cloud';
      moment.sky = kind;
      moment.look = { ...base, ...WEATHER_LOOK[kind] };
      this._setFx(kind);
    }
    if (base.fx) this._setFx(base.fx);
    this._clearTint();
    if (base.tint) {
      const colour = [1, 3, 5].map((at) => parseInt(base.tint.slice(at, at + 2), 16));
      const strength = contrastOf(colour, [255, 255, 255]) < 3 ? 0.12 : 0.32;
      for (const layer of [this._el.tint, this._el.npTint]) {
        layer.style.background = base.tint;
        layer.animate([{ opacity: 0 }, { opacity: strength, offset: 0.2 }, { opacity: strength, offset: 0.7 }, { opacity: 0 }], { duration: base.ms, easing: 'ease-in-out' });
      }
    }
    this._moment = moment;
    this._lastMoment = name;
    this._el.eyes.style.transform = '';
    clearTimeout(this._momentT);
    this._momentT = setTimeout(() => this._endMoment(true), base.ms);
    this._apply();
    if (base.skit) this._startSkit(moment);
    return true;
  }
  _clearTint() {
    for (const layer of [this._el.tint, this._el.npTint]) layer.getAnimations().forEach((a) => a.cancel());
  }
  _endMoment(apply) {
    clearTimeout(this._momentT);
    if (!this._moment) return;
    this._stopSkit();
    this._moment = null;
    this._el.shell.classList.remove('has-card');
    this._clearTint();
    const fx = this._el.fx;
    fx.classList.remove('on');
    this._el.shell.classList.remove('fx-busy');
    clearTimeout(this._fxT);
    this._fxT = setTimeout(() => fx.replaceChildren(), FX_FADE_MS);
    if (apply) this._apply();
  }
  // Skits: fill the layers, start the movements, and change expression on each beat. Skits that can happen from
  // either side take turns. Word-by-word lyrics already keep the screen busy, so they use fewer pieces alongside them.
  _startSkit(moment) {
    // A story with more than one ending plays them in turn.
    const look = moment.look, shell = this._el.shell, layer = this._el.skit;
    if (look.endings) this._endingTurn = ((this._endingTurn ?? -1) + 1) % look.endings.length;
    const name = look.endings ? look.endings[this._endingTurn] : look.skit, s = SKITS[name];
    if (!s) return;
    clearTimeout(this._skitT);
    const few = (n) => this._fewer(n);
    layer.back.innerHTML = s.back ? s.back(few) : '';
    layer.front.innerHTML = s.front ? s.front(few) : '';
    layer.kit.innerHTML = s.kit ? s.kit(few) : '';
    for (const eye of layer.eyes) eye.innerHTML = s.eyeKit ? s.eyeKit(few) : '';
    this._blend(this._el.blend, this._el.rb); // start from wherever its breathing had got to
    delete shell.dataset.skit;
    void shell.offsetWidth; // so the same skit twice in a row starts again from the beginning
    this._skitSides = this._skitSides || {}; // each either-side skit swaps from wherever it played last time
    const flip = s.flip ? (this._skitSides[name] = !this._skitSides[name]) : false;
    if (flip) shell.dataset.flip = ''; else delete shell.dataset.flip;
    shell.dataset.skit = name;
    for (const el of [layer.back, layer.front, layer.kit]) el.classList.add('on');
    shell.classList.add('fx-busy');
    this._beatT = (s.beats || []).map(([at, change]) => setTimeout(() => {
      if (this._moment !== moment) return;
      moment.look = { ...moment.look, ...change };
      this._apply();
    }, at));
  }
  _stopSkit() {
    (this._beatT || []).forEach(clearTimeout);
    this._beatT = [];
    const shell = this._el.shell, layer = this._el.skit;
    if (!shell.dataset.skit) return;
    // If it's cut short (you start talking), ease back from wherever it had got to rather than jumping.
    this._blend(this._el.blend, this._el.rb);
    this._blend(this._el.eyesBlend, this._el.eyes);
    delete shell.dataset.skit;
    delete shell.dataset.flip;
    for (const el of [layer.back, layer.front, layer.kit]) el.classList.remove('on');
    clearTimeout(this._skitT);
    this._skitT = setTimeout(() => { for (const el of [layer.back, layer.front, layer.kit, ...layer.eyes]) el.replaceChildren(); }, FX_FADE_MS);
  }
  // Builds any of the reusable effects: falling, rising, drifting, twinkling, bursting, sweeping or rings.
  // Word-by-word lyrics already keep the screen busy, so effects use fewer pieces alongside them.
  _fewer(n) {
    return this._lyricLine && this._lyricLine.w && n > 4 ? Math.ceil(n * FX_WITH_WORDS) : n;
  }
  _effect({ kind, icon, colour, n, size }) {
    const inner = ICON[icon] || '';
    n = this._fewer(n);
    // The face sits left of the lyrics, so bursts and rings start from wherever it is.
    const x = this._el.shell.classList.contains('has-lyrics') ? 22 : 50, y = this._el.shell.classList.contains('has-np') ? 38 : 48;
    let out = '';
    for (let i = 0; i < n; i += 1) {
      const across = (i * 37 + 7) % 100, down = (i * 53 + 11) % 90, scale = 0.7 + ((i * 29) % 60) / 100, delay = ((i * 0.31) % 2.6).toFixed(2);
      const px = Math.round(size * scale);
      const shape = `width:${px}px;height:${px}px;--c:${colour || 'var(--ink)'};`;
      if (kind === 'fall') out += `<i class="pt pt-fall" style="${shape}left:${across}%;animation-delay:-${delay}s">${inner}</i>`;
      else if (kind === 'rise') out += `<i class="pt pt-rise" style="${shape}left:${across}%;animation-delay:-${delay}s">${inner}</i>`;
      else if (kind === 'drift') out += `<i class="pt pt-drift" style="${shape}top:${down}%;animation-delay:-${(i * 0.7).toFixed(2)}s">${inner}</i>`;
      else if (kind === 'twinkle') out += `<i class="pt pt-twinkle" style="${shape}left:${across}%;top:${down}%;animation-delay:-${delay}s">${inner}</i>`;
      else if (kind === 'burst') {
        const angle = (i / n) * Math.PI * 2, reach = 150 + ((i * 67) % 140);
        out += `<i class="pt pt-burst" style="${shape}left:${x}%;top:${y}%;--dx:${Math.round(Math.cos(angle) * reach)}px;--dy:${Math.round(Math.sin(angle) * reach)}px;animation-delay:${(i * 0.04).toFixed(2)}s">${inner}</i>`;
      } else if (kind === 'sweep') out += `<i class="pt pt-sweep" style="width:${size}px;height:${size}px;--c:${colour || 'var(--ink)'};top:18%">${inner}</i>`;
      else if (kind === 'rings') out += `<i class="pt pt-ring" style="--c:${colour || 'var(--ink)'};left:${x}%;top:${y}%;animation-delay:${(i * 0.5).toFixed(2)}s"></i>`;
    }
    return out;
  }
  _readout(left, middle, right, leftIsIcon) {
    const { l, c, r } = this._el.ro;
    const size = (text) => `${text.length <= 2 ? 170 : text.length === 3 ? 124 : 96}px`;
    if (leftIsIcon) { l.innerHTML = left; l.style.fontSize = ''; } else { l.textContent = left; l.style.fontSize = size(left); }
    c.textContent = middle;
    c.style.fontSize = '130px';
    r.textContent = right;
    r.style.fontSize = size(right);
  }
  // Particles for a moment. Positions are spread evenly by a fixed step so they look scattered without being random.
  _setFx(kind) {
    if (kind && typeof kind === 'object') {
      clearTimeout(this._fxT);
      this._el.fx.innerHTML = this._effect(kind);
      this._el.fx.classList.add('on');
      this._el.shell.classList.add('fx-busy');
      return;
    }
    const make = (n, cls, style, inner = '') => Array.from({ length: this._fewer(n) }, (_, i) => `<i class="${cls}" style="${style(i)}">${inner}</i>`).join('');
    const spread = (i, step) => (i * step) % 100;
    const html = {
      rain: () => make(18, 'drop', (i) => `left:${spread(i, 37)}%;animation-delay:-${(i * 0.13).toFixed(2)}s`),
      storm: () => make(22, 'drop', (i) => `left:${spread(i, 37)}%;animation-delay:-${(i * 0.11).toFixed(2)}s`) + '<i class="flash"></i>',
      snow: () => make(16, 'flake', (i) => `left:${spread(i, 43)}%;animation-delay:-${(i * 0.41).toFixed(2)}s`),
      sun: () => `<i class="sun">${ICON.sun}</i>`,
      cloud: () => make(3, 'cloud', (i) => `top:${[6, 120, 40][i]}px;animation-delay:${[0, -2.5, -5][i]}s`, ICON.cloud),
      fog: () => make(3, 'mist', (i) => `top:${[70, 210, 340][i]}px;animation-delay:-${i * 2}s`),
      wind: () => make(9, 'gust', (i) => `top:${40 + spread(i, 29) * 3.6}px;animation-delay:-${(i * 0.17).toFixed(2)}s`),
      night: () => make(14, 'twinkle', (i) => `left:${spread(i, 37) || 4}%;top:${4 + spread(i, 23) * 0.8}%;animation-delay:-${(i * 0.3).toFixed(1)}s`),
      fly: () => `<i class="flyer"><b>${ICON.butterfly}</b></i>`,
      shooting: () => `<i class="shoot">${ICON.star}</i>`,
      confetti: () => make(20, 'confetti', (i) => `left:${spread(i, 37)}%;background:${['#ff5f7e', '#ffd34d', '#5fd0ff', '#7dff9a', '#c98bff'][i % 5]};animation-delay:-${(i * 0.13).toFixed(2)}s`),
      embers: () => make(16, 'ember', (i) => `left:${spread(i, 37)}%;animation-delay:-${(i * 0.13).toFixed(2)}s`),
    }[kind];
    clearTimeout(this._fxT);
    this._el.fx.innerHTML = html ? html() : '';
    this._el.fx.classList.toggle('on', !!html);
    this._el.shell.classList.toggle('fx-busy', !!html);
  }

  // ---- the words you said: read from Home Assistant's own record of the last voice run ----
  async _pipelineId() {
    // The assistant this Echo uses: its own "Assistant" choice if it has one (a Bop's voice can change it), else the preferred one.
    const select = this._bopAssistantSelect(), chosen = (select && this._state(select)?.state) || '';
    if (this._pipeline && this._pipelineFor === chosen) return this._pipeline;
    try {
      const r = await this._hass.callWS({ type: 'assist_pipeline/pipeline/list' });
      const named = chosen && chosen !== 'preferred' && (r.pipelines || []).find((p) => p.name === chosen);
      this._pipeline = (named && named.id) || r.preferred_pipeline || (r.pipelines && r.pipelines[0] && r.pipelines[0].id);
      this._pipelineFor = chosen;
    } catch (err) { this._pipeline = this._config.pipeline; }
    return this._pipeline;
  }
  async _latestRun() {
    const pipeline_id = await this._pipelineId();
    if (!pipeline_id) return null;
    const r = await this._hass.callWS({ type: 'assist_pipeline/pipeline_debug/list', pipeline_id });
    const runs = r.pipeline_runs || [];
    return runs.length ? { pipeline_id, id: runs[runs.length - 1].pipeline_run_id } : { pipeline_id, id: null };
  }
  _primeWords() {
    if (this._priming) return this._priming;
    // Note what's already in the record, so an old conversation is never shown as new.
    this._priming = this._latestRun()
      .then((run) => { this._seenRun = run ? run.id : null; })
      .catch((err) => { this._seenRun = null; this._blockWords(err); });
    return this._priming;
  }
  _blockWords(err) {
    if (err && err.code === 'unauthorized') {
      this._wordsBlocked = true;
      console.info('Echo robot: this login is not an admin, so it reacts to listening/thinking/speaking but cannot read the words.');
    }
  }
  _voiceStart() {
    clearTimeout(this._wordsT);
    clearTimeout(this._pollT);
    this._react = '';
    this._lingerUntil = 0;
    this._showWords('', '');
    this._openControls(false);
    this._stopDemo();
    this._endMoment(false);
    this._voice = { said: '', reply: '', react: '', run: null, deadline: Date.now() + VOICE_LIMIT_MS, ended: false, done: false, local: !!this._talk };
    // Talking from this screen hands over the words directly, so there's nothing to look up.
    if (this._talk) this._talkVoice(this._talk);
    else if (!this._wordsBlocked) this._poll(this._voice);
  }
  _voiceEnd() {
    const v = this._voice;
    if (!v) return;
    v.ended = true;
    v.deadline = Math.min(v.deadline, Date.now() + 3000); // an error can land just after the state returns to idle
    if (v.done) this._finishVoice(v);
    else if (this._wordsBlocked || v.local) this._voice = null;
  }
  async _poll(v) {
    if (v !== this._voice || v.done) return;
    try {
      if (this._priming) await this._priming;
      const run = await this._latestRun();
      if (run && run.id && run.id !== this._seenRun) {
        const { events } = await this._hass.callWS({ type: 'assist_pipeline/pipeline_debug/get', pipeline_id: run.pipeline_id, pipeline_run_id: run.id });
        const data = readRun(events);
        if (data.satellite && data.satellite !== this._config.satellite) {
          this._seenRun = run.id; // another speaker's conversation, not ours
        } else if (v === this._voice) {
          v.run = run.id;
          v.said = data.said;
          v.reply = data.failed && !data.reply ? 'Sorry, I didn’t catch that.' : data.reply;
          if (data.finished && (data.reply || data.failed)) {
            v.react = classify(data.said, data.type, data.code, data.failed);
            v.done = true;
            this._seenRun = run.id;
          }
          this._showVoice();
          if (v.done && v.ended) this._finishVoice(v);
        }
      }
    } catch (err) {
      this._blockWords(err);
      if (this._wordsBlocked) return;
    }
    if (v === this._voice && !v.done) {
      if (Date.now() < v.deadline) this._pollT = setTimeout(() => this._poll(v), POLL_MS);
      else if (v.ended) { this._showWords(v.said, ''); this._finishVoice(v); }
    }
  }
  // Milliseconds until the voice should be starting, if that setting is on. Nothing tells the screen exactly when it does.
  _speechLeft() {
    // From a PC, "responding" only starts once the sound really does, so there's nothing to wait for.
    if (this._talk || !this._config.speech_wait || !this._respondingAt) return 0;
    this._saidBefore = this._saidBefore || new Set();
    const seconds = speechWaitSeconds(this._voice && this._voice.reply, this._saidBefore) + (Number(this._config.speech_wait_adjust) || 0);
    return Math.max(0, this._respondingAt + seconds * 1000 - Date.now());
  }
  _holdForSpeech() {
    clearTimeout(this._speechT);
    const left = this._speechLeft();
    if (left > 0) this._speechT = setTimeout(() => { this._showVoice(); this._apply(); }, left + 20);
  }
  _showVoice() {
    this._holdForSpeech();
    const v = this._voice;
    if (!v) return;
    // Hold the reply back until the robot starts saying it, so words and voice line up.
    const now = this._talk ? this._talk.core : this._state(this._config.satellite)?.state;
    const speaking = (now === 'responding' && this._speechLeft() === 0) || v.ended;
    if (speaking && v.reply && v.reply.length <= SPEECH_REMEMBERED_CHARS) this._rememberSaid = v.reply;
    this._showWords(v.said, speaking ? v.reply : '');
    if (speaking && v.react && this._react !== v.react) { this._react = v.react; this._lingerUntil = Date.now() + VOICE_LIMIT_MS; this._apply(); }
  }
  _finishVoice(v) {
    if (v !== this._voice) return;
    this._showVoice();
    this._voice = null;
    if (this._rememberSaid) {
      this._saidBefore = this._saidBefore || new Set();
      this._saidBefore.add(this._rememberSaid.trim());
      if (this._saidBefore.size > 100) this._saidBefore.clear();
      this._rememberSaid = '';
    }
    this._react = v.react;
    this._lingerUntil = v.react ? Date.now() + LINGER_MS : 0;
    clearTimeout(this._lingerT);
    this._lingerT = setTimeout(() => { this._react = ''; this._apply(); }, LINGER_MS + 50);
    clearTimeout(this._wordsT);
    this._wordsT = setTimeout(() => this._showWords('', ''), WORDS_AFTER_MS);
    this._apply();
  }
  _showWords(said, reply) {
    this._setText(this._el.said, said ? `“${said}”` : '');
    this._setText(this._el.reply, reply || '');
    this._el.reply.classList.toggle('long', (reply || '').length > 90);
    this._el.shell.classList.toggle('has-words', !!(said || reply));
  }

  // ---- timers and reminders, from the echo_robot add-on ----
  _watchAlerts() {
    const conn = this._hass && this._hass.connection;
    if (this._config.alerts === false || this._alertSub || this._alertsMissing || !conn || typeof conn.subscribeMessage !== 'function') return;
    this._alertSub = conn.subscribeMessage((d) => this._gotAlerts(d), { type: 'echo_robot/subscribe' }).catch((err) => {
      this._alertSub = null;
      this._alertsMissing = true;
      if (err && err.code === 'unknown_command') {
        console.info('Echo robot: the echo_robot add-on isn’t installed, so timers and reminders won’t show.');
      } else {
        clearTimeout(this._alertRetryT);
        this._alertRetryT = setTimeout(() => { this._alertsMissing = false; this._watchAlerts(); }, 30000);
      }
      return null;
    });
  }
  _stopAlerts() {
    const sub = this._alertSub;
    this._alertSub = null;
    this._alertsMissing = false;
    clearTimeout(this._alertRetryT);
    if (sub) sub.then((unsub) => { if (typeof unsub === 'function') unsub(); }).catch(() => {});
    this._alertData = null;
    this._alertsSeen = false;
    if (this._alerts) for (const key of [...this._alerts.keys()]) this._dropAlert(key, true);
    this._layoutAlerts();
  }
  _serverNow() { return Date.now() + (this._alertSkew || 0); }
  _gotAlerts(d) {
    if (!d || !Array.isArray(d.timers) || this._config.alerts === false) return;
    // Times come from the server's clock, so a screen whose own clock is off still counts down right.
    this._alertSkew = typeof d.now === 'number' ? d.now - Date.now() : 0;
    const first = !this._alertsSeen;
    this._alertsSeen = true;
    this._alertData = d;
    this._syncAlerts(first);
  }
  _syncAlerts(first) {
    const d = this._alertData;
    if (!d || !this._built) return;
    const now = this._serverNow(), want = new Map();
    // A timer that finished before this page opened has already been dealt with.
    if (first) for (const x of d.done || []) this._dismissed.add(`d:${x.id}`);
    for (const t of d.timers || []) want.set(`t:${t.id}`, ['timer', t]);
    for (const x of d.done || []) if (now - x.at < ALERT_DONE_MS && !this._dismissed.has(`d:${x.id}`)) want.set(`d:${x.id}`, ['done', x]);
    for (const r of d.reminders || []) want.set(`r:${r.id}`, ['reminder', r]);
    for (const key of [...this._alerts.keys()]) if (!want.has(key)) this._dropAlert(key);
    for (const [key, [kind, data]] of want) {
      let a = this._alerts.get(key);
      if (!a) {
        // Ones already running when the screen starts go straight to the corner, without popping up.
        a = { key, kind, el: this._alertEl(key), popUntil: first ? 0 : Date.now() + ALERT_POP_MS, openUntil: 0, born: Date.now() };
        this._alerts.set(key, a);
      } else if (kind === 'reminder' && a.data.status !== data.status) {
        // Snoozed: say when it's coming back. Gone off or missed: whatever it was showing before no longer applies.
        a.popUntil = data.status === 'pending' ? Date.now() + ALERT_POP_MS : 0;
        a.openUntil = 0;
      }
      a.data = data;
    }
    this._layoutAlerts();
  }
  _alertEl(key) {
    const el = document.createElement('div');
    el.className = 'al';
    el.setAttribute('role', 'button');
    el.innerHTML = '<span class="al-row"><span class="al-ic"></span><span class="al-main"><span class="al-title"></span><span class="al-sub"></span></span><span class="al-time"></span></span><span class="al-btns"></span>';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = this._alerts.get(key);
      const button = e.target.closest && e.target.closest('[data-act]');
      if (a) button ? this._alertAction(a, button.dataset.act) : this._alertTap(a);
    });
    this._el.alerts.appendChild(el);
    return el;
  }
  _alertMode(a, now, local) {
    const d = a.data;
    if (a.kind === 'done' || (a.kind === 'reminder' && d.status === 'ringing')) return 'ring';
    if (a.openUntil > local) return 'open';
    if (a.popUntil > local) return 'pop';
    if (a.kind === 'reminder' && d.status === 'pending' && d.due - now > (d.kind === 'alarm' ? ALARM_SOON_MS : ALERT_SOON_MS)) return 'hidden';
    return 'dock';
  }
  _ringAlert() {
    if (!this._alerts) return null;
    for (const a of this._alerts.values()) if (a.mode === 'ring') return a;
    return null;
  }
  // What each one says: more in the middle of the screen, just the essentials in the corner.
  _fillAlert(a, mode, now) {
    const d = a.data, centre = mode !== 'dock';
    let icon = 'timer', title = '', sub = '', time = '', buttons = [];
    if (a.kind === 'timer') {
      time = clockLeft(d.paused || !d.ends ? d.left * 1000 : d.ends - now);
      title = centre ? timerLabel(d) : shortLabel(capFirst(d.name || d.command || ''), 12);
      sub = d.paused ? 'Paused' : '';
      if (mode === 'open') buttons = [['cancel', 'Cancel timer', true], ['close', 'Keep']];
    } else if (a.kind === 'done') {
      title = 'Time’s up';
      sub = timerLabel(d);
      buttons = [['stop', 'Stop', true]];
    } else if (d.kind === 'alarm') {
      icon = 'sun';
      const at = new Date(d.due).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      if (d.status === 'ringing') {
        title = 'Good morning';
        sub = `Alarm · ${at}`;
        buttons = [['done', 'I’m up', true], ['snooze', `Snooze ${ALARM_SNOOZE_MIN} min`]];
      } else if (d.status === 'missed') {
        title = centre ? 'Missed alarm' : 'Alarm';
        if (centre) sub = at; else time = 'Missed';
        if (mode === 'open') buttons = [['done', 'Done', true]];
      } else {
        // dueWords says "Tomorrow 07:00" a while off, but "in 12 min" when close, so add the clock time then.
        const soon = d.due - now < ALERT_SOON_MS, when = dueWords(d.due, now);
        title = mode === 'pop' ? 'Alarm set' : 'Alarm';
        if (centre) sub = soon ? `${when} · ${at}` : when; else time = soon ? at : when;
        if (mode === 'open') buttons = [['cancel', 'Cancel alarm', true], ['close', 'Keep']];
      }
    } else {
      icon = 'bell';
      const text = capFirst(d.text) || 'Reminder';
      title = centre ? text : shortLabel(text, 12);
      if (d.status === 'ringing') {
        sub = 'Reminder';
        buttons = [['done', 'Done', true], ['snooze', `Snooze ${ALERT_SNOOZE_MIN} min`]];
      } else if (d.status === 'missed') {
        if (centre) sub = 'Missed reminder'; else time = 'Missed';
        if (mode === 'open') buttons = [['done', 'Done', true], ['snooze', `Snooze ${ALERT_SNOOZE_MIN} min`]];
      } else {
        const when = dueWords(d.due, now);
        if (centre) sub = mode === 'pop' ? `Reminder set · ${when}` : when; else time = when.replace(/^in /, '');
        if (mode === 'open') buttons = [['cancel', 'Cancel reminder', true], ['close', 'Keep']];
      }
    }
    const el = a.el, [row, btns] = el.children, [ic, main, timeEl] = row.children;
    if (ic.dataset.icon !== icon) { ic.dataset.icon = icon; ic.innerHTML = ICON[icon]; }
    this._setText(main.children[0], title);
    this._setText(main.children[1], sub);
    this._setText(timeEl, time);
    const buttonKey = JSON.stringify(buttons);
    if (btns.dataset.key !== buttonKey) {
      btns.dataset.key = buttonKey;
      btns.innerHTML = buttons.map(([act, label, main]) => `<button class="al-b${main ? ' main' : ''}" data-act="${act}">${label}</button>`).join('');
    }
    el.classList.toggle('centre', centre);
    el.classList.toggle('ring', mode === 'ring');
    el.classList.toggle('paused', a.kind === 'timer' && !!d.paused);
    el.classList.toggle('missed', a.kind === 'reminder' && d.status === 'missed' && !centre);
    el.setAttribute('aria-label', [title, sub, time].filter(Boolean).join(', '));
  }
  _layoutAlerts(force) {
    if (!this._built || !this._alerts) return;
    const now = this._serverNow(), local = Date.now(), shell = this._el.shell;
    const W = this._sw || shell.clientWidth || 960;
    const order = { ring: 0, open: 1, pop: 2, dock: 3, hidden: 4 };
    const items = [];
    for (const a of [...this._alerts.values()]) {
      if (a.kind === 'done') {
        // A finished timer shows until the Echo stops ringing, or for a minute if it never rang here.
        if (this._ringing) a.sawRinging = true;
        if ((a.sawRinging && !this._ringing) || now - a.data.at >= ALERT_DONE_MS) {
          this._dismissed.add(a.key);
          this._dropAlert(a.key);
          continue;
        }
      }
      items.push([a, this._alertMode(a, now, local)]);
    }
    items.sort((x, y) => order[x[1]] - order[y[1]] || x[0].born - y[0].born);
    let centreTaken = false, docked = 0, ringKey = '';
    for (let [a, mode] of items) {
      // One at a time in the middle; the rest wait in the corner.
      if (mode === 'ring' || mode === 'open' || mode === 'pop') {
        if (centreTaken) mode = 'dock';
        centreTaken = true;
      }
      if (mode === 'ring' && a.mode !== 'ring') a.ringAt = local;
      if (mode === 'ring') ringKey = a.key;
      this._fillAlert(a, mode, now);
      if (mode === 'hidden') {
        a.el.classList.remove('in');
        a.mode = mode;
        a.place = null;
        continue;
      }
      const w = a.el.offsetWidth, h = a.el.offsetHeight;
      const x = mode === 'dock' ? Math.round(W - DOCK_RIGHT - w) : Math.round((W - w) / 2);
      const y = mode === 'dock' ? DOCK_TOP + docked++ * (44 + DOCK_GAP) : POP_TOP;
      this._placeAlert(a, mode, x, y, w, h, force);
    }
    // Move on exactly when a pop-up's time is up, rather than at the next tick.
    const next = Math.min(...items.map(([a]) => [a.popUntil, a.openUntil].filter((t) => t > local)).flat(), Infinity);
    clearTimeout(this._alertT);
    if (next < Infinity) this._alertT = setTimeout(() => this._layoutAlerts(), next - local + 20);
    shell.classList.toggle('has-dock', docked > 0);
    shell.classList.toggle('has-pop', centreTaken);
    shell.style.setProperty('--dock-h', `${docked * (44 + DOCK_GAP)}px`);
    if (ringKey !== (this._ringKey || '')) {
      this._ringKey = ringKey;
      if (ringKey) { this._endMoment(false); this._openControls(false); }
      this._apply();
    }
    const ring = ringKey && this._alerts.get(ringKey);
    if (ring && this._config.chime && local - ring.ringAt < ALERT_DONE_MS && local - (this._chimedAt || 0) >= CHIME_EVERY_MS) {
      this._chimedAt = local;
      this._chime();
    }
  }
  // Moves smoothly between the middle and the corner. Only position and size are animated, which the
  // Echo's graphics chip does by itself: the pill is drawn at its new size, then shrunk or grown from the old one.
  _placeAlert(a, mode, x, y, w, h, force) {
    const el = a.el, key = `${mode}|${x}|${y}|${w}|${h}`;
    const changed = a.mode !== mode;
    a.mode = mode;
    if (a.place === key && !force) return;
    const target = `translate(${x}px,${y}px)`;
    if (!a.place || !a.box) {
      el.style.transition = 'none';
      el.style.transform = `translate(${x}px,${y - 24}px)`;
      void el.offsetWidth;
      el.style.transition = '';
    } else if (changed && !force) {
      const s = a.box.h / h, tx = a.box.x + a.box.w / 2 - (w * s) / 2, ty = a.box.y + a.box.h / 2 - (h * s) / 2;
      el.style.transition = 'none';
      el.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(3)})`;
      void el.offsetWidth;
      el.style.transition = '';
    }
    el.classList.add('in');
    el.style.transform = target;
    a.place = key;
    a.box = { x, y, w, h };
  }
  _dropAlert(key, now) {
    const a = this._alerts && this._alerts.get(key);
    if (!a) return;
    this._alerts.delete(key);
    const el = a.el;
    if (now || !a.place) { el.remove(); return; }
    el.classList.add('gone');
    setTimeout(() => el.remove(), ALERT_GONE_MS);
  }
  _alertTap(a) {
    if (a.mode === 'ring') { this._alertAction(a, a.kind === 'reminder' ? 'done' : 'stop'); return; }
    if (a.mode === 'dock') { a.openUntil = Date.now() + ALERT_OPEN_MS; a.popUntil = 0; } else { a.openUntil = 0; a.popUntil = 0; }
    this._layoutAlerts();
  }
  async _alertAction(a, act) {
    if (act === 'close') { a.openUntil = 0; a.popUntil = 0; this._layoutAlerts(); return; }
    if (act === 'stop') {
      if (this._ringing) this._press(this._config.stop_ringing);
      this._dismissed.add(a.key);
      this._dropAlert(a.key);
      this._layoutAlerts();
      return;
    }
    const id = a.data.id;
    const call = act === 'cancel' && a.kind === 'timer' ? { type: 'echo_robot/timer_cancel', timer_id: id }
      : act === 'snooze' ? { type: 'echo_robot/reminder_snooze', reminder_id: id, minutes: a.data.kind === 'alarm' ? ALARM_SNOOZE_MIN : ALERT_SNOOZE_MIN }
        : { type: 'echo_robot/reminder_done', reminder_id: id };
    a.openUntil = 0;
    try {
      await this._hass.callWS(call);
    } catch (err) {
      this._toast(err && err.message ? `Couldn’t do that: ${String(err.message).slice(0, 60)}` : 'Couldn’t reach Home Assistant');
    }
  }
  // Two soft notes, made here rather than loaded, so nothing is fetched.
  _chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = this._chimeCtx = this._chimeCtx || new Ctx();
      const t0 = ctx.currentTime;
      [[880, 0], [1175, 0.18]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t0 + delay);
        gain.gain.linearRampToValueAtTime(0.22, t0 + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + delay + 0.7);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + delay);
        osc.stop(t0 + delay + 0.75);
      });
    } catch (err) { /* no sound on this screen */ }
  }

  // ---- talking from this screen (a PC): its microphone goes to Home Assistant's own speech recognition ----
  _talkKey(e) {
    if (!this._config.talk || e.code !== 'Space' || e.ctrlKey || e.altKey || e.metaKey) return;
    const target = e.composedPath ? e.composedPath()[0] : e.target;
    if (target && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) || target.isContentEditable)) return;
    if (!this.getClientRects().length) return; // this dashboard isn't the one showing
    e.preventDefault();
    if (e.type === 'keydown') { if (!e.repeat) this._talkPress(); } else this._talkRelease();
  }
  _talkPress() {
    const t = this._talk;
    if (t) {
      // Pressing again stops listening, or stops it talking.
      if (t.core === 'listening') this._talkEndAudio(t); else this._talkFinish(t);
      this._talkPressedAt = 0;
      return;
    }
    this._talkPressedAt = Date.now();
    this._talkStart();
  }
  _talkRelease() {
    // Holding it down means "until I let go"; a quick press listens until you stop talking.
    const t = this._talk;
    if (t && this._talkPressedAt && Date.now() - this._talkPressedAt >= TALK_HOLD_MS && t.core === 'listening') this._talkEndAudio(t);
    this._talkPressedAt = 0;
  }
  async _talkStart() {
    if (!this._config.talk || !this._hass || !this._hass.connection) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._toast('The microphone needs a secure (https) connection');
      return;
    }
    this._openControls(false);
    this._stopDemo();
    const wasActive = ['listening', 'processing', 'responding'].includes(this._core);
    const t = { core: 'listening', handler: null, queue: [], said: '', reply: '', react: '', done: false };
    this._talk = t;
    this._el.shell.classList.add('talking');
    if (wasActive) this._voiceStart();
    this._update();
    t.limitT = setTimeout(() => this._talkEndAudio(t), TALK_LISTEN_MS);
    t.startT = setTimeout(() => { if (t.handler == null) this._talkFail(t, 'Couldn’t reach Home Assistant'); }, TALK_START_MS);
    try {
      t.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (this._talk !== t) { this._talkStopMic(t); return; }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      t.ctx = new Ctx();
      if (t.ctx.state === 'suspended') await t.ctx.resume().catch(() => {}); // started by a key in another program
      if (!this._micUrl) this._micUrl = URL.createObjectURL(new Blob([MIC_WORKLET], { type: 'application/javascript' }));
      await t.ctx.audioWorklet.addModule(this._micUrl);
      if (this._talk !== t || !t.ctx) { this._talkStopMic(t); return; }
      t.node = new AudioWorkletNode(t.ctx, 'echo-robot-mic');
      t.node.port.onmessage = (e) => this._talkAudio(t, e.data);
      t.ctx.createMediaStreamSource(t.stream).connect(t.node);
      t.node.connect(t.ctx.destination); // keeps it running; it only ever outputs silence
    } catch (err) {
      this._talkFail(t, err && err.name === 'NotAllowedError' ? 'The microphone was blocked. Allow it in the address bar.' : 'Couldn’t open the microphone');
      return;
    }
    try {
      const pipeline = this._config.pipeline || await this._pipelineId(); // the same assistant as the Echo
      const entity = this._hass.entities && this._hass.entities[this._config.satellite];
      const device = this._config.talk_device || (entity && entity.device_id) || null;
      const msg = { type: 'assist_pipeline/run', start_stage: 'stt', end_stage: 'tts', input: { sample_rate: 16000 }, timeout: 60 };
      if (pipeline) msg.pipeline = pipeline;
      if (device) msg.device_id = device; // so "set a timer" rings on the Echo, and shows here too
      if (this._talkConv && Date.now() - this._talkConvAt < TALK_CONVERSATION_MS) msg.conversation_id = this._talkConv;
      t.unsub = await this._hass.connection.subscribeMessage((ev) => this._talkEvent(t, ev), msg, { resubscribe: false });
      if (this._talk !== t) this._talkUnsub(t);
    } catch (err) {
      this._talkFail(t, err && err.message ? `Couldn’t start: ${String(err.message).slice(0, 60)}` : 'Couldn’t reach Home Assistant');
    }
  }
  _talkAudio(t, buffer) {
    if (this._talk !== t || t.micDone) return;
    if (t.handler == null) { if (t.queue.length < 200) t.queue.push(buffer); return; }
    this._talkSend(t, new Uint8Array(buffer));
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
    this._talkCore(t, 'processing');
  }
  _talkStopMic(t) {
    t.micDone = true;
    clearTimeout(t.limitT);
    if (t.stream) t.stream.getTracks().forEach((track) => track.stop());
    if (t.ctx) t.ctx.close().catch(() => {});
    t.stream = null;
    t.ctx = null;
  }
  // Event names and shapes from homeassistant/components/assist_pipeline (default_pipeline.py and run.py).
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
      this._talkCore(t, 'processing');
    } else if (ev.type === 'intent-progress') {
      // A long reply from the chat assistant starts speaking before it's finished writing.
      if (d.tts_start_streaming && t.ttsUrl) this._talkPlay(t, t.ttsUrl);
    } else if (ev.type === 'intent-end') {
      const out = d.intent_output || {}, r = out.response || {};
      t.reply = (r.speech && r.speech.plain && r.speech.plain.speech) || '';
      t.react = classify(t.said, r.response_type || '', (r.data && r.data.code) || '', false);
      t.done = true;
      if (out.conversation_id) { this._talkConv = out.conversation_id; this._talkConvAt = Date.now(); }
    } else if (ev.type === 'tts-end') {
      this._talkPlay(t, (d.tts_output && d.tts_output.url) || t.ttsUrl);
    } else if (ev.type === 'error') {
      this._talkFail(t, null, /no-text|no_text|stt-stream|stt-no/.test(d.code || '') ? 'Sorry, I didn’t catch that.' : 'Sorry, something went wrong.');
      return;
    } else if (ev.type === 'run-end') {
      if (!t.audio) this._talkFinish(t);
    }
    this._talkVoice(t);
  }
  _talkPlay(t, url) {
    if (t.audio || !url || this._talk !== t) return;
    const src = url.startsWith('/') && this._hass.hassUrl ? this._hass.hassUrl(url) : url;
    const audio = t.audio = new Audio(src);
    audio.addEventListener('playing', () => this._talkCore(t, 'responding'));
    audio.addEventListener('ended', () => this._talkFinish(t));
    audio.addEventListener('error', () => this._talkFinish(t));
    const playing = audio.play();
    if (playing && playing.catch) playing.catch(() => this._talkFinish(t));
  }
  _talkCore(t, core) {
    if (this._talk !== t || t.core === core) return;
    t.core = core;
    this._update();
  }
  _talkVoice(t) {
    const v = this._voice;
    if (!v || !v.local || this._talk !== t) return;
    Object.assign(v, { said: t.said, reply: t.reply, react: t.react, done: t.done });
    this._showVoice();
  }
  _talkFail(t, toastText, reply) {
    if (this._talk !== t) return;
    if (toastText) this._toast(toastText);
    Object.assign(t, { reply: reply || '', react: 'confused', done: true });
    this._talkStopMic(t);
    this._talkUnsub(t);
    if (!reply) { this._talkFinish(t); return; }
    this._talkCore(t, 'responding');
    this._talkVoice(t);
    clearTimeout(t.failT);
    t.failT = setTimeout(() => this._talkFinish(t), TALK_FAIL_SHOW_MS);
  }
  _talkUnsub(t) {
    const unsub = t.unsub;
    t.unsub = null;
    if (typeof unsub !== 'function') return;
    try {
      const p = unsub();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* it had already finished */ }
  }
  _talkFinish(t) {
    if (this._talk !== t) return;
    clearTimeout(t.startT);
    clearTimeout(t.failT);
    this._talkStopMic(t);
    if (t.audio && !t.audio.ended) t.audio.pause();
    this._talkUnsub(t);
    this._talkVoice(t);
    this._talk = null;
    this._el.shell.classList.remove('talking');
    this._update();
  }

  // ---- hold the robot to see every reaction, without talking to it ----
  _startDemo() {
    let i = 0;
    const step = () => {
      if (i >= DEMO.length) { this._stopDemo(); return; }
      const name = DEMO[i++];
      this._endMoment(false);
      this._demo = MOMENTS[name] ? 'idle' : name;
      if (MOMENTS[name]) this._playMoment(name); else this._apply();
      this._demoT = setTimeout(step, MOMENTS[name] ? MOMENTS[name].ms + 400 : 2800);
    };
    this._openControls(false);
    clearTimeout(this._demoT);
    step();
  }
  _stopDemo() {
    clearTimeout(this._demoT);
    if (this._demo) { this._demo = null; this._endMoment(false); this._apply(); }
  }

  // ---- controls ----
  _openControls(open) {
    if (!this._built) return;
    clearTimeout(this._controlsT);
    if (open) this._endMoment(true);
    this._el.shell.classList.toggle('open', open);
    this._el.controls.setAttribute('aria-hidden', String(!open));
    if (!open && this._el.shell.classList.contains('settings-open')) this._openSettings(false);
    if (!open && this._el.shell.classList.contains('heat-open')) this._openHeat(null);
    if (!open && this._el.shell.classList.contains('cust-open')) this._openCust(false);
    if (!open && this._el.shell.classList.contains('light-open')) this._openLight(null);
    if (!open && this._el.shell.classList.contains('vac-open')) this._openVac(null);
    if (!open && this._el.shell.classList.contains('bopm-open')) this._openMaker(null);
    if (!open && this._el.shell.classList.contains('bops-open')) this._openBops(false);
    const page = ['settings-open', 'heat-open', 'cust-open', 'light-open', 'vac-open', 'bops-open', 'bopm-open'].some((c) => this._el.shell.classList.contains(c));
    if (open) this._controlsT = setTimeout(() => this._openControls(false), page ? SETTINGS_MS : CONTROLS_MS);
  }

  // ---- settings: saved on this screen, so losing them does no harm ----
  _choices() {
    if (this._saved === undefined) {
      try { this._saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (err) { this._saved = {}; }
      if (typeof this._saved !== 'object' || Array.isArray(this._saved)) this._saved = {};
    }
    const out = {};
    for (const [key] of SETTING_SWITCHES) if (typeof this._saved[key] === 'boolean') out[key] = this._saved[key];
    if (['face', 'buddy'].includes(this._saved.robot)) out.robot = this._saved.robot;
    if (MENU_LAYOUTS.includes(this._saved.menu_layout)) out.menu_layout = this._saved.menu_layout;
    if (/^#[0-9a-f]{6}$/i.test(this._saved.light_colour || '')) out.light_colour = this._saved.light_colour;
    if (['big', 'compact'].includes(this._saved.menu_size)) out.menu_size = this._saved.menu_size;
    // Which light sensor is in this screen's room ('' = none): each screen keeps its own.
    if (typeof this._saved.dark_sensor === 'string') out.dark_sensor = this._saved.dark_sensor || null;
    if (typeof this._saved.bop === 'string' && /^[a-z0-9_-]{1,40}$/.test(this._saved.bop)) out.bop = this._saved.bop; // this screen's Bop
    if (Array.isArray(this._saved.menu_order)) out.menu_order = this._saved.menu_order.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, show: x.show !== false }));
    return out;
  }
  _saveChoice(key, value) {
    this._choices();
    this._saved[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._saved)); } catch (err) { /* keeps working for this session */ }
  }
  _wireSettings(q) {
    q('.gearbtn').addEventListener('click', () => this._openSettings(true));
    q('.set-back').addEventListener('click', () => this._openSettings(false));
    this.shadowRoot.querySelectorAll('.set-t').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.setting;
      this._changeSetting(key, this._config[key] === false);
    }));
    this.shadowRoot.querySelectorAll('.set-pick').forEach((b) => b.addEventListener('click', () => this._changeSetting('robot', b.dataset.robot)));
    const roomLight = this.shadowRoot.querySelector('[data-choice=dark_sensor]');
    roomLight.addEventListener('change', () => this._changeSetting('dark_sensor', roomLight.value));
    roomLight.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.shadowRoot.querySelectorAll('.set-range').forEach((slider) => {
      slider.addEventListener('input', () => this._slideBrightness(slider));
      slider.addEventListener('pointerdown', (e) => e.stopPropagation());
      slider.addEventListener('pointerdown', () => this._openControls(true));
    });
    if (!this._kiosk()) q('.set-note').textContent = 'This screen can only darken the picture, not turn down its backlight.';
  }
  _openSettings(open) {
    this._el.shell.classList.toggle('settings-open', open);
    this.shadowRoot.querySelector('.settings').setAttribute('aria-hidden', String(!open));
    if (open) {
      this.shadowRoot.querySelector('.set-body').scrollTop = 0;
      this._renderSettings();
      this._readBrightness();
      this._openControls(true);
    } else {
      this._applyBrightness();
      if (this._el.shell.classList.contains('open')) this._openControls(true);
    }
  }
  _changeSetting(key, value) {
    this._saveChoice(key, value);
    this._config[key] = value;
    if (key === 'robot') {
      this._el.shell.dataset.robot = value;
      this._h = 0; // its size depends on which robot it is
    }
    if (key === 'night_mode') this._wasNight = undefined; // switching it off isn't the same as morning arriving
    if (key === 'dark_sensor') {
      this._config.dark_sensor = value || null;
      this._dark = undefined; // a new sensor decides straight away
      this._roomLightKey = null;
    }
    if (key === 'moments' || key === 'info_cards') this._scheduleMoment();
    if (key === 'alerts' && !value) this._stopAlerts(); // turning it back on subscribes again on the next update
    if (key === 'lyrics' && !value) {
      this._setLyricLines([]);
      this._lyricKey = null; // so they're fetched again if lyrics are turned back on
    }
    this._renderSettings();
    this._tick();
    this._update();
  }
  _renderSettings() {
    this.shadowRoot.querySelectorAll('.set-t').forEach((b) => b.setAttribute('aria-pressed', String(this._config[b.dataset.setting] !== false)));
    this._renderRoomLight();
    this.shadowRoot.querySelectorAll('.set-pick').forEach((b) => b.setAttribute('aria-pressed', String(this._config.robot === b.dataset.robot)));
    this._showBrightness();
  }
  // The room light choice lists Home Assistant's light-level sensors (lux), and "None" to go by the night times.
  _renderRoomLight() {
    const select = this.shadowRoot.querySelector('[data-choice=dark_sensor]');
    if (!select || !this._hass) return;
    const states = this._hass.states, chosen = this._config.dark_sensor || '';
    const ids = Object.keys(states).filter((id) => id.startsWith('sensor.') && (states[id].attributes.device_class === 'illuminance' || states[id].attributes.unit_of_measurement === 'lx'));
    if (chosen && !ids.includes(chosen)) ids.push(chosen);
    const options = [['', 'None (night times)'], ...ids.sort().map((id) => [id, String(states[id]?.attributes.friendly_name || id).replace(/ illuminance$/i, '')])];
    const key = options.map((o) => o.join('=')).join('|') + `#${chosen}`;
    if (key === this._roomLightKey) return;
    this._roomLightKey = key;
    select.replaceChildren(...options.map(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === chosen;
      return option;
    }));
  }
  // ---- brightness: the real backlight in Kiosk Satellite, otherwise a dark layer over the picture ----
  _kiosk() {
    const kiosk = window.kioskSatellite;
    return kiosk && typeof kiosk.setBrightness === 'function' ? kiosk : null;
  }
  _brightValue(key) {
    this._choices();
    const value = Number(this._saved[key]);
    return Number.isFinite(value) && this._saved[key] !== null && this._saved[key] !== undefined ? Math.max(BRIGHT_MIN, Math.min(1, value)) : null;
  }
  async _readBrightness() {
    const kiosk = this._kiosk();
    if (!kiosk || typeof kiosk.getBrightness !== 'function') { this._showBrightness(); return; }
    try {
      const level = Number(await kiosk.getBrightness());
      // The app's own value is the truth for daytime, unless the night level is what's showing now.
      if (Number.isFinite(level) && !this._brightNight && !this._brightSliding) this._screenLevel = Math.max(BRIGHT_MIN, Math.min(1, level));
    } catch (err) { /* the slider just shows the saved value */ }
    this._showBrightness();
  }
  _showBrightness() {
    const day = this._brightValue('brightness') ?? this._screenLevel ?? 1;
    const dayNow = this._brightNight ? day : (this._screenLevel ?? day);
    const night = this._brightValue('night_brightness');
    this.shadowRoot.querySelectorAll('.set-range').forEach((slider) => {
      const isNight = slider.dataset.bright === 'night_brightness';
      const value = isNight ? (night ?? dayNow) : dayNow;
      if (!(this._brightSliding === slider)) slider.value = String(Math.round(value * 100));
      slider.parentElement.querySelector('.set-val').textContent = isNight && night === null ? 'Same' : `${Math.round((this._brightSliding === slider ? Number(slider.value) / 100 : value) * 100)}%`;
    });
  }
  _slideBrightness(slider) {
    const key = slider.dataset.bright, value = Math.max(BRIGHT_MIN, Math.min(1, Number(slider.value) / 100));
    this._brightSliding = slider;
    // Previewing the night level needs a daytime level to come back to.
    if (key === 'night_brightness' && this._brightValue('brightness') === null) this._saveChoice('brightness', this._screenLevel ?? 1);
    this._saveChoice(key, value);
    if (key === 'brightness' && !this._brightNight) this._screenLevel = value;
    this._showBrightness();
    this._setScreen(value); // shows you the level you're choosing, even the night one during the day
    clearTimeout(this._brightT);
    this._brightT = setTimeout(() => { this._brightSliding = null; this._applyBrightness(); this._showBrightness(); }, BRIGHT_RESTORE_MS);
  }
  // Sent at most every so often while sliding, always ending on the latest value, as a slow chip can't keep up with every step.
  _setScreen(level) {
    this._screenWanted = level;
    if (this._screenBusy) return;
    this._screenBusy = true;
    const send = async () => {
      const value = this._screenWanted;
      await this._sendScreen(value);
      setTimeout(() => {
        if (this._screenWanted !== value) send();
        else this._screenBusy = false;
      }, BRIGHT_SEND_MS);
    };
    send();
  }
  async _sendScreen(level) {
    const kiosk = this._kiosk();
    if (!kiosk) {
      this._el.dimmer.style.opacity = String((1 - level) * 0.9);
      return;
    }
    try {
      if ((await kiosk.setBrightness(level)) === false) this._toast('Couldn’t change the brightness');
    } catch (err) {
      this._toast('Couldn’t change the brightness');
    }
  }
  _applyBrightness(starting) {
    clearTimeout(this._brightT);
    this._brightSliding = null;
    const night = this._brightValue('night_brightness'), day = this._brightValue('brightness');
    const level = this._el.shell.classList.contains('night') && night !== null ? night : day;
    if (level === null) return;
    // On Kiosk Satellite the app already holds the daytime level, so opening the page doesn't need to change it.
    if (starting && this._kiosk() && level === day) return;
    this._setScreen(level);
  }
  async _nightChanged(night) {
    const nightLevel = this._brightValue('night_brightness');
    if (nightLevel === null) return;
    if (night && this._brightValue('brightness') === null && this._kiosk() && typeof this._kiosk().getBrightness === 'function') {
      // Remember the daytime level before turning it down, so morning can put it back.
      try {
        const level = Number(await this._kiosk().getBrightness());
        if (Number.isFinite(level)) this._saveChoice('brightness', Math.max(BRIGHT_MIN, Math.min(1, level)));
      } catch (err) { /* morning leaves it at the night level, and the slider can fix it */ }
    }
    this._applyBrightness();
  }
  async _service(domain, service, entity, extra = {}) {
    if (!this._hass || !this._usable(entity)) { this._toast('That’s unavailable right now'); return; }
    try { await this._hass.callService(domain, service, { entity_id: entity, ...extra }); }
    catch (err) {
      // Say what Home Assistant said: it's usually the real reason.
      const why = String((err && err.message) || '').trim().slice(0, 80);
      this._toast(why ? `Couldn’t do that: ${why}` : 'Couldn’t reach that. Try again?');
      console.warn('Echo robot: service failed', domain, service, why);
    }
  }
  // A button's state is the time it was last pressed, or "unknown" if never: only "unavailable" means it can't be used.
  _press(entity) {
    const s = this._state(entity);
    if (s && s.state !== 'unavailable') this._hass.callService('button', 'press', { entity_id: entity }).catch(() => {});
  }
  _toast(text) {
    this._setText(this._el.toast, text);
    this._el.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this._el.toast.classList.remove('show'), 3000);
  }
  _updateControls() {
    this._renderMenu();
    if (this._el.shell.classList.contains('heat-open')) this._renderHeat();
    if (this._el.shell.classList.contains('light-open')) this._renderLight();
    if (this._el.shell.classList.contains('vac-open')) this._renderVac();
    this._el.mic.setAttribute('aria-pressed', String(this._muted));
    const micKey = String(this._muted);
    if (micKey !== this._micKey) { this._micKey = micKey; this._el.mic.firstElementChild.innerHTML = this._muted ? ICON.micoff : ICON.mic; }
    this._el.mic.disabled = !this._state(this._config.mute);
    const controlled = this._controlledId();
    const p = this._state(controlled), ok = this._usable(controlled), playing = p?.state === 'playing';
    const features = Number(p?.attributes.supported_features || 0);
    this.shadowRoot.querySelectorAll('[data-media]').forEach((b) => b.classList.toggle('off', !ok || !(features & MEDIA_NEEDS[b.dataset.media])));
    const playKey = String(playing);
    if (playKey !== this._playKey) { this._playKey = playKey; this._el.playBtn.firstElementChild.innerHTML = playing ? ICON.pause : ICON.play; }
  }
  // ---- Customise menu: a page in Settings. Choices are saved on this screen, like the other settings ----
  _wireCust(q) {
    this._el.cust = q('.cust');
    q('.cust-open').addEventListener('click', () => this._openCust(true));
    q('.cust-back').addEventListener('click', () => this._openCust(false));
    this.shadowRoot.querySelectorAll('.cust-layout').forEach((b) => b.addEventListener('click', () => this._changeMenu('menu_layout', b.dataset.layout)));
    this.shadowRoot.querySelectorAll('.cust-swatch').forEach((b) => b.addEventListener('click', () => this._changeMenu('light_colour', b.dataset.colour)));
    this.shadowRoot.querySelectorAll('.cust-pick').forEach((b) => b.addEventListener('click', () => this._changeMenu('menu_size', b.dataset.size)));
  }
  _openCust(open) {
    this._el.shell.classList.toggle('cust-open', open);
    this._el.cust.setAttribute('aria-hidden', String(!open));
    if (open) { this._el.cust.querySelector('.set-body').scrollTop = 0; this._renderCust(); }
    if (this._el.shell.classList.contains('open')) this._openControls(true);
  }
  _changeMenu(key, value) {
    this._saveChoice(key, value);
    this._config[key] = value;
    this._lightsKey = null;
    this._renderCust();
    this._updateControls();
    this._openControls(true); // choosing keeps it open
  }
  _saveMenuOrder(items) {
    this._changeMenu('menu_order', items.map((x) => ({ id: x.id, show: x.show })));
  }
  _renderCust() {
    if (!this._el.cust) return;
    const cust = this._el.cust, layout = this._menuLayout();
    cust.querySelectorAll('.cust-layout').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === layout)));
    cust.querySelectorAll('.cust-swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.colour.toLowerCase() === String(this._config.light_colour || '#ffd34d').toLowerCase())));
    cust.querySelectorAll('.cust-pick').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === (this._config.menu_size === 'compact' ? 'compact' : 'big'))));
    const items = this._menuItems();
    const KIND = { heat: 'Heating', light: 'Light', weather: '', scene: 'Scene', door: 'Doorbell' };
    cust.querySelector('.cust-items').replaceChildren(...items.map((item, i) => {
      const row = document.createElement('div');
      row.className = `cust-row${item.show ? '' : ' hidden'}`;
      row.innerHTML = `<span class="cust-name"></span><span class="cust-kind"></span><button class="cust-move" aria-label="Move up">${ICON.up}</button><button class="cust-move" aria-label="Move down">${ICON.down}</button><button class="cust-sw"></button>`;
      row.querySelector('.cust-name').textContent = this._menuName(item);
      row.querySelector('.cust-kind').textContent = item.kind === 'light' || item.off ? '' : item.id.startsWith('script.') ? 'Script' : KIND[item.kind];
      const [up, down] = row.querySelectorAll('.cust-move'), sw = row.querySelector('.cust-sw');
      up.disabled = i === 0;
      down.disabled = i === items.length - 1;
      const move = (to) => { const next = items.slice(); next.splice(i, 1); next.splice(to, 0, item); this._saveMenuOrder(next); };
      up.addEventListener('click', () => move(i - 1));
      down.addEventListener('click', () => move(i + 1));
      sw.setAttribute('aria-pressed', String(item.show));
      sw.setAttribute('aria-label', `Show ${this._menuName(item)}`);
      sw.addEventListener('click', () => { item.show = !item.show; this._saveMenuOrder(items); });
      return row;
    }));
  }

  // ---- the tap menu: what's in it, in what order, and in which layout (all chosen on the Customise page) ----
  /** Every button the menu could show, in the order chosen, each marked shown or hidden. */
  _menuItems() {
    const all = [
      ...this._heaters().map((id) => ({ id, kind: 'heat' })),
      ...this._vacuums().map((id) => ({ id, kind: 'vacuum' })),
      ...this._doors(),
      ...this._config.lights.map((light) => ({ id: light.entity, kind: 'light', light })),
      ...(this._config.weather && this._state(this._config.weather) ? [{ id: 'weather', kind: 'weather' }] : []),
      ...this._scenes().map((scene) => ({ id: scene.entity, kind: 'scene', scene })),
      ...(this._config.scenes !== false && this._config.lights.length > 1 ? [{ id: 'lights_off', kind: 'scene', off: true }] : []),
    ];
    const byId = new Map(all.map((x) => [x.id, x]));
    const out = [];
    for (const saved of Array.isArray(this._config.menu_order) ? this._config.menu_order : []) {
      const item = saved && byId.get(saved.id);
      if (item && !out.includes(item)) { item.show = saved.show !== false; out.push(item); }
    }
    // Anything new (a light added to the dashboard, say) joins at the end. The weather, "Lights off" and scenes
    // found by themselves (Home Assistant can have dozens) start hidden; scenes listed in the dashboard start shown.
    for (const item of all) {
      if (out.includes(item)) continue;
      item.show = item.kind === 'weather' ? false : item.kind === 'scene' ? !!(item.scene && item.scene.listed) : true;
      out.push(item);
    }
    return out;
  }
  _menuName(item) {
    if (item.kind === 'scene') return item.off ? 'Lights off' : this._sceneName(item.scene);
    if (item.kind === 'vacuum') return this._vacName(item.id);
    if (item.kind === 'door') return this._doorName(item.trigger) || 'Doorbell';
    return item.kind === 'light' ? item.light.name : item.kind === 'heat' ? this._heatName(item.id) : 'Weather';
  }

  // ---- scenes: one tap runs a Home Assistant scene or script; "Lights off" turns off the menu's lights ----
  /** The dashboard's "scenes" list, or else every scene and script in Home Assistant. */
  _scenes() {
    const wanted = this._config.scenes;
    if (wanted === false || !this._hass) return [];
    if (Array.isArray(wanted)) {
      return wanted.map((x) => (typeof x === 'string' ? { entity: x } : x))
        .filter((x) => x && typeof x.entity === 'string' && this._state(x.entity))
        .map((x) => ({ entity: x.entity, name: x.name, listed: true }));
    }
    return Object.keys(this._hass.states).filter((id) => /^(scene|script)\./.test(id))
      .map((entity) => ({ entity, listed: false }))
      .sort((a, b) => this._sceneName(a).localeCompare(this._sceneName(b)));
  }
  _sceneName(scene) {
    return scene.name || this._state(scene.entity)?.attributes.friendly_name || capFirst(scene.entity.split('.')[1].replace(/_/g, ' '));
  }
  _lightsOn() { return this._config.lights.map((l) => l.entity).filter((id) => this._state(id)?.state === 'on'); }
  // A scene's state is when it last ran ("unknown" if never), so only "unavailable" means it can't be used.
  _sceneOk(item) {
    if (item.off) return this._config.lights.some((l) => this._usable(l.entity));
    const s = this._state(item.id);
    return !!s && s.state !== 'unavailable';
  }
  _sceneRan(id) { return !!this._ran && this._ran[id] > Date.now(); }
  _sceneIcon(item) {
    if (item.off) return ICON.power;
    const name = this._menuName(item).toLowerCase();
    if (/\b(movie|film|tv|cinema)/.test(name)) return ICON.film; // before "night", for Movie night
    if (/\b(bed|night|sleep|relax|wind down)/.test(name)) return ICON.moon;
    if (/\b(morning|wake|bright)/.test(name)) return ICON.sun;
    return ICON.scene;
  }
  _sceneStatus(item) {
    if (!this._sceneOk(item)) return 'Unavailable';
    if (this._sceneRan(item.id)) return 'Done';
    if (item.off) { const n = this._lightsOn().length; return n ? `${n} on` : 'All off'; }
    return item.id.startsWith('script.') && this._state(item.id)?.state === 'on' ? 'Running' : '';
  }
  _sceneTile(item) {
    const ran = this._sceneRan(item.id), b = document.createElement('button');
    b.className = `tile scene-tile${ran ? ' on' : ''}`;
    b.disabled = !this._sceneOk(item);
    b.innerHTML = `<span class="ic">${ran ? ICON.check : this._sceneIcon(item)}</span><span class="tx"><span class="nm"></span><span class="st" style="display:block"></span></span>`;
    b.querySelector('.nm').textContent = this._menuName(item);
    b.querySelector('.st').textContent = this._sceneStatus(item);
    b.setAttribute('aria-label', `${this._menuName(item)}${this._sceneStatus(item) ? `, ${this._sceneStatus(item)}` : ''}`);
    b.addEventListener('click', () => this._runScene(item));
    return b;
  }
  async _runScene(item) {
    if (!this._hass || !this._sceneOk(item)) return;
    try {
      if (item.off) {
        const on = this._lightsOn();
        if (on.length) await this._hass.callService('light', 'turn_off', { entity_id: on });
      } else {
        await this._hass.callService(item.id.startsWith('script.') ? 'script' : 'scene', 'turn_on', { entity_id: item.id });
      }
    } catch (err) {
      const why = String((err && err.message) || '').trim().slice(0, 80);
      this._toast(why ? `Couldn’t do that: ${why}` : 'Couldn’t reach that. Try again?');
      return;
    }
    // A tick for a moment, so you know it went; then it goes back to how it was.
    this._ran = { ...(this._ran || {}), [item.id]: Date.now() + SCENE_DONE_MS };
    this._lightsKey = null;
    this._updateControls();
    setTimeout(() => { this._lightsKey = null; this._updateControls(); }, SCENE_DONE_MS + 50);
  }
  _menuLayout() { return MENU_LAYOUTS.includes(this._config.menu_layout) ? this._config.menu_layout : 'heat_top'; }
  _renderMenu() {
    const layout = this._menuLayout(), compact = this._config.menu_size === 'compact';
    const colour = /^#[0-9a-f]{6}$/i.test(this._config.light_colour || '') ? this._config.light_colour : '#ffd34d';
    const items = this._menuItems().filter((x) => x.show);
    const now = (x) => x.kind === 'door' ? `${this._usable(x.camera)}` : x.kind === 'vacuum' ? `${this._vacInfo(x.id).tile}|${this._vacBusy(x.id)}` : x.kind === 'scene' ? `${this._sceneStatus(x)}|${this._sceneOk(x)}` : x.kind === 'light' ? `${this._state(x.id)?.state}|${this._lightPct(x.id)}` : x.kind === 'heat' ? `${this._heatSummary(x.id)}|${this._heatOn(x.id)}|${this._state(x.id)?.state}` : `${this._state(this._config.weather)?.state}|${this._state(this._config.weather)?.attributes.temperature}`;
    const key = JSON.stringify([layout, compact, colour, items.map((x) => [x.id, this._menuName(x), now(x)])]);
    if (key === this._lightsKey) return;
    this._lightsKey = key;
    this._el.shell.style.setProperty('--on', colour);
    const menu = this._el.menu;
    menu.dataset.layout = layout;
    menu.classList.toggle('compact', compact);
    // Heating on top: the first thermostat becomes a wide strip with Cooler and Warmer on it.
    // Split: the first thermostat and the weather sit in a column on the left.
    let strip = null, side = [], rest = items;
    if (layout === 'heat_top') strip = items.find((x) => x.kind === 'heat') || null;
    if (layout === 'split') side = [items.find((x) => x.kind === 'heat'), items.find((x) => x.kind === 'weather')].filter(Boolean);
    rest = items.filter((x) => x !== strip && !side.includes(x));
    this._el.menuStrip.replaceChildren(...(strip ? [this._heatPanel(strip.id, 'strip')] : []));
    this._el.menuSide.replaceChildren(...side.map((x) => (x.kind === 'heat' ? this._heatPanel(x.id, 'card') : this._weatherTile('card'))));
    menu.classList.toggle('has-strip', !!strip);
    menu.classList.toggle('has-side', side.length > 0);
    const lights = this._el.lights;
    if (layout === 'round') {
      lights.dataset.n = 'round';
      lights.style.removeProperty('--cols');
      lights.replaceChildren(...rest.map((x) => this._roundTile(x)));
      return;
    }
    // However many there are, they fit: see the .lights styles.
    const n = rest.length;
    let kind = n > 8 ? 'scroll' : n > 4 ? 'many' : 'few', cols = kind === 'many' ? Math.ceil(n / 2) : Math.max(1, n);
    if (layout === 'split' && side.length) { kind = n > 4 ? 'scroll' : 'many'; cols = 2; }
    // Under the heating strip the buttons stay in one row, as in the design; more than four, and you swipe.
    if (strip) { kind = n > 4 ? 'row' : 'few'; cols = Math.max(1, n); }
    if (compact && kind === 'few') kind = 'many';
    lights.dataset.n = kind;
    lights.style.setProperty('--cols', String(cols));
    lights.replaceChildren(...rest.map((x) => (x.kind === 'light' ? this._tile(x.light) : x.kind === 'heat' ? this._heatTile(x.id) : x.kind === 'vacuum' ? this._vacTile(x.id) : x.kind === 'door' ? this._doorTile(x) : x.kind === 'scene' ? this._sceneTile(x) : this._weatherTile('tile'))));
  }
  /** A doorbell's button: its camera, live, without anyone having to ring. */
  _doorTile(item) {
    const ok = this._usable(item.camera), b = document.createElement('button'), name = this._menuName(item);
    b.className = 'tile door-tile';
    b.disabled = !ok;
    b.innerHTML = `<span class="ic">${ICON.camera}</span><span class="tx"><span class="nm" style="display:block"></span><span class="st" style="display:block"></span></span>`;
    b.querySelector('.nm').textContent = name;
    b.querySelector('.st').textContent = ok ? 'Live view' : 'Unavailable';
    b.setAttribute('aria-label', `${name}: ${ok ? 'shows its camera live' : 'unavailable'}`);
    b.addEventListener('click', () => this._openDoorbell(item.trigger, 'menu', item.camera));
    return b;
  }
  /** The heating with Cooler and Warmer on it: a wide strip, or a card in the side column. Tap it to open the full heating page. */
  _heatPanel(id, variant) {
    const s = this._state(id), ok = this._usable(id), off = s?.state === 'off', on = ok && this._heatOn(id);
    const now = s?.attributes.current_temperature, target = this._heatTarget(id);
    const el = document.createElement('div');
    el.className = `hpanel hpanel-${variant}${on ? ' on' : ''}${off ? ' off' : ''}`;
    el.innerHTML = `<button class="hp-open"><span class="hp-ic">${ICON.flame}</span><span class="hp-tx"><span class="hp-title"></span><span class="hp-sub"></span></span></button>
      <div class="hp-set"><button class="hp-step" data-step="-1" aria-label="Cooler">−</button><span class="hp-target"><span class="hp-label"></span><span class="hp-val"></span></span><button class="hp-step" data-step="1" aria-label="Warmer">+</button></div>`;
    el.querySelector('.hp-title').textContent = !ok ? 'Unavailable' : off ? 'Heating off' : on ? 'Heating now' : (this._heaters().length > 1 ? this._heatName(id) : 'Heating');
    el.querySelector('.hp-sub').textContent = now != null ? `Room is ${this._deg(now)}` : '';
    el.querySelector('.hp-label').textContent = off ? '' : 'Set to';
    el.querySelector('.hp-val').textContent = off ? 'Off' : this._deg(target);
    el.querySelector('.hp-open').setAttribute('aria-label', `${this._heatName(id)}: ${this._heatSummary(id)}. Opens heating controls.`);
    el.querySelector('.hp-open').addEventListener('click', () => this._openHeat(id));
    el.querySelectorAll('.hp-step').forEach((b) => {
      b.disabled = !ok || off || target == null;
      b.addEventListener('click', () => { this._heatId = id; this._heatStep(Number(b.dataset.step)); });
    });
    return el;
  }
  _weatherTile(variant) {
    const w = this._state(this._config.weather), ok = this._usable(this._config.weather);
    const el = document.createElement('div');
    el.className = variant === 'card' ? 'wcard' : 'tile wtile';
    el.innerHTML = `<span class="ic">${this._weatherIcon()}</span><span class="tx"><span class="nm" style="display:block"></span><span class="st" style="display:block"></span></span>`;
    el.querySelector('.nm').textContent = ok && w.attributes.temperature != null ? this._deg(Math.round(w.attributes.temperature)) : 'Weather';
    el.querySelector('.st').textContent = ok ? WEATHER_WORDS[w.state] || capFirst(String(w.state).replace(/[-_]/g, ' ')) : 'Unavailable';
    return el;
  }
  /** Round layout: a circle with the name underneath. */
  _roundTile(item) {
    const b = document.createElement(item.kind === 'weather' ? 'div' : 'button');
    b.className = 'tile rtile';
    const id = item.kind === 'weather' ? this._config.weather : item.kind === 'door' ? item.camera : item.id;
    const scene = item.kind === 'scene', ok = scene ? this._sceneOk(item) : this._usable(id);
    const on = ok && (scene ? this._sceneRan(id) : item.kind === 'light' ? this._state(id)?.state === 'on' : item.kind === 'heat' && this._heatOn(id));
    b.classList.toggle('on', on);
    b.classList.toggle('heat-on', on && item.kind === 'heat');
    if (b.tagName === 'BUTTON') b.disabled = !ok;
    let inner = ICON.light;
    if (item.kind === 'heat') {
      const off = this._state(id)?.state === 'off';
      inner = `<span class="rt-big">${off ? 'Off' : this._deg(this._heatTarget(id))}</span>`;
    }
    if (item.kind === 'weather') {
      const t = this._state(id)?.attributes.temperature;
      inner = t != null ? `<span class="rt-big">${this._deg(Math.round(t))}</span>` : this._weatherIcon();
    }
    if (scene) inner = on ? ICON.check : this._sceneIcon(item);
    if (item.kind === 'vacuum') { inner = ICON.vacuum; b.classList.toggle('on', ok && this._vacBusy(id)); }
    if (item.kind === 'door') inner = ICON.camera;
    b.innerHTML = `<span class="rt-dot">${inner}</span><span class="nm"></span>`;
    b.querySelector('.nm').textContent = this._menuName(item);
    if (scene) {
      b.setAttribute('aria-label', `${this._menuName(item)}${this._sceneStatus(item) ? `, ${this._sceneStatus(item)}` : ''}`);
      b.addEventListener('click', () => this._runScene(item));
    } else if (item.kind === 'light') {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${item.light.name}, ${!ok ? 'unavailable' : on ? 'on' : 'off'}`);
      this._holdOpensLight(b, id);
      b.addEventListener('click', () => { if (this._lightHeld) { this._lightHeld = false; return; } this._service('light', 'toggle', id); });
    } else if (item.kind === 'heat') {
      b.setAttribute('aria-label', `${this._heatName(id)}: ${this._heatSummary(id)}. Opens heating controls.`);
      b.addEventListener('click', () => this._openHeat(id));
    } else if (item.kind === 'vacuum') {
      b.setAttribute('aria-label', `${this._vacName(id)}: ${this._vacInfo(id).tile}. Opens its controls.`);
      b.addEventListener('click', () => this._openVac(id));
    } else if (item.kind === 'door') {
      b.setAttribute('aria-label', `${this._menuName(item)}: ${ok ? 'shows its camera live' : 'unavailable'}`);
      b.addEventListener('click', () => this._openDoorbell(item.trigger, 'menu', item.camera));
    }
    return b;
  }

  // ---- heating: a button per thermostat in the menu, and a page with a dial, Cooler/Warmer, modes and presets ----
  _heaters() {
    if (this._config.heating_controls === false || !this._hass) return [];
    const wanted = this._config.heating || Object.keys(this._hass.states).filter((id) => id.startsWith('climate.')).sort();
    return wanted.filter((id) => this._state(id));
  }
  _heatName(id) {
    const s = this._state(id);
    const name = (s && s.attributes.friendly_name) || 'Heating';
    return this._heaters().length > 1 ? name : 'Heating';
  }
  _heatTarget(id) {
    const a = this._state(id)?.attributes || {};
    if (this._heatPending && this._heatPending.id === id) return this._heatPending.value;
    // A thermostat with a range (heat and cool) is set by its heating end.
    return a.temperature ?? a.target_temp_low ?? null;
  }
  _heatOn(id) {
    const s = this._state(id);
    if (!s) return false;
    const action = s.attributes.hvac_action;
    return action ? action === 'heating' || action === 'preheating' : s.state === 'heat';
  }
  _deg(v) { return v == null || Number.isNaN(Number(v)) ? '–' : `${Number(v).toFixed(Number(v) % 1 ? 1 : 0)}°`; }
  _heatSummary(id) {
    const s = this._state(id);
    if (!this._usable(id)) return 'Unavailable';
    const now = s.attributes.current_temperature, target = this._heatTarget(id);
    if (s.state === 'off') return now != null ? `${this._deg(now)} · Off` : 'Off';
    return [now != null ? this._deg(now) : '', target != null ? `set ${this._deg(target)}` : ''].filter(Boolean).join(' · ');
  }
  _heatTile(id) {
    const ok = this._usable(id), on = ok && this._heatOn(id);
    const b = document.createElement('button');
    b.className = `tile heat-tile${on ? ' on' : ''}`;
    b.disabled = !ok;
    b.innerHTML = `<span class="ic">${ICON.flame}</span><span class="tx"><span class="nm" style="display:block"></span><span class="st" style="display:block"></span></span>`;
    b.querySelector('.nm').textContent = this._heatName(id);
    b.querySelector('.st').textContent = this._heatSummary(id);
    b.setAttribute('aria-label', `${this._heatName(id)}, ${this._heatSummary(id)}${on ? ', heating now' : ''}. Opens heating controls.`);
    b.addEventListener('click', () => this._openHeat(id));
    return b;
  }
  _wireHeat(q) {
    this._el.heat = q('.heat');
    q('.heat-back').addEventListener('click', () => this._openHeat(null));
    this.shadowRoot.querySelectorAll('.heat-step').forEach((b) => b.addEventListener('click', () => this._heatStep(Number(b.dataset.step))));
  }
  _openHeat(id) {
    const open = !!id;
    this._heatId = id || this._heatId;
    this._el.shell.classList.toggle('heat-open', open);
    this._el.heat.setAttribute('aria-hidden', String(!open));
    if (open) { this._renderHeat(); this._openControls(true); }
    else if (this._el.shell.classList.contains('open')) this._openControls(true);
  }
  _renderHeat() {
    const id = this._heatId, s = this._state(id), el = this._el.heat;
    if (!s) return;
    const a = s.attributes, ok = this._usable(id), off = s.state === 'off';
    const min = Number(a.min_temp ?? 7), max = Number(a.max_temp ?? 30);
    const target = this._heatTarget(id), now = a.current_temperature;
    const place = (v) => Math.max(0, Math.min(1, (Number(v) - min) / ((max - min) || 1)));
    // The dial: an arc filled up to the set temperature, and a dot where the room is now.
    el.querySelector('.hd-fill').style.strokeDasharray = `${target == null || off ? 0 : (place(target) * 100).toFixed(2)} 100`;
    const dot = el.querySelector('.hd-now');
    if (now != null) {
      const angle = (135 + 270 * place(now)) * Math.PI / 180;
      dot.setAttribute('cx', (100 + 80 * Math.cos(angle)).toFixed(2));
      dot.setAttribute('cy', (100 + 80 * Math.sin(angle)).toFixed(2));
    }
    dot.style.display = now == null ? 'none' : '';
    el.classList.toggle('heating', ok && this._heatOn(id));
    el.classList.toggle('off', off);
    this._setText(el.querySelector('.hd-label'), off ? 'Heating is' : 'Set to');
    this._setText(el.querySelector('.hd-target'), off ? 'Off' : this._deg(target));
    this._setText(el.querySelector('.hd-cur'), now != null ? `Now ${this._deg(now)}` : '');
    this._setText(el.querySelector('.heat-status'), !ok ? 'This thermostat is unavailable right now' : off ? 'Off' : this._heatOn(id) ? 'Heating now' : `Not heating: it’s warm enough`);
    el.querySelectorAll('.heat-step').forEach((b) => { b.disabled = !ok || target == null; });
    // Several thermostats: pick which one.
    const pick = el.querySelector('.heat-pick'), heaters = this._heaters();
    const pickKey = JSON.stringify([heaters, id]);
    if (pick.dataset.key !== pickKey) {
      pick.dataset.key = pickKey;
      pick.replaceChildren(...(heaters.length > 1 ? heaters : []).map((h) => {
        const b = document.createElement('button');
        b.className = 'heat-chip';
        b.textContent = this._state(h).attributes.friendly_name || h;
        b.setAttribute('aria-pressed', String(h === id));
        b.addEventListener('click', () => { this._heatId = h; this._renderHeat(); });
        return b;
      }));
    }
    // Modes and presets: only the ones this thermostat has.
    const MODE_NAMES = { off: 'Off', heat: 'Heat', auto: 'Schedule', heat_cool: 'Auto', cool: 'Cool', dry: 'Dry', fan_only: 'Fan' };
    this._heatChips(el.querySelector('.heat-modes'), a.hvac_modes || [], s.state, (m) => MODE_NAMES[m] || m, (m) => this._service('climate', 'set_hvac_mode', id, { hvac_mode: m }));
    this._heatChips(el.querySelector('.heat-presets'), a.preset_modes || [], a.preset_mode, (p) => capFirst(String(p).replace(/_/g, ' ')), (p) => this._service('climate', 'set_preset_mode', id, { preset_mode: p }));
  }
  _heatChips(box, values, current, label, choose) {
    const key = JSON.stringify([values, current]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.replaceChildren(...values.map((v) => {
      const b = document.createElement('button');
      b.className = 'heat-chip';
      b.textContent = label(v);
      b.setAttribute('aria-pressed', String(v === current));
      b.addEventListener('click', () => choose(v));
      return b;
    }));
  }
  // Cooler/Warmer change the number straight away; Home Assistant is told once you stop pressing.
  _heatStep(direction) {
    const id = this._heatId, s = this._state(id);
    const base = this._heatTarget(id);
    if (!s || base == null) return;
    const a = s.attributes, step = Number(a.target_temp_step) || 0.5;
    const value = Math.max(Number(a.min_temp ?? 7), Math.min(Number(a.max_temp ?? 30), Math.round((Number(base) + direction * step) / step) * step));
    clearTimeout(this._heatPending && this._heatPending.timer);
    this._heatPending = { id, value, timer: setTimeout(() => this._heatSend(), HEAT_SEND_MS) };
    this._updateControls(); // the page and the menu button both show the new number
    this._openControls(true); // pressing keeps the menu open
  }
  async _heatSend() {
    const p = this._heatPending;
    if (!p) return;
    const a = this._state(p.id)?.attributes || {};
    const data = a.temperature == null && a.target_temp_low != null ? { target_temp_low: p.value, target_temp_high: a.target_temp_high } : { temperature: p.value };
    await this._service('climate', 'set_temperature', p.id, data);
    // Show the new number until Home Assistant reports it, or a few seconds pass.
    setTimeout(() => { if (this._heatPending === p) { this._heatPending = null; this._lightsKey = null; this._updateControls(); } }, HEAT_SETTLE_MS);
  }
  // ---- robot vacuums: a button each in the menu, and a page with the live map, controls and rooms ----
  _vacuums() {
    if (this._config.vacuums === false || !this._hass) return [];
    const wanted = this._config.vacuums;
    const ids = Array.isArray(wanted) ? wanted.map((x) => (typeof x === 'string' ? x : x && x.entity)) : Object.keys(this._hass.states).filter((id) => id.startsWith('vacuum.')).sort();
    return ids.filter((id) => id && this._state(id));
  }
  // Another entity on the same device as the vacuum, matched by the end of its id ("..._battery", "..._battery_2").
  _vacPart(id, domain, ending) {
    const registry = this._hass?.entities || {}, device = registry[id] && registry[id].device_id;
    if (!device) return null;
    const pattern = new RegExp(`_${ending}(_\\d+)?$`);
    return Object.keys(registry).find((e) => e.startsWith(`${domain}.`) && registry[e].device_id === device && pattern.test(e) && this._state(e)) || null;
  }
  // Its name: the dashboard's, or Home Assistant's; two with the same name (both "Robot Vacuum") go by model.
  _vacName(id) {
    const listed = Array.isArray(this._config.vacuums) && this._config.vacuums.find((x) => x && typeof x === 'object' && x.entity === id);
    if (listed && listed.name) return listed.name;
    const name = this._state(id)?.attributes.friendly_name || capFirst(id.split('.')[1].replace(/_/g, ' '));
    const twins = this._vacuums().filter((v) => (this._state(v)?.attributes.friendly_name || '') === name);
    if (twins.length < 2) return name;
    const device = this._hass.entities?.[id]?.device_id, model = device && this._hass.devices?.[device]?.model;
    return model ? String(model).replace(/^Tapo\s+/i, '') : name;
  }
  // Cleaning, heading home, or the dock busy with a short job of the clean (washing or attaching the mop, say).
  _vacBusy(id) {
    const state = this._state(id)?.state;
    return ['cleaning', 'returning'].includes(state) || (state === 'docked' && VAC_DOCK_JOBS.has(this._vacStatus(id)));
  }
  // TapoVac's Status sensor ("Washing Mop"), lower case, or ''. Its planner's status also ends in "_status", so
  // that one is left out, and the shortest name wins.
  _vacStatus(id) {
    const registry = this._hass?.entities || {}, device = registry[id] && registry[id].device_id;
    if (!device) return '';
    const found = Object.keys(registry).filter((e) => e.startsWith('sensor.') && registry[e].device_id === device && /_status(_\d+)?$/.test(e) && !/planner/.test(e) && this._state(e))
      .sort((a, b) => a.length - b.length)[0];
    const value = found ? String(this._state(found).state || '').trim().toLowerCase() : '';
    return /^(unknown|unavailable)$/.test(value) ? '' : value;
  }
  _vacInfo(id) {
    const s = this._state(id), state = s?.state || 'unavailable', a = s?.attributes || {};
    const value = (e) => (e ? this._state(e)?.state : null);
    const battery = Number(value(this._vacPart(id, 'sensor', 'battery')) ?? a.battery_level);
    const room = value(this._vacPart(id, 'sensor', 'current_room'));
    const progress = Number(value(this._vacPart(id, 'sensor', 'clean_progress')));
    const error = value(this._vacPart(id, 'sensor', 'error'));
    const problem = (error && !/^(ok|none|no error|unknown|unavailable)$/i.test(error)) ? error : (state === 'error' ? 'Needs attention' : '');
    const status = this._vacStatus(id);
    const word = !this._usable(id) ? 'Unavailable' : problem ? 'Problem' : VAC_STATUS_WORDS[status] || VAC_WORDS[state] || capFirst(state);
    const pct = Number.isFinite(battery) ? `${Math.round(battery)}%` : '';
    const where = room && !/^(unknown|unavailable|none)$/i.test(room) ? room : '';
    const done = state === 'cleaning' && Number.isFinite(progress) ? `${Math.round(progress)}%` : '';
    const line = [word, state === 'cleaning' ? where : '', done].filter(Boolean).join(' · ');
    const tile = problem ? 'Problem' : state === 'cleaning' ? [word, where, done].filter(Boolean).join(' · ') : [word, pct].filter(Boolean).join(' · ');
    return { state, word, line, tile, problem, battery: pct, room: where, rooms: Array.isArray(a.rooms) ? a.rooms : [] };
  }
  // The live map: the integration's map camera (rooms, the path so far, where it is), else its map picture.
  // Only Home Assistant's own address is used, so the screen still talks to nothing else.
  _vacMapUrls(id) {
    const out = [];
    for (const [key, e] of [['camera', this._vacPart(id, 'camera', 'map')], ['image', this._vacPart(id, 'image', 'map_image')]]) {
      const pic = e && this._state(e)?.attributes.entity_picture;
      if (pic && String(pic).startsWith('/')) out.push({ key, url: `${pic}${pic.includes('?') ? '&' : '?'}t=${this._vacMapTick || 0}` });
    }
    return out;
  }
  _vacMapUrl(id) { return this._vacMapUrls(id)[0]?.url || null; }
  _loadPicture(url) {
    return new Promise((done) => { const img = new Image(); img.onload = () => done(img); img.onerror = () => done(null); img.src = url; });
  }
  // The map picture: the first time, both of the add-on's (its map camera and map picture) are fetched and the
  // bigger one is kept; after that, just that one. Null if there's none, or it won't load.
  async _vacMapPicture(id) {
    const urls = this._vacMapUrls(id);
    if (!urls.length) return null;
    this._vacMapBest = this._vacMapBest || {};
    const known = urls.find((u) => u.key === this._vacMapBest[id]);
    if (known) return this._loadPicture(known.url);
    const pictures = await Promise.all(urls.map((u) => this._loadPicture(u.url)));
    let best = null, size = -1;
    pictures.forEach((p, i) => { if (p && p.naturalWidth * p.naturalHeight > size) { size = p.naturalWidth * p.naturalHeight; best = p; this._vacMapBest[id] = urls[i].key; } });
    return best;
  }
  async _drawVacMap(id, canvas) {
    const picture = await this._vacMapPicture(id);
    if (!picture || !canvas.isConnected) return false;
    canvas.hidden = false;
    canvas._picture = picture; // kept for drawing again when the map is enlarged
    if (canvas._vacId !== id) { canvas._vacId = id; canvas._shown = null; } // another vacuum's map: no glide across
    canvas._view = this._vacFollow(id, picture);
    this._paintVacMap(canvas, true);
    return true;
  }
  /**
   * The close-up that follows the robot: where it is on the map picture (its blue-rimmed disc, or else its
   * position_mm through the map camera's conversion), enlarged so the robot looks about FOLLOW_ROBOT_PX across.
   * Null if it can't be found: then the whole map shows.
   */
  _vacFollow(id, picture) {
    let robot = findRobot(picture);
    const camera = this._vacPart(id, 'camera', 'map'), attrs = (camera && this._state(camera)?.attributes) || {};
    const geometry = attrs.map_geometry || {}, size = geometry.image_size;
    // The conversion is for the map camera's own picture; only used if this picture is the same size.
    const same = Array.isArray(size) && size[0] === picture.naturalWidth && size[1] === picture.naturalHeight;
    if (!robot && same) {
      const pos = this._state(id)?.attributes.position_mm, mm = Array.isArray(pos) ? pos.map(Number) : [];
      const at = mm.length >= 2 && mm.every(Number.isFinite) ? mapPoint(attrs, mm) : null;
      if (at && at.x >= 0 && at.y >= 0 && at.x <= picture.naturalWidth && at.y <= picture.naturalHeight) robot = { x: at.x, y: at.y, d: 0 };
    }
    if (!robot) return null;
    const res = Number(geometry.resolution_mm) || 50, per = Number(geometry.scale_px_per_cell) || 4;
    const across = robot.d || Math.max(2, Math.round((330 / res) * per)); // TapoVac draws it 33cm wide
    return { x: robot.x, y: robot.y, zoom: Math.min(FOLLOW_ZOOM_MAX, Math.max(1, FOLLOW_ROBOT_PX / across)) };
  }
  // Draws the map (a close-up on the robot if it was found), gliding from where it was looking before.
  _paintVacMap(canvas, glide) {
    const picture = canvas._picture, view = canvas._view, from = canvas._shown;
    cancelAnimationFrame(canvas._glide);
    if (!picture) return;
    if (!view || !from || !glide) { canvas._shown = view ? paintMap(picture, canvas, view) : null; if (!view) paintMap(picture, canvas); return; }
    const start = performance.now();
    const step = (now) => {
      if (canvas._picture !== picture) return; // a newer picture took over
      const t = Math.min(1, (now - start) / FOLLOW_GLIDE_MS), ease = t * t * (3 - 2 * t);
      // Each step is kept within the house by paintMap, so the glide stops at the edge rather than past it.
      canvas._shown = paintMap(picture, canvas, { zoom: view.zoom, x: from.x + (view.x - from.x) * ease, y: from.y + (view.y - from.y) * ease });
      if (t < 1) canvas._glide = requestAnimationFrame(step);
    };
    canvas._glide = requestAnimationFrame(step);
  }
  // ---- the live map beside the face while a vacuum cleans ----
  // Which vacuum to watch: the first one cleaning (or heading home) that has a map.
  _vacWatchId() {
    if (this._config.vacuum_watch === false) return null;
    return this._vacuums().find((v) => this._vacBusy(v) && this._usable(v) && this._vacMapUrl(v)) || null;
  }
  // Whether the map can be seen right now: the CSS gives way to words, lyrics, cards, the menu and pop-ups.
  _vacWatchSeen() {
    const shell = this._el.shell;
    return shell.classList.contains('has-vac') && getComputedStyle(this._el.vwatch).pointerEvents === 'auto';
  }
  _updateVacWatch() {
    if (!this._built) return;
    const id = this._vacWatchId();
    this._el.shell.classList.toggle('has-vac', !!id);
    this._placeVacWatch();
    if (!!id !== !!this._vacWatch) this._tick(); // night mode steps aside (or comes back) straight away
    if (!id) {
      if (this._vacWatch) { this._vacWatch = null; clearTimeout(this._vacWatchT); this._el.vwCanvas.hidden = true; }
      return;
    }
    const info = this._vacInfo(id), several = this._vacuums().length > 1;
    const who = several ? this._vacName(id) : info.state === 'cleaning' && info.word === 'Cleaning' ? 'Hoovering' : info.word;
    const line = [who, several && (info.state !== 'cleaning' || info.word !== 'Cleaning') ? info.word : '', info.state === 'cleaning' ? info.room : '',
      info.state === 'cleaning' && /%$/.test(info.line) ? info.line.split(' · ').pop() : ''].filter(Boolean).join(' · ');
    this._setText(this._el.vwLine, line);
    if (this._vacWatch !== id) { this._vacWatch = id; this._refreshVacWatch(); }
  }
  // Keeps the map clear of the now-playing bar: measured from where the bar really sits (offsetTop ignores its
  // slide-in movement), with a 16px gap.
  _placeVacWatch() {
    const shell = this._el.shell, np = this._el.np;
    if (!shell.classList.contains('has-vac') || !shell.classList.contains('has-np') || !np.offsetHeight) return;
    const space = Math.round(shell.clientHeight - np.offsetTop + VW_NP_GAP);
    if (space > 60 && space < shell.clientHeight / 2) shell.style.setProperty('--vw-np', `${space}px`);
  }
  // A fresh map picture every few seconds while it can be seen; nothing is fetched while something else is showing.
  _refreshVacWatch() {
    clearTimeout(this._vacWatchT);
    const id = this._vacWatch;
    if (!id) return;
    const canvas = this._el.vwCanvas;
    if (this._vacWatchSeen() || !canvas._picture) {
      this._vacMapTick = Date.now();
      this._drawVacMap(id, canvas).then((drawn) => { if (!drawn && this._vacWatch === id && !canvas._picture) canvas.hidden = true; });
    }
    this._vacWatchT = setTimeout(() => this._refreshVacWatch(), VAC_MAP_MS);
  }
  _vacTile(id) {
    const ok = this._usable(id), info = this._vacInfo(id), b = document.createElement('button');
    b.className = `tile vac-tile${ok && this._vacBusy(id) ? ' on' : ''}`;
    b.disabled = !ok;
    b.innerHTML = `<span class="ic">${ICON.vacuum}</span><span class="tx"><span class="nm" style="display:block"></span><span class="st" style="display:block"></span></span>`;
    b.querySelector('.nm').textContent = this._vacName(id);
    b.querySelector('.st').textContent = info.tile;
    b.setAttribute('aria-label', `${this._vacName(id)}, ${info.tile}. Opens its controls.`);
    b.addEventListener('click', () => this._openVac(id));
    return b;
  }
  _wireVac(q) {
    this._el.vac = q('.vac');
    q('.vac-back').addEventListener('click', () => this._openVac(null));
    this._el.vac.querySelectorAll('.vac-act').forEach((b) => b.addEventListener('click', () => this._vacAct(b.dataset.act)));
    q('.vac-map').addEventListener('click', () => this._vacZoom(!this._el.vac.classList.contains('vac-big')));
  }
  /** The map, big (the whole page) or back beside the controls. */
  _vacZoom(big) {
    const el = this._el.vac, canvas = el.querySelector('.vac-canvas');
    if (big && canvas.hidden) return; // no map to enlarge
    el.classList.toggle('vac-big', big);
    el.querySelector('.vac-zoom').innerHTML = big ? ICON.shrink : ICON.expand;
    el.querySelector('.vac-map').setAttribute('aria-label', big ? 'Back to the controls' : 'Enlarge the map');
    if (canvas._picture && !canvas.hidden) this._paintVacMap(canvas, false); // drawn again at its new size
  }
  _openVac(id) {
    const open = !!id;
    if (this._el.vac.classList.contains('vac-big')) this._vacZoom(false);
    this._vacId = id || this._vacId;
    this._el.shell.classList.toggle('vac-open', open);
    this._el.vac.setAttribute('aria-hidden', String(!open));
    clearTimeout(this._vacMapT);
    if (open) { this._vacMapTick = Date.now(); this._renderVac(); this._openControls(true); this._refreshVacMap(); }
    else if (this._el.shell.classList.contains('open')) this._openControls(true);
  }
  // The map picture is fetched again every few seconds while cleaning, so the robot can be seen moving.
  _refreshVacMap() {
    clearTimeout(this._vacMapT);
    if (!this._el.shell.classList.contains('vac-open')) return;
    this._vacMapT = setTimeout(() => { this._vacMapTick = Date.now(); this._renderVac(); this._refreshVacMap(); }, this._vacBusy(this._vacId) ? VAC_MAP_MS : VAC_MAP_IDLE_MS);
  }
  _renderVac() {
    const id = this._vacId, el = this._el.vac;
    if (!id || !this._state(id)) return;
    const info = this._vacInfo(id), ok = this._usable(id), busy = this._vacBusy(id);
    el.classList.toggle('busy', busy);
    el.classList.toggle('problem', !!info.problem);
    this._setText(el.querySelector('.vac-name'), this._vacName(id));
    this._setText(el.querySelector('.vac-status'), info.problem || info.line);
    this._setText(el.querySelector('.vac-sub'), [info.battery && `Battery ${info.battery}`, !busy && info.room ? `Last in ${info.room}` : ''].filter(Boolean).join(' · '));
    // Start, or Pause while cleaning (Resume when paused).
    const go = el.querySelector('[data-act=go]'), cleaning = info.state === 'cleaning';
    const goKey = cleaning ? 'pause' : info.state === 'paused' ? 'resume' : 'start';
    if (go.dataset.mode !== goKey) {
      go.dataset.mode = goKey;
      go.querySelector('.va-ic').innerHTML = cleaning ? ICON.pause : ICON.play;
      go.querySelector('.va-tx').textContent = cleaning ? 'Pause cleaning' : goKey === 'resume' ? 'Carry on' : 'Start cleaning';
    }
    el.querySelectorAll('.vac-act').forEach((b) => { b.disabled = !ok; });
    el.querySelector('[data-act=dock]').disabled = !ok || info.state === 'docked';
    // The map, drawn again when there's a new picture. One that won't load shows "No map yet".
    const canvas = el.querySelector('.vac-canvas'), mapKey = `${id}|${this._vacMapTick}`;
    if (mapKey !== this._vacDrawn) {
      this._vacDrawn = mapKey;
      this._drawVacMap(id, canvas).then((drawn) => { if (this._vacDrawn === mapKey && !drawn) canvas.hidden = true; });
    }
    // Several vacuums: pick which one.
    const pick = el.querySelector('.vac-pick'), all = this._vacuums(), pickKey = JSON.stringify([all, id]);
    if (pick.dataset.key !== pickKey) {
      pick.dataset.key = pickKey;
      pick.replaceChildren(...(all.length > 1 ? all : []).map((v) => {
        const b = document.createElement('button');
        b.className = 'heat-chip';
        b.textContent = this._vacName(v);
        b.setAttribute('aria-pressed', String(v === id));
        b.addEventListener('click', () => this._openVac(v));
        return b;
      }));
    }
  }
  async _vacCall(domain, service, data, done) {
    try {
      await this._hass.callService(domain, service, data);
      if (done) this._toast(done);
    } catch (err) {
      const why = String((err && err.message) || '').trim().slice(0, 80);
      this._toast(why ? `Couldn’t do that: ${why}` : 'Couldn’t reach the vacuum. Try again?');
    }
  }
  _vacAct(act) {
    const id = this._vacId;
    if (!id) return;
    const state = this._state(id)?.state;
    if (act === 'go') this._vacCall('vacuum', state === 'cleaning' ? 'pause' : 'start', { entity_id: id });
    if (act === 'dock') this._vacCall('vacuum', 'return_to_base', { entity_id: id }, 'Going home');
  }
  _tile(item) {
    const s = this._state(item.entity), on = s?.state === 'on', ok = this._usable(item.entity);
    const b = document.createElement('button');
    b.className = `tile${on ? ' on' : ''}`;
    b.disabled = !ok;
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `<span class="ic">${ICON.light}</span><span class="tx"><span class="nm" style="display:block"></span><span class="st" style="display:block"></span></span>`;
    b.querySelector('.nm').textContent = item.name;
    const pct = on && this._lightCaps(item.entity).dim ? this._lightPct(item.entity) : null;
    b.querySelector('.st').textContent = !ok ? 'Unavailable' : on ? (pct != null ? `On · ${pct}%` : 'On') : 'Off';
    this._holdOpensLight(b, item.entity);
    b.addEventListener('click', () => { if (this._lightHeld) { this._lightHeld = false; return; } this._service('light', 'toggle', item.entity); });
    return b;
  }

  // ---- a light's own page: hold its button. Brightness, plus warm/cool and colours if the bulb has them ----
  /** Hold (without sliding) to open the light's page; a quick tap still switches it on or off. */
  _holdOpensLight(b, id) {
    let timer = null, x = 0, y = 0;
    const stop = () => { clearTimeout(timer); timer = null; };
    b.addEventListener('pointerdown', (e) => {
      stop();
      this._lightHeld = false;
      x = e.clientX; y = e.clientY;
      timer = setTimeout(() => { timer = null; this._lightHeld = true; this._openLight(id); }, LIGHT_HOLD_MS);
    });
    // Swiping a row of buttons isn't a hold.
    b.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 12) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => b.addEventListener(n, stop));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  _lightCaps(id) {
    const a = this._state(id)?.attributes || {}, modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : null;
    // Home Assistant lists what each bulb can do. Without that list, assume it dims, as most do.
    return {
      dim: modes ? modes.some((m) => m !== 'onoff' && m !== 'unknown') : true,
      temp: !!modes && modes.includes('color_temp'),
      colour: !!modes && modes.some((m) => COLOUR_MODES.includes(m)),
    };
  }
  /** Brightness out of 100: what you just set (until the bulb catches up), else what Home Assistant says. 0 is off. */
  _lightPct(id) {
    const p = this._lightPending;
    if (p && p.id === id && Date.now() < p.until) return p.value;
    const s = this._state(id);
    if (s?.state !== 'on') return 0;
    const b = s.attributes.brightness;
    return b == null ? null : Math.max(1, Math.round(Number(b) / 2.55));
  }
  _wireLight(q) {
    this._el.lpage = q('.lpage');
    q('.lp-back').addEventListener('click', () => this._openLight(null));
    q('.lp-power').addEventListener('click', () => {
      if (this._lightPending) { clearTimeout(this._lightPending.timer); this._lightPending = null; }
      this._service('light', 'toggle', this._lightId);
      this._openControls(true);
    });
    this.shadowRoot.querySelectorAll('.lp-step').forEach((b) => b.addEventListener('click', () => {
      const now = this._lightPct(this._lightId) || 0;
      this._lightSet(Math.round(now / 10) * 10 + Number(b.dataset.step) * 10, true);
    }));
    const bar = q('.lp-bright');
    const at = (e) => { const r = bar.getBoundingClientRect(); return Math.round(((e.clientX - r.left) / (r.width || 1)) * 100); };
    bar.addEventListener('pointerdown', (e) => {
      if (bar.getAttribute('aria-disabled') === 'true') return;
      this._lightDrag = true;
      try { bar.setPointerCapture(e.pointerId); } catch (err) { /* still works while the finger stays on it */ }
      this._lightSet(at(e), false);
    });
    bar.addEventListener('pointermove', (e) => { if (this._lightDrag) this._lightSet(at(e), false); });
    const end = () => {
      if (!this._lightDrag) return;
      this._lightDrag = false;
      if (this._lightPending) this._lightSet(this._lightPending.value, true);
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    bar.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10 }[e.key];
      if (step) { e.preventDefault(); this._lightSet((this._lightPct(this._lightId) || 0) + step, true); }
    });
  }
  _openLight(id) {
    const open = !!id;
    if (open) this._lightId = id;
    this._lightDrag = false;
    this._el.shell.classList.toggle('light-open', open);
    this._el.lpage.setAttribute('aria-hidden', String(!open));
    if (open) { this._el.lpage.querySelector('.lp-colours').dataset.key = ''; this._renderLight(); this._openControls(true); }
    else if (this._el.shell.classList.contains('open')) this._openControls(true);
  }
  /** The bar moves at once; the bulb is told as you drag (not too often), and once more when you let go. */
  _lightSet(value, final) {
    const id = this._lightId;
    if (!id) return;
    value = Math.max(1, Math.min(100, Math.round(value)));
    let p = this._lightPending;
    if (!p || p.id !== id) p = this._lightPending = { id, sentAt: 0 };
    clearTimeout(p.timer);
    p.value = value;
    p.until = Date.now() + LIGHT_SETTLE_MS;
    const since = Date.now() - p.sentAt;
    if (final || since >= LIGHT_SEND_MS) this._lightSend(p);
    else p.timer = setTimeout(() => this._lightSend(p), LIGHT_SEND_MS - since);
    this._lightsKey = null;
    this._updateControls();
    this._openControls(true);
  }
  _lightSend(p) {
    clearTimeout(p.timer);
    if (p.sent === p.value) return;
    p.sent = p.value;
    p.sentAt = Date.now();
    this._service('light', 'turn_on', p.id, { brightness_pct: p.value });
    setTimeout(() => {
      if (this._lightPending === p && Date.now() >= p.until) { this._lightPending = null; this._lightsKey = null; this._updateControls(); }
    }, LIGHT_SETTLE_MS + 50);
  }
  _renderLight() {
    const id = this._lightId, el = this._el.lpage;
    if (!el || !id) return;
    const s = this._state(id), a = s?.attributes || {}, ok = this._usable(id), on = s?.state === 'on', caps = this._lightCaps(id);
    const item = this._config.lights.find((l) => l.entity === id);
    this._setText(el.querySelector('.lp-name'), item ? item.name : a.friendly_name || 'Light');
    const power = el.querySelector('.lp-power');
    power.disabled = !ok;
    power.setAttribute('aria-pressed', String(on));
    this._setText(power, on ? 'On' : 'Off');
    // Pending first: dragging up from off shows the new brightness straight away.
    const pending = this._lightPending && this._lightPending.id === id && Date.now() < this._lightPending.until;
    const pct = caps.dim && (on || pending) ? this._lightPct(id) ?? 100 : 0;
    const bar = el.querySelector('.lp-bright');
    bar.setAttribute('aria-disabled', String(!ok || !caps.dim));
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-valuetext', pct ? `${pct}%` : 'Off');
    el.querySelector('.lp-fill').style.width = `${pct}%`;
    el.querySelector('.lp-fill .lp-in').style.width = pct ? `${(10000 / pct).toFixed(3)}%` : '100%';
    const words = !ok ? '' : !caps.dim ? (on ? 'On' : 'Off') : pct ? `${pct}%` : 'Off';
    el.querySelectorAll('.lp-val').forEach((v) => this._setText(v, words));
    el.querySelectorAll('.lp-step').forEach((b) => { b.disabled = !ok || !caps.dim || (b.dataset.step === '-1' && !pct); });
    this._setText(el.querySelector('.lp-note'), !s || !ok ? 'This light is unavailable right now' : !caps.dim ? 'This light can only switch on and off.' : '');
    // Warm to cool, and colours: only what this bulb can do.
    const box = el.querySelector('.lp-colours'), picked = on ? this._lightPick(a) : null;
    const key = JSON.stringify([id, ok, caps.temp, caps.colour, picked]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const out = [];
    if (ok && caps.temp) {
      for (const [name, kelvin, dot] of LIGHT_TEMPS) {
        const b = document.createElement('button');
        b.className = 'lp-temp';
        b.innerHTML = `<i style="background:${dot}"></i><span></span>`;
        b.querySelector('span').textContent = name;
        b.setAttribute('aria-pressed', String(picked === name));
        const lo = Number(a.min_color_temp_kelvin) || 2000, hi = Number(a.max_color_temp_kelvin) || 6500;
        b.addEventListener('click', () => { this._service('light', 'turn_on', id, { color_temp_kelvin: Math.max(lo, Math.min(hi, kelvin)) }); this._openControls(true); });
        out.push(b);
      }
    }
    if (ok && caps.colour) {
      if (out.length) { const gap = document.createElement('span'); gap.className = 'lp-gap'; out.push(gap); }
      for (const [name, hue] of LIGHT_HUES) {
        const b = document.createElement('button');
        b.className = 'lp-swatch';
        b.style.background = `hsl(${hue},92%,58%)`;
        b.setAttribute('aria-label', name);
        b.setAttribute('aria-pressed', String(picked === name));
        b.addEventListener('click', () => { this._service('light', 'turn_on', id, { hs_color: [hue, 100] }); this._openControls(true); });
        out.push(b);
      }
    }
    box.replaceChildren(...out);
  }
  /** Which warm/cool or colour button matches what the bulb is doing now, if any. */
  _lightPick(a) {
    if (a.color_mode === 'color_temp' && a.color_temp_kelvin != null) {
      const near = LIGHT_TEMPS.reduce((best, t) => (Math.abs(t[1] - a.color_temp_kelvin) < Math.abs(best[1] - a.color_temp_kelvin) ? t : best));
      return Math.abs(near[1] - a.color_temp_kelvin) <= 700 ? near[0] : null;
    }
    if (Array.isArray(a.hs_color) && a.hs_color[1] >= 50) {
      const gap = (h) => { const d = Math.abs(h - a.hs_color[0]) % 360; return Math.min(d, 360 - d); };
      const near = LIGHT_HUES.reduce((best, h) => (gap(h[1]) < gap(best[1]) ? h : best));
      return gap(near[1]) <= 20 ? near[0] : null;
    }
    return null;
  }
  // ---- Bops: this screen's character (see BOP_PRESETS). The list is kept by the echo_robot add-on, so every screen sees
  // the same Bops (without the add-on, they're kept on this screen only). Which Bop this screen shows is a Settings choice. ----
  _wireBops(q) {
    Object.assign(this._el, { bopEyes: q('.bop-eyes'), bopCheeks: q('.bop-cheeks'), bopLink: q('.bop-link'), bops: q('.bops'), bopsGrid: q('.bops-grid'), bopsNow: q('.bops-now'), bopm: q('.bopm'), bopmInput: q('.bopm-input'), bopmPanel: q('.bopm-panel'), bopmPrev: q('.bopm-prev'), bopmFace: q('.bopm-face'), bopmSay: q('.bopm-say'), bopmCopy: q('.bopm-copy'), bopmDel: q('.bopm-del') });
    this._el.bopLink.addEventListener('click', () => this._openBops(true));
    q('.bops-back').addEventListener('click', () => this._openBops(false));
    q('.bopm-back').addEventListener('click', () => this._openMaker(null));
    this._el.bopsGrid.addEventListener('click', (e) => {
      const edit = e.target.closest('.bop-edit'), use = e.target.closest('.bop-use');
      if (edit) this._openMaker(this._bopList().find((b) => b.id === edit.dataset.id) || null);
      else if (use) this._useBop(use.dataset.id);
      else if (e.target.closest('.bop-new')) this._openMaker(this._newBop());
    });
    q('.bopm-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.bopm-tab');
      if (tab) { this._bopTab = tab.dataset.tab; this._el.bopmPanel.scrollTop = 0; this._renderMaker(); }
    });
    this._el.bopmPanel.addEventListener('click', (e) => { const o = e.target.closest('[data-k]'); if (o) this._bopPick(o.dataset.k, o.dataset.v); });
    const input = this._el.bopmInput;
    input.addEventListener('input', () => { if (this._bopDraft) this._bopDraft.name = input.value; this._openControls(true); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    q('.bopm-save').addEventListener('click', () => this._saveBop());
    this._el.bopmCopy.addEventListener('click', () => this._copyBop());
    this._el.bopmDel.addEventListener('click', () => this._deleteBop());
  }
  _bopLocal() {
    if (this._bopLocalList === undefined) {
      try { const list = JSON.parse(localStorage.getItem(BOP_LOCAL_KEY)); this._bopLocalList = Array.isArray(list) ? list : []; } catch (err) { this._bopLocalList = []; }
    }
    return this._bopLocalList;
  }
  _bopSaved() { return (this._bopShared ? this._bopShared.bops : this._bopLocal()).map(cleanBop).filter(Boolean); }
  // Every Bop: the ready-made six (as changed, if they were), then the ones made, in the order they were made.
  _bopList() {
    const src = this._bopShared ? this._bopShared.bops : this._bopLocal();
    if (this._bopListFrom === src) return this._bopListMemo; // worked out again only when the list changes
    const saved = this._bopSaved(), byId = new Map(saved.map((b) => [b.id, b]));
    this._bopListFrom = src;
    this._bopListMemo = [...BOP_PRESETS.map((p) => byId.get(p.id) || p), ...saved.filter((b) => !BOP_PRESETS.some((p) => p.id === b.id))];
    return this._bopListMemo;
  }
  _bopOf(id) { const list = this._bopList(); return list.find((b) => b.id === id) || list.find((b) => b.id === BOP_DEFAULT); }
  _bopChosen() { return this._bopOf(this._config.bop || BOP_DEFAULT); }
  // Puts this screen's Bop on the face. Only the face robot wears Bops; the full-body robot keeps its own look.
  _applyBop() {
    if (!this._built) return;
    const shell = this._el.shell, b = this._config.robot === 'face' ? this._bopChosen() : null;
    const key = b ? JSON.stringify(b) : '';
    if (key !== this._bopKey) {
      const before = this._bopKey !== undefined && this._hass ? this._seenColour() : null;
      this._bopKey = key;
      this._bopNow = b;
      if (b) {
        shell.dataset.bop = b.mood;
        shell.dataset.beye = bopAwake(b.eye);
        shell.style.setProperty('--rest', b.bg);
        shell.style.setProperty('--bop-eye', '#fff');
      } else {
        delete shell.dataset.bop;
        delete shell.dataset.beye;
        shell.style.removeProperty('--rest');
        shell.style.removeProperty('--bop-eye');
      }
      const kit = b ? bopKit(b) : { eyes: '', cheeks: '' };
      this._el.bopEyes.innerHTML = kit.eyes;
      this._el.bopEyes.classList.toggle('glasses', !!b && b.extras.includes('glasses'));
      this._el.bopCheeks.innerHTML = kit.cheeks;
      if (this._hass) { this._apply(); if (before) this._wash(before); }
    }
    this._renderBopLink();
    if (this._hass) { this._bopTellServer(); this._bopVoice(); }
  }
  // The plain round eyes and the plain smile become the Bop's own. Shut eyes open a little unless it's simply resting.
  _bopFace(next) {
    const b = this._bopNow;
    if (!b) return next;
    const resting = !this._moment && ['idle', 'groove'].includes(this._el.shell.dataset.mood);
    const eye = next.eye === 'round' ? (resting ? b.eye : bopAwake(b.eye)) : next.eye;
    const mouth = next.mouth === 'smile' ? b.mouth : next.mouth;
    return eye === next.eye && mouth === next.mouth ? next : { ...next, eye, mouth };
  }
  // Its personality picks which moments it plays: a sleepy Bop yawns instead of dancing.
  _bopMoments(list, kind) {
    const mood = this._bopNow && this._bopNow.mood;
    if (!mood) return list;
    if (kind === 'music') return BOP_MUSIC[mood] || list;
    const less = BOP_PLAY_LESS[mood] || [];
    return [...list.filter((n) => !less.includes(n)), ...(BOP_PLAY_MORE[mood] || [])];
  }
  _renderBopLink() {
    const b = this._bopChosen(), link = this._el.bopLink;
    const key = JSON.stringify(b) + this._config.robot;
    if (!link || key === this._bopLinkKey) return;
    this._bopLinkKey = key;
    link.querySelector('.bop-dot').style.background = b.bg;
    link.querySelector('.bop-dot').innerHTML = bopFace(b, 0.1);
    this._setText(link.querySelector('.bop-label'), `Bop: ${b.name}${this._config.robot === 'face' ? '' : ' (face robot only)'}`);
  }
  _openBops(open) {
    this._el.shell.classList.toggle('bops-open', open);
    this._el.bops.setAttribute('aria-hidden', String(!open));
    if (open) { this._el.bopsGrid.scrollTop = 0; this._renderBops(); }
    if (this._el.shell.classList.contains('open')) this._openControls(true);
  }
  _renderBops() {
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const list = this._bopList(), cur = this._bopChosen();
    this._setText(this._el.bopsNow, `On this screen: ${cur.name}`);
    const made = list.length - BOP_PRESETS.length;
    this._el.bopsGrid.innerHTML = list.map((b) => `<div class="bop-tile" aria-current="${b.id === cur.id}"><button class="bop-use" data-id="${b.id}" aria-label="Use ${esc(b.name)} on this screen"><span class="bop-thumb" style="background:${b.bg}">${bopFace(b, 0.26)}</span><span class="bop-tname"><span>${esc(b.name)}</span></span></button><button class="bop-edit" data-id="${b.id}" aria-label="Change ${esc(b.name)}"><span>${BOP_ICON.pencil}</span></button></div>`).join('')
      + (made < BOP_MAX ? `<button class="bop-new"><span class="ic">${BOP_ICON.plus}</span><span>New Bop</span></button>` : '');
  }
  _useBop(id) {
    this._saveChoice('bop', id);
    this._config.bop = id;
    this._applyBop();
    if (this._el.shell.classList.contains('bops-open')) this._renderBops();
    this._toast(`${this._bopChosen().name} is on this screen now`);
    if (this._el.shell.classList.contains('open')) this._openControls(true);
  }
  _newBop() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const id = `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    return { id, name: pick(BOP_NEW_NAMES), bg: pick(BOP_COLOURS)[0], eye: pick(BOP_EYES), mouth: pick(BOP_MOUTHS), extras: [], mood: 'cheerful', voice: this._bopChosen().voice, isNew: true };
  }
  // The maker: changes are tried out on the preview, and only kept when saved. Back leaves them.
  _openMaker(bop) {
    const open = !!bop;
    this._bopDraft = open ? { ...bop, extras: [...bop.extras] } : null;
    this._bopDelArmed = false;
    if (open && !this._bopTab) this._bopTab = 'colour';
    this._el.shell.classList.toggle('bopm-open', open);
    this._el.bopm.setAttribute('aria-hidden', String(!open));
    if (open) { this._el.bopmPanel.scrollTop = 0; this._renderMaker(true); } else this._el.bopmInput.blur();
    if (this._el.shell.classList.contains('open')) this._openControls(true);
  }
  _renderMaker(full) {
    const d = this._bopDraft, el = this._el, tab = this._bopTab;
    if (!d) return;
    if (full) el.bopmInput.value = d.name;
    el.bopmPrev.style.background = d.bg;
    el.bopmFace.innerHTML = bopFace(d, 0.48);
    this._setText(el.bopmSay, BOP_LINES[d.mood]);
    const preset = BOP_PRESETS.some((p) => p.id === d.id), stored = this._bopSaved().some((b) => b.id === d.id);
    el.bopmCopy.hidden = !!d.isNew;
    el.bopmDel.hidden = !!d.isNew || (preset && !stored);
    this._setText(el.bopmDel, this._bopDelArmed ? 'Sure?' : preset ? 'Reset' : 'Delete');
    el.bopmDel.classList.toggle('warn', !!this._bopDelArmed);
    this.shadowRoot.querySelectorAll('.bopm-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    const pair = (e) => `<svg viewBox="0 -12 240 144" aria-hidden="true"><g>${BOP_EYE_PATHS[e]}</g><g transform="translate(140 0)">${BOP_EYE_PATHS[e]}</g></svg>`;
    let html;
    if (tab === 'colour') html = BOP_COLOURS.map(([c, n]) => `<button class="bop-sw" data-k="bg" data-v="${c}" aria-label="${n}" aria-pressed="${d.bg === c}" style="background:${c}"></button>`).join('');
    else if (tab === 'eyes') html = BOP_EYES.map((e) => `<button class="bop-opt" data-k="eye" data-v="${e}" aria-pressed="${d.eye === e}">${pair(e)}<span>${BOP_WORDS[e]}</span></button>`).join('');
    else if (tab === 'mouth') html = BOP_MOUTHS.map((m) => `<button class="bop-opt" data-k="mouth" data-v="${m}" aria-pressed="${d.mouth === m}"><svg viewBox="0 0 180 80" style="height:34px" aria-hidden="true">${BOP_MOUTH_PATHS[m]}</svg><span>${BOP_WORDS[m]}</span></button>`).join('');
    else if (tab === 'extras') html = BOP_EXTRAS.map((x) => `<button class="bop-opt" data-k="extras" data-v="${x}" aria-pressed="${d.extras.includes(x)}">${BOP_EXTRA_PICS[x]}<span>${BOP_WORDS[x]}</span></button>`).join('');
    else if (tab === 'mood') html = BOP_MOODS.map(([m, n, s]) => `<button class="bop-opt wide" data-k="mood" data-v="${m}" aria-pressed="${d.mood === m}"><span>${n}</span><small>${s}</small></button>`).join('');
    else html = BOP_VOICES.map(([v, n, s]) => `<button class="bop-voice" data-k="voice" data-v="${v}" aria-pressed="${d.voice === v}" aria-label="${n}, ${s}. Plays a sample">${n}<small>${s}</small></button>`).join('')
      + `<p class="bopm-note">${this._config.bop_voices === false ? 'Voices are switched off for this screen.' : 'Tap a voice to hear it.'}</p>`;
    el.bopmPanel.dataset.tab = tab;
    el.bopmPanel.innerHTML = html;
  }
  _bopPick(k, v) {
    const d = this._bopDraft;
    if (!d) return;
    if (k === 'extras') d.extras = BOP_EXTRAS.filter((x) => (x === v ? !d.extras.includes(v) : d.extras.includes(x)));
    else if (k === 'bg' || k === 'eye' || k === 'mouth' || k === 'mood' || k === 'voice') d[k] = v;
    if (k === 'voice') this._bopSample(v, `Hello, I’m ${(d.name || '').trim() || 'your new Bop'}.`);
    this._bopDelArmed = false;
    this._renderMaker();
    if (this._el.shell.classList.contains('open')) this._openControls(true);
  }
  _copyBop() {
    const d = this._bopDraft;
    if (!d) return;
    const name = this._el.bopmInput.value.trim() || d.name;
    this._bopDraft = { ...d, extras: [...d.extras], id: this._newBop().id, name: `${name.slice(0, BOP_NAME_MAX - 2)} 2`, isNew: true };
    this._renderMaker(true);
    this._toast('A copy: change it, then Save');
  }
  async _saveBop() {
    const d = this._bopDraft;
    if (!d) return;
    const bop = cleanBop({ ...d, name: this._el.bopmInput.value });
    if (!bop) { this._toast('Give your Bop a name first'); this._el.bopmInput.focus(); return; }
    if (d.isNew && this._bopSaved().filter((b) => !BOP_PRESETS.some((p) => p.id === b.id)).length >= BOP_MAX) { this._toast(`That’s the most Bops there can be (${BOP_MAX})`); return; }
    if (!(await this._storeBop(bop))) return;
    this._openMaker(null);
    this._useBop(bop.id);
    this._toast(`Saved. ${bop.name} is on this screen now`);
  }
  async _storeBop(bop) {
    if (this._bopShared) {
      try {
        await this._hass.callWS({ type: 'echo_robot/bop_save', bop });
        const list = this._bopShared.bops.filter((b) => b && b.id !== bop.id);
        const at = this._bopShared.bops.findIndex((b) => b && b.id === bop.id);
        list.splice(at < 0 ? list.length : at, 0, bop);
        this._bopShared.bops = list; // the add-on sends the new list too
        return true;
      } catch (err) {
        this._toast('Couldn’t save the Bop. Try again in a moment');
        return false;
      }
    }
    const list = this._bopLocal().filter((b) => b && b.id !== bop.id), at = this._bopLocal().findIndex((b) => b && b.id === bop.id);
    list.splice(at < 0 ? list.length : at, 0, bop);
    this._bopLocalList = list;
    try { localStorage.setItem(BOP_LOCAL_KEY, JSON.stringify(list)); } catch (err) { /* kept for this visit */ }
    return true;
  }
  // Delete a Bop that was made, or put a ready-made one back how it started. Asks once more first.
  async _deleteBop() {
    const d = this._bopDraft;
    if (!d) return;
    if (!this._bopDelArmed) { this._bopDelArmed = true; this._renderMaker(); return; }
    this._bopDelArmed = false;
    const preset = BOP_PRESETS.some((p) => p.id === d.id);
    if (this._bopShared) {
      try {
        await this._hass.callWS({ type: 'echo_robot/bop_delete', bop_id: d.id });
        this._bopShared.bops = this._bopShared.bops.filter((b) => b && b.id !== d.id);
      } catch (err) { this._toast('Couldn’t do that. Try again in a moment'); this._renderMaker(); return; }
    } else {
      this._bopLocalList = this._bopLocal().filter((b) => b && b.id !== d.id);
      try { localStorage.setItem(BOP_LOCAL_KEY, JSON.stringify(this._bopLocalList)); } catch (err) { /* kept for this visit */ }
    }
    this._applyBop();
    if (preset) { this._bopDraft = { ...this._bopOf(d.id), extras: [...this._bopOf(d.id).extras] }; this._renderMaker(true); this._toast(`${this._bopDraft.name} is back to how it started`); return; }
    this._openMaker(null);
    if (this._el.shell.classList.contains('bops-open')) this._renderBops();
    this._toast(`${d.name} is gone`);
  }
  // The shared list, from the echo_robot add-on. Without it (an older add-on), Bops stay on this screen.
  _watchBops() {
    const conn = this._hass && this._hass.connection;
    if (this._bopSub || this._bopsMissing || !conn || typeof conn.subscribeMessage !== 'function') return;
    this._bopSub = conn.subscribeMessage((d) => this._gotBops(d), { type: 'echo_robot/bops' }).catch((err) => {
      this._bopSub = null;
      this._bopsMissing = true;
      if (!err || err.code !== 'unknown_command') {
        clearTimeout(this._bopRetryT);
        this._bopRetryT = setTimeout(() => { this._bopsMissing = false; this._watchBops(); }, 30000);
      }
      return null;
    });
  }
  _stopBops() {
    const sub = this._bopSub;
    this._bopSub = null;
    this._bopsMissing = false;
    clearTimeout(this._bopRetryT);
    if (sub) sub.then((unsub) => { if (typeof unsub === 'function') unsub(); }).catch(() => {});
  }
  _gotBops(d) {
    if (!d || !Array.isArray(d.bops)) return;
    this._bopShared = { bops: d.bops, chosen: d.chosen && typeof d.chosen === 'object' ? d.chosen : {} };
    this._bopMoveLocal();
    this._applyBop();
    if (this._el.shell.classList.contains('bops-open')) this._renderBops();
    if (this._bopDraft && this._el.shell.classList.contains('bopm-open')) this._renderMaker();
  }
  // Bops made on this screen before the add-on could keep them are handed over to it, once.
  _bopMoveLocal() {
    const local = this._bopLocal().map(cleanBop).filter(Boolean).filter((b) => !this._bopShared.bops.some((s) => s && s.id === b.id));
    if (!local.length || this._bopMoving) return;
    this._bopMoving = true;
    Promise.all(local.map((bop) => this._hass.callWS({ type: 'echo_robot/bop_save', bop })))
      .then(() => { this._bopLocalList = []; try { localStorage.removeItem(BOP_LOCAL_KEY); } catch (err) { /* nothing to tidy */ } })
      .catch(() => {})
      .finally(() => { this._bopMoving = false; });
  }
  // The device a spoken request comes from, if this screen is that device's own screen. A PC view (talk mode) borrows
  // the Echo's, so it doesn't speak for it, unless it has a talk_device of its own.
  _bopDevice() {
    if (this._config.talk) return this._config.talk_device || null;
    const ent = this._hass && this._hass.entities && this._hass.entities[this._config.satellite];
    return (ent && ent.device_id) || null;
  }
  // Tells the add-on this device's Bop, so the assistant talks in its personality (see echo_robot/bops.py).
  _bopTellServer() {
    const device = this._bopDevice(), b = this._bopChosen();
    if (!this._bopShared || !device || !b) return;
    const want = { id: b.id, name: b.name, mood: b.mood, voice: b.voice };
    const has = this._bopShared.chosen[device];
    if (has && ['id', 'name', 'mood', 'voice'].every((k) => has[k] === want[k])) { this._bopTold = null; return; }
    const key = device + JSON.stringify(want);
    if (this._bopTold === key) return; // sent: waiting for the add-on's answer
    this._bopTold = key;
    this._hass.callWS({ type: 'echo_robot/bop_use', device_id: device, bop: want }).catch(() => { this._bopTold = null; });
  }
  // The Echo's "Assistant" choice: a select on the satellite's own device whose options are the voice assistants.
  _bopAssistantSelect() {
    const ents = this._hass && this._hass.entities;
    if (!ents) return null;
    if (this._bopSelectFor === ents) return this._bopSelect;
    const sat = ents[this._config.satellite], ids = sat && sat.device_id ? Object.keys(ents).filter((id) => id.startsWith('select.') && ents[id].device_id === sat.device_id) : [];
    const listsAssistants = (id) => { const o = this._state(id)?.attributes?.options; return Array.isArray(o) && o.includes('preferred'); };
    this._bopSelectFor = ents;
    this._bopSelect = ids.find((id) => /_(assistant|pipeline)$/.test(id) && listsAssistants(id)) || ids.find(listsAssistants) || null;
    return this._bopSelect;
  }
  // Home Assistant keeps the voice inside the voice assistant (pipeline). So each voice gets its own copy of this Echo's
  // assistant, the same in every way but the voice, named "<assistant> · <Voice>". The original is the one without it.
  async _bopPipelines() {
    const r = await this._hass.callWS({ type: 'assist_pipeline/pipeline/list' });
    const list = r.pipelines || [], select = this._bopAssistantSelect();
    const chosen = select ? this._state(select)?.state : null;
    const current = (chosen && chosen !== 'preferred' && list.find((p) => p.name === chosen)) || list.find((p) => p.id === r.preferred_pipeline) || list[0];
    const m = current && current.name.match(/^(.*) · (\w+)$/);
    const base = (m && BOP_VOICES.some(([, n]) => n === m[2]) && list.find((p) => p.name === m[1])) || current;
    return { list, base, current, preferred: r.preferred_pipeline, select, chosen };
  }
  async _bopSample(voice, text) {
    try {
      const { base } = await this._bopPipelines();
      if (!base || !base.tts_engine) throw new Error('no voice service');
      const r = await this._hass.callApi('POST', 'tts_get_url', { engine_id: base.tts_engine, message: text, language: base.tts_language || base.language, options: { voice } });
      const url = r && (r.path && this._hass.hassUrl ? this._hass.hassUrl(r.path) : r.url);
      if (!url) throw new Error('no sound');
      if (this._bopAudio) this._bopAudio.pause();
      this._bopAudio = new Audio(url);
      await this._bopAudio.play();
    } catch (err) {
      this._toast('Couldn’t play that voice here');
    }
  }
  // Switches this Echo to the copy of its assistant with its Bop's voice, making or refreshing the copy first.
  // Only on the Echo's own screen, only for an admin login, and only if its voice service has that voice.
  async _bopVoice() {
    if (this._config.bop_voices === false || this._config.talk || !this._hass.user || !this._hass.user.is_admin) return;
    const b = this._bopChosen();
    if (!b || !this._bopAssistantSelect()) return;
    const key = b.voice; // only when the Bop's voice changes (and once on opening), so a hand-picked assistant isn't fought over
    if (key === this._bopVoiceKey) return;
    if (this._bopVoiceBusy) { this._bopVoiceAgain = true; return; }
    this._bopVoiceBusy = true;
    this._bopVoiceKey = key;
    try {
      const p = await this._bopPipelines();
      if (!p.base || !p.base.tts_engine) return;
      let target = p.base;
      if (p.base.tts_voice !== b.voice) {
        const { voices } = await this._hass.callWS({ type: 'tts/engine/voices', engine_id: p.base.tts_engine, language: p.base.tts_language || p.base.language });
        if (!Array.isArray(voices) || !voices.some((v) => v.voice_id === b.voice)) return; // this voice service hasn't got it
        const voiceName = (BOP_VOICES.find(([v]) => v === b.voice) || [])[1];
        if (!voiceName) return;
        const fields = {};
        for (const k of ['conversation_engine', 'conversation_language', 'language', 'stt_engine', 'stt_language', 'tts_engine', 'tts_language', 'wake_word_entity', 'wake_word_id', 'prefer_local_intents']) if (k in p.base) fields[k] = p.base[k];
        fields.tts_voice = b.voice;
        const name = `${p.base.name} · ${voiceName}`;
        target = p.list.find((x) => x.name === name);
        if (!target) target = await this._hass.callWS({ type: 'assist_pipeline/pipeline/create', name, ...fields });
        else if (Object.keys(fields).some((k) => target[k] !== fields[k])) target = await this._hass.callWS({ type: 'assist_pipeline/pipeline/update', pipeline_id: target.id, name, ...fields });
      }
      const option = target.id === p.preferred ? 'preferred' : target.name; // back to the original: as it was set up
      if (p.chosen !== option) {
        // A new copy takes a moment to appear in the Echo's list of assistants.
        for (let i = 0; i < 12 && !(this._state(p.select)?.attributes?.options || []).includes(option); i++) await new Promise((ok) => setTimeout(ok, 250));
        await this._hass.callService('select', 'select_option', { entity_id: p.select, option });
        // The words are read from the assistant's own record, so start reading the new one afresh.
        this._pipeline = null;
        this._priming = null;
        this._seenRun = undefined;
      }
    } catch (err) {
      console.info('Echo robot: couldn’t switch to the Bop’s voice.', err && (err.message || err.code || err));
    } finally {
      this._bopVoiceBusy = false;
      if (this._bopVoiceAgain) { this._bopVoiceAgain = false; this._bopVoiceKey = null; this._bopVoice(); }
    }
  }
}
EchoHomeCard.classify = classify;
EchoHomeCard.readRun = readRun;
EchoHomeCard.artPalette = artPalette;
EchoHomeCard.lyricLines = lyricLines;
EchoHomeCard.lyricAt = lyricAt;
EchoHomeCard.lyricReaction = lyricReaction;
EchoHomeCard.reactionList = REACTIONS;
EchoHomeCard.idleList = IDLES;
EchoHomeCard.skits = SKITS;
EchoHomeCard.playMoments = PLAY_MOMENTS;
EchoHomeCard.openers = OPENERS;
EchoHomeCard.firstSpokenLength = firstSpokenLength;
EchoHomeCard.speechWaitSeconds = speechWaitSeconds;
EchoHomeCard.homeMoments = ['homeArrive', 'homeHeat', 'homeMorning', 'homeYawn', 'homeDrowsy', 'homeNodOff'];
if (!customElements.get('echo-home-card')) customElements.define('echo-home-card', EchoHomeCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'echo-home-card', name: 'Echo Robot', description: 'A full-screen robot that reacts to your voice, with controls behind a tap.' });
