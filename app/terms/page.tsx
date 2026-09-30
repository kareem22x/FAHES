import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import SiteHeader from '@/components/site-header'
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  FileText,
  Gavel,
  Handshake,
  Info,
  RefreshCw,
  Scale,
  UserRound,
  Wallet,
  XCircle,
} from 'lucide-react'
import '../public-pages.css'

export const metadata = { title: 'الشروط والأحكام' }

const navigation = [
  { href: '/#how-it-works', label: 'كيف تعمل المنصة؟' },
  { href: '/#services', label: 'خدمات الفحص' },
  { href: '/#faq', label: 'الأسئلة الشائعة' },
]

/** Static string on purpose: a runtime date would opt the page out of static rendering. */
const lastUpdated = 'سبتمبر 2026'

type Block = { lead?: string; items?: string[] }
type Section = { id: string; title: string; icon: typeof Scale; blocks: Block[]; note?: React.ReactNode }

const sections: Section[] = [
  {
    id: 'service',
    title: 'طبيعة الخدمة',
    icon: Handshake,
    blocks: [
      {
        items: [
          'منصة «فاحص» وسيط إلكتروني يربط طالب الفحص (العميل) بفاحصي سيارات مستقلين في مدن ومحافظات المنطقة الشرقية.',
          'المنصة لا تنفّذ الفحص بنفسها، ولا تملك المركبات محل الفحص، ولا تعمل وكيلًا عن أي من الطرفين.',
          'ينشر العميل طلب الفحص من حسابه بعد تحديد بيانات المركبة وموقعها ونوع الفحص والموعد، ويظهر الطلب للفاحصين المعتمدين في نطاق المدينة المحددة.',
          'الفحص ينفّذه فاحص مستقل يختاره العميل من بين العروض التي تصله على طلبه.',
        ],
      },
    ],
    note: 'استخدامك للمنصة يعني موافقتك على هذه الشروط وعلى سياسة الخصوصية.',
  },
  {
    id: 'responsibilities',
    title: 'مسؤوليات العميل والفاحص',
    icon: UserRound,
    blocks: [
      {
        lead: 'مسؤوليات العميل:',
        items: [
          'إدخال بيانات صحيحة للمركبة والموقع ووسيلة الوصول إليها عند نشر الطلب.',
          'توفير إمكانية الوصول إلى المركبة في الموعد المحدد في الطلب.',
          'إثبات أحقيته في التصرف بالمركبة أو حصوله على إذن مالكها قبل طلب الفحص.',
          'استخدام التقرير كمصدر من مصادر القرار، وعدم اعتباره تعهدًا بحالة المركبة.',
        ],
      },
      {
        lead: 'مسؤوليات الفاحص المستقل:',
        items: [
          'إجراء معاينة ميدانية للسيارة وتوثيق ما يلاحظه من صور وملاحظات.',
          'الالتزام بالموعد المحدد في الطلب، وإبلاغ العميل قبل موعد الزيارة عند تعذّر الحضور.',
          'المحافظة على سرية بيانات الطلب وموقع السيارة، وعدم استخدامها لغير تنفيذ الفحص.',
          'عدم طلب أي مبالغ خارج ما تم الاتفاق عليه مع العميل.',
        ],
      },
    ],
  },
  {
    id: 'pricing',
    title: 'الأسعار والدفع',
    icon: Wallet,
    blocks: [
      {
        items: [
          'يقدّم كل فاحص عرضه بسعره على الطلب المنشور، ويختار العميل العرض الأنسب له.',
          'الدفع الإلكتروني غير مفعّل حاليًا: لا تتم أي عملية دفع داخل المنصة، ولا تحتفظ المنصة ببيانات بطاقات أو بمبالغ.',
          'أي اتفاق مالي بين العميل والفاحص يتم بينهما مباشرة، ولا تتولى المنصة تحصيل أي مبلغ نيابة عن الفاحص.',
          'السعر المعروض يأتي من الفاحص، ولا تضمن المنصة استمراره إذا تغيّر نطاق العمل أو موعده.',
        ],
      },
    ],
    note: 'لا توجد حاليًا أي وسيلة دفع إلكتروني داخل المنصة، وسنحدّث هذه الشروط إذا أُضيفت.',
  },
  {
    id: 'cancellation',
    title: 'إلغاء الطلب',
    icon: XCircle,
    blocks: [
      {
        items: [
          'لا يوفّر حسابك حاليًا خيار إلغاء الطلب من المنصة.',
          'إذا احتجت تأجيل الموعد أو إلغاءه، أخبر الفاحص عند تواصله معك قبل الزيارة.',
          'لا تفرض المنصة حاليًا أي رسوم على الإلغاء.',
        ],
      },
    ],
    note: 'متابعة حالة الطلب متاحة في أي وقت من لوحة التحكم في حسابك.',
  },
  {
    id: 'liability',
    title: 'حدود المسؤولية',
    icon: Scale,
    blocks: [
      {
        items: [
          'التقرير يعكس ملاحظات المعاينة الظاهرية للمركبة في وقت الفحص، ولا يُعد تعهدًا بحالة المركبة أو بخلوّها من العيوب الظاهرة أو الخفية.',
          'التقرير مساعدة على القرار، ولا يُغني عن أي فحص فني أو نظامي تفرضه الجهات المختصة.',
          'قرار الشراء أو البيع أو التسعير يبقى قرار العميل وحده، والمنصة غير مسؤولة عن نتائجه.',
          'لا تتحمل المنصة مسؤولية أي اتفاق أو مبلغ يتم بين العميل والفاحص خارج المنصة.',
        ],
      },
    ],
    note: 'نحرص على توثيق الملاحظات بالصور قدر الإمكان، لكن العيوب التي تظهر بعد انتهاء الفحص لا تقع ضمن نطاق الخدمة.',
  },
  {
    id: 'account',
    title: 'الحساب والاستخدام المقبول',
    icon: BadgeCheck,
    blocks: [
      {
        items: [
          'إنشاء الحساب وتسجيل الدخول يتمّان عبر مقدم خدمة المصادقة Clerk، وأنت مسؤول عن المحافظة على سرية وسيلة الدخول الخاصة بك.',
          'تُستخدم المنصة للأغراض المشروعة فقط، ويُمنع نشر بيانات مضللة أو محتوى مخالف للأنظمة.',
          'يراجع فريق المنصة طلبات الانضمام إلى شبكة الفاحصين، ويمكنه اعتماد الطلب أو رفضه أو إيقاف حساب الفاحص.',
        ],
      },
    ],
  },
  {
    id: 'changes',
    title: 'التعديلات',
    icon: RefreshCw,
    blocks: [
      {
        items: [
          'قد نحدّث هذه الشروط عند تغيّر الخدمة أو الأنظمة، ويظهر تاريخ آخر تحديث في أعلى الصفحة.',
          'استمرارك في استخدام المنصة بعد نشر التعديلات يعني موافقتك عليها.',
        ],
      },
    ],
  },
  {
    id: 'law',
    title: 'القانون المطبق',
    icon: Gavel,
    blocks: [
      {
        items: [
          'تخضع هذه الشروط وتُفسَّر وفق أنظمة المملكة العربية السعودية.',
          'أي نزاع ينشأ عن استخدام المنصة يُحال إلى الجهات القضائية المختصة في المملكة.',
        ],
      },
    ],
  },
  {
    id: 'contact',
    title: 'التواصل بشأن هذه الشروط',
    icon: Info,
    blocks: [
      {
        items: [
          'لمتابعة أي طلب قائم أو طلب توضيح يخص طلبك، استخدم لوحة التحكم في حسابك.',
          'لأسئلة الاستخدام العامة وخطوات طلب الفحص، راجع مركز المساعدة.',
        ],
      },
    ],
    note: (
      <>
        <Link className="site-inline-link" href="/help">مركز المساعدة <ArrowLeft size={14} /></Link>
        <Link className="site-inline-link" href="/dashboard">لوحة التحكم <ArrowLeft size={14} /></Link>
      </>
    ),
  },
]

