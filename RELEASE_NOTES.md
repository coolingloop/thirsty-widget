THIRSTY takes a sip every time an AI answers you: Claude Code, Codex and web chats.

**Downloads**
- Windows 10/11: `THIRSTY-Setup.exe` (installs for your user, no admin). `THIRSTY-Portable.exe` runs without installing.
- Mac, Apple Silicon: `THIRSTY-mac-arm64.dmg`. Mac, Intel: `THIRSTY-mac-x64.dmg`.
- Chrome extension for web chats: `thirsty-extension.zip` (unzip, then Load unpacked in `chrome://extensions` with Developer mode on).

**First launch**
The apps are not code-signed yet.
- Windows: if "Windows protected your PC" appears, click **More info**, then **Run anyway**.
- Mac: open the app once, click **Done**, then **System Settings > Privacy & Security > Open Anyway**.

**Verify**
Every file here was built by this repository's release workflow from the tagged source. Compare your download with `SHA256SUMS.txt` (`certutil -hashfile THIRSTY-Setup.exe SHA256` on Windows, `shasum -a 256 THIRSTY-mac-arm64.dmg` on Mac).

The app reads your local Claude Code and Codex logs read-only, keeps counts in its own folder and talks only to 127.0.0.1. No telemetry, no account.
