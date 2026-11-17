# Notices

Two windows can appear on Stremio Web. Both are written in JSON files you control.

| Window | File | Where it lives | When it shows |
| --- | --- | --- | --- |
| New version | `notice.json` + its picture | Attached to the GitHub release as assets | When a newer version is the **latest** release. On two different days, at most. "Download" stops it for that version. |
| What's new | `whats-new.json` + its picture | Inside `extension/` (ships with the extension) | Once, after the extension is updated (not after a first install). |

The files in this folder are the source copies of the release assets. Editing them, or anything else on `main`, does not reach users: only the files attached to the published release do. Drafts and pre-releases are never read.

## File format

```json
{
  "version": "1.3.0",
  "image": "notice.png",
  "en": { "title": "Short title", "text": "Text" },
  "ar": { "title": "عنوان قصير", "text": "نص" }
}
```

- `image` is optional. For `notice.json` it is the name of another asset in the same release (1.5 MB at most). For `whats-new.json` it is a file in `extension/`. Any shape works: the window follows the picture's size. A 2:1 picture (for example 1280×640) looks best.
- The text is Arabic (right to left) when the Stremio interface language is Arabic, English for every other language. If `ar` is missing, English is shown.
- `text`: a blank line starts a new paragraph, lines starting with `- ` are a list, and `**bold**`, `` `code` `` and `[link](https://...)` work. Nothing else is read as formatting.

## Publishing a new version

1. Edit `notices/notice.json` and its picture. Check them on the test page: `test/notice-preview.html`.
2. Create the release and attach `notice.json` and the picture next to the extension zip.
3. To fix a mistake later, replace the attached file. Extensions check again within 12 hours.
