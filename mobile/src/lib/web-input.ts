import { Platform } from 'react-native'

/**
 * ضبط سلوك اللمس والاختيار على **الويب** — ورقة أنماط واحدة عند الإقلاع.
 *
 * ── لماذا ورقة أنماط لا أنماط React Native ────────────────────────────────
 *
 * `touch-action` و`-webkit-tap-highlight-color` خاصيّتان في المتصفّح لا مقابل
 * لهما في نظام أنماط React Native، فلا سبيل لضبطهما من `StyleSheet`. وأقرب
 * مكافئ (`userSelect` في `ViewStyle`) **موجود فعلًا** لكنه يخصّ الاختيار وحده.
 *
 * ── `touch-action: manipulation` — ما تحلّه بالضبط ────────────────────────
 *
 * المتصفّح يؤخّر حدث `click` نحو **300ms** بعد كل لمسة، ينتظر ليرى إن كانت
 * اللمسة بداية نقر مزدوج (للتكبير). في تطبيق كامل الشاشة هذا التأخير محسوس
 * على **كل** زرّ. و`manipulation` تُلغي انتظار النقر المزدوج ⇒ استجابة فورية،
 * مع إبقاء التمرير والتكبير بإيماءتين (وهو المطلوب).
 *
 * ── الاختيار: `none` على الجذر **مع استثناء حقول الإدخال** ─────────────────
 *
 * `user-select` موروثة. فـ`none` على `html` تُلغي اختيار النصّ في التطبيق
 * كلّه — وهو المطلوب: اختيار نصّ واجهة داخل تطبيق يشبه تطبيقات التوصيل خطأ
 * لا ميزة (يظهر مقبض اختيار أزرق عند لمس طويل على عنوان).
 *
 * ⚠️ لكن بلا الاستثناء التالي **تنكسر حقول الإدخال**: مستخدم يريد تصحيح حرف
 * في بريده لا يستطيع تحديده. فالحقول تُعاد إلى `text` صراحةً. وهذا ليس
 * ترفًا: شاشة تسجيل الدخول كلها حقل واحد.
 *
 * ── ولماذا لا شيء من هذا على الجهاز ───────────────────────────────────────
 *
 * على iOS/أندرويد `Text` **غير قابل للاختيار افتراضيًّا** (يحتاج `selectable`
 * صريحة)، فلا اختيار نصّ يُلغى. و`touch-action` مفهوم متصفّح لا منصّة. فإضافة
 * `userSelect: 'none'` على جذر الشجرة هناك تكرار بلا أثر — وقد تُقحم خطرًا
 * على حقول الإدخال الأصلية بلا مقابل.
 */
export function applyWebInputChrome(): void {
  if (Platform.OS !== 'web') return
  // `document` غير معرَّف في العرض على الخادم (SSR) ⇒ الفحص لازم.
  if (typeof document === 'undefined') return

  // نداء ثانٍ (إعادة تحميل سريعة) لا يُضيف ورقة ثانية.
  if (document.querySelector('style[data-fahes="input-chrome"]')) return

  const style = document.createElement('style')
  style.setAttribute('data-fahes', 'input-chrome')
  style.textContent = [
    'html,body{touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
    'html,body,#root{user-select:none;-webkit-user-select:none}',
    'input,textarea,select,[contenteditable="true"]{user-select:text;-webkit-user-select:text}',
  ].join('')

  document.head.appendChild(style)
}
