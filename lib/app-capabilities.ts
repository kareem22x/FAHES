/**
 * عقد التنقّل في تطبيق الجوال — وحدة نقية تُجيب سؤالًا واحدًا:
 * **«ماذا يرى هذا الحساب؟»**
 *
 * ── لماذا في `lib/` ولا في التطبيق ─────────────────────────────────────────
 *
 * لأنها **قاعدة**، والقاعدة المكتوبة داخل شاشة قاعدة لا يمكن اختبارها:
 * صفحات الإدارة `force-dynamic`، فخطأ في خريطة الأدوار لا يظهر في `tsc` ولا
 * `eslint` ولا `build` — يظهر لمستخدم يرى تبويبًا لا يملكه. وهنا تُختبر في
 * `vitest` (‏`lib/**​/*.test.ts`) بلا Clerk وبلا متصفّح.
 *
 * ── ولماذا يُرسلها الخادم ولا يعيد التطبيق اشتقاقها ────────────────────────
 *
 * لو اشتقّ التطبيق مجموعة التبويبات من الدور بنفسه، لصار عندنا مصدرا حقيقة:
 * مصدر الخادم يحرس المسارات، ومصدر التطبيق يرسم الشاشات. وهما يتباعدان عند
 * أول دور جديد — فيرى المستخدم تبويبًا يجيبه الخادم بـ401. هذا **بالضبط**
 * ما كان يحدث قبل هذا الملف: `GET /api/customer/requests` يرفض كل من ليس
 * `role === 'customer'`، والتطبيق كان يناديه لكل دور فيظهر خطأ في كل شاشة.
 *
 * ⇒ الخادم يقرّر، والتطبيق يعرض. مصدر واحد.
 *
 * ── ⚠️ ما ليس في هذا الملف ────────────────────────────────────────────────
 *
 * `can` **تلميح للواجهة لا حرس**. الحرس الحقيقي هو حرس المسار في الخادم
 * (`getSession` + `mayUseCustomerSurface` + `isInspectorSession`)، وهو الذي
 * يبقى صحيحًا لو كذب التلميح. الغرض من `can` واحد: ألّا يعرض التطبيق شاشة
 * تنادي مسارًا يعرف مسبقًا أنه سيرفض — فلا يظهر «تعذّر إكمال العملية» على
 * حالة هي في الحقيقة «هذه الميزة ليست لك».
 */

export type AppRole = 'customer' | 'inspector' | 'admin' | 'admin_pending'

/**
 * الواجهة التي يقف فيها المستخدم الآن.
 *
 * `pending` ليست واجهة منتج بل **حالة عابرة**: مدير مصادَق لم يتجاوز بوابة
 * رمز الدخول بعد. له تبويب واحد يقوده إلى البوابة، لا واجهة إدارة.
 */
export type AppSurface = 'customer' | 'inspector' | 'admin' | 'pending'

/** معرّف الشاشة — التطبيق يحوّله إلى مكوّن، وله بديل آمن لمجهول. */
export type AppScreenKey =
  | 'customer-home'
  | 'customer-orders'
  | 'inspector-jobs'
  | 'inspector-wallet'
  | 'admin-console'
  | 'admin-gate'
  | 'notifications'
  | 'account'

export type AppTab = {
  /** اسم الملف تحت `(tabs)` — وهو أيضًا المفتاح الثابت للتبويب. */
  segment: string
  title: string
  /** اسم أيقونة `lucide`. نصّ لا مكوّن: الوحدة نقية ولا تستورد React. */
  icon: string
  screen: AppScreenKey
}

export type AppCapabilities = {
  role: AppRole
  /** الواجهات التي **يجوز** لهذا الحساب الوقوف فيها. */
  surfaces: AppSurface[]
  /** الواجهة المعروضة الآن. */
  surface: AppSurface
  /** مسار الهبوط بعد الدخول، للواجهة النشطة. */
  home: string
  /** التبويبات بالترتيب — التطبيق يخفي كل تبويب خارجها. */
  tabs: AppTab[]
  /**
   * تلميح للواجهة (انظر التحذير في رأس الملف). الخادم هو الحرس.
   */
  can: {
    readOwnRequests: boolean
    readFieldWork: boolean
    requestPayout: boolean
    openConsole: boolean
  }
}

// التبويبات المشتركة بين الواجهات — تُعرَّف مرّة فلا تتباعد تسمياتها.
const NOTIFICATIONS_TAB: AppTab = {
  segment: 'notifications',
  title: 'التنبيهات',
  icon: 'bell',
  screen: 'notifications',
}

const ACCOUNT_TAB: AppTab = {
  segment: 'account',
  title: 'حسابي',
  icon: 'user',
  screen: 'account',
}

/**
 * ⚠️ **ترتيب الإعلان هنا هو ترتيب الشريط على الشاشة.**
 *
 * `expo-router` يرتّب التبويبات بترتيب إعلان `<Tabs.Screen>` في الملف، لا
 * بترتيب المصفوفة الواردة من الخادم. والتطبيق يحلّ ذلك بإعلان **كل** الأسماء
 * بترتيب واحد، ويُخفي ما ليس في `tabs` بـ`href: null`. فالترتيب هنا مُوثَّق
 * لا مُنفَّذ: `(tabs)/_layout.tsx` يعلن بنفس هذا الترتيب.
 */
