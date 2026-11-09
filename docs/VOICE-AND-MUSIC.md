# Setting up voice and music

The robot needs a voice device and a working voice assistant in Home Assistant. Everything else here is optional. Work through it in order, and test each part before moving on.

**How far you can trust these steps:**

- Timings and test results come from one small home server (Intel i5-6500T, 16 GB of memory). Yours will differ.
- Steps marked **Not tested as written** are based on each project's documentation, and weren't run in exactly this form. Menus and options also change, so if something doesn't match, check that project's own documentation.

## Which Home Assistant do you have?

Go to **Settings > About**.

- **Home Assistant OS or Supervised:** you have an add-on store (newer versions may call add-ons "Apps"). This is the easy route.
- **Home Assistant Container:** there's no add-on store, so you run each service in Docker yourself.

## 1. Speech recognition and a voice

You need something to turn speech into text, and something to read replies aloud. Everything in this section runs at home.

### With the add-on store

1. Install **Whisper** and **Piper** from the store, and start both.
2. Go to **Settings > Devices & services**. They should appear to be set up through the **Wyoming Protocol** integration.

### With Docker

**Not tested as written.**

```bash
docker run -d --name whisper --restart unless-stopped -p 10300:10300 -v /path/to/whisper-data:/data \
  rhasspy/wyoming-whisper --model small-int8 --language en --beam-size 1
```

```bash
docker run -d --name piper --restart unless-stopped -p 10200:10200 -v /path/to/piper-data:/data \
  rhasspy/wyoming-piper --voice en_GB-alan-medium
```

Then, for each one, go to **Settings > Devices & services > Add integration > Wyoming Protocol**. Use your server's network address and the port above. `localhost` often won't work when Home Assistant is in its own container.

**Keep these ports inside your home.** These services have no password, so never forward them through your router.

### Create the assistant

1. Go to **Settings > Voice assistants** and add an assistant, or edit the one you have.
2. Set **Speech-to-text** to Whisper and **Text-to-speech** to Piper.
3. Assign the assistant to your voice device, then ask it "What time is it?".

## 2. Choosing speech recognition

The biggest delay is usually here. These are the two options tested, using the same 72 recordings of everyday requests made by computer voices:

| | Whisper `small-int8` | Parakeet |
|---|---|---|
| **Time to recognise a short request** | About 2.7 seconds | About 0.5 seconds |
| **Clear audio, word-perfect** | 70 of 72 | 61 of 72 |
| **Quiet, noisy audio, word-perfect** | 26 of 72 | 33 of 72 |
| **Memory in use** | About 0.9 GB | About 1.25 GB |

- **Most of Parakeet's misses were harmless:** "Tolliver" for "Toliver", or "lights" for "light". It did also hear "Golden Brown" as "gold and brown" once, so it may struggle more with song and artist names.
- **Whisper's time barely changes with how long you talk.** Lowering its beam size from 5 to 1 hardly helped, so changing its settings won't fix the delay.
- **These were computer voices.** How each one hears you across a room is the test that counts.
- **Start with Whisper.** It's the simplest to set up. Try Parakeet if it feels slow.

### Trying Parakeet

**Not tested as written.** This image and these options ran fine on the test server, but through `server-scripts/try-parakeet.py`, which downloads the model first and locks everything down. You can read that script for the stricter version.

```bash
docker run -d --name parakeet --restart unless-stopped --log-driver none -p 10301:10300 -v /path/to/parakeet-data:/data \
  ghcr.io/tboby/wyoming-onnx-asr@sha256:9b2ccdd52c7aa83e36a2d674de749c4c01bd6bb1e23ea45dd85befb9fc013340 \
  --uri tcp://0.0.0.0:10300 --model-en nemo-parakeet-tdt-0.6b-v2 -q int8
```

- The first start downloads a model of about 660 MB, so give it a few minutes.
- `--log-driver none` matters, because by default it writes everything it hears to its log.
- It was left hanging for 30 minutes on one locked-down first start, with temporary space limited to 128 MB. That was never confirmed as the cause, but if the download seems stuck, check its log and that limit.
- It has no setting for a list of expected words, as far as I could find. Whisper does, through `--initial-prompt`.

Add it through the **Wyoming Protocol** integration on port `10301`, then choose it under **Speech-to-text** in your assistant. To go back, choose Whisper again.

