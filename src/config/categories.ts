import { CategoryConfig, CategoryId, ThemeId } from '../types';

export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'word',
    label: 'کلمه',
    enLabel: 'Word',
    shortLabel: 'کلمه',
    metaLabel: 'نقش دستوری / تلفظ IPA',
    metaPlaceholder: 'مثلاً: (adj) /rɪˈzɪl.jənt/',
    englishPlaceholder: 'مثلاً: resilient',
    persianPlaceholder: 'مثلاً: تاب‌آور، انعطاف‌پذیر در برابر سختی',
    examplePlaceholder: 'مثلاً: Children are often remarkably resilient.',
    color: '#17365d',
    softBg: '#e8eef6',
    darkSoftBg: 'rgba(59, 130, 246, 0.16)',
    badgeText: '#17365d'
  },
  {
    id: 'phrase',
    label: 'عبارت و اصطلاح',
    enLabel: 'Phrase & Idiom',
    shortLabel: 'عبارت',
    metaLabel: 'لحن / کاربرد',
    metaPlaceholder: 'مثلاً: Informal — مکالمه روزمره',
    englishPlaceholder: 'مثلاً: break the ice',
    persianPlaceholder: 'مثلاً: یخ جمع را شکستن، شروع به صمیمی شدن',
    examplePlaceholder: 'مثلاً: He told a funny story to break the ice.',
    color: '#0f766e',
    softBg: '#e0f2f1',
    darkSoftBg: 'rgba(20, 184, 166, 0.16)',
    badgeText: '#0f766e'
  },
  {
    id: 'grammar',
    label: 'گرامر',
    enLabel: 'Grammar',
    shortLabel: 'گرامر',
    metaLabel: 'فرمول / ساختار دستوری',
    metaPlaceholder: 'مثلاً: Subject + have/has + been + V-ing',
    englishPlaceholder: 'مثلاً: Present Perfect Continuous',
    persianPlaceholder: 'مثلاً: حال کامل استمراری (کاری از گذشته تا الان)',
    examplePlaceholder: 'مثلاً: I have been studying English for two years.',
    color: '#6d28d9',
    softBg: '#f3e8ff',
    darkSoftBg: 'rgba(139, 92, 246, 0.18)',
    badgeText: '#6d28d9'
  },
  {
    id: 'sentence',
    label: 'جمله کاربردی',
    enLabel: 'Sentence',
    shortLabel: 'جمله',
    metaLabel: 'موقعیت استفاده',
    metaPlaceholder: 'مثلاً: جلسه کاری / ایمیل رسمی / کافه',
    englishPlaceholder: 'مثلاً: Could you elaborate on that point?',
    persianPlaceholder: 'مثلاً: ممکن است این نکته را بیشتر توضیح دهید؟',
    examplePlaceholder: 'مثلاً: پاسخ پیشنهادی یا جمله مکمل در مکالمه',
    color: '#1d4ed8',
    softBg: '#dbeafe',
    darkSoftBg: 'rgba(37, 99, 235, 0.18)',
    badgeText: '#1d4ed8'
  },
  {
    id: 'phrasal',
    label: 'فعل عبارتی',
    enLabel: 'Phrasal Verb',
    shortLabel: 'فعل عبارتی',
    metaLabel: 'جداشدنی / جدانشدنی',
    metaPlaceholder: 'مثلاً: Separable (figure it out)',
    englishPlaceholder: 'مثلاً: figure out',
    persianPlaceholder: 'مثلاً: سردرآوردن، حل کردن، کشف کردن',
    examplePlaceholder: 'مثلاً: We need to figure out a practical solution.',
    color: '#047857',
    softBg: '#dcfce7',
    darkSoftBg: 'rgba(16, 185, 129, 0.16)',
    badgeText: '#047857'
  },
  {
    id: 'speaking',
    label: 'تلفظ و اسپیکینگ',
    enLabel: 'Speaking & IPA',
    shortLabel: 'اسپیکینگ',
    metaLabel: 'نکته آوایی / محل استرس',
    metaPlaceholder: 'مثلاً: حرف b خوانده نمی‌شود — /ˈsʌt.əl/',
    englishPlaceholder: 'مثلاً: subtle',
    persianPlaceholder: 'مثلاً: ظریف، نامحسوس',
    examplePlaceholder: 'مثلاً: There is a subtle difference between the two.',
    color: '#9f1239',
    softBg: '#ffe4e6',
    darkSoftBg: 'rgba(244, 63, 94, 0.16)',
    badgeText: '#9f1239'
  }
];

export const CATEGORY_MAP: Record<CategoryId, CategoryConfig> = CATEGORIES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<CategoryId, CategoryConfig>
);

export const THEMES: Record<
  ThemeId,
  {
    name: string;
    brand: string;
    brandRgb: string;
    softRgb: string;
    hoverRgb: string;
  }
> = {
  navy: {
    name: 'سرمه‌ای کلاسیک',
    brand: '#17365d',
    brandRgb: '23 54 93',
    softRgb: '232 238 246',
    hoverRgb: '16 38 66'
  },
  emerald: {
    name: 'زمردی آرام',
    brand: '#0f766e',
    brandRgb: '15 118 110',
    softRgb: '224 242 241',
    hoverRgb: '17 94 89'
  },
  royal: {
    name: 'آبی لاجوردی',
    brand: '#1d4ed8',
    brandRgb: '29 78 216',
    softRgb: '219 234 254',
    hoverRgb: '30 64 175'
  },
  crimson: {
    name: 'زرشکی مدرن',
    brand: '#9f1239',
    brandRgb: '159 18 57',
    softRgb: '255 228 230',
    hoverRgb: '136 19 55'
  }
};
