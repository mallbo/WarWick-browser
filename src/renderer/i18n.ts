export type Language = 'en' | 'ar';

export interface Translations {
  common: {
    language: string;
    switchTo: string;
    settings: string;
    newTab: string;
    protected: string;
    aiAssistant: string;
    runAudit: string;
  };
  home: {
    heroTitle: string;
    heroSubtitle: string;
    badge: string;
    urlPlaceholder: string;
    promptPlaceholder: string;
    analyzeBtn: string;
    croTitle: string;
    croDesc: string;
    croBadge: string;
    croPrompt: string;
    spyTitle: string;
    spyDesc: string;
    spyBadge: string;
    spyPrompt: string;
    hooksTitle: string;
    hooksDesc: string;
    hooksBadge: string;
    hooksPrompt: string;
    briefTitle: string;
    briefDesc: string;
    briefBadge: string;
    briefPrompt: string;
    autopsyTitle: string;
    autopsyBadge: string;
    autopsyDesc: string;
    autopsyAction: string;
    shortcutNewTab: string;
    shortcutOmnibox: string;
    shortcutAi: string;
    shortcutAutopsy: string;
  };
  nav: {
    back: string;
    forward: string;
    reload: string;
    bookmark: string;
    omniboxPlaceholder: string;
    marketingLens: string;
    aiPromptBadge: string;
  };
  sidebar: {
    brandSubtitle: string;
    newTab: string;
    funnelAutopsy: string;
    settings: string;
    expand: string;
    collapse: string;
  };
}

