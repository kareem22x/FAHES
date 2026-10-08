/**
 * `KeyboardAvoidingView` — على الويب.
 *
 * مكوّن React Native الأصلي لا نسخة المكتبة: `react-native-keyboard-controller`
 * لا تملك ملفّ `.web.*`، وكل استدعاءاتها على الويب `NOOP` ⇒ نسختها هنا
 * `View` عاديّة بلا إزاحة، أي **تراجع صامت**. الشرح الكامل في `keyboard.tsx`.
 *
 * وعلى الويب يحتاج `behavior` صريحًا (بخلاف أندرويد الأصلي) لأن المتصفّح لا
 * يُعيد تخطيط الصفحة عند ظهور لوحة المفاتيح.
 */
export { KeyboardAvoidingView } from 'react-native'
