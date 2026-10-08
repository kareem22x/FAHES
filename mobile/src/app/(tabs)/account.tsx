import Constants from 'expo-constants'
import { LogOut, Phone, ShieldCheck, User } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Card, Divider } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { AppText } from '@/components/ui/text'
import { useSession } from '@/lib/auth'
import { isRTLEffective } from '@/lib/rtl'
import { useTheme } from '@/theme'

/**
 * حسابي.
 *
 * ── لماذا لا تعديل للبيانات هنا ───────────────────────────────────────────
 *
 * رقم الجوال هو **هوية الحساب** في هذا المنتج، وتغييره يمرّ عبر بوابة تحقّق
 * على الويب (`/verify-phone` ثم `/api/account/phone`). إضافة نموذج ثانٍ في
 * التطبيق تعني مسارين لتغيير الهوية — وهو آخر ما يجوز أن يتباعد بين واجهتين.
 * فالتطبيق يعرض ويُخرج، والويب يعدّل.
 */

export default function AccountScreen() {
  const t = useTheme()
  const { displayName, phone, userId, signOut } = useSession()
  const [busy, setBusy] = useState(false)

  const version = Constants.expoConfig?.version ?? '1.0.0'

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: t.space[6] }}>
        <AppText variant="title" weight="heavy">
          حسابي
        </AppText>
      </View>

      <Card style={{ marginTop: t.space[5] }}>
        <View style={{ padding: t.space[4] }}>
          <Row icon={<User color={t.colors.textMuted} size={16} strokeWidth={2} />} label="الاسم">
            {displayName ?? '—'}
          </Row>
          <Divider inset={0} />
          <Row icon={<Phone color={t.colors.textMuted} size={16} strokeWidth={2} />} label="رقم الجوال">
            {phone ?? '—'}
          </Row>
          {userId ? (
            <>
              <Divider inset={0} />
              <Row
                icon={<ShieldCheck color={t.colors.textMuted} size={16} strokeWidth={2} />}
                label="معرّف الحساب"
                ltr
              >
                {userId}
              </Row>
            </>
          ) : null}
        </View>
      </Card>

      <View style={{ marginTop: t.space[6] }}>
        <Button
          label="تسجيل الخروج"
          onPress={handleSignOut}
          variant="secondary"
          loading={busy}
          icon={<LogOut color={t.colors.text} size={16} strokeWidth={2.2} />}
        />
      </View>

      <AppText variant="caption" align="center" style={{ marginTop: t.space[6] }}>
        فاحص · الإصدار {version}
      </AppText>

      {/*
        تشخيص الاتجاه. `I18nManager.forceRTL` يُقرأ عند إقلاع التطبيق فقط، فأول
        تشغيل بعد تثبيته قد يظهر LTR حتى إعادة تحميل واحدة. عرض الحالة هنا
        يجعل ذلك مُشخَّصًا لا مُخمَّنًا — وهو سطر واحد يكفي.
      */}
      {!isRTLEffective() ? (
        <AppText variant="caption" align="center" tone="warning" style={{ marginTop: t.space[2] }}>
          الاتجاه العربي يحتاج إعادة تشغيل التطبيق مرّة واحدة ليُطبَّق.
        </AppText>
      ) : null}
    </Screen>
  )
}

function Row({
  icon,
  label,
  children,
  ltr = false,
}: {
  icon: React.ReactNode
  label: string
  children: string
  ltr?: boolean
}) {
  const t = useTheme()
  return (
    <View style={[styles.row, { paddingVertical: t.space[3] }]}>
      {icon}
      <AppText variant="caption" style={styles.label}>
        {label}
      </AppText>
      <AppText variant="label" weight="semibold" ltr={ltr} style={styles.value} numberOfLines={1}>
        {children}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 96 },
  value: { flex: 1, minWidth: 0, textAlign: 'left' },
})
