// Sample notices for test/notice-preview.html. Each case has English and Arabic text.
const LONG_EN = 'This version works with both the new and the previous Stremio Web interface. The option now appears in the new menu, which Stremio opens outside the stream row.\n\n- **New:** add your own Stremio Web addresses in the settings.\n- **New:** a short notice tells you when a new version is out.\n- **Fix:** the option was missing from the new right-click menu.\n- Subtitles, the helper and torrent streams work as before.\n\nTo update, download the zip, extract it over your current extension folder, then click the reload icon on the extension in `chrome://extensions`. Your settings and the subtitles helper keep working, because the extension ID does not change.\n\nRead more in the [release notes](https://github.com/abdallah28r/play-in-potplayer-for-stremio/releases).';
const LONG_AR = 'هذا الإصدار يعمل مع واجهة Stremio Web الجديدة والسابقة. الخيار يظهر الآن في القائمة الجديدة التي يفتحها Stremio خارج صف البث.\n\n- **جديد:** أضف عناوين Stremio Web الخاصة بك من الإعدادات.\n- **جديد:** إشعار قصير يخبرك عند صدور إصدار جديد.\n- **إصلاح:** الخيار كان مفقودًا من قائمة الزر الأيمن الجديدة.\n- الترجمات والبرنامج المساعد وروابط التورنت تعمل كما كانت.\n\nللتحديث، حمّل ملف zip، وفك الضغط فوق مجلد الإضافة الحالي، ثم اضغط زر إعادة التحميل على الإضافة في `chrome://extensions`. إعداداتك والبرنامج المساعد تبقى تعمل، لأن رقم الإضافة لا يتغير.\n\nاقرأ المزيد في [ملاحظات الإصدار](https://github.com/abdallah28r/play-in-potplayer-for-stremio/releases).';
const MID_EN = 'Play in PotPlayer now works with both the new and the previous Stremio Web interface.\n\n- **New:** your own Stremio Web addresses in the settings.\n- **New:** update notices.';
const MID_AR = 'خيار Play in PotPlayer يعمل الآن مع واجهة Stremio Web الجديدة والسابقة.\n\n- **جديد:** عناوين Stremio Web الخاصة بك في الإعدادات.\n- **جديد:** إشعارات التحديث.';
const T = (en, ar, enTitle = 'Works with the new Stremio Web', arTitle = 'يعمل مع واجهة Stremio Web الجديدة') => ({ en: { title: enTitle, text: en }, ar: { title: arTitle, text: ar } });

window.NOTICE_CASES = [
  { id: 'real-whatsnew', label: 'Real: extension/whats-new.json', kind: 'whatsnew', file: '../extension/whats-new.json', imageBase: '../extension/' },
  { id: 'real-notice', label: 'Real: notices/notice.json', kind: 'update', file: '../notices/notice.json', imageBase: '../notices/' },
  { id: 'short', label: 'Short text, wide picture (2:1)', kind: 'update', image: '../docs/images/banner.png', data: T('Works with the new Stremio Web.', 'يعمل مع واجهة Stremio Web الجديدة.') },
  { id: 'long', label: 'Long text, wide picture', kind: 'update', image: '../docs/images/banner.png', data: T(LONG_EN, LONG_AR) },
  { id: 'very-wide', label: 'Very wide picture (4:1)', kind: 'whatsnew', image: 'notice-images/very-wide.svg', data: T(MID_EN, MID_AR) },
  { id: 'square', label: 'Almost square picture', kind: 'update', image: 'notice-images/square.png', data: T(MID_EN, MID_AR) },
  { id: 'tall', label: 'Tall picture (3:5)', kind: 'whatsnew', image: 'notice-images/tall.svg', data: T(MID_EN, MID_AR) },
  { id: 'small', label: 'Small picture (387×257)', kind: 'whatsnew', image: 'notice-images/small.png', data: T(MID_EN, MID_AR) },
  { id: 'no-image', label: 'No picture', kind: 'update', data: T(MID_EN, MID_AR) },
  { id: 'long-no-image', label: 'Long text, no picture', kind: 'whatsnew', data: T(LONG_EN, LONG_AR) },
  { id: 'long-title', label: 'Very long title', kind: 'update', image: '../docs/images/banner.png', data: T(MID_EN, MID_AR, 'A very long title that keeps going to check how the heading wraps inside the window', 'عنوان طويل جدًا يستمر لنتأكد من طريقة التفاف العنوان داخل النافذة بدون مشاكل') },
  { id: 'broken-image', label: 'Picture that fails to load', kind: 'update', image: 'notice-images/missing.png', data: T(MID_EN, MID_AR) },
  { id: 'english-only', label: 'English only (no ar text)', kind: 'whatsnew', image: '../docs/images/banner.png', data: { en: { title: 'English only', text: 'This file has no Arabic text, so Arabic users see English.' } } },
];

// → { kind, data, image } for a case, loading the real files when needed.
window.loadNoticeCase = async function (id) {
  const c = window.NOTICE_CASES.find((x) => x.id === id) || window.NOTICE_CASES[0];
  if (c.file) {
    const data = await fetch(c.file, { cache: 'no-store' }).then((r) => r.json());
    return { kind: c.kind, data, image: data.image ? c.imageBase + data.image : null };
  }
  let image = c.image || null;
  // The local test server sends .svg without an image type, so SVG samples are passed as data: URLs.
  if (image && image.endsWith('.svg')) {
    const svg = await fetch(image).then((r) => r.text());
    image = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  return { kind: c.kind, data: { version: '1.3.0', ...c.data }, image };
};
