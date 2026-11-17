# Notices

Two windows can appear on Stremio Web. Both are written in JSON files you control.

| Window | File | Where it lives | When it shows |
| --- | --- | --- | --- |
| New version | `notice.json` + its picture | This folder, on the `main` branch | When the version in `notice.json` is the **latest** published release and is newer than the installed extension. On two different days, at most. "Download" stops it for that version. |
| What's new | `whats-new.json` + its picture | Inside `extension/` (ships with the extension) | Once, after the extension is updated (not after a first install). |

The extension reads `notice.json` and its picture straight from this folder on `main`, so nothing extra is attached to the release. A notice only shows when its `version` matches the latest published release, so pushing it before the release is safe: it waits for the release. Drafts and pre-releases are never read.

## File format

```json
{
  "version": "1.4.0",
  "image": "notice.png",
  "en": { "title": "Short title", "text": "Text" },
  "ar": { "title": "عنوان قصير", "text": "نص" }
}
```

- `version` is required and must be the release's version (the tag without `v`).
- `image` is optional. For `notice.json` it is the name of a picture in this folder (`.png`, `.jpg`, `.webp` or `.gif`, 1.5 MB at most). For `whats-new.json` it is a file in `extension/`. Any shape works: the window follows the picture's size. A 2:1 picture (for example 1280×640) looks best.
- The text is Arabic (right to left) when the Stremio interface language is Arabic, English for every other language. If `ar` is missing, English is shown.
- `text`: a blank line starts a new paragraph, lines starting with `- ` are a list, and `**bold**`, `` `code` `` and `[link](https://...)` work. Nothing else is read as formatting.

## Publishing a new version

1. Edit `notices/notice.json` (set `version` to the new version) and its picture. Check them on the test page: `test/notice-preview.html`.
2. Commit and push them to `main`.
3. Publish the release with the extension zip. The notice starts showing once the release is the latest one.
4. To fix a mistake later, edit the files on `main`. Extensions check again within 12 hours.
