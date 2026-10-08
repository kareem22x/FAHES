import { useSignIn } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { AlertCircle, ArrowRight, Mail, ShieldCheck } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FahesMark, FahesWordmark } from '@/components/brand/fahes-brand'
import { AuthBackdrop } from '@/components/ui/auth-backdrop'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { KeyboardAvoidingView } from '@/components/ui/keyboard'
import { Screen } from '@/components/ui/screen'
import { AppText } from '@/components/ui/text'
import { isPlausibleEmail, normalizeEmail, readClerkError } from '@/lib/clerk-errors'
import { env } from '@/lib/env'
import { brandRamp, ink, useTheme } from '@/theme'

/**
 * تسجيل الدخول.
 *
 * ── 🔴 تصحيح جوهري: العامل الأوّل هو **رمز البريد** لا الجوال ولا كلمة المرور ─
 *
 * النسخة السابقة بدأت بحقل **رقم جوال**، ثم بحثت عن `password` أو `phone_code`
 * في `supportedFirstFactors`. وهي بنية **لا يمكن أن تنجح على هذه النسخة**.
 *
 * المصدر ليس تخمينًا: `GET /v1/environment` من الـFrontend API
 * (`relieved-ewe-917.clerk.accounts.dev`) يعيد `user_settings.attributes`:
 *
 * | الخاصية | `used_for_first_factor` | `first_factors` |
 * |---|---|---|
 * | `email_address` | **true** | **`["email_code"]`** |
 * | `phone_number` | false | `[]` |
 * | `password` | false | `[]` |
 *
 * أي أن **العامل الأوّل الوحيد المتاح هو رمز يُرسل بالبريد**. الجوال مُفعَّل
 * كخاصية (`enabled: true`) لكنه **ليس عامل دخول**، وكلمة المرور مطلوبة للحساب
 * لكنها ليست عاملًا أوّلًا. فالمسار السابق كان ينتهي دائمًا إلى
 * «هذا الحساب لا يدعم الدخول…» — رسالة صحيحة لسبب خاطئ.
 *
 * ⇒ لذلك حُذف الجوال من الواجهة (كما طُلب)، والمسار الآن خطوتان:
 *
 *   1. `create({ identifier: email })` ⇒ نقرأ `supportedFirstFactors`
 *   2. `prepareFirstFactor({ strategy: 'email_code', emailAddressId })` ⇒ يُرسل الرمز
 *   3. `attemptFirstFactor({ strategy: 'email_code', code })` ⇒ `complete`
 *
 * ⚠️ ولماذا نقرأ `supportedFirstFactors` ولا نفترض `email_code` مباشرةً؟
 * لأن الإعداد **يُغيَّر من لوحة Clerk لا من الكود**؛ لو فُعِّل الجوال غدًا
 * لكفى أن نضيف فرعًا هنا. قراءة العوامل تجعل التطبيق يتبع الخادم لا العكس.
 *
 * ── لماذا نموذج أصلي لا `<SignIn />` جاهز ─────────────────────────────────
 *
 * `@clerk/clerk-expo` v2 يصدّر **خطّافات** لا مكوّن واجهة؛ النسخة الجاهزة في
 * `@clerk/elements` وتحمل تصميمها الخاص — أي تطبيق أبيض/رمادي داخل منتج داكن
 * بعربية RTL. فالنموذج مبنيّ هنا برموزنا.
 */

type Step = 'email' | 'code'

/** ثواني انتظار قبل السماح بإعادة الإرسال. */
const RESEND_SECONDS = 30
const CODE_LENGTH = 6

/** نقاط القيمة — منسوخة من `.auth-points` في `app/sign-in/[[...sign-in]]/page.tsx`. */
const POINTS = [
  'عروض الفاحصين القريبين من موقع السيارة',
  'متابعة حالة الفحص خطوة بخطوة',
  'تقارير وصور محفوظة في حسابك',
] as const

/**
 * صياغة عدّاد الثواني بالعربية الفصيحة.
 *
 * العربية تميّز المفرد والمثنّى والجمع، و«1 ثانية» و«2 ثانية» خطأ ظاهر.
 * والدالة صغيرة فإهمالها اختيار واعٍ لا سهو.
 */
function secondsLabel(n: number): string {
  if (n === 1) return 'ثانية واحدة'
  if (n === 2) return 'ثانيتين'
  if (n <= 10) return `${n} ثوانٍ`
  return `${n} ثانية`
}

