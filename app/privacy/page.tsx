import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import SiteHeader from '@/components/site-header'
import {
  ArrowLeft,
  Clock3,
  Database,
  FileSearch,
  FileText,
  Handshake,
  Info,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import '../public-pages.css'

export const metadata = { title: 'سياسة الخصوصية' }

const navigation = [
  { href: '/#how-it-works', label: 'كيف تعمل المنصة؟' },
  { href: '/#services', label: 'خدمات الفحص' },
  { href: '/#faq', label: 'الأسئلة الشائعة' },
]

/** Static string on purpose: a runtime date would opt the page out of static rendering. */
const lastUpdated = 'سبتمبر 2026'

type Block = { lead?: string; items?: string[] }
type Section = { id: string; title: string; icon: typeof Lock; blocks: Block[]; note?: React.ReactNode }

const sections: Section[] = [
  {
    id: 'scope',
    title: 'نطاق هذه السياسة',
    icon: FileText,
    blocks: [
      {
        items: [
          'تنطبق هذه السياسة على منصة فاحص وعلى البيانات التي نجمعها عند إنشاء الحساب، أو نشر طلب فحص، أو تنفيذ الفحص، أو عرض التقرير.',
          'تشمل السياسة بيانات العملاء والفاحصين المستقلين الذين يستخدمون المنصة.',
          'لا تشمل السياسة أي موقع أو خدمة خارجية تصل إليها من رابط خارج فاحص.',
        ],
      },
    ],
  },
  {
    id: 'data',
    title: 'البيانات التي نجمعها',
    icon: Database,
    blocks: [
      {
        lead: 'بيانات الحساب (يديرها مقدم الخدمة Clerk):',
        items: [
          'الاسم الظاهر في الحساب ووسيلة الدخول: البريد الإلكتروني أو رقم الجوال.',
          'صورة الحساب إن وُجدت، وحالة توثيق وسيلة الدخول.',
        ],
      },
      {
        lead: 'بيانات الطلب:',
        items: [
          'بيانات المركبة: الشركة والموديل وسنة الصنع والممشى واللون.',
          'موقع الفحص: المدينة أو المحافظة والحي والعنوان أو وصف الموقع.',
          'نوع الفحص المطلوب والموعد المحدد والملاحظات التي تكتبها في الطلب.',
          'حالة الطلب، والعروض التي يقدّمها الفاحصون، وتفاصيل الإسناد.',
        ],
      },
      {
        lead: 'بيانات الفحص والتقارير:',
        items: [
          'الصور والملاحظات التي يرفعها الفاحص أثناء المعاينة الميدانية، وقد تشمل مقاطع فيديو قصيرة.',
          'ملخص التقرير النهائي الذي يظهر لك في حسابك بعد إتمام الفحص.',
        ],
      },
      {
        lead: 'بيانات تشغيلية أساسية:',
        items: [
          'سجلات الدخول الأساسية، مثل وقت آخر تسجيل دخول إلى حسابك.',
          'سجلات تقنية قصيرة العمر تُستخدم للحد من الطلبات المتكررة وحماية الخدمة، وتُخزَّن بصيغة غير قابلة للربط المباشر بهويتك.',
          'إحصاءات استخدام مجمّعة تُجمع في بيئة الإنتاج عبر Vercel Analytics.',
        ],
      },
    ],
  },
  {
    id: 'why',
    title: 'لماذا نجمع هذه البيانات',
    icon: FileSearch,
    blocks: [
      {
        items: [
          'إنشاء الحساب وتسجيل الدخول والتحقق من هوية المستخدم.',
          'ربط الطلب بفاحص يستطيع الوصول إلى موقع السيارة، وتنفيذ الفحص في الموعد.',
          'إعداد التقرير وعرضه في حسابك ومتابعة حالة الطلب خطوة بخطوة.',
          'استخدام بيانات التواصل عند الحاجة إلى مراجعة طلب الانضمام أو متابعة مشكلة في طلب قائم.',
          'حماية المنصة ومعالجة أي إساءة استخدام أو نزاع بين الأطراف.',
        ],
      },
    ],
  },
  {
    id: 'sharing',
    title: 'مشاركة البيانات',
    icon: Handshake,
    blocks: [
      {
        items: [
          'لا يظهر للفاحص اسم العميل ولا رقم جواله ولا بريده الإلكتروني؛ ما يظهر له هو تفاصيل الطلب وموقع السيارة بالقدر اللازم لتنفيذ الفحص.',
          'Clerk: مقدم خدمة المصادقة الذي يدير تسجيل الدخول ويحفظ بيانات الحساب الأساسية.',
          'Supabase: مزوّد قاعدة البيانات والتخزين الذي نحفظ عليه بيانات المنصة وملفات الفحص.',
          'Vercel Analytics: إحصاءات استخدام مجمّعة تُجمع في بيئة الإنتاج فقط.',
          'قد نشارك بيانات محددة استجابة لطلب نظامي من جهة مختصة، أو لحماية حقوق المنصة والمستخدمين.',
          'لا نبيع بياناتك الشخصية ولا نشاركها لأغراض تسويقية لدى جهات أخرى.',
        ],
      },
    ],
    note: 'بيانات الطلب التي تظهر للفاحص لا تتضمن أي وسيلة تواصل معك.',
  },
  {
    id: 'rights',
    title: 'حقوقك',
    icon: UserRound,
    blocks: [
      {
        items: [
          'الاطلاع على بيانات حسابك في أي وقت من صفحة الحساب.',
          'إضافة رقم جوالك وتوثيقه برمز SMS، أو مزامنة الرقم الموثّق لدى Clerk.',
          'لا يوفّر التطبيق حاليًا تعديلًا مباشرًا للاسم أو البريد الإلكتروني، فكلاهما يُدار عبر Clerk.',
          'لا يوفّر التطبيق حاليًا حذفًا ذاتيًا للحساب، ولا توجد قناة دعم منشورة لاستقبال طلبات الحذف.',
        ],
      },
    ],
    note: (
      <>
        الخيارات المتاحة حاليًا لإدارة بياناتك هي ما ورد في القائمة أعلاه.
        <Link className="site-inline-link" href="/account">صفحة الحساب <ArrowLeft size={14} /></Link>
        <Link className="site-inline-link" href="/help">مركز المساعدة <ArrowLeft size={14} /></Link>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'مدة الحفظ',
    icon: Clock3,
    blocks: [
      {
        items: [
          'نحفظ بيانات الحساب والطلب والتقرير ما دام حسابك قائمًا، لأن التقارير تبقى متاحة لك في حسابك للرجوع إليها.',
          'لا يوفّر التطبيق حاليًا حذفًا ذاتيًا للبيانات، ولا توجد قناة دعم منشورة لاستقبال طلبات الحذف.',
          'قد نحتفظ بسجلات محدودة لمدة أطول عند وجود نزاع قائم أو التزام نظامي.',
        ],
      },
    ],
    note: 'سيتم تحديث هذه الصفحة إذا أُضيفت أي وسيلة جديدة لإدارة بياناتك أو حذفها.',
  },
  {
    id: 'security',
    title: 'أمان البيانات',
    icon: Lock,
    blocks: [
      {
        items: [
          'تُخزَّن بيانات المنصة على Supabase، والوصول إليها يتم من الجانب الخادمي عبر مفتاح سري لا يُنشر في المتصفح.',
          'تسجيل الدخول والجلسات يديرها Clerk، ولا نحتفظ بكلمات المرور داخل المنصة.',
          'ملفات الفحص لا تُعرض بروابط دائمة، وإنما عبر روابط موقّعة قصيرة العمر (خمس دقائق) تُنشأ عند طلب الملف.',
          'الوصول إلى التقرير مقصور على صاحب الطلب والفاحص المسند إليه، ولا يظهر التقرير لأي فاحص آخر.',
        ],
      },
    ],
    note: 'لا يوجد نظام إلكتروني آمن بنسبة 100%، لكننا نعمل على تقليل المخاطر. ننصحك بعدم مشاركة وسيلة الدخول إلى حسابك مع أي شخص.',
  },
  {
    id: 'changes',
    title: 'التعديلات على السياسة',
    icon: RefreshCw,
    blocks: [
      {
        items: [
          'قد نحدّث هذه السياسة عند تغيّر الخدمة أو مزوّدي الخدمة، ويظهر تاريخ آخر تحديث في أعلى الصفحة.',
          'ننصحك بمراجعة الصفحة دوريًا، واستمرارك في استخدام المنصة بعد التحديث يعني موافقتك على السياسة المحدّثة.',
        ],
      },
    ],
  },
  {
    id: 'contact',
    title: 'التواصل معنا',
    icon: Info,
    blocks: [
      {
        items: [
          'لمتابعة أي طلب قائم أو أي استفسار يخص بياناتك، ابدأ من لوحة التحكم في حسابك.',
          'لأسئلة الاستخدام العامة، راجع مركز المساعدة.',
        ],
      },
    ],
    note: (
      <>
        <Link className="site-inline-link" href="/dashboard">لوحة التحكم <ArrowLeft size={14} /></Link>
        <Link className="site-inline-link" href="/help">مركز المساعدة <ArrowLeft size={14} /></Link>
      </>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <main dir="rtl" className="site-shell">
      <SiteHeader navigation={navigation} />

      <section className="pub-hero">
        <div className="site-container pub-hero-inner">
          <span className="site-eyebrow site-eyebrow-light"><ShieldCheck size={14} /> بياناتك عندنا</span>
          <h1>سياسة الخصوصية</h1>
          <p>
            نوضّح هنا أي بيانات نجمعها في منصة فاحص، ولماذا نحتاجها، ومع من تُشارك، وكيف نحافظ عليها،
            وما هي حقوقك تجاهها.
          </p>
          <div className="pub-meta">
            <span className="pub-chip"><Clock3 size={14} /> آخر تحديث: {lastUpdated}</span>
            <span className="pub-chip"><Lock size={14} /> تسجيل الدخول مُدار عبر Clerk</span>
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