export default function TermsPage() {
  return (
    <main dir="rtl" className="site-shell">
      <SiteHeader navigation={navigation} />

      <section className="pub-hero">
        <div className="site-container pub-hero-inner">
          <span className="site-eyebrow site-eyebrow-light"><Scale size={14} /> قواعد استخدام المنصة</span>
          <h1>الشروط والأحكام</h1>
          <p>
            توضّح هذه الشروط العلاقة بينك وبين منصة فاحص والفاحصين المستقلين العاملين عليها: طبيعة الخدمة،
            ومسؤوليات كل طرف، والأسعار والإلغاء، وحدود مسؤوليتنا.
          </p>
          <div className="pub-meta">
            <span className="pub-chip"><Clock3 size={14} /> آخر تحديث: {lastUpdated}</span>
            <span className="pub-chip"><FileText size={14} /> تنطبق على جميع مستخدمي المنصة</span>
          </div>
        </div>
      </section>

      <section className="pub-section">
        <div className="site-container pub-layout">
          <aside className="pub-toc">
            <h2>محتويات الصفحة</h2>
            <ol>
              {sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}
            </ol>
          </aside>

          <div className="pub-doc">
            {sections.map(({ id, title, icon: Icon, blocks, note }) => (
              <section key={id} id={id} className="app-panel">
                <div className="app-panel-head">
                  <span className="app-panel-icon"><Icon size={20} /></span>
                  <div><h2>{title}</h2></div>
                </div>
                {blocks.map((block, index) => (
                  <div key={block.lead ?? index}>
                    {block.lead && <p>{block.lead}</p>}
                    {block.items && <ul className="pub-list">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>}
                  </div>
                ))}
                {note && <div className="pub-note"><Info size={15} /><div>{note}</div></div>}
              </section>
            ))}
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
