# فاحص

منصة عربية لطلب فحص السيارات في مدن ومحافظات المنطقة الشرقية، ومتابعة الفحص عن بُعد.

## التقنية والبنية

- Next.js App Router وReact وTypeScript، بواجهات عربية RTL.
- Supabase PostgreSQL لتخزين الحسابات والطلبات والعروض والتقارير وسجل التدقيق.
- Supabase Storage خاص لملفات الفحص مع روابط موقعة قصيرة العمر.
- Clerk لتسجيل الدخول وإدارة الجلسات؛ رقم الجوال اختياري للعملاء، وإذا أُضيف فيُربط بعد التحقق بهوية Clerk وسجل المستخدم في Supabase.
- واجهات API محمية بهوية Clerk وبصلاحيات الأدوار وملكية الطلب.
- لا توجد لوحات معاينة أو بيانات طلبات تجريبية متاحة للعامة.

## بنية الواجهات

- `app/globals.css` طبقة الأنماط الأساسية (الرموز، التخطيط، الصفحة الرئيسية، مساحة الفاحص، الإدارة).
- `app/refresh.css` طبقة التحديث: رأس الموقع وقائمة الحساب، لوحة العميل، صفحات الدخول، ومقياس الخطوط. تُستورد بعد `globals.css` لتتقدم عند تعارض القواعد.
- الصفحة الرئيسية `app/page.tsx` مع `components/site-header.tsx` و`components/account-menu.tsx`: أيقونة الحساب فوق صورة المستخدم تفتح قائمة (طلباتي، لوحة التحكم، تقاريري، ملفي الشخصي، تسجيل الخروج).
- لوحة العميل `app/dashboard/`: `page.tsx` نظرة عامة، `requests/` طلباتي، `reports/` تقاريري، `profile/` الملف الشخصي، و`inspections/[id]/` تقرير الفحص.
- الملف الشخصي مشترك بين `/account` و`/dashboard/profile` عبر `components/account-profile.tsx`.
- صفحات عامة: `/terms` و`/privacy` و`/help` و`/become-inspector`.

## الإعداد المحلي

1. أنشئ مشروع Supabase ونفّذ ملفات `supabase/migrations/` بالترتيب الزمني من SQL Editor.
2. أنشئ `.env.local` من `.env.example` **إذا لم يكن موجودًا**، ثم أضف بيانات Supabase والأسرار وفق `SETUP.md`.
3. شغّل `pnpm install` و`pnpm dev`، ثم افتح `http://localhost:3000`.

## فحوص المشروع

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

المجلد `deepseek-harness/` غير مرتبط بالمشروع، وهو مستثنى في `tsconfig.json` و`eslint.config.mjs` و`.gitignore`؛ بدون هذا الاستثناء يستهلك `tsc` الذاكرة كاملة ويمرّ `eslint` على شجرة غير شجرة الموقع.

## متطلبات الإطلاق

أضف `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` و`CLERK_SECRET_KEY` و`SUPABASE_URL` و`SUPABASE_SECRET_KEY` و`SESSION_SECRET` و`RATE_LIMIT_PEPPER` في إعدادات الخادم/النشر المناسبة. لا تشارك أو ترفع `.env.local`. فعّل وسيلة دخول بديلة مثل البريد أو Google في لوحة Clerk، واجعل رقم الجوال اختياريًا؛ إعداد طرق الدخول يتم من Clerk وليس من التطبيق. التقديم كفاحص يتطلب رقم جوال موثقًا للتواصل. الدفع الإلكتروني غير مفعّل عمدًا. راجع `SETUP.md` و`DEPLOYMENT.md` و`SECURITY.md` للخطوات والحدود المتبقية.
