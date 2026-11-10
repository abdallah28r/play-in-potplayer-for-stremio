Play in PotPlayer for Stremio - Subtitles helper (optional)
===========================================================

You do not need this folder to use the extension.

By default, "Play in PotPlayer" sends only the video to PotPlayer. Subtitles from your
Stremio subtitle add-ons (OpenSubtitles, SubDL, ...) stay behind, because a link
can only carry the video.

Install this small helper if you want those subtitles in PotPlayer too:

  1. Double-click install.bat (no admin rights needed).
  2. Reload Stremio Web (F5).

That's it. "Play in PotPlayer" now opens the video together with every subtitle
in your Stremio "Default Subtitles Language". Switch between them in PotPlayer
with Alt+L.

To remove it, double-click uninstall.bat.

Keep this folder inside the extension folder. If you move the extension folder,
run install.bat again.

What it is: host.ps1 is a short PowerShell script you can read. It runs only when
you click "Play in PotPlayer". It downloads the subtitle files to your temp folder
and starts PotPlayer with them. install.bat only registers it with Chrome, Edge
and Brave for your Windows user.
