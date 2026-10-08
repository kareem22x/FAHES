import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AppAuthProvider } from '@/lib/auth'
import { assertEnv } from '@/lib/env'
import { enforceRTL } from '@/lib/rtl'
import { useAppFonts } from '@/theme/fonts'
import { useTheme } from '@/theme'

/**
 * التخطيط الجذري.
 *
 * ── ترتيب ما يحدث هنا مهم ─────────────────────────────────────────────────
 *
 *   1. `enforceRTL()` — على مستوى الوحدة، **قبل** رسم أي شاشة. المنصّة تقرأ
 *      قيمة الاتجاه عند الإقلاع فقط، فنداؤه داخل مكوّن متأخّر جدًّا.
 *   2. `SplashScreen.preventAutoHideAsync()` — قبل أول رسم، وإلا وميض شاشة
 *      بيضاء بين شاشة البداية والواجهة.
 *   3. `assertEnv()` — يشتكي مبكرًا على إعداد خاطئ بدل رسالة غامضة من Clerk.
 *
 * ── ترتيب المزوّدات ───────────────────────────────────────────────────────
 *
 * `GestureHandlerRootView` **الأب outermost** (تشترطه مكتبة الإيماءات لكل
 * شجرة)، ثم `SafeAreaProvider` (يوفّر الهوامش لكل شاشة)، ثم المصادقة، ثم
 * الثيم. عكس الترتيب يجعل `useSafeAreaInsets` يرمي في أول شاشة.
 */

enforceRTL()
assertEnv()

SplashScreen.preventAutoHideAsync().catch(() => {
  /* لا شيء: قد تكون أُخفيت مسبقًا في إعادة تحميل سريعة. */
})

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppAuthProvider>
          <ThemedNavigator />
        </AppAuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/**
 * الملّاح — منفصل لسببين حقيقيين:
 *
 *   1. `useTheme()` يجب أن يكون **داخل** `SafeAreaProvider` لا في مكوّن الجذر
 *      الذي يُركّب المزوّدات.
 *   2. تحميل الخط وإخفاء شاشة البداية يجب أن يحدثا **بعد** أن تُركَّب الشاشة
 *      الأولى — وإلا ظهر فراغ أسود لحظةً. الفصل يجعل هذه اللحظة واضحة.
 *
 * ── 🩸 الخطّ: كان يُعرَّف ولا يُنادى ────────────────────────────────────────
 *
 * `useAppFonts()` كانت مكتوبة وموثَّقة بـ«تُنادى في `_layout` الجذر» —
 * ولم تكن تُنادى في أي موضع. فلم تُسجَّل أي `@font-face`، وسقط كل نصّ إلى خطّ
 * النظام بصمت: لا خطأ ولا تحذير، فقط شكل مختلف. والفحوصات الساكنة تمرّ على
 * ذلك كله. الإثبات الوحيد هو `document.fonts` — لا `getComputedStyle`.
 */
function ThemedNavigator() {
  const t = useTheme()
  const { loaded: fontsLoaded, failed: fontsFailed } = useAppFonts()

  // «استقرّ الخط» = نجح أو فشل. انتظار النجاح وحده يُنتج تعليقًا أبديًّا.
  const fontsReady = fontsLoaded || fontsFailed

  useEffect(() => {
    // شبكة أمان: شاشة البداية المحجوبة تُنتج تطبيقًا **فارغًا** لا شاشة
    // رديئة. فلا يجوز أن يتوقّف إخفاؤها على أي شيء قد لا يصل.
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {
        /* لا شيء. */
      })
    }, 4000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!fontsReady) return
    // `requestAnimationFrame` يضمن أن الإطار الأول جاهز فعلًا قبل الإخفاء.
    const frame = requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => {
        /* لا شيء. */
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [fontsReady])

  // ثيم الملّاحة مبنيّ من رموزنا لا من ثيم المكتبة الافتراضي (أبيض/أسود
  // صريح) — وإلا ظهرت خلفية الرأس بيضاء في تطبيق داكن.
  const base = t.isDark ? DarkTheme : DefaultTheme
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: t.colors.background,
      card: t.colors.surface,
      text: t.colors.text,
      border: t.colors.border,
      primary: t.colors.accent,
    },
  }

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.colors.background },
          animation: 'slide_from_left',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      </Stack>
    </ThemeProvider>
  )
}