## 3. A friendlier voice (optional)

The Fable voice sounds more natural than Piper, but it needs much more from your server:

| | Piper | Fable (Kokoro) |
|---|---|---|
| **Time to prepare a typical sentence** | Quick | About 2 to 4 seconds |
| **Memory in use** | Small | About 2.8 GB |

Kokoro runs at home and needs no internet once it's downloaded. To use it:

1. Run Kokoro. **Not tested as written.**

   ```bash
   docker run -d --name kokoro --restart unless-stopped -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
   ```

2. Run the connector from `voice/`, leaving Piper running as its backup:

   ```bash
   python3 voice/echo_voice_bridge.py --port 10210 --kokoro http://YOUR-SERVER:8880 --piper-host YOUR-SERVER
   ```

   It needs to keep running, so set it up as a service. `server-scripts/install-fable.py` shows how.

3. Add **Wyoming Protocol** with host `127.0.0.1` and port `10210`, then choose it in your assistant, with the voice set to **Fable**.

**The catch:** the connector only listens on its own machine. That suits Home Assistant running on the same computer with Docker's host network. For anything else, you'd need to change the `127.0.0.1` near the end of `echo_voice_bridge.py`, and keep that port inside your home.

Fable takes a few seconds to prepare each reply, so the words would appear on screen before you hear them. To keep them together, add `speech_wait: true` to the card's settings. If the words still come first, raise `speech_wait_adjust` by a second or so, or lower it if they come after. The timings behind this were measured on the test server, so a faster or slower server will need adjusting.

The connector keeps short phrases it has already said in memory, never on disk, so repeats like "Turned on the light." start instantly. It also has eight short openers ready, like "Sure thing.". These were tried as a way to start talking sooner, but they weren't worth it: they can only play once the AI has finished, so "Let me see." sounds silly when the answer is already there.

As well as Fable, it also has George, Emma and Heart. It splits long sentences at commas so it can start speaking sooner, and it tidies up things that sound wrong read aloud, like "11°C".

## 4. A smarter assistant (optional)

Home Assistant's built-in assistant understands set phrases, and misses quite a lot. A chat AI copes much better with natural wording.

**Privacy:** with a cloud AI, what you say is sent to that company as text. Speech recognition still happens at home, so your actual voice stays home.

1. Add an AI conversation integration in Home Assistant. This project used Grok, through a local LiteLLM proxy, but others should work too. You'll need your own account and key. Keep the key out of this repository.
2. In **Settings > Voice assistants**, set your assistant's **Conversation agent** to it, and turn on **Prefer handling commands locally**. Simple commands then stay at home and run faster.
3. Paste [`assistant/grok-instructions.txt`](../assistant/grok-instructions.txt) into its instructions. It makes replies short, friendly and easy to read aloud.
4. **Pick a fast model.** This made a big difference on the test server: a plain test question took `grok-4.3` 6.9 seconds to its first word, and `grok-4.20-0309-non-reasoning` 0.6. "Reasoning" models think before answering, which a home assistant rarely needs. Model names change, so check what's on offer.
5. Under **Settings > Voice assistants > Expose**, share what you want it to control. It can only see what you share here, and that includes the weather.

### Weather forecasts

The assistant may only see the current weather. To let it answer "will it rain tomorrow?":

1. Create a new script from [`assistant/weather-forecast-script.yaml`](../assistant/weather-forecast-script.yaml). If yours isn't called `weather.forecast_home`, change that first.
2. Share the script with the assistant under **Expose**.

## 5. Spotify

Link Spotify using Home Assistant's own **Spotify** integration. The robot finds it by itself and shows the cover, album colours, lyrics and buttons. You'll need Spotify Premium to control playback.

**This doesn't make music come out of the screen.** It controls Spotify on your other devices. To play on the screen itself, you need Music Assistant.

## 6. Music on the screen with Music Assistant (optional)

**Privacy:** Music Assistant looks up artist details on services like Wikipedia, MusicBrainz and Last.fm. **Leave its "Remote Access" setting off** to keep it home-only.

### Install it

With the add-on store, install **Music Assistant** from there. With Docker (**Not tested as written**, simplified from `server-scripts/install-music-assistant.py`):

```bash
docker run -d --name music-assistant --restart unless-stopped --network host -v /path/to/music-assistant-data:/data \
  ghcr.io/music-assistant/server:latest
```

