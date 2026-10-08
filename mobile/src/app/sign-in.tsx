import { useSignIn } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { AppText } from '@/components/ui/text'
import { useTheme } from '@/theme'

/**
 * تسجيل الدخول.
 *
 * ── لماذا نموذج أصلي لا `<SignIn />` جاهز ─────────────────────────────────
 *
 * `@clerk/clerk-expo` v2 يصدّر **خطّافات** (`useSignIn`/`useSignUp`) لا
 * مكوّن واجهة. النسخة الجاهزة تعيش في حزمة أخرى (`@clerk/elements`) وتحمل
 * تصميمها الخاص — أي تطبيق أبيض/رمادي داخل منتج داكن بعربية RTL.
 * فالنموذج مبنيّ هنا برموزنا.
 *
 * ── لماذا خطوتان لا واحدة ─────────────────────────────────────────────────
 *
 * لا نعرف أي عامل مُفعَّل في نسخة Clerk (كلمة مرور؟ رمز جوال؟ كلاهما؟)،
 * والافتراض خطأ في الحالتين: نموذج بكلمة مرور فقط يفشل إن كان الحساب
 * بالرمز، والعكس كذلك. الحلّ أن **نسأل Clerk**: `create({ identifier })`
 * تُرجع العوامل المدعومة لهذا الحساب، فنعرض الحقل الصحيح.
 *
 *   كلمة مرور  → `attemptFirstFactor({ strategy: 'password' })`
 *   رمز جوال   → `attemptFirstFactor({ strategy: 'phone_code' })`
 *
 * ⇒ التطبيق يعمل مع أي إعداد، بلا أن نُثبّت افتراضًا في الكود.
 *
 * ── الأرقام ───────────────────────────────────────────────────────────────
 *
 * Clerk يقبل الرقم بصيغة دولية (`+9665…`). نُبقي ما يكتبه المستخدم كما هو
 * ولا «نُصلحه»: تخمين رمز الدولة ينتج أرقامًا خاطئة صامتة. النصّ التوجيهي
 * يوضّح الصيغة.
 */

type Step = 'phone' | 'password' | 'code'