export default function SignInScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  /** معرّف البريد داخل محاولة Clerk — لازم لإعادة الإرسال بلا محاولة جديدة. */
  const [emailAddressId, setEmailAddressId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  /** خطأ يخصّ الحقل ⇒ يظهر تحته لا في صندوق منفصل. */
  const [fieldError, setFieldError] = useState<string | null>(null)
  /** خطأ يخصّ العملية كلها ⇒ صندوق مستقلّ. */
  const [error, setError] = useState<string | null>(null)

  /**
   * عدّاد إعادة الإرسال.
   *
   * `setTimeout` بخطوة واحدة لكل ثانية لا `setInterval`: كل نبضة تُعيد جدولة
   * التالية، فالإلغاء عند الخروج من الشاشة (`clearTimeout`) كافٍ ولا يبقى
   * مؤقّت يعمل في الخلفية على شاشة أُغلقت.
   */
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  /** إتمام الدخول بعد نجاح العامل. */
  const finish = useCallback(
    async (sessionId: string | null | undefined) => {
      // `setActive` اختيارية قبل إقلاع Clerk — والفحص عليها لازم.
      if (!setActive) {
        setError('تعذّر تفعيل الجلسة. أعد المحاولة.')
        return
      }
      if (!sessionId) {
        setError('تعذّر إنشاء الجلسة. أعد المحاولة.')
        return
      }
      await setActive({ session: sessionId })
      // الوجهة الشاشة الرئيسية لا «طلباتي»: بعد الدخول يريد المستخدم أن يرى
      // الخريطة وحالة طلبه الجاري، لا قائمة. والقائمة تبويب على بعد ضغطة.
      router.replace('/(tabs)')
    },
    [router, setActive],
  )

  /** الخطوة 1 — نطلب رمز التحقق على البريد. */
  const submitEmail = useCallback(async () => {
    // `signIn` نفسها `undefined` قبل أن يُقلع Clerk (لا مجرّد `isLoaded`).
    if (!isLoaded || !signIn || busy) return

    const identifier = normalizeEmail(email)
    if (!isPlausibleEmail(identifier)) {
      setFieldError('صيغة البريد الإلكتروني غير صحيحة. مثال: name@example.com')
      return
    }

    setBusy(true)
    setError(null)
    setFieldError(null)
    try {
      const attempt = await signIn.create({ identifier })
      const factor = attempt.supportedFirstFactors?.find((item) => item.strategy === 'email_code')

      if (!factor || !('emailAddressId' in factor)) {
        setError('هذا الحساب لا يدعم الدخول برمز البريد الإلكتروني. تواصل مع الدعم.')
        return
      }

      await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId })

      setEmailAddressId(factor.emailAddressId)
      setEmail(identifier)
      setCode('')
      setCooldown(RESEND_SECONDS)
      setStep('code')
    } catch (caught) {
      const info = readClerkError(caught, 'تعذّر إرسال رمز التحقق. أعد المحاولة.')
      // «لا يوجد حساب» يخصّ الحقل ⇒ يُعرض تحته ليعرف المستخدم أين يصحّح.
      if (info.kind === 'not_found') setFieldError(info.message)
      else setError(info.message)
    } finally {
      setBusy(false)
    }
  }, [busy, email, isLoaded, signIn])

  /** الخطوة 2 — تأكيد الرمز. */
  const submitCode = useCallback(
    async (value?: string) => {
      if (!signIn || busy) return
      const digits = (value ?? code).replace(/\D/g, '')
      if (digits.length !== CODE_LENGTH) {
        setFieldError(`أدخل الرمز المكوّن من ${CODE_LENGTH} أرقام.`)
        return
      }
      setBusy(true)
      setError(null)
      setFieldError(null)
      try {
        const attempt = await signIn.attemptFirstFactor({ strategy: 'email_code', code: digits })
        if (attempt.status === 'complete') {
          await finish(attempt.createdSessionId)
          return
        }
        setError('لم يكتمل تسجيل الدخول. أعد المحاولة.')
      } catch (caught) {
        setError(readClerkError(caught, 'تعذّر التحقق من الرمز. أعد المحاولة.').message)
      } finally {
        setBusy(false)
      }
    },
    [busy, code, finish, signIn],
  )

  /**
   * إعادة إرسال الرمز على **المحاولة القائمة** لا محاولة جديدة.
   *
   * `prepareFirstFactor` تُعاد على `signIn` الحالية؛ استدعاء `create` مرّة
   * أخرى كان سيُنشئ محاولة ثانية ويُهمل الأولى — فيصل رمزان ويُرفض الأوّل
   * بلا سبب مفهوم للمستخدم.
   */
  const resend = useCallback(async () => {
    if (!signIn || busy || cooldown > 0 || !emailAddressId) return
    setBusy(true)
    setError(null)
    setFieldError(null)
    try {
      await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId })
      setCode('')
      setCooldown(RESEND_SECONDS)
    } catch (caught) {
      setError(readClerkError(caught, 'تعذّر إعادة إرسال الرمز. أعد المحاولة.').message)
    } finally {
      setBusy(false)
    }
  }, [busy, cooldown, emailAddressId, signIn])

  /** العودة لتعديل البريد — تُبطل المحاولة الجارية لئلا يبقى رمز صالح لها. */
  const back = useCallback(() => {
    setStep('email')
    setCode('')
    setEmailAddressId(null)
    setCooldown(0)
    setFieldError(null)
    setError(null)
  }, [])

  const openLegal = useCallback((path: string) => {
    void WebBrowser.openBrowserAsync(`${env.apiUrl}${path}`)
  }, [])

  const canSubmit = step === 'email' ? email.trim().length > 0 : code.replace(/\D/g, '').length === CODE_LENGTH

  return (
    <Screen scroll={false} padded={false} edges={{ top: false, bottom: false }}>
      <KeyboardAvoidingView
        // أندرويد يضبط الواجهة بنفسه (`adjustResize`) ولا يحتاج هذا الغلاف.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + t.space[6] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── الشريط العلوي: تدرّج الهوية + الوعد ───────────────────────── */}
          <View style={[styles.hero, { paddingTop: insets.top + t.space[6], paddingBottom: t.space[12] }]}>
            <AuthBackdrop />

            <View style={styles.brandRow}>
              <FahesMark size={44} plate="#ffffff" glyph={ink[900]} />
              <FahesWordmark variant="heading" color="#ffffff" dotColor={brandRamp[300]} />
            </View>

            <View style={[styles.eyebrow, { marginTop: t.space[7], borderRadius: t.radius.pill }]}>
              <ShieldCheck size={14} color="#dcecff" />
              <AppText variant="caption" weight="bold" style={{ color: '#dcecff' }}>
                مساحة العمل الآمنة
              </AppText>
            </View>

            <AppText variant="display" weight="heavy" style={[styles.heroTitle, { marginTop: t.space[4] }]}>
              فحص سيارتك{'\n'}وأنت في مدينة ثانية
            </AppText>

            <View style={{ marginTop: t.space[6], gap: t.space[3] }}>
              {POINTS.map((point) => (
                <View key={point} style={styles.point}>
                  <View style={[styles.dot, { backgroundColor: brandRamp[300] }]} />
                  <AppText variant="caption" style={[styles.pointText, { color: 'rgba(255,255,255,0.86)' }]}>
                    {point}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          {/* ── البطاقة: تركب على التدرّج بزوايا عليا دائرية ───────────────── */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: t.colors.background,
                borderTopLeftRadius: t.radius.xl,
                borderTopRightRadius: t.radius.xl,
                marginTop: -t.space[8],
              },
            ]}
          >
            {step === 'email' ? (
              <>
                <AppText variant="title" weight="bold">
                  تسجيل الدخول
                </AppText>
                <AppText variant="body" tone="muted" style={{ marginTop: t.space[2] }}>
                  أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق من {CODE_LENGTH} أرقام. بلا كلمة مرور.
                </AppText>

                <View style={{ marginTop: t.space[6] }}>
                  <TextField
                    // `key` مختلفة لكل خطوة ⇒ React يركّب حقلًا جديدًا فيعمل
                    // `autoFocus` عند الانتقال (التركيب لا التحديث).
                    key="email"
                    label="البريد الإلكتروني"
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value)
                      if (fieldError) setFieldError(null)
                    }}
                    placeholder="name@example.com"
                    icon={Mail}
                    ltr
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    returnKeyType="send"
                    editable={!busy}
                    onSubmitEditing={submitEmail}
                    error={fieldError}
                  />
                </View>

                <View style={{ marginTop: t.space[6] }}>
                  <Button
                    label="أرسل رمز التحقق"
                    onPress={submitEmail}
                    loading={busy}
                    disabled={!isLoaded || !canSubmit}
                    size="lg"
                  />
                </View>
              </>
            ) : (
              <>
                <Pressable
                  onPress={back}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="رجوع لتعديل البريد الإلكتروني"
                  hitSlop={12}
                  style={styles.backRow}
                >
                  {/* في واجهة RTL «الرجوع» سهم إلى اليمين. */}
                  <ArrowRight size={18} color={t.colors.accent} />
                  <AppText variant="label" weight="bold" tone="accent">
                    رجوع
                  </AppText>
                </Pressable>

                <AppText variant="title" weight="bold" style={{ marginTop: t.space[4] }}>
                  رمز التحقق
                </AppText>
                <AppText variant="body" tone="muted" style={{ marginTop: t.space[2] }}>
                  أرسلنا رمزًا من {CODE_LENGTH} أرقام إلى
                </AppText>

                <View
                  style={[
                    styles.emailChip,
                    {
                      backgroundColor: t.colors.surface,
                      borderColor: t.colors.border,
                      borderRadius: t.radius.sm,
                      marginTop: t.space[3],
                    },
                  ]}
                >
                  <AppText variant="label" weight="bold" ltr>
                    {email}
                  </AppText>
                </View>

                <View style={{ marginTop: t.space[5] }}>
                  <TextField
                    key="code"
                    variant="code"
                    value={code}
                    onChangeText={(value) => {
                      // أرقام فقط، وبلا تجاوز الطول — اللصق من البريد يجرّ
                      // مسافات وأسطرًا أحيانًا.
                      const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH)
                      setCode(digits)
                      if (fieldError) setFieldError(null)
                      // إكمال آلي عند اكتمال الأرقام: الخطوة الوحيدة الباقية
                      // هي الضغط، فلا داعي لتكليف المستخدم بها.
                      if (digits.length === CODE_LENGTH) void submitCode(digits)
                    }}
                    placeholder="000000"
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={CODE_LENGTH}
                    autoFocus
                    editable={!busy}
                    returnKeyType="go"
                    onSubmitEditing={() => void submitCode()}
                    error={fieldError}
                  />
                </View>

                <View style={styles.resendRow}>
                  <AppText variant="caption">لم يصلك الرمز؟</AppText>
                  {cooldown > 0 ? (
                    <AppText variant="caption" tone="muted">
                      أعد الإرسال خلال {secondsLabel(cooldown)}
                    </AppText>
                  ) : (
                    <Pressable onPress={resend} disabled={busy} hitSlop={10} accessibilityRole="button">
                      <AppText variant="label" weight="bold" tone="accent">
                        أعد الإرسال
                      </AppText>
                    </Pressable>
                  )}
                </View>

                <View style={{ marginTop: t.space[5] }}>
                  <Button
                    label="تأكيد الدخول"
                    onPress={() => void submitCode()}
                    loading={busy}
                    disabled={!canSubmit}
                    size="lg"
                  />
                </View>
              </>
            )}

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: t.feedback.error.background,
                    borderColor: t.feedback.error.border,
                    borderRadius: t.radius.sm,
                    marginTop: t.space[5],
                    padding: t.space[3],
                    gap: t.space[2],
                  },
                ]}
              >
                <AlertCircle size={18} color={t.feedback.error.text} />
                <AppText variant="caption" weight="semibold" tone="error" style={styles.fill}>
                  {error}
                </AppText>
              </View>
            ) : null}

            <AppText variant="caption" tone="muted" align="center" style={{ marginTop: t.space[8] }}>
              بالمتابعة أنت توافق على{' '}
              <AppText variant="caption" weight="bold" tone="accent" onPress={() => openLegal('/terms')}>
                الشروط والأحكام
              </AppText>{' '}
              و{' '}
              <AppText variant="caption" weight="bold" tone="accent" onPress={() => openLegal('/privacy')}>
                سياسة الخصوصية
              </AppText>
              .
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { paddingHorizontal: 20, overflow: 'hidden' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  heroTitle: { color: '#ffffff' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  pointText: { flex: 1 },
  card: { paddingHorizontal: 20, paddingTop: 28 },
  backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4 },
  emailChip: { alignSelf: 'flex-start', borderWidth: 1, paddingVertical: 9, paddingHorizontal: 12 },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  errorBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
})
