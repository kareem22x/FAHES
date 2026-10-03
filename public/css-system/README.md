# نظام التصميم — `global.css` + `animations.js`

ثلاثة ملفات مستقلّة، بلا أي مكتبة خارجية، مبنية على هوية **فاحص** الحالية
(كحلي `#0F172A` → أزرق `#2563EB`، خط Alexandria، واجهة عربية RTL).

| الملف | الوصف |
| --- | --- |
| `global.css` | المتغيّرات + Reset + Base + Utility classes + نظام الانتقالات + أنماط scroll reveal |
| `animations.js` | محرّك scroll reveal مبني على `IntersectionObserver` فقط (~200 سطر) |
| `examples.html` | صفحة أمثلة حيّة لكل الاتجاهات والمكوّنات والأدوات |

افتح `examples.html` مباشرة في المتصفح — لا يحتاج أي خادم أو بناء.

---

## 1. بنية `global.css`

الملف مرتّب في 13 قسمًا مرقّمًا:

```
01. Design tokens      ← المصدر الوحيد للحقيقة
02. Reset              ← توحيد السلوك بين المتصفحات
03. Base               ← الوثيقة والعناوين
04. Layout primitives  ← container / section / stack / cluster / grid-auto
05. Spacing utilities
06. Typography utilities
07. Flex & grid helpers
08. Surfaces & components  ← card / btn / badge
09. Transition system
10. Scroll reveal
11. Accessibility      ← sr-only / skip-link
12. Reduced motion
13. Print
```

### تغيير الهوية

كل شيء يقرأ من الرموز (tokens). لتغيير اللون الأساسي، عدّل عائلة
`--brand-*` في القسم 01.1 فقط، وستتبعه كل المكوّنات تلقائيًا:

```css
--brand-700: #1d4ed8;   /* اللون الأساسي */
--brand-600: #2563eb;   /* accent */
```

الوضع الليلي جاهز عبر `[data-theme="dark"]` (اختياري — مشروعك مثبّت حاليًا على الوضع الفاتح).

---

## 2. قواعد الحركة

- **`transform` و `opacity` فقط.** لا نلمس `width`/`height`/`top`/`left`
  أبدًا أثناء الحركة، فلا يحدث reflow.
- مدة الظهور الافتراضية `700ms` بمنحنى `--ease-out`، ويمكن ضبطها لكل عنصر.

---

## 3. عقد الاستخدام في HTML

```html
<!-- ظهور افتراضي (fade) -->
<div data-reveal>…</div>

<!-- اتجاه: up | down | left | right | start | end | zoom | zoom-in | fade -->
<div data-reveal="up">…</div>

<!-- تأخير صريح بالمللي ثانية -->
<div data-reveal="zoom" data-reveal-delay="200">…</div>

<!-- تتابع: يُوزّع تأخيرًا تصاعديًا على الأبناء المباشرين -->
<ul data-reveal-stagger="90">
  <li data-reveal="up">١</li>
  <li data-reveal="up">٢</li>
</ul>
```

اتجاهات `start` / `end` **منطقية**: في RTL يظهر `start` من اليمين تلقائيًا.

### ضبط المسافة والمقياس

```css
.hero-card { --reveal-distance: 40px; --reveal-scale: 0.9; }
```

### ⚠️ احتياط إلزامي عند تعطيل JS

لأن العناصر تبدأ بـ `opacity: 0`، فإن تعطيل JavaScript كليًا يعني صفحة فارغة.
أضِف هذه الكتلة في `<head>` دائمًا:

```html
<noscript>
  <style>
    [data-reveal] { opacity: 1 !important; transform: none !important; }
  </style>
</noscript>
```

---

## 4. واجهة `animations.js`

| الدالة | الوظيفة |
| --- | --- |
| `Reveal.init(options)` | تهيئة يدوية (يعمل تلقائيًا عند `DOMContentLoaded`) |
| `Reveal.refresh(root?)` | إعادة المسح بعد إضافة عناصر جديدة (تنقّل SPA) |
| `Reveal.observe(el)` | مراقبة عنصر واحد |
| `Reveal.reveal(el)` | إظهار فوري لعنصر |
| `Reveal.revealAll(root?)` | إظهار كل العناصر |
| `Reveal.reset(root?)` | إخفاء وإعادة المراقبة (للعروض) |
| `Reveal.destroy()` | إنهاء كل المراقبين |

الأحداث: `reveal:in` و `reveal:out` يتصاعدان (bubble) من العنصر مع `detail.el`.

### إعدادات مخصّصة قبل التحميل

```html
<script>
  window.RevealConfig = {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.2,
    staggerStep: 120,
    once: true,       // false = إعادة الإخفاء عند الخروج من الشاشة
    watchDom: true    // إعادة المسح عند تغيّر DOM
  };
</script>
<script src="animations.js"></script>
```

---

## 5. الدمج مع مشروع Next.js الحالي

المشروع يستخدم Tailwind v4 + React 19. هناك مسارَان:

### أ) الصفحات الثابتة / خارج React

انسخ المجلّد إلى `public/css-system/` واستدعِ الملفين في أي صفحة:

```html
<link rel="stylesheet" href="/css-system/global.css" />
<script src="/css-system/animations.js" defer></script>
```

### ب) داخل Next.js

1. **المتغيّرات + Reset + reveal:** استورد `global.css` بعد `globals.css`
   في `app/layout.tsx`. هذه الطبقات لا تتعارض مع Tailwind (تستخدم
   `data-reveal` و custom properties).
2. **طبقة الأدوات (§05–§08):** ⚠️ **قد تتعارض مع أدوات Tailwind** لأن
   الأسماء متشابهة (`.grid`, `.flex`, `.hidden`, `.mt-4` …).
   اختر واحدًا:
   - احذف أقسام §05–§08 واستخدم أدوات Tailwind وحدها، **أو**
   - أبقِها واحذف ما يقابلها من Tailwind، **أو**
   - اطلب نسخة مُنَطّقة (`.u-mt-4` مثلًا) لتجنّب أي تصادم.
3. **`animations.js`:** أضِفه كسكربت عميل. في App Router:

```tsx
// components/reveal-init.tsx
'use client';
import { useEffect } from 'react';

export default function RevealInit() {
  useEffect(() => {
    // animations.js منسوخ إلى public/css-system/
    const s = document.createElement('script');
    s.src = '/css-system/animations.js';
    s.defer = true;
    document.body.appendChild(s);
    return () => s.remove();
  }, []);
  return null;
}
```

> ملاحظة: مشروعك يملك بالفعل `components/scroll-reveal.tsx` (framer-motion +
> react-intersection-observer). هذا النظام البديل **بلا مكتبات** ومناسب
> للصفحات الثابتة أو عندما تريد تقليل حجم الحزمة.

---

## 6. قائمة تحقّق

- [ ] التنقّل بالكيبورد: `Tab` يُظهر حلقة التركيز، و`skip-link` يعمل.
- [ ] كتلة `<noscript>` موجودة في `<head>`.
- [ ] عند غياب `IntersectionObserver` تظهر العناصر تلقائيًا (مُعالَج داخل `animations.js`).
- [ ] الصفحة تعمل في RTL و LTR.