export default function SignInScreen() {
  const t = useTheme()
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** إتمام الدخول بعد نجاح أي عامل. */
  const finish = useCallback(
    async (sessionId: string | null | undefined) => {
      // `setActive` أيضًا اختيارية قبل إقلاع Clerk — والفحص عليها لازم.
      if (!setActive) {
        setError('تعذّر تفعيل الجلسة. أعد المحاولة.')
        return
      }
      if (!sessionId) {
        setError('تعذّر إنشاء الجلسة. أعد المحاولة.')
        return
      }
      await setActive({ session: sessionId })
      router.replace('/(tabs)/orders')
    },
    [router, setActive],
  )

  /** الخطوة 1 — نطلب العوامل المتاحة لهذا الحساب. */
  const submitPhone = useCallback(async () => {
    // `signIn` نفسها `undefined` قبل أن يُقلع Clerk (لا مجرّد `isLoaded`) —
    // والفحص عليها لازم لنوعها وللتحقّق معًا.
    if (!isLoaded || !signIn || busy) return
    const identifier = phone.trim()
    if (!identifier) {
      setError('أدخل رقم جوالك.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const attempt = await signIn.create({ identifier })
      const factors = attempt.supportedFirstFactors ?? []
      const hasPassword = factors.some((factor) => factor.strategy === 'password')
      const phoneCode = factors.find((factor) => factor.strategy === 'phone_code')

      if (hasPassword) {
        setStep('password')
        return
      }

      if (phoneCode && 'phoneNumberId' in phoneCode) {
        // رمز الجوال يحتاج إرسالًا صريحًا أولًا.
        await signIn.prepareFirstFactor({
          strategy: 'phone_code',
          phoneNumberId: phoneCode.phoneNumberId,
        })
        setStep('code')
        return
      }

      setError('هذا الحساب لا يدعم الدخول بكلمة المرور أو رمز الجوال. تواصل مع الدعم.')
    } catch (caught) {
      setError(readClerkError(caught, 'تعذّر بدء تسجيل الدخول.'))
    } finally {
      setBusy(false)
    }
  }, [busy, isLoaded, phone, signIn])

  /** الخطوة 2أ — كلمة المرور. */
  const submitPassword = useCallback(async () => {
    if (!signIn || busy) return
    if (!password) {
      setError('أدخل كلمة المرور.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const attempt = await signIn.attemptFirstFactor({ strategy: 'password', password })
      if (attempt.status === 'complete') {
        await finish(attempt.createdSessionId)
        return
      }
      setError('لم يكتمل تسجيل الدخول. أعد المحاولة.')
    } catch (caught) {
      setError(readClerkError(caught, 'كلمة المرور غير صحيحة.'))
    } finally {
      setBusy(false)
    }
  }, [busy, finish, password, signIn])

  /** الخطوة 2ب — رمز الجوال. */
  const submitCode = useCallback(async () => {
    if (!signIn || busy) return
    if (!code.trim()) {
      setError('أدخل الرمز المرسل إلى جوالك.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const attempt = await signIn.attemptFirstFactor({ strategy: 'phone_code', code: code.trim() })
      if (attempt.status === 'complete') {
        await finish(attempt.createdSessionId)
        return
      }
      setError('لم يكتمل تسجيل الدخول. أعد المحاولة.')
    } catch (caught) {
      setError(readClerkError(caught, 'الرمز غير صحيح.'))
    } finally {
      setBusy(false)
    }
  }, [busy, code, finish, signIn])

  const inputStyle = useMemo(
    () => [
      styles.input,
      {
        backgroundColor: t.colors.surface,
        borderColor: t.colors.border,
        borderRadius: t.radius.sm,
        color: t.colors.text,
        fontFamily: t.font.medium,
        fontSize: t.fontSize.base,
      },
    ],
    [t],
  )

  const title = step === 'phone' ? 'تسجيل الدخول' : step === 'password' ? 'كلمة المرور' : 'رمز التحقق'
  const hint =
    step === 'phone'
      ? 'أدخل رقم جوالك بالصيغة الدولية، مثال: ‎+9665XXXXXXXX'
      : step === 'password'
        ? `أدخل كلمة المرور لحساب ${phone.trim()}`
        : `أرسلنا رمزًا إلى ${phone.trim()}`

  return (
    <Screen scroll edges={{ top: true, bottom: true }}>
      <KeyboardAvoidingView
        // أندرويد يضبط الواجهة بنفسه (`adjustResize`) ولا يحتاج هذا الغلاف.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={[styles.hero, { marginTop: t.space[10] }]}>
          <AppText variant="title" weight="heavy">
            فاحص
          </AppText>
          <AppText variant="body" tone="muted" style={{ marginTop: t.space[2] }}>
            فحص سيارتك في الشرقية وأنت في مدينة ثانية
          </AppText>
        </View>

        <View style={{ marginTop: t.space[10] }}>
          <AppText variant="heading" weight="bold">
            {title}
          </AppText>
          <AppText variant="caption" style={{ marginTop: t.space[2] }}>
            {hint}
          </AppText>

          <View style={{ marginTop: t.space[5] }}>
            {step === 'phone' ? (
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+9665XXXXXXXX"
                placeholderTextColor={t.colors.textMuted}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                editable={!busy}
                // `writingDirection: ltr` لأن الرقم لاتيني داخل واجهة عربية؛
                // بلا هذا يبدأ الرقم من اليمين فيظهر مقلوبًا.
                style={[...inputStyle, styles.ltrInput]}
                onSubmitEditing={submitPhone}
                returnKeyType="next"
              />
            ) : null}

            {step === 'password' ? (
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={t.colors.textMuted}
                secureTextEntry
                autoComplete="current-password"
                editable={!busy}
                style={[...inputStyle, styles.ltrInput]}
                onSubmitEditing={submitPassword}
                returnKeyType="go"
              />
            ) : null}

            {step === 'code' ? (
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={t.colors.textMuted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                editable={!busy}
                style={[...inputStyle, styles.ltrInput]}
                onSubmitEditing={submitCode}
                returnKeyType="go"
              />
            ) : null}
          </View>

          {error ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: t.tones.cancelled.background, borderColor: t.tones.cancelled.border, borderRadius: t.radius.sm },
              ]}
            >
              <AppText variant="caption" weight="semibold" style={{ color: t.tones.cancelled.text }}>
                {error}
              </AppText>
            </View>
          ) : null}

          <View style={{ marginTop: t.space[6] }}>
            <Button
              label={step === 'phone' ? 'متابعة' : 'تسجيل الدخول'}
              onPress={step === 'phone' ? submitPhone : step === 'password' ? submitPassword : submitCode}
              loading={busy}
              disabled={!isLoaded}
              size="lg"
            />
          </View>

          {step !== 'phone' ? (
            <View style={{ marginTop: t.space[4] }}>
              <Button
                label="رجوع"
                onPress={() => {
                  setStep('phone')
                  setPassword('')
                  setCode('')
                  setError(null)
                }}
                variant="ghost"
                size="sm"
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

/**
 * رسالة خطأ عربية من خطأ Clerk.
 *
 * Clerk يرمي كائنًا يحمل `errors[]` برسائل **إنجليزية** من الخادم. عرضها
 * كما هي في تطبيق عربي غير مقبول، وصياغتها كلها ترجمة لا تنتهي. فالقاعدة:
 * الحالات الشائعة لها نصّ عربي، وما عداها رسالة عامة — ولا تُعرض رسالة
 * إنجليزية أبدًا.
 */
function readClerkError(caught: unknown, fallback: string): string {
  const code =
    caught && typeof caught === 'object' && 'errors' in caught
      ? (caught as { errors?: { code?: string }[] }).errors?.[0]?.code
      : undefined

  switch (code) {
    case 'form_identifier_not_found':
      return 'لا يوجد حساب بهذا الرقم. تحقّق من الرقم أو أنشئ حسابًا جديدًا.'
    case 'form_password_incorrect':
      return 'كلمة المرور غير صحيحة.'
    case 'form_param_format_invalid':
      return 'صيغة الرقم غير صحيحة. استخدم الصيغة الدولية مثل ‎+9665XXXXXXXX.'
    case 'verification_expired':
      return 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.'
    case 'too_many_requests':
      return 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.'
    default:
      return fallback
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center' },
  input: {
    height: 52,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  // اتجاه الكتابة داخل الحقل لاتيني (أرقام، كلمة مرور، رمز) مع محاذاة يمين
  // في واجهة RTL — `ltr` هنا يخصّ ترتيب المحارف لا موضع الحقل.
  ltrInput: { writingDirection: 'ltr', textAlign: 'left' },
  errorBox: { marginTop: 16, borderWidth: 1, padding: 12 },
})
