// Builds the "notice tester" Chrome extension from the current files, so it always shows
// exactly what users will see. Run:  node test/notice-tester/build.js
// Output: _private/notice-tester/ (not published). Load it with "Load unpacked", then press
// the reload icon on it in chrome://extensions after every rebuild.
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..', '..');
const out = path.join(repo, '_private', 'notice-tester');
const from = (...p) => path.join(repo, ...p);

const notice = JSON.parse(fs.readFileSync(from('notices', 'notice.json'), 'utf8'));
const whatsNew = JSON.parse(fs.readFileSync(from('extension', 'whats-new.json'), 'utf8'));
if (notice.image && whatsNew.image && notice.image === whatsNew.image) {
  throw new Error('notice.json and whats-new.json use the same picture name; rename one of them');
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });

const copy = (src, name) => fs.copyFileSync(src, path.join(out, name || path.basename(src)));
copy(from('extension', 'notice.js'));
copy(from('test', 'notice-tester', 'tester.js'));
copy(from('notices', 'notice.json'));
copy(from('extension', 'whats-new.json'));
if (notice.image) copy(from('notices', notice.image));
if (whatsNew.image) copy(from('extension', whatsNew.image));
for (const size of [16, 32, 48, 128]) copy(from('extension', 'icons', `icon${size}.png`), path.join('icons', `icon${size}.png`));

const sites = ['https://web.stremio.com/*'];
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  manifest_version: 3,
  name: 'TEST - Play in PotPlayer notices',
  version: '0.0.1',
  description: 'Test only. Buttons on Stremio Web that show the update and What\'s new notices in English and Arabic.',
  icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  content_scripts: [{ matches: sites, js: ['notice.js', 'tester.js'], run_at: 'document_idle' }],
  web_accessible_resources: [{ resources: ['*.json', '*.png', '*.jpg', '*.jpeg', '*.webp', '*.gif', '*.svg'], matches: sites }],
}, null, 2) + '\n');

console.log('Built', out);
console.log(fs.readdirSync(out).join(', '));
