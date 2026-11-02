<img src="docs/images/banner.png" alt="Play in PotPlayer for Stremio" width="100%">

Play any Stremio Web stream in PotPlayer with one click.

## Requirements

- Windows
- [PotPlayer](https://potplayer.tv/) (64-bit, up to date)
- Google Chrome, or another Chromium browser such as Edge or Brave

## Install

1. Download `play-in-potplayer-for-stremio.zip` from the [latest release](https://github.com/abdallah28r/play-in-potplayer-for-stremio/releases/latest).
2. Unzip it to a folder you will keep. Chrome loads the extension from this folder, so don't delete or move it.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and select the unzipped folder.

If Stremio Web is already open, reload the page with `F5`.

## Use

This Chrome extension adds a **Play in PotPlayer** option to the right-click menu of streams on [web.stremio.com](https://web.stremio.com). Nothing else to install or configure.

1. Open a movie or episode on [web.stremio.com](https://web.stremio.com).
2. **Right-click** a stream in the list.
3. Click **Play in PotPlayer**.

<img src="docs/images/menu.png" alt="Stremio stream menu with the new Play in PotPlayer option under Play" width="387">

The first time, Chrome asks to open PotPlayer. Tick **Always allow** and click **Open**.

## Messages

The extension tells you what happened in a small message on the page.

| Message | Meaning |
| --- | --- |
| <img src="docs/images/message-opening.png" alt="Opening in PotPlayer" width="240"> | The link was sent to PotPlayer. |
| <img src="docs/images/message-not-opened.png" alt="PotPlayer did not open warning" width="420"> | The page stayed in front, so PotPlayer may not have opened. |
| <img src="docs/images/message-error.png" alt="Error message for a stream that cannot play in PotPlayer" width="420"> | This stream cannot play in PotPlayer. The message gives the reason. |

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The option is not in the menu | Reload Stremio with `F5`. Make sure you right-clicked a stream, because a left click plays it inside Stremio. |
| Nothing happens when I click it | Check that PotPlayer is installed and up to date, then try again. If you declined Chrome's prompt, reload the page and accept it. |
| PotPlayer opens but the video fails | The link may have expired, so open it again from Stremio or try another stream. |
| "Link is too long" message | The link was copied for you. Press `Ctrl+U` in PotPlayer and paste it. |
| "Needs Stremio Service" message | Install and start [Stremio Service](https://www.stremio.com/download-service), then try again. |

Streams that need custom connection headers may not play, because PotPlayer cannot receive headers through a link.

## Privacy

- No accounts, analytics, or tracking. The extension has no server and collects nothing.
- It runs only on Stremio Web. The stream link is sent only to PotPlayer on your PC, and to Stremio's local streaming server (`127.0.0.1:11470`) when a stream needs it.
- Stream links can contain private tokens from your add-ons. PotPlayer may show them in its title bar and keep them in its history, so take care when sharing screenshots.

## Legal

This project is a small launcher. It does not host, provide, index, or link to any media, and it includes no add-ons or stream sources. It does not bypass DRM or any other copy protection.

You are responsible for what you watch and for following the laws of your country and the terms of the services you use. Only play content you have the right to access.

Stremio and PotPlayer are trademarks of their respective owners and are named here only to describe compatibility.

## Acknowledgements

The request used to start streams on Stremio's local server follows the format used by [stremio-video](https://github.com/Stremio/stremio-video) (MIT License).

## License

[MIT](LICENSE)

> Unofficial project. Not affiliated with, endorsed by, or sponsored by Stremio or PotPlayer
