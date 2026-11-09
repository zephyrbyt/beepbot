# Server scripts: for reference

These are the scripts used to set up voice and music on one particular server. **They won't work on another setup as they are**, so read them for ideas rather than running them.

They expect Home Assistant in Docker, plus a private Docker network called `home-voice-private` holding Whisper and Piper, which isn't part of this repository. Most refuse to run if that setup isn't there. They also need `sudo`, so read each one before running anything.

| Script | What it does |
|---|---|
| `kokoro-test.py` | Tries the Kokoro voice engine, without changing anything on the screen |
| `install-fable.py` | Installs Kokoro and the connector in `../voice`, which gives the friendlier Fable voice |
| `update-voice-connector.py` | Updates only the connector, and puts the old one back if the new one can't speak |
| `upgrade-whisper.py` | Changes the Whisper speech recognition model or settings, with an undo |
| `try-parakeet.py` | Adds the Parakeet speech recogniser next to Whisper, locked down and with no internet |
| `install-music-assistant.py` | Installs Music Assistant, so "play this song" can play on the screen |
| `check-voice-speed.py` | Read-only: shows how long past requests spent listening, thinking and speaking |
