# Instructions for AI agents

You're helping someone install or update **Beepbot**, a robot face for a Home Assistant screen, in their own home. This file tells you what to do, in order, and what not to do. The person-facing guides are [README.md](README.md) and [docs/VOICE-AND-MUSIC.md](docs/VOICE-AND-MUSIC.md). When this file and the person disagree, the person wins.

## Ground rules

- **Ask before anything hard to undo:** restarting Home Assistant, deleting files, changing `configuration.yaml`, changing their voice assistant, or installing new services. Say what will change first.
- **Back up before editing.** Copy `configuration.yaml` (and any file you change) before touching it.
- **Never print, log, commit or paste secrets:** Home Assistant tokens, API keys, passwords, `secrets.yaml`, or anything in `.storage/`. If you need a key, ask the person to enter it themselves in Home Assistant's own settings page, or to put it in `secrets.yaml`.
- **Don't publish their details.** Their dashboard holds the names of their people, rooms and devices. Never put it in this repository, an issue or a pull request.
- **Keep home services at home.** Never forward speech, voice or Music Assistant ports through the router, and leave Music Assistant's "Remote Access" off unless they ask.
- **Cloud AI is the person's choice.** With a cloud AI, what they say is sent to that company as text. Tell them before you set one up.
- **Don't guess entity names.** Read them from Home Assistant (**Developer Tools > States**, or its API if they've given you access).
- **Test each part before the next.** Most problems come from skipping a step.

## What Beepbot is made of

| Part | Where | How it updates |
|---|---|---|
| The integration (`echo_robot`): timers, reminders, alarms, lyrics, photos, phrases, and the cards | `custom_components/echo_robot/`, installed by HACS | HACS **Update**, then restart Home Assistant |
| The robot card `custom:echo-home-card` and the iPad/iPhone card `custom:echo-mobile-card` | Served by the integration at `/echo_robot/`, added to dashboard resources by itself | With the integration |
| Spoken phrases for reminders, alarms and weather | Copied by the integration into `custom_sentences/en/`, first line marked "Managed by the Beepbot integration" | With the integration |
| The dashboard | The person's own dashboard configuration | By hand |
| Music, radio and weather scripts and automations ([assistant/](assistant/)) | Pasted into Home Assistant | By hand, when a release says they changed |
| AI instructions ([assistant/grok-instructions.txt](assistant/grok-instructions.txt)) | The conversation agent's settings | By hand |
| Speech recognition, voices, Music Assistant | Add-ons, or Docker on their server | By hand |

The internal name is still `echo_robot` (from before it was called Beepbot). Don't rename it: stored reminders, the card's type and its web addresses depend on it.

## Step 1: check what they have

Find out, and tell the person anything missing:

