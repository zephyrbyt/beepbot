# The robot on a PC

The same robot, in a window on your computer, and you can talk to it.

## Set it up

1. Add the second page from [`examples/dashboard.yaml`](../examples/dashboard.yaml) (the one with `path: desktop`) to your dashboard. It's a hidden page, so your main screen doesn't change.
2. On your PC, open your dashboard's address with `/desktop` on the end, in **Chrome or Edge**.
3. To give it its own window and taskbar icon:
   - **Chrome:** ⋮ menu > **Cast, save and share** > **Install page as app** (or **Create shortcut** and tick **Open as window**).
   - **Edge:** ⋯ menu > **Apps** > **Install this site as an app**.

## Talk to it

- **Tap Space:** it listens until you stop talking.
- **Hold Space:** it listens until you let go.
- Or click the **microphone button** in the bottom-right corner. Press again while it's talking to stop it.

The browser asks once to use the microphone. The microphone is only on while the robot is listening. There's no wake word, so it never listens on its own.

Requests from the PC count as coming from your voice device (the `satellite` setting), so a timer set from the PC rings there too, and shows on both screens. Set `talk_device` to a different device id to change that.

## The microphone needs a secure connection

Browsers only allow a microphone on `https` pages they trust. If yours shows a certificate warning, your PC needs to trust your server's certificate first. How to do that depends on your setup. With Caddy's `tls internal`, the certificate to trust is `/data/caddy/pki/authorities/local/root.crt` inside the Caddy container.

## Settings for this page

| Setting | What it does |
|---|---|
| `talk: true` | Space and the mic button talk to it |
| `desktop: true` | Scales everything up to fill a big window |
| `chime: true` | Chimes on this screen when a timer or reminder goes off |
| `talk_device` | Which device a request counts as coming from (normally worked out from `satellite`) |
