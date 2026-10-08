import { Tabs } from 'expo-router'
import { ClipboardList, User } from 'lucide-react-native'

import { useTheme } from '@/theme'

/**
 * شريط التبويبات — واجهة العميل.
 *
 * ── لماذا تبويبان لا أكثر ─────────────────────────────────────────────────
 *
 * القاعدة التي بنى عليها أوبر واجهته: التبويب لما يُفتح كل يوم، والباقي داخل
 * شاشة أو ورقة. العميل يفتح التطبيق لأمرين: يتابع طلبه، أو يعدّل حسابه.
 * «طلب جديد» إجراء لا قسم — مكانه زرّ عائم في قائمة الطلبات، لا تبويب رابع
 * يزاحم.
 *
 * ── واجهة الفاحص ──────────────────────────────────────────────────────────
 *
 * ستكون مجموعة تبويبات **منفصلة** لا تبويبًا ثالثًا هنا: الفاحص لا يرى طلباته
 * كعميل ولا حسابه كعميل، ولا يجوز أن يرى الاثنين. الفصل في التوجيه (M3) لا
 * في الشريط.
 */

export default function TabsLayout() {
  const t = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
          // الارتفاع 60 لا الافتراضي (~49): الشريط يحمل نصًّا عربيًّا تحت
          // الأيقونة، والعربية تحتاج سطرًا أطول. والأهم أنه يبقي هدف اللمس
          // فوق 44 نقطة.
          height: 60,
          paddingTop: 6,
          paddingBottom: 6,
        },
        tabBarLabelStyle: {
          fontFamily: t.font.semibold,
          fontSize: t.fontSize['2xs'],
        },
      }}
    >
      <Tabs.Screen
        name="orders"
        options={{
          title: 'طلباتي',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={2.2} />,
        }}
      />
    </Tabs>
  )
}
