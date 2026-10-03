import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import SiteHeader from '@/components/site-header'
import { COMING_SOON_CITIES, SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import {
  ArrowLeft,
  BadgeCheck,
  CarFront,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  LifeBuoy,
  LayoutDashboard,
  MapPin,
  UserRound,
  Wallet,
} from 'lucide-react'
import '../public-pages.css'

export const metadata = { title: 'مركز المساعدة' }

const navigation = [
  { href: '/#how-it-works', label: 'كيف تعمل المنصة؟' },
  { href: '/#services', label: 'خدمات الفحص' },
  { href: '/#faq', label: 'الأسئلة الشائعة' },
]

const steps = [
  { number: '01', icon: UserRound, title: 'أنشئ حسابك', text: 'تسجيل الدخول في فاحص مُدار عبر Clerk، ويحتاج حسابك لمتابعة الطلب واستلام التقرير.' },
  { number: '02', icon: CarFront, title: 'أدخل بيانات السيارة والموقع', text: 'حدد الشركة والموديل وسنة الصنع، ثم المدينة والحي وعنوان الوصول إلى السيارة في الشرقية.' },
  { number: '03', icon: ClipboardList, title: 'اختر نوع الفحص والموعد', text: 'فحص شامل أو ميكانيكي أو هيكل وبوية أو فحص كمبيوتر، مع الموعد الذي يناسبك، ثم انشر الطلب.' },
  { number: '04', icon: FileCheck2, title: 'اختر العرض واستلم التقرير', text: 'تتابع عروض الفاحصين من لوحة التحكم، وبعد إتمام الفحص يظهر التقرير بالصور والملاحظات في حسابك.' },
]

const faqs = [
  { question: 'كيف أبدأ طلب فحص؟', answer: 'سجّل الدخول إلى حسابك، ثم افتح صفحة «اطلب فحصًا» وأدخل بيانات السيارة وموقعها ونوع الفحص والموعد، وبعد نشر الطلب يظهر للفاحصين المعتمدين في مدينة السيارة.' },
  { question: 'هل لازم أكون موجودًا مع السيارة وقت الفحص؟', answer: 'لا، حدد موقع السيارة ووسيلة الوصول إليها بدقة. الفاحص يزور الموقع ويرفع ملاحظاته وصوره، والتقرير يظهر في حسابك.' },
  { question: 'كم تكلفة الفحص؟', answer: 'يقدّم كل فاحص سعره في عرضه على طلبك، وتختار العرض الأنسب لك من لوحة التحكم.' },
  { question: 'كيف يتم الدفع؟', answer: 'الدفع الإلكتروني غير مفعّل حاليًا في المنصة، ولا نحتفظ ببيانات بطاقات. أي اتفاق مالي يتم بينك وبين الفاحص مباشرة.' },
  { question: 'كيف أتابع حالة طلبي؟', answer: 'من لوحة التحكم تشاهد حالة الطلب والعروض الواردة عليه، ومن صفحة «تقاريري» تصل إلى تقارير الفحوص الجاهزة.' },
  { question: 'متى يظهر تقرير الفحص؟', answer: 'يظهر التقرير في حسابك بعد أن يرفعه الفاحص بعد إتمام المعاينة. وقبل ذلك تبقى حالة الطلب ظاهرة لك في لوحة التحكم.' },
  { question: 'أقدر ألغي الطلب؟', answer: 'لا يوفّر حسابك حاليًا زر إلغاء للطلب. إن احتجت تأجيل الموعد أو إلغاءه، أخبر الفاحص عند تواصله معك قبل الزيارة، ولا تفرض المنصة رسومًا على الإلغاء.' },
  { question: 'هل تشاركون رقم جوالي مع الفاحص؟', answer: 'لا يظهر للفاحص اسمك ولا رقم جوالك ولا بريدك الإلكتروني. الفاحص يرى تفاصيل الطلب وموقع السيارة فقط.' },
  { question: 'كيف أنضم كفاحص؟', answer: 'من صفحة «كن فاحصًا» تعبّئ استبيان الانضمام: سنوات الخبرة، ومجالات الفحص، والمدن التي تغطيها، ونوع التوفر، ومعدات الفحص. نراجع الطلب ثم نفعّل الحساب.' },
]

export default function HelpPage() {
  return (
    <main dir="rtl" className="site-shell">
      <SiteHeader navigation={navigation} />

      <section className="pub-hero">
        <div className="site-container pub-hero-inner">
          <span className="site-eyebrow site-eyebrow-light"><LifeBuoy size={14} /> كيف نوصلك لتقريرك</span>
          <h1>مركز المساعدة</h1>
          <p>كل ما تحتاجه للبدء: خطوات طلب الفحص، إجابات الأسئلة المتكررة، والمدن المشمولة في المنطقة الشرقية.</p>
          <div className="pub-meta">
            <span className="pub-chip"><ClipboardList size={14} /> خطوات الطلب بالتفصيل</span>
            <span className="pub-chip"><MapPin size={14} /> {SUPPORTED_CITIES.length} مدن متاحة الآن</span>
            <span className="pub-chip"><Wallet size={14} /> الدفع الإلكتروني غير مفعّل حاليًا</span>
          </div>
        </div>
      </section>

      <section id="how-to-request" className="site-section">
        <div className="site-container">
          <div className="site-section-heading reveal">
            <div><span className="site-eyebrow">أربع خطوات فقط</span><h2>كيف أطلب فحصًا؟<br /><span>من الطلب إلى التقرير.</span></h2></div>
            <p>تحتاج دقائق لإرسال الطلب، ونحن نوصله للفاحصين القريبين من موقع السيارة.</p>
          </div>
          <div className="pub-steps stagger-on-view">
            {steps.map(({ number, icon: Icon, title, text }) => (
              <article key={number} className="site-step-card">
                <div className="site-step-top"><span className="site-step-number">{number}</span><span className="site-step-icon"><Icon size={21} /></span></div>
                <h3>{title}</h3>
                <p>{text}</p>
                <span className="site-step-line" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="site-faq-section">
        <div className="site-container site-faq-grid">
          <div className="site-faq-intro reveal">
            <span className="site-eyebrow">إجابات واضحة</span>
            <h2>أسئلة تتكرر<br /><span>على العملاء.</span></h2>
            <p>إذا ما وجدت جوابك هنا، ابدأ طلبك وتابع التفاصيل من لوحة التحكم.</p>
            <Link href="/requests/new" className="site-inline-link">ابدأ طلبك <ArrowLeft size={16} /></Link>
          </div>
          <div className="site-faq-list stagger-on-view">
            {faqs.map((faq) => (
              <details key={faq.question}><summary>{faq.question}<ChevronDown size={19} /></summary><p>{faq.answer}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section id="cities" className="site-cities-section">
        <div className="site-container site-cities-inner">
          <div className="reveal">
            <span className="site-eyebrow site-eyebrow-light">تغطيتنا في المنطقة الشرقية</span>
            <h2>وش المدن المشمولة؟<br /><span>نفحصها عنك.</span></h2>
            <p>نغطي حالياً {SUPPORTED_CITIES.length} مدن في المنطقة الشرقية. اختر موقع السيارة عند إرسال طلبك.</p>
          </div>
          {/*
            Split rather than one flat list: the covered cities are the answer to
            the question, the rest are a roadmap. Showing them at equal weight
            would imply we serve cities the booking form rejects.
          */}
          <div className="site-city-list stagger-on-view">
            {SUPPORTED_CITIES.map((city) => <span key={city}><MapPin size={15} />{city}</span>)}
          </div>
          <p className="site-cities-disclaimer">مدن قادمة قريباً: {COMING_SOON_CITIES.join('، ')}.</p>
          <div className="site-cities-decoration" aria-hidden="true"><MapPin size={74} strokeWidth={0.8} /></div>
        </div>
      </section>

      <section id="contact" className="site-section">
        <div className="site-container">
          <div className="site-section-heading reveal">
            <div><span className="site-eyebrow">تحتاج مساعدة؟</span><h2>ابدأ من حسابك،<br /><span>كل شيء هناك.</span></h2></div>
            <p>لا يوجد بريد دعم منشور حاليًا. طلبك وبيانات حسابك هما أسرع طريق للمتابعة.</p>
          </div>
          <div className="pub-contact-grid">
            <div className="app-panel is-soft">
              <div className="app-panel-head">
                <span className="app-panel-icon"><ClipboardList size={20} /></span>
                <div><h2>طلب فحص جديد</h2><p>انشر الطلب وسيظهر للفاحصين المعتمدين في المدينة التي تحددها.</p></div>
              </div>
              <div className="pub-links">
                <Link href="/requests/new" className="app-panel-link"><span><CarFront size={17} /> اطلب فحصًا جديدًا</span><ArrowLeft size={16} /></Link>
                <Link href="/dashboard" className="app-panel-link"><span><LayoutDashboard size={17} /> تابع طلباتك وتقاريرك</span><ArrowLeft size={16} /></Link>
              </div>
            </div>

            <div className="app-panel">
              <div className="app-panel-head">
                <span className="app-panel-icon"><UserRound size={20} /></span>
                <div><h2>قبل أن تبدأ</h2><p>ثلاث نقاط تختصر عليك أغلب الأسئلة.</p></div>
              </div>
              <ul className="pub-checklist">
                {[
                  'تحتاج حسابًا لتتابع الطلب وتستلم التقرير.',
                  'الطلب يُنشر على الفاحصين المعتمدين في مدينة السيارة.',
                  'التقرير يعكس معاينة ظاهرية للسيارة في وقت الفحص.',
                ].map((item) => (
                  <li key={item}><BadgeCheck size={15} />{item}</li>
                ))}
              </ul>
              <div className="pub-actions">
                <Link href="/login" className="btn btn-ghost btn-sm">تسجيل الدخول</Link>
                <Link href="/become-inspector" className="btn btn-ghost btn-sm">كن فاحصًا</Link>
              </div>
            </div>
          </div>
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