export const translations: Record<Language, Translations> = {
  en: {
    common: {
      language: 'English',
      switchTo: 'عربي',
      settings: 'Settings',
      newTab: 'New Tab',
      protected: 'Protected',
      aiAssistant: 'AI',
      runAudit: 'Run Audit'
    },
    home: {
      heroTitle: 'WarWick Marketing Intelligence',
      heroSubtitle: 'High-speed AI marketing browser powered by local Antigravity intelligence — store audits, competitor pricing radar, and funnel diagnostics.',
      badge: '2026 Linear OS',
      urlPlaceholder: 'Enter store or landing page URL (e.g., https://store.com)...',
      promptPlaceholder: 'Ask any marketing task: e.g. "audit checkout flow" or "generate 5 high-converting hooks"...',
      analyzeBtn: 'Analyze',
      croTitle: 'CRO & Conversion Audit',
      croDesc: 'Deep audit of friction points, CTA hierarchy, and checkout bottlenecks.',
      croBadge: '84/100 Benchmark',
      croPrompt: 'Conduct a comprehensive Conversion Rate Optimization (CRO) audit for this page. Identify top friction points hurting checkout conversions and provide immediate actionable fixes.',
      spyTitle: 'Competitor Price & Offer Radar',
      spyDesc: 'Extract competitor pricing deltas, offer bundles, and market positioning.',
      spyBadge: 'Market Delta',
      spyPrompt: 'Analyze and compare this store against top market competitors: extract price gaps, offer structures, and unfair competitive advantages.',
      hooksTitle: 'Generate 10 Viral Ad Hooks',
      hooksDesc: 'Psychology-driven hooks for TikTok and Reels designed to stop scrolling in 3 seconds.',
      hooksBadge: 'High CTR Angles',
      hooksPrompt: 'Generate 10 high-converting magnetic ad hooks for this product/store, crafted for TikTok & Instagram Reels across diverse psychological angles.',
      briefTitle: 'Strategic Executive Brief',
      briefDesc: 'Synthesized breakdown of product-market fit, audience, and key metrics.',
      briefBadge: 'Executive Brief',
      briefPrompt: 'Provide an executive marketing brief of this page: target audience persona, core value proposition, pricing analysis, and key takeaways.',
      autopsyTitle: 'Funnel Autopsy • Conversion Diagnostics',
      autopsyBadge: 'Multi-Persona Simulation',
      autopsyDesc: 'Deploy AI personas (skeptical buyer, discount seeker, impulse buyer) through the funnel to pinpoint exact drop-off moments with visual evidence.',
      autopsyAction: 'Start Autopsy ⏎',
      shortcutNewTab: 'Ctrl+T New Tab',
      shortcutOmnibox: 'Ctrl+K Command OS',
      shortcutAi: 'Ctrl+J WarWick AI',
      shortcutAutopsy: 'Ctrl+Shift+F Funnel Autopsy'
    },
    nav: {
      back: 'Back (Alt+Left)',
      forward: 'Forward (Alt+Right)',
      reload: 'Reload (Ctrl+R / F5)',
      bookmark: 'Bookmark this page',
      omniboxPlaceholder: 'Search or enter URL, or type @ai...',
      marketingLens: 'Marketing Lens',
      aiPromptBadge: 'AI Prompt ↵'
    },
    sidebar: {
      brandSubtitle: 'AI',
      newTab: 'New Tab',
      funnelAutopsy: 'Funnel Autopsy',
      settings: 'Settings',
      expand: 'Expand Sidebar (Ctrl+S)',
      collapse: 'Collapse Sidebar (Ctrl+S)'
    }
  },
  ar: {
    common: {
      language: 'العربية',
      switchTo: 'EN',
      settings: 'الإعدادات',
      newTab: 'تبويب جديد',
      protected: 'محمي',
      aiAssistant: 'المساعد',
      runAudit: 'تشغيل الفحص'
    },
    home: {
      heroTitle: 'WarWick Marketing Intelligence',
      heroSubtitle: 'متصفح تسويقي فائق الذكاء مدعوم بموديل Antigravity المحلي — فحص فوري للمتاجر، كشف عروض المنافسين، وتشريح مسارات التحويل.',
      badge: '2026 Linear OS',
      urlPlaceholder: 'ضع رابط المتجر أو صفحة الهبوط لفحصها (مثلاً: https://store.com)...',
      promptPlaceholder: 'اطلب أي مهمة تسويقية: مثلاً "حلل سرعة الدفع" أو "اكتب 5 زوايا إعلانية غير مسبوقة"...',
      analyzeBtn: 'تحليل',
      croTitle: 'فحص معدل التحويل (CRO)',
      croDesc: 'تحليل دقيق للأزرار وسلاسة مسار الدفع ونقاط تسرب العملاء.',
      croBadge: '84/100 Benchmark',
      croPrompt: 'قم بإجراء فحص شامل لمعدل التحويل (CRO Audit) لهذه الصفحة، مع تحديد أسباب انسحاب الزوار وحلول رفع المبيعات فوراً.',
      spyTitle: 'رادار المنافسين والأسعار',
      spyDesc: 'استخراج فروق الأسعار، الميزات التنافسية، وحيل العروض.',
      spyBadge: 'Market Delta',
      spyPrompt: 'قارن هذا المتجر بأبرز المنافسين في نفس المجال، واستخرج الفروق الجوهرية في التسعير والعروض الترويجية.',
      hooksTitle: 'توليد 10 خطافات إعلانية',
      hooksDesc: 'خطافات سيكولوجية للتيك توك والريلز توقف التمرير في 3 ثوانٍ.',
      hooksBadge: 'High CTR Angles',
      hooksPrompt: 'اكتب 10 خطافات إعلانية قوية (Magnetic Hooks) لهذا المنتج أو المتجر، موجهة لجمهور تيك توك وإنستجرام بأساليب سيكولوجية متنوعة.',
      briefTitle: 'ملخص تحليلي استراتيجي',
      briefDesc: 'خلاصة مركزة للمنتج والجمهور المستهدف والأرقام الحيوية.',
      briefBadge: 'Executive Brief',
      briefPrompt: 'لخّص هذه الصفحة تسويقياً في نقاط واضحة مع ذكر أهم الأرقام والملاحظات المؤثرة على قرار الشراء.',
      autopsyTitle: 'Funnel Autopsy • تشريح مسارات البيع',
      autopsyBadge: 'Multi-Persona Simulation',
      autopsyDesc: 'أرسل شخصيات ذكاء اصطناعي (المشتري المتردد، الباحث عن الخصم، العميل المستعجل) داخل أي مسار شراء، واكتشف اللحظة المحددة لانسحابهم بالصور والدلائل.',
      autopsyAction: 'بدء التشريح ⏎',
      shortcutNewTab: 'Ctrl+T لتبويب جديد',
      shortcutOmnibox: 'Ctrl+K لشريط الأوامر',
      shortcutAi: 'Ctrl+J لمساعد WarWick',
      shortcutAutopsy: 'Ctrl+Shift+F لتشريح المسار'
    },
    nav: {
      back: 'رجوع (Alt+Left)',
      forward: 'تقدم (Alt+Right)',
      reload: 'إعادة تحميل (Ctrl+R / F5)',
      bookmark: 'إضافة للمفضلة',
      omniboxPlaceholder: 'ابحث أو أدخل رابطاً، أو اكتب @ai...',
      marketingLens: 'عدسة التسويق',
      aiPromptBadge: 'أمر ذكاء اصطناعي ↵'
    },
    sidebar: {
      brandSubtitle: 'AI',
      newTab: 'تبويب جديد',
      funnelAutopsy: 'تشريح المسار',
      settings: 'الإعدادات',
      expand: 'توسيع القائمة (Ctrl+S)',
      collapse: 'طي القائمة (Ctrl+S)'
    }
  }
};
