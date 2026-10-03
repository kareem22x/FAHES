import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import SiteHeader from '@/components/site-header'
import { ArrowLeft, BadgeCheck, CheckCircle2, ClipboardList, MapPin, ShieldCheck } from 'lucide-react'
import { InspectorApplicationForm } from '@/components/modules/inspector/application-form'
import '../public-pages.css'

const navigation = [
  { href: '/#how-it-works', label: 'كيف تعمل المنصة؟' },
  { href: '/#services', label: 'خدمات الفحص' },
  { href: '/#faq', label: 'الأسئلة الشائعة' },
]

const benefits = ['حدّد مدن تغطيتك وحالة توفّرك للطلبات', 'استلم طلبات فحص قريبة من موقعك', 'ارفع التقارير والصور من مكان الفحص', 'تابع طلباتك ومواعيدك وتقاريرك من لوحة الفاحص']

export default function BecomeInspectorPage() {
  return (
    <main dir="rtl" className="site-shell bi-page">
      <SiteHeader navigation={navigation} />

      <section className="bi-hero">
        <div className="site-container bi-hero-grid">
          <div className="hero-stagger">
            <span className="site-eyebrow"><BadgeCheck size={15} /> انضم إلى شبكة الفاحصين</span>
            <h1>حوّل خبرتك إلى<br /><span>فرص ودخل.</span></h1>
            <p className="bi-lead">كن جزءًا من شبكة فاحصي السيارات الموثوقين في المنطقة الشرقية، وساعد المشترين على اتخاذ قرار أفضل.</p>
            <div className="bi-actions">
              <a href="#application" className="btn btn-primary">ابدأ استبيان الانضمام <ClipboardList size={17} /></a>
              <Link href="/help" className="btn btn-ghost">مركز المساعدة</Link>
            </div>
          </div>

          <aside className="bi-panel">
            <span className="bi-panel-kicker"><ShieldCheck size={15} /> لماذا فاحص؟</span>
            <ul className="bi-benefits stagger-on-view">
              {benefits.map((benefit) => <li key={benefit}><CheckCircle2 size={17} />{benefit}</li>)}
            </ul>
            <div className="bi-facts">
              <div className="bi-fact"><MapPin size={18} /><strong>مدن متعددة</strong><small>اختر نطاق خدمتك</small></div>
              <div className="bi-fact"><ShieldCheck size={18} /><strong>فاحص موثق</strong><small>ثقة وأمان للطرفين</small></div>
            </div>
          </aside>
        </div>
      </section>

      <section className="bi-application reveal">
        <div className="site-container">
          <InspectorApplicationForm />
          <p className="bi-footnote">سيتم مراجعة بياناتك قبل تفعيل الحساب واستقبال الطلبات.</p>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-container">
          <div className="site-footer-main">
            <div className="site-footer-brand"><Link href="/" className="site-brand"><BrandMark className="site-brand-mark" /><span>فاحص<span className="site-brand-period">.</span></span></Link><p>نفحص سيارتك في الشرقية، حتى لو كنت بمدينة ثانية.</p></div>
            <div className="site-footer-links"><Link href="/terms">الشروط والأحكام</Link><Link href="/privacy">الخصوصية</Link><Link href="/help">مركز المساعدة</Link><Link href="/become-inspector">كن فاحصًا</Link></div>
            <Link href="/requests/new" className="site-footer-cta">ابدأ طلب فحص <ArrowLeft size={15} /></Link>
          </div>
          <div className="site-footer-bottom"><span>© 2026 فاحص. جميع الحقوق محفوظة.</span><span>خدمة فحص سيارات المنطقة الشرقية.</span></div>
        </div>
      </footer>
    </main>
  )
}
