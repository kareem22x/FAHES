# 🎨 Enhanced UI/UX Components Guide
## دليل المكونات المحسّنة - فاحص

تاريخ: 2026-10-01
الإصدار: 2.0

---

## 📚 Table of Contents

1. [Overview](#overview)
2. [Enhanced Button](#enhanced-button)
3. [Enhanced Card](#enhanced-card)
4. [Loading Components](#loading-components)
5. [Design Tokens](#design-tokens)
6. [Implementation Examples](#implementation-examples)
7. [Best Practices](#best-practices)

---

## 🌟 Overview

تم تطوير مجموعة شاملة من المكونات المحسّنة التي توفر:

### ✨ Key Features
- **Micro-Interactions**: تفاعلات دقيقة وسلسة
- **Glassmorphism**: تأثيرات زجاجية عصرية
- **3D Effects**: تأثيرات ثلاثية الأبعاد
- **Loading States**: حالات تحميل متقدمة
- **Accessibility**: معايير وصول كاملة
- **Performance**: محسّن للأداء العالي

### 🎯 Design Philosophy
- **Progressive Enhancement**: تحسين تدريجي
- **Mobile-First**: الأولوية للموبايل
- **RTL Support**: دعم كامل للعربية
- **Theme Ready**: جاهز للـ dark mode

---

## 🔘 Enhanced Button

### Features
- ✨ Ripple effect على الضغط
- 🧲 Magnetic hover (اتباع المؤشر)
- 📊 Loading states مع spinner
- 🎨 5 أنماط مختلفة
- 🎯 Scale animations
- 💫 Shine effect

### Usage

```tsx
import EnhancedButton from '@/components/ui/enhanced-button'
import { ArrowLeft } from 'lucide-react'

// Basic Usage
<EnhancedButton variant="primary">
  اطلب فحصك الآن
</EnhancedButton>

// With Icon
<EnhancedButton 
  variant="primary"
  rightIcon={<ArrowLeft size={16} />}
>
  اطلب فحصك الآن
</EnhancedButton>

// With Loading
<EnhancedButton 
  variant="primary"
  isLoading={true}
  loadingText="جاري الإرسال..."
>
  إرسال
</EnhancedButton>

// Glass Variant with Magnetic Effect
<EnhancedButton 
  variant="glass"
  magnetic={true}
  size="lg"
>
  تواصل معنا
</EnhancedButton>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'glass' \| 'outline' \| 'ghost'` | `'primary'` | نمط الزر |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | حجم الزر |
| `isLoading` | `boolean` | `false` | حالة التحميل |
| `loadingText` | `string` | `undefined` | نص التحميل |
| `leftIcon` | `ReactNode` | `undefined` | أيقونة يسار |
| `rightIcon` | `ReactNode` | `undefined` | أيقونة يمين |
| `magnetic` | `boolean` | `false` | تفعيل التأثير المغناطيسي |
| `ripple` | `boolean` | `true` | تفعيل تأثير الموجة |

### Variants Preview

```tsx
// Primary - للإجراءات الرئيسية
<EnhancedButton variant="primary">
  Primary Button
</EnhancedButton>

// Secondary - للإجراءات الثانوية
<EnhancedButton variant="secondary">
  Secondary Button
</EnhancedButton>

// Glass - للتصاميم الشفافة
<EnhancedButton variant="glass">
  Glass Button
</EnhancedButton>

// Outline - للإجراءات الأقل أهمية
<EnhancedButton variant="outline">
  Outline Button
</EnhancedButton>

// Ghost - للروابط والإجراءات الخفيفة
<EnhancedButton variant="ghost">
  Ghost Button
</EnhancedButton>
```

---

## 🎴 Enhanced Card

### Features
- 🎴 3D tilt effect
- ✨ Glass morphism
- 🌈 Gradient borders
- 💫 Glow on hover
- 📦 Smooth depth
- 🎨 4 أنماط

### Usage

```tsx
import EnhancedCard, { StatCard, FeatureCard } from '@/components/ui/enhanced-card'
import { Car } from 'lucide-react'

// Basic Card
<EnhancedCard variant="default" hover3D>
  <h3>عنوان البطاقة</h3>
  <p>محتوى البطاقة هنا</p>
</EnhancedCard>

// Glass Card
<EnhancedCard variant="glass" glowOnHover>
  محتوى بتأثير زجاجي
</EnhancedCard>

// Card with Gradient Border
<EnhancedCard variant="default" borderGradient>
  بطاقة مع حدود متدرجة
</EnhancedCard>

// Stat Card
<StatCard
  icon={<Car size={20} />}
  value="1,234"
  label="طلب فحص"
  trend="up"
  trendValue="+12%"
/>

// Feature Card
<FeatureCard
  icon={<Car size={24} />}
  title="فحص شامل"
  description="صورة متكاملة عن حالة السيارة"
  badge="جديد"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'glass' \| 'gradient' \| 'elevated'` | `'default'` | نمط البطاقة |
| `hover3D` | `boolean` | `true` | تفعيل التأثير ثلاثي الأبعاد |
| `glowOnHover` | `boolean` | `false` | تفعيل التوهج |
| `borderGradient` | `boolean` | `false` | حدود متدرجة |

---

## ⏳ Loading Components

### Available Components

#### 1. Skeleton Loader
```tsx
import { Skeleton, CardSkeleton } from '@/components/ui/enhanced-loading'

<Skeleton width="100%" height={20} />
<CardSkeleton />
```

#### 2. Spinner
```tsx
import { Spinner } from '@/components/ui/enhanced-loading'

<Spinner size={24} color="#0d74e3" />
```

#### 3. Dots Loader
```tsx
import { DotsLoader } from '@/components/ui/enhanced-loading'

<DotsLoader size={8} color="#0d74e3" />
```

#### 4. Progress Bar
```tsx
import { ProgressBar } from '@/components/ui/enhanced-loading'

<ProgressBar 
  progress={75} 
  height={4} 
  showLabel 
/>
```

#### 5. Pulse Loader
```tsx
import { PulseLoader } from '@/components/ui/enhanced-loading'

<PulseLoader size={40} color="#0d74e3" />
```

#### 6. Loading Overlay
```tsx
import { LoadingOverlay } from '@/components/ui/enhanced-loading'

<LoadingOverlay 
  isLoading={true}
  text="جاري التحميل..."
  blur={true}
/>
```

#### 7. Success/Error Icons
```tsx
import { SuccessCheck, ErrorIcon } from '@/components/ui/enhanced-loading'

<SuccessCheck size={60} />
<ErrorIcon size={60} />
```

---

## 🎨 Design Tokens

### Colors

```css
/* Primary Colors */
--color-primary: #0a1f44;
--color-secondary: #0a5cc0;
--color-accent: #0d74e3;

/* Brand Ramp */
--brand-700: #084a9c;
--brand-600: #0a5cc0;
--brand-500: #0d74e3;
--brand-400: #3d92f5;
--brand-300: #7bb6ff;
--brand-200: #b6d8ff;
--brand-100: #dcecff;
--brand-50: #eef6ff;
```

### Gradients

```css
/* Enhanced Gradients */
--gradient-primary: linear-gradient(135deg, #0a5cc0 0%, #0d74e3 100%);
--gradient-accent: linear-gradient(135deg, #0d74e3 0%, #7bb6ff 100%);
--gradient-hero: linear-gradient(135deg, #0a1f44 0%, #0a5cc0 50%, #0d74e3 100%);
--gradient-glass: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
```

### Shadows

```css
/* Enhanced Shadow System */
--shadow-sm: 0 2px 8px rgb(10 31 68 / 8%), 0 1px 2px rgb(10 31 68 / 4%);
--shadow-md: 0 4px 16px rgb(10 31 68 / 10%), 0 2px 4px rgb(10 31 68 / 6%);
--shadow-lg: 0 8px 32px rgb(10 31 68 / 12%), 0 4px 8px rgb(10 31 68 / 8%);
--shadow-xl: 0 16px 48px rgb(10 31 68 / 16%), 0 8px 16px rgb(10 31 68 / 10%);
--shadow-brand: 0 8px 24px rgb(13 116 227 / 20%), 0 4px 8px rgb(13 116 227 / 12%);
--shadow-glow: 0 0 20px rgb(13 116 227 / 30%), 0 0 40px rgb(13 116 227 / 15%);
```

### Spacing

```css
/* Micro Spacing Scale */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

### Animation Timings

```css
/* Enhanced Motion System */
--timing-instant: 100ms;
--timing-fast: 200ms;
--timing-base: 300ms;
--timing-slow: 500ms;

/* Easing Functions */
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## 💡 Implementation Examples

### Example 1: Hero Section with Enhanced Components

```tsx
import EnhancedButton from '@/components/ui/enhanced-button'
import EnhancedCard from '@/components/ui/enhanced-card'
import { ArrowLeft, Car } from 'lucide-react'

export default function HeroSection() {
  return (
    <section className="relative py-20 px-6">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#eef6ff] to-transparent opacity-50" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-[#0a1f44] mb-6">
            سيارتك بالشرقية؟ 
            <span className="text-[#0d74e3]"> نفحصها عنك.</span>
          </h1>
          <p className="text-xl text-[#5f7086] mb-8 max-w-2xl mx-auto">
            نرسل فاحصًا إلى موقع السيارة في مدن ومحافظات الشرقية
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <EnhancedButton 
              variant="primary" 
              size="lg"
              magnetic
              rightIcon={<ArrowLeft size={20} />}
            >
              اطلب فحصك الآن
            </EnhancedButton>
            
            <EnhancedButton 
              variant="glass" 
              size="lg"
            >
              تعرف على الخدمة
            </EnhancedButton>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          {features.map((feature) => (
            <EnhancedCard 
              key={feature.title}
              variant="glass"
              hover3D
              glowOnHover
            >
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#0d74e3] to-[#7bb6ff] flex items-center justify-center text-white">
                  <feature.icon size={28} />
                </div>
                <h3 className="text-lg font-bold text-[#0a1f44] mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-[#5f7086]">
                  {feature.description}
                </p>
              </div>
            </EnhancedCard>
          ))}
        </div>
      </div>
    </section>
  )
}
```

### Example 2: Dashboard with Loading States

```tsx
import { StatCard } from '@/components/ui/enhanced-card'
import { CardSkeleton, LoadingOverlay } from '@/components/ui/enhanced-loading'
import { Car, FileText, Clock, CheckCircle } from 'lucide-react'

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    loadStats().then(data => {
      setStats(data)
      setIsLoading(false)
    })
  }, [])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <CardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <StatCard
        icon={<Car size={20} />}
        value={stats.totalInspections}
        label="إجمالي الطلبات"
        trend="up"
        trendValue="+12%"
      />
      <StatCard
        icon={<FileText size={20} />}
        value={stats.completedReports}
        label="تقارير منجزة"
        trend="up"
        trendValue="+8%"
      />
      <StatCard
        icon={<Clock size={20} />}
        value={stats.pendingInspections}
        label="قيد الانتظار"
        trend="neutral"
      />
      <StatCard
        icon={<CheckCircle size={20} />}
        value={`${stats.satisfactionRate}%`}
        label="نسبة الرضا"
        trend="up"
        trendValue="+5%"
      />
    </div>
  )
}
```

### Example 3: Form with Enhanced Buttons

```tsx
import EnhancedButton from '@/components/ui/enhanced-button'
import { LoadingOverlay, SuccessCheck, ErrorIcon } from '@/components/ui/enhanced-loading'
import { useState } from 'react'

export default function InspectionForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      await submitInspection(formData)
      setStatus('success')
    } catch (error) {
      setStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <LoadingOverlay 
        isLoading={isSubmitting}
        text="جاري إرسال طلبك..."
      />

      {/* Form Fields */}
      <div className="space-y-4">
        {/* ... form inputs ... */}
      </div>

      {/* Status Messages */}
      {status === 'success' && (
        <div className="flex items-center gap-3 p-4 bg-[#ddf3e9] rounded-xl">
          <SuccessCheck size={40} />
          <p className="text-[#0f7a55] font-bold">
            تم إرسال طلبك بنجاح!
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-3 p-4 bg-[#fee2e2] rounded-xl">
          <ErrorIcon size={40} />
          <p className="text-[#bf3b2c] font-bold">
            حدث خطأ، يرجى المحاولة مرة أخرى
          </p>
        </div>
      )}

      {/* Submit Buttons */}
      <div className="flex items-center gap-4">
        <EnhancedButton
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isSubmitting}
          loadingText="جاري الإرسال..."
          className="flex-1"
        >
          إرسال الطلب
        </EnhancedButton>
        
        <EnhancedButton
          type="button"
          variant="outline"
          size="lg"
          disabled={isSubmitting}
        >
          إلغاء
        </EnhancedButton>
      </div>
    </form>
  )
}
```

---

## 🎯 Best Practices

### Performance Tips

1. **استخدم dynamic imports للمكونات الثقيلة**
```tsx
const EnhancedCard = dynamic(() => import('@/components/ui/enhanced-card'))
```

2. **استخدم Skeleton loaders بدلاً من spinners للمحتوى**
```tsx
// ❌ سيء
{isLoading ? <Spinner /> : <Content />}

// ✅ جيد
{isLoading ? <CardSkeleton /> : <Content />}
```

3. **قلل من استخدام التأثيرات على الموبايل**
```tsx
<EnhancedCard 
  hover3D={!isMobile}  // تعطيل 3D على الموبايل
  glowOnHover={false}
/>
```

### Accessibility Guidelines

1. **استخدم aria-labels مناسبة**
```tsx
<EnhancedButton aria-label="إرسال طلب فحص السيارة">
  إرسال
</EnhancedButton>
```

2. **وفر حالات loading واضحة**
```tsx
<EnhancedButton 
  isLoading={true}
  aria-busy="true"
  aria-live="polite"
>
  جاري الإرسال...
</EnhancedButton>
```

### Animation Guidelines

1. **استخدم spring animations للتفاعلات الطبيعية**
```tsx
transition={{
  type: 'spring',
  stiffness: 400,
  damping: 25,
}}
```

2. **اجعل الانتقالات سريعة وواضحة (200-300ms)**
```tsx
transition={{ duration: 0.3 }}
```

3. **استخدم stagger للعناصر المتعددة**
```tsx
{items.map((item, i) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.1 }}
  >
    {item}
  </motion.div>
))}
```

---

## 📱 Responsive Design

### Breakpoints

```css
/* Mobile */
@media (max-width: 640px) { }

/* Tablet */
@media (min-width: 641px) and (max-width: 1024px) { }

/* Desktop */
@media (min-width: 1025px) { }
```

### Mobile-First Approach

```tsx
// ❌ سيء - Desktop first
<EnhancedButton size="lg" className="md:size-md">

// ✅ جيد - Mobile first
<EnhancedButton size="sm" className="md:size-lg">
```

---

## 🚀 Performance Checklist

- [ ] استخدام Framer Motion بحكمة (lazy load)
- [ ] تطبيق will-change للعناصر المتحركة
- [ ] استخدام transform بدلاً من position
- [ ] تقليل box-shadow على العناصر المتحركة
- [ ] استخدام GPU acceleration
- [ ] تطبيق skeleton loaders
- [ ] lazy loading للصور
- [ ] code splitting للمكونات

---

## 📊 Browser Support

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 90+ | ✅ Full |
| Firefox | 88+ | ✅ Full |
| Safari | 14+ | ✅ Full |
| Edge | 90+ | ✅ Full |

---

## 🔄 Migration Guide

### من المكونات القديمة إلى المحسّنة

```tsx
// Before
<button className="site-button">
  اطلب الآن
</button>

// After
<EnhancedButton variant="primary">
  اطلب الآن
</EnhancedButton>

// Before
<div className="site-card">
  محتوى
</div>

// After
<EnhancedCard variant="default" hover3D>
  محتوى
</EnhancedCard>
```

---

## 🎓 Resources

- [Framer Motion Docs](https://www.framer.com/motion/)
- [Tailwind CSS Docs](https://tailwindcss.com)
- [React Accessibility](https://react.dev/learn/accessibility)
- [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)

---

*تم إنشاء هذا الدليل بواسطة Principal UI/UX Architect*
*آخر تحديث: 2026-10-01*
