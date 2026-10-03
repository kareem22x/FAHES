import Link from 'next/link'
import MotionCard from '@/components/motion-card'
import BrandMark from '@/components/brand-mark'
import SiteHeader from '@/components/site-header'
import ScrollProgress from '@/components/scroll-progress'
import TiltFrame from '@/components/tilt-frame'
import FaqAccordion from '@/components/faq-accordion'
import CitiesSection from '@/components/cities-section'
import CountUp from '@/components/count-up'
import Advanced3DCard from '@/components/motion/advanced-3d-card'
import FloatingParticles from '@/components/motion/particle-system'
import { SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import {
  ArrowLeft,
  BadgeCheck,
  CarFront,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileText,
  MapPin,
  ShieldCheck,
  Star,
} from 'lucide-react'

const steps = [
  { number: '01', title: 'حدد موقع السيارة', text: 'اختر مدينتها وحيّها في المنطقة الشرقية، حتى لو كنت في مدينة ثانية.' },
  { number: '02', title: 'يصلها الفاحص', text: 'فاحص قريب يزور السيارة ويفحصها على الطبيعة.' },
  { number: '03', title: 'استلم تقريرك', text: 'تقرير بالصور والملاحظات يصلك وين ما كنت.' },
]

const services = [
  { icon: CarFront, title: 'فحص شامل', text: 'صورة متكاملة عن حالة السيارة من الداخل والخارج.' },
  { icon: ShieldCheck, title: 'فحص الهيكل والبوية', text: 'كشف الحوادث والرشوش وآثار الإصلاح.' },
  { icon: FileText, title: 'فحص ميكانيكي', text: 'تقييم المحرك والقير والأنظمة الأساسية.' },
  { icon: ClipboardCheck, title: 'فحص حسب الطلب', text: 'اختر النقاط التي تهمك قبل اتخاذ قرارك.' },
]

const faqs = [
  { question: 'أقدر أفحص السيارة وأنا في مدينة ثانية؟', answer: 'نعم، حدد موقع السيارة في الشرقية وسيتوجه الفاحص إليها، وتستلم التقرير عن بُعد.' },
  { question: 'وش المدن والمحافظات اللي تشملها التغطية؟', answer: 'تشمل التغطية مدن ومحافظات المنطقة الشرقية، من الدمام والخبر إلى الأحساء والجبيل وحفر الباطن.' },
  { question: 'كم يستغرق فحص السيارة؟', answer: 'يستغرق الفحص عادةً من 30 إلى 60 دقيقة، حسب نوع الفحص وحالة السيارة.' },
  { question: 'ماذا يتضمن تقرير الفحص؟', answer: 'تحصل على ملاحظات الفاحص وصور للسيارة وتقييم واضح لأهم أجزائها.' },
]

const navigation = [
  { href: '#how-it-works', label: 'كيف تعمل المنصة؟' },
  { href: '#services', label: 'خدمات الفحص' },
  { href: '#cities', label: 'مناطق التغطية' },
  { href: '#faq', label: 'الأسئلة الشائعة' },
]

const proofPoints = [
  { icon: ShieldCheck, title: 'فاحصون مستقلون', text: 'رأي مهني ومحايد' },
  { icon: FileText, title: 'تقرير واضح', text: 'تفاصيل تساعدك تقرر' },
  { icon: MapPin, title: 'مدن الشرقية', text: 'الفحص عند السيارة' },
  { icon: Clock3, title: 'أنت في مكانك', text: 'تقريرك يصلك عن بُعد' },
]

const stats = [
  { value: SUPPORTED_CITIES.length, suffix: '', label: 'مدن مدعومة', note: 'متاحة الآن في المنطقة الشرقية' },
  { value: services.length, suffix: '', label: 'أنواع فحص', note: 'شامل، هيكل، ميكانيكي، حسب الطلب' },
  { value: 3, suffix: '', label: 'خطوات فقط', note: 'من إرسال الطلب إلى التقرير' },
  { value: 60, suffix: '', label: 'دقيقة', note: 'متوسط مدة الفحص الميداني' },
]

export default function Page() {
  return (
    <main className="site-shell">
      <ScrollProgress />

      <div className="site-topline">
        <div className="site-container site-topline-inner">
          <span className="site-live-dot" />
          <span>سيارتك بالشرقية؟ نفحصها وأنت في مدينة ثانية</span>
          <Link href="/requests/new">اطلب فحصك الآن <ArrowLeft size={14} /></Link>
        </div>
      </div>

      <SiteHeader navigation={navigation} />

      <section className="site-hero">
        <div className="site-hero-aurora" aria-hidden="true" />
        <div className="site-hero-veil" aria-hidden="true" />
        <FloatingParticles count={25} className="hero-particles" aria-hidden="true" />

        <div className="site-container site-hero-grid">
          <div className="site-hero-copy hero-stagger">
            <div className="site-eyebrow site-eyebrow-light"><span className="site-live-dot" /> فحص سيارات في المنطقة الشرقية</div>
            <h1>سيارتك بالشرقية؟<br /><span className="hero-shimmer">نفحصها عنك.</span></h1>
            <p className="site-hero-description">
              لا يهم وين أنت. نرسل فاحصًا إلى موقع السيارة في مدن ومحافظات الشرقية، ونرسل لك تقريرًا واضحًا يساعدك تقرر قبل الشراء.
            </p>
            <div className="site-hero-actions">
              <Link href="/requests/new" className="site-button site-button-light shine magnetic-button">اطلب فحص سيارتك <ArrowLeft size={18} /></Link>
              <Link href="/become-inspector" className="site-text-link">انضم كفاحص <ArrowLeft size={16} /></Link>
            </div>
            <div className="site-hero-proof">
              <div className="site-proof-avatars" aria-hidden="true"><MapPin size={18} /></div>
              <p><strong>مدن ومحافظات الشرقية</strong><span>حدد موقع السيارة عند الطلب</span></p>
              <span className="site-proof-divider" />
              <p className="site-rating"><strong><Star size={13} fill="currentColor" /> طلب · عرض · تقرير</strong><span>تابعها من حسابك</span></p>
            </div>
          </div>

          <div className="site-hero-art" data-reveal="zoom" aria-label="معاينة تقرير فحص سيارة">
            <TiltFrame className="site-hero-frame">
              <div className="site-art-glow" />
              <div className="site-art-grid" />
              <div className="site-hero-spot" aria-hidden="true" />

              <div className="tilt-layer tilt-layer-top">
                <div className="site-float-note site-float-note-top animate-floaty">
                  <span className="site-note-icon"><BadgeCheck size={19} /></span>
                  <span><strong>فاحص معتمد</strong><small>تم التحقق من بياناته</small></span>
                  <Check size={17} className="site-note-check" />
                </div>
              </div>

              <MotionCard className="site-report-card">
                <div className="site-report-head">
                  <div><span className="site-report-kicker">خدمة فاحص</span><strong>فحص ميداني للسيارة</strong></div>
                  <span className="site-report-status"><span /> حسب الموعد</span>
                </div>
                <div className="site-car-visual">
                  <div className="site-car-orbit site-car-orbit-one" />
                  <div className="site-car-orbit site-car-orbit-two" />
                  <span className="site-car-icon"><CarFront size={100} strokeWidth={1.05} /></span>
                  <span className="site-car-spark site-car-spark-one">✳</span>
                  <span className="site-car-spark site-car-spark-two">✳</span>
                </div>
                <div className="site-report-location"><MapPin size={15} /><span>موقع السيارة المحدد في الطلب</span><span className="site-location-separator">·</span><span>المنطقة الشرقية</span></div>
                <div className="site-report-results">
                  <div><span className="site-result-icon site-result-good"><Check size={14} /></span><span><small>المركبة</small><strong>بنود الفحص</strong></span></div>
                  <div><span className="site-result-icon site-result-warn">!</span><span><small>التوثيق</small><strong>صور وملاحظات</strong></span></div>
                  <div><span className="site-result-icon site-result-good"><Check size={14} /></span><span><small>المتابعة</small><strong>من حسابك</strong></span></div>
                </div>
                <div className="site-report-footer"><span><ClipboardCheck size={16} /> متابعة حالة الطلب</span><span>تقريرك بعد إتمام الفحص <ArrowLeft size={14} /></span></div>
              </MotionCard>

              <div className="tilt-layer tilt-layer-bottom">
                <div className="site-float-note site-float-note-bottom">
                  <span className="site-map-pin"><MapPin size={18} /></span>
                  <span><strong>الفاحص في موقع السيارة</strong><small>أنت تتابع من أي مكان</small></span>
                  <span className="site-ping" />
                </div>
              </div>

              <span className="site-art-caption"><Clock3 size={14} /> تقريرك جاهز بعد الفحص مباشرة</span>
            </TiltFrame>
          </div>
        </div>
        <div className="site-hero-curve" />
      </section>

      <section className="site-trust-strip" aria-label="مزايا فاحص">
        <div className="site-container site-trust-grid stagger-on-view">
          {proofPoints.map(({ icon: Icon, title, text }) => (
            <div key={title}><span className="site-trust-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{text}</small></span></div>
          ))}
        </div>
      </section>

      <section className="site-stats" aria-label="فاحص بالأرقام">
        <div className="site-container site-stats-grid stagger-on-view">
          {stats.map((stat) => (
            <div key={stat.label} className="site-stat">
              <strong><CountUp to={stat.value} suffix={stat.suffix} /></strong>
              <span className="site-stat-label">{stat.label}</span>
              <small>{stat.note}</small>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="site-section">
        <div className="site-container">
          <div className="site-section-heading" data-reveal="start">
            <div><span className="site-eyebrow">خطوات سهلة وواضحة</span><h2>من طلبك إلى تقريرك،<br /><span>كل شيء بمكانه.</span></h2></div>
            <p>أنت بعيد عن السيارة؟ نتولى الفحص في موقعها ونوصل لك النتيجة.</p>
          </div>
          <div className="site-steps-grid stagger-on-view">
            {steps.map((step, index) => (
              <Advanced3DCard key={step.number} className="site-step-card">
                <div className="site-step-top"><span className="site-step-number">{step.number}</span><span className="site-step-icon">{[<MapPin key="pin" size={21} />, <BadgeCheck key="badge" size={21} />, <FileText key="file" size={21} />][index]}</span></div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <span className="site-step-line" />
              </Advanced3DCard>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="site-services-section">
        <div className="site-container">
          <div className="site-section-heading site-services-heading" data-reveal="start">
            <div><span className="site-eyebrow">اختر اللي يناسبك</span><h2>فحص على قدّ <span>احتياجك.</span></h2></div>
            <Link href="/requests/new" className="site-inline-link hover-nudge-parent">كل خدمات الفحص <ArrowLeft size={16} className="hover-nudge" /></Link>
          </div>
          <div className="site-services-grid stagger-on-view">
            {services.map(({ icon: Icon, title, text }, index) => (
              <Advanced3DCard key={title} className={`site-service-card site-service-${index + 1}`}>
                <span className="site-service-icon"><Icon size={22} /></span>
                <span className="site-service-number">0{index + 1}</span>
                <h3>{title}</h3><p>{text}</p>
                <Link href="/requests/new" aria-label={`اطلب ${title}`}><ArrowLeft size={17} /></Link>
              </Advanced3DCard>
            ))}
          </div>
        </div>
      </section>

      <CitiesSection />

      <section id="faq" className="site-section site-faq-section">
        <div className="site-container site-faq-grid">
          <div className="site-faq-intro" data-reveal="end"><span className="site-eyebrow">إجابات واضحة</span><h2>عندك سؤال؟<br /><span>حنا هنا.</span></h2><p>جمعنا لك أهم الإجابات عشان تبدأ وأنت مطمئن.</p><Link href="/requests/new" className="site-inline-link hover-nudge-parent">ابدأ طلبك <ArrowLeft size={16} className="hover-nudge" /></Link></div>
          <FaqAccordion items={faqs} />
        </div>
      </section>

      <section className="site-final-cta">
        <div className="site-container site-final-cta-inner" data-reveal="zoom">
          <span className="site-cta-icon"><CarFront size={25} /></span>
          <div><h2>أنت بعيد؟ إحنا نفحصها.</h2><p>اطلب فحص سيارتك في الشرقية واستلم تقريرك وين ما كنت.</p></div>
          <Link href="/requests/new" className="site-button site-button-light shine">اطلب فحص سيارتك <ArrowLeft size={17} /></Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-container">
          <div className="site-footer-main" data-reveal="up">
            <div className="site-footer-brand"><Link href="/" className="site-brand"><BrandMark className="site-brand-mark" /><span>فاحص<span className="site-brand-period">.</span></span></Link><p>نفحص سيارتك في الشرقية، حتى لو كنت بمدينة ثانية.</p></div>
            <div className="site-footer-links"><Link href="/terms">الشروط والأحكام</Link><Link href="/privacy">الخصوصية</Link><Link href="/help">مركز المساعدة</Link><Link href="/become-inspector">كن فاحصًا</Link></div>
            <Link href="/requests/new" className="site-footer-cta">ابدأ طلب فحص <ArrowLeft size={15} /></Link>
          </div>
          <div className="site-footer-bottom" data-reveal="fade" data-reveal-delay="120"><span>© 2026 فاحص. جميع الحقوق محفوظة.</span><span>خدمة فحص سيارات المنطقة الشرقية.</span></div>
        </div>
      </footer>
    </main>
  )
}