1. **Home Assistant version:** 2026.10 or newer (**Settings > About**). Also note whether it's **Home Assistant OS/Supervised** (has an add-on store) or **Container** (Docker, no store). That decides how you install services later.
2. **HACS** is installed. If not, point them to [hacs.xyz](https://hacs.xyz) and stop until it is.
3. **A voice device** (an `assist_satellite.*` entity). The robot was made for an Echo Show 5 running Home Assistant. Turning an Echo into one isn't covered here: if they haven't, say so and stop.
4. **A screen** showing a Home Assistant dashboard (the Echo itself, a tablet or a PC browser). Tested at 960 by 470 with Chromium 118 or newer.
5. **Could they have an older copy?** Look for `custom_components/echo_lyrics`, a `custom_components/echo_robot` folder that HACS doesn't list as installed, `www/echo-ui/echo-home-card.js`, or `echo_lyrics:` in `configuration.yaml`. If so, do **Step 2** first. If the house was set up with a private `install.py` script instead of HACS, don't install this as well: ask the person which one they want.

## Step 2: move over from a hand-installed copy (only if Step 1 found one)

Their dashboard, reminders, alarms and on-screen settings are kept. With their OK:

1. Back up `configuration.yaml`.
2. Delete the folders `custom_components/echo_lyrics` and `custom_components/echo_robot`.
3. Delete `custom_sentences/en/echo_speech.yaml`, `echo_reminders.yaml` and `echo_alarms.yaml` if present. The integration writes fresh, managed copies. (It leaves unmarked files alone, so old copies would otherwise stay.)
4. Remove the `echo_lyrics:` line from `configuration.yaml`. An `echo_robot:` section can stay: its settings are used, and the settings page is then turned off.
5. Leave the old resource `/local/echo-ui/echo-home-card.js` alone. The integration moves it over to the new card by itself, and removes a second copy of the same card. After everything works, `www/echo-ui/echo-home-card.js` can be deleted.

## Step 3: install

1. HACS > three-dot menu > **Custom repositories**: add `https://github.com/zephyrbyt/beepbot`, type **Integration**.
2. Find **Beepbot** in HACS, **Download**.
3. Restart Home Assistant (ask first).
4. **Settings > Devices & services > Add integration > Beepbot**. The settings page asks:

   | Setting | What to choose |
   |---|---|
   | Say reminders and alarms on | Their voice device (filled in if there's only one) |
   | Wake-up lights | Bedroom lights to fade up before an alarm, or none |
   | Wake-up light fade | Minutes, 15 by default, 0 for none |
   | Lyrics | On unless they don't want song details sent to lyrics services |
   | Lyrics sources | **All** (more word-by-word lyrics, includes unofficial services) or **Open only** (LRCLIB) |
   | Understand reminder and alarm requests on this server | On, so those requests don't go to a cloud AI |

   Or, instead, in `configuration.yaml` (then restart):

   ```yaml
   echo_robot:
     announce: [assist_satellite.their_device]
     wake_lights: [light.their_bedroom]
     wake_minutes: 15
     lyrics: true
     lyrics_sources: all      # or open
     phrases: true
   ```

   Settings changed later apply after a restart; Home Assistant shows a reminder.

## Step 4: the dashboard

1. **Settings > Dashboards > Add dashboard**, from scratch. Open it, edit, three-dot menu, **Raw configuration editor**.
2. Paste [examples/dashboard.yaml](examples/dashboard.yaml) and fill in real entity names. The voice device's entities usually share one start, for example:

   | Card setting | Entity | Example |
   |---|---|---|
   | `satellite` | the voice device | `assist_satellite.kitchen_echo_assist_satellite` |
   | `mute` | its microphone switch | `switch.kitchen_echo_mute` |
   | `wake_word` | its wake word choice, if any | `select.kitchen_echo_wake_word` |
   | `timer_ringing` | its timer-ringing sensor | `binary_sensor.kitchen_echo_timer_ringing` |
   | `stop_ringing` | its stop button | `button.kitchen_echo_stop_ringing` |
   | `weather` | their weather | `weather.forecast_home` |
   | `player` | a speaker to control when nothing else plays | `media_player.kitchen` |
   | `lights` | the lights for the tap menu, each with a short `name` | |

   Every other setting is optional; the defaults are at the top of `custom_components/echo_robot/www/echo-home-card.js` (`const DEFAULTS`). Many can also be changed on the screen itself, from the cog in the tap menu, and are then saved on that screen.
3. Point the screen at the dashboard and refresh it.
4. **The screen should log in as an admin user.** The card reads the words spoken from Home Assistant's voice debug data, which only admins can read. Without that it still works, but can't show or react to what was said. Explain this and let the person decide.
5. **iPad or iPhone (optional):** another dashboard from [examples/robot-home.yaml](examples/robot-home.yaml), in the Home Assistant app.
6. **A PC (optional):** the second page in the dashboard example, explained in [docs/PC.md](docs/PC.md).

## Step 5: check it worked

- Home Assistant's log (**Settings > System > Logs**) has no errors mentioning `echo_robot` or Beepbot. (Its start-up lines are at info level, so they only show if the logger is set to info for `custom_components.echo_robot`.)
- **Settings > Dashboards > Resources** lists `/echo_robot/echo-home-card.js?v=...` once, and `/echo_robot/echo-mobile-card.js?v=...`. If their resources are kept in YAML, there are none: the cards load on every page instead, which is fine.
- `/api/echo_robot` and `/api/echo_lyrics` answer **401** without a login (running, and rightly asking for one). **404** means that part didn't start: check the log.
- The screen shows the robot. Say "What time is it?" to the voice device and watch it listen, think and talk.
- Say "Set a timer for 2 minutes", then "Remind me to stretch in 3 minutes". Both should show on the screen.
- Play music on any player Home Assistant knows about: the cover and title show, with lyrics if found.

## Step 6: voice (if it isn't working yet)

The robot needs speech recognition, a voice, and an assistant using them. Full details, timings and Docker commands are in [docs/VOICE-AND-MUSIC.md](docs/VOICE-AND-MUSIC.md). In short:

- **Speech recognition:** Whisper is the simplest (add-on store, or Docker `rhasspy/wyoming-whisper`). Parakeet was about five times quicker on the test server, but a little less accurate with names. Both run at home.
- **Voice:** Piper (add-on or `rhasspy/wyoming-piper`). For the friendlier Fable voice, Kokoro plus the connector in [voice/](voice/), which falls back to Piper. Kokoro needs about 3 GB of memory and takes a few seconds per reply, so set `speech_wait: true` on the card.
- Each is added through the **Wyoming Protocol** integration, then chosen under **Settings > Voice assistants**. Assign that assistant to their voice device.
- These services have no password: keep their ports inside the home.

## Step 7: AI replies (optional)

Home Assistant's built-in assistant only understands set phrases. A chat AI copes with natural wording. Whichever they choose:

1. Add the conversation integration and let the person enter their own key in its settings page. Choices (names can change, so check Home Assistant's integration list):

   | AI | How |
   |---|---|
   | OpenAI (ChatGPT) | Home Assistant's built-in **OpenAI** integration |
   | Anthropic (Claude) | Built-in **Anthropic** integration |
   | Google (Gemini) | Built-in **Google Generative AI** integration |
   | A local model | Built-in **Ollama** integration (nothing leaves the home, needs a capable server) |
   | Grok (xAI) and others | If Home Assistant has no built-in integration for it, use an OpenAI-compatible proxy such as LiteLLM with a conversation integration that accepts a custom address. Keep the proxy on the home network, and its key out of every file you share. |

2. In the agent's settings, allow it to **control Home Assistant** (the "Assist" option). Without it, it can't switch anything, and can't use Beepbot's reminder and alarm tools, which it gets through that option.
3. Paste [assistant/grok-instructions.txt](assistant/grok-instructions.txt) into the agent's instructions (it isn't Grok-specific). It keeps replies short and easy to read aloud.
4. **Pick a fast model without "reasoning".** On the test server, a non-reasoning Grok model answered in 0.6 seconds against 6.9 for a reasoning one. Every second counts when talking.
5. **Settings > Voice assistants:** set the assistant's conversation agent to it and turn on **Prefer handling commands locally**, so timers, lights and Beepbot's reminder phrases stay quick and at home.
6. Under **Expose**, share only what the AI should see and control. That includes the weather entity and the scripts from Step 8.
7. Optional: create the script in [assistant/weather-forecast-script.yaml](assistant/weather-forecast-script.yaml) (change `weather.forecast_home` if theirs differs) and expose it, so "will it rain tomorrow?" works.

## Step 8: music and radio on the screen (optional)

- **Spotify alone** (built-in Spotify integration, Premium needed) lets the robot show and control what's playing elsewhere, but not play on the screen.
- **Music Assistant** plays on the screen. Install it (add-on, or Docker `ghcr.io/music-assistant/server` on the host network), create its admin login at once, add Spotify and **Radio Browser** as providers, pair the Echo (Sendspin pairing token entity), then add the **Music Assistant** integration in Home Assistant.
- Paste the files in [assistant/](assistant/), after replacing `media_player.echo_show_example` with their screen's Music Assistant player:
  - `play-music-script.yaml` as a **script**, exposed to the AI;
  - `play-shortcut-automation.yaml` as an **automation** ("play X by Y" without the AI);
  - `play-radio-script.yaml` as a **script**, exposed to the AI. Add their local stations under `stations` and set `favourite`;
  - `play-radio-automation.yaml` as an **automation** ("play Heart" without the AI).
- Scripts go in the script editor and automations in the automation editor (**Edit in YAML**). The error "not a valid option at 'triggers'" means an automation went into the script editor.
- If songs won't play or are slow, the usual cause is Spotify limiting Music Assistant's shared login: see "Your own Spotify client ID" in the voice and music guide.

## Optional extras

- **Photos:** an idle slideshow from one album in their own Immich. YAML only, with the key in `secrets.yaml` (ask the person to add it):

  ```yaml
  echo_robot:
    photos:
      album: Echo Show
      api_key: !secret echo_photos_immich_key
      url: http://127.0.0.1:2283
  ```

  The key needs only Immich's `album.read` and `asset.view`. An Immich address outside the home network is refused. An `echo_robot:` section turns the settings page off, so if they set Beepbot up on the settings page, move those settings into this section too (see Step 3), delete the Beepbot entry under **Settings > Devices & services**, then restart (in that order: deleting the entry takes the cards out until the next start).
- **Lyrics timing:** if lyrics run early or late, `lyrics_offset` (seconds) on the card, or the Earlier/Later buttons on the screen.
- **Your own trigger words:** the `REACTIONS` table in the card. Updates replace that file, so suggest a pull request.

## Updating

HACS shows updates under **Settings > Updates**. Update, restart Home Assistant (ask first), then refresh the screens. Read the release notes: if a file in [assistant/](assistant/) changed, paste it again. Nothing else needs doing.

## Removing

Delete Beepbot under **Settings > Devices & services**. It takes its cards out of the dashboard resources and its marked phrase files out of `custom_sentences/en`; the rest stops at the next restart. Then remove it in HACS. Their dashboard and pasted scripts stay until they delete them.

## Common problems

| What happens | Likely cause |
|---|---|
| "Voice is offline" on the screen | Wrong `satellite`, or no assistant assigned to the voice device |
| The robot never shows the words said | The screen isn't logged in as an admin |
| Old design still shows after an update | The screen kept its old copy: refresh it, or clear the screen browser's cache |
| "Custom element doesn't exist: echo-home-card" | Integration not set up yet (Step 3), or resources kept in YAML and the page needs a refresh |
| Reminder requests go to the AI and are slow | "Prefer handling commands locally" is off, or the integration's "Understand reminder and alarm requests" setting is off |
| The AI says it can't play music | The music script or the player isn't exposed |
| Integration error "echo_lyrics not found" | An old `echo_lyrics:` line is still in `configuration.yaml` |
| More in the voice and music guide | [docs/VOICE-AND-MUSIC.md](docs/VOICE-AND-MUSIC.md) |

## Changing the code

The integration's own files are in `custom_components/echo_robot/` (`__init__.py`, `config_flow.py`, `frontend.py`, `sentences.py`). The parts are in `robot/`, `lyrics/` and `photos/`, and the cards in `www/`. The card must run on Chromium 118 (no CSS nesting or newer syntax). Keep changes general, with no names, addresses or devices from any one home, and send them as a pull request. This project is under [PolyForm Noncommercial 1.0.0](LICENSE).