It needs the host network so that speakers can find it.

### Set it up

1. **Open it straight away and create the admin login.** The first person to open it sets this. With Docker, it's at `http://YOUR-SERVER:8095`. Save the password somewhere safe.
2. In its settings, add **Spotify** as a music provider.
3. **Pair your screen.** The Echo plays through Sendspin, which comes with Music Assistant. In Home Assistant, enable the device's **Sendspin pairing token** entity, then give that token to Music Assistant when it asks. Sendspin is still in preview, and other devices may pair differently.
4. In Home Assistant, go to **Settings > Devices & services > Add integration > Music Assistant**, and sign in.
5. Check your screen shows up as a player in Music Assistant, then play something from Music Assistant's own page.

### Let the assistant play songs

Both of these use `media_player.echo_show_example`, so **change that to your screen's Music Assistant player first**.

1. **"Play music" tool:** create a new **script** from [`assistant/play-music-script.yaml`](../assistant/play-music-script.yaml), and share it under **Expose**.
2. **Quick "play X by Y" shortcut:** create a new **automation** from [`assistant/play-shortcut-automation.yaml`](../assistant/play-shortcut-automation.yaml). Requests in this form skip the AI, so they're quicker and stay at home.

Make sure the shortcut goes in as an automation and not a script.

### Radio

1. In Music Assistant's settings, add **Radio Browser** as a music provider. It's a free directory of stations at radio-browser.info: the station name you ask for is looked up there, and the sound comes from the broadcaster, as any internet radio does.
2. **"Play radio" tool:** create a new **script** from [`assistant/play-radio-script.yaml`](../assistant/play-radio-script.yaml), and share it under **Expose**. It pins the main UK stations, because Radio Browser has dozens called "Heart" something. Add your own to `stations`, and set `favourite` for "play the radio".
3. **Quick radio shortcut:** create a new **automation** from [`assistant/play-radio-automation.yaml`](../assistant/play-radio-automation.yaml). "Play Heart", "put on Radio 2" and "play Jazz FM radio" then skip the AI.

## If something goes wrong

These all came up during the original setup:

| What happens | What it was |
|---|---|
| **"Could not resolve to playable media", or no songs found** | Spotify was limiting the shared login Music Assistant uses. Adding your own Spotify client ID fixed it. |
| **A long spinner after signing in to Spotify in Music Assistant** | This was the playback pairing step. It can take a while, so give it time before retrying. |
| **Songs take a minute to start** | Often the same Spotify limit. Your own client ID helped, and turning off the import of your whole Spotify library is worth trying too. |
| **"Sorry, I can't play songs"** | The assistant couldn't see a Music Assistant player. Check it's shared under **Expose**, and that the "play music" script is too. |
| **Music plays on the wrong speaker** | Use the "play music" script and shortcut above, which name your screen directly. |
| **"not a valid option at 'triggers'"** | An automation was pasted into the script editor. |
| **It hears "plate" instead of "play"** | Speech recognition slipped. The shortcut already accepts "plate", "plays" and "played". |
| **"Play Heart" plays a song called Heart** | The radio script and shortcut aren't in yet, or Radio Browser isn't added in Music Assistant. |
| **The assistant can't see the weather** | The weather entity isn't shared under **Expose**. |
| **Lyrics run slightly early or late** | Set `lyrics_offset` in the card's settings. |
| **No words appear on the screen** | The screen needs an admin login, as the main README explains. |

### Your own Spotify client ID

1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard), with the redirect URL set to `https://music-assistant.io/callback`.
2. In Music Assistant's Spotify settings, enter the client ID, then sign in again.

**Spotify restricts this on some accounts.** The [Music Assistant documentation](https://music-assistant.io/music-providers/spotify) warns that accounts created from around 2024 may be blocked, as well as some older ones. If you see 403 errors in its log, remove the client ID. Check there first, as this may have changed.

## Sources

- [Music Assistant: Spotify](https://music-assistant.io/music-providers/spotify)
- [Music Assistant: Sendspin](https://www.music-assistant.io/player-support/sendspin)
- [Wyoming Onnx ASR, which runs Parakeet](https://github.com/tboby/wyoming-onnx-asr)
- [Home Assistant community: connecting Wyoming services](https://community.home-assistant.io/t/how-to-pick-a-port-for-wyoming-protocol/587897)