const CUSTOMER_TABS: AppTab[] = [
  { segment: 'index', title: 'الرئيسية', icon: 'map-pin', screen: 'customer-home' },
  { segment: 'orders', title: 'طلباتي', icon: 'clipboard-list', screen: 'customer-orders' },
  NOTIFICATIONS_TAB,
  ACCOUNT_TAB,
]

const INSPECTOR_TABS: AppTab[] = [
  { segment: 'jobs', title: 'المهام', icon: 'briefcase', screen: 'inspector-jobs' },
  { segment: 'wallet', title: 'المحفظة', icon: 'wallet', screen: 'inspector-wallet' },
  NOTIFICATIONS_TAB,
  ACCOUNT_TAB,
]

const ADMIN_TABS: AppTab[] = [
  { segment: 'console', title: 'الإدارة', icon: 'shield', screen: 'admin-console' },
  NOTIFICATIONS_TAB,
  ACCOUNT_TAB,
]

const PENDING_TABS: AppTab[] = [
  { segment: 'gate', title: 'بوابة الدخول', icon: 'lock', screen: 'admin-gate' },
  ACCOUNT_TAB,
]

const HOME_BY_SURFACE: Record<AppSurface, string> = {
  customer: '/(tabs)',
  inspector: '/(tabs)/jobs',
  admin: '/(tabs)/console',
  pending: '/(tabs)/gate',
}

const TABS_BY_SURFACE: Record<AppSurface, AppTab[]> = {
  customer: CUSTOMER_TABS,
  inspector: INSPECTOR_TABS,
  admin: ADMIN_TABS,
  pending: PENDING_TABS,
}

/**
 * الواجهات المسموحة لكل دور.
 *
 * المالك يستحقّ الثلاث معًا: هو **فوق** الأدوار لا داخلها — `getSession()`
 * يحسم دوره إلى `admin` قبل أن يقرأ `inspector_status`، فالواجهات عنده
 * **اختيار عرض** لا تغيير دور. وهذا نفس المنطق الذي بُني عليه كوكي
 * `fahes_surface` على الويب، مُعادًا هنا بصيغة تعمل بلا كوكيز: رمز Bearer
 * لا يُرفق كوكي، فلو اعتمد التطبيق على الكوكي لرأى المالك الإدارة دائمًا.
 *
 * ولماذا لا يُمنح `admin` (غير المالك) واجهة الفاحص: لا خطّ عمل ميداني له،
 * وإجراءاته في مسارات الميدان كانت ستُنسَب إلى حساب لم يتجاوز التحقق.
 */
const SURFACES_BY_ROLE: Record<AppRole, AppSurface[]> = {
  customer: ['customer'],
  inspector: ['inspector'],
  admin: ['admin'],
  admin_pending: ['pending'],
}

const OWNER_SURFACES: AppSurface[] = ['customer', 'inspector', 'admin']

/**
 * الواجهة الافتراضية لكل دور حين لا يطلب العميل واجهة.
 *
 * `admin_pending` تهبط على البوابة لا على الإدارة: الحساب مصادَق لكنه لم
 * يتجاوز رمز الدخول بعد، وعرض لوحة الإدارة له يعني عرض بيانات لا يملك حقّها.
 */
const DEFAULT_SURFACE_BY_ROLE: Record<AppRole, AppSurface> = {
  customer: 'customer',
  inspector: 'inspector',
  admin: 'admin',
  admin_pending: 'pending',
}

function isSurface(value: unknown): value is AppSurface {
  return value === 'customer' || value === 'inspector' || value === 'admin' || value === 'pending'
}

export function capabilitiesFor(input: {
  role: AppRole
  isPlatformOwner: boolean
  /**
   * واجهة طلبها العميل. **تُحترم للمالك وحده**، وتُتجاهل لغيره بلا خطأ:
   * طلب واجهة لا يملكها ليس هجومًا يستحق 400، بل شاشة قديمة في التطبيق بعد
   * تغيّر الصلاحية — والسلوك الصحيح أن نُعيده إلى واجهته لا أن نُفشل الطلب.
   */
  requestedSurface?: unknown
}): AppCapabilities {
  const surfaces = input.isPlatformOwner ? OWNER_SURFACES : SURFACES_BY_ROLE[input.role]

  const requested = isSurface(input.requestedSurface) ? input.requestedSurface : null
  const fallback = DEFAULT_SURFACE_BY_ROLE[input.role]
  // المالك بلا طلب صريح يقف في الإدارة — نفس موضع الهبوط على الويب.
  const surface =
    requested && surfaces.includes(requested)
      ? requested
      : surfaces.includes(fallback)
        ? fallback
        : surfaces[0]

  return {
    role: input.role,
    surfaces: [...surfaces],
    surface,
    home: HOME_BY_SURFACE[surface],
    tabs: TABS_BY_SURFACE[surface],
    can: {
      readOwnRequests: surface === 'customer',
      readFieldWork: surface === 'inspector',
      requestPayout: surface === 'inspector',
      openConsole: surface === 'admin',
    },
  }
}
