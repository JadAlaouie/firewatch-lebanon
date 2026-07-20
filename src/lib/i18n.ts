import type { EventPriority, EventStatus } from '../types';

export type Language = 'en' | 'ar';

export const languages: Record<Language, { label: string; dir: 'ltr' | 'rtl'; locale: string }> = {
  en: { label: 'English', dir: 'ltr', locale: 'en-GB' },
  ar: { label: 'العربية', dir: 'rtl', locale: 'ar-LB' },
};

export function nextLanguage(language: Language): Language {
  return language === 'en' ? 'ar' : 'en';
}

export function storedLanguage(value: string | null): Language {
  return value === 'ar' ? 'ar' : 'en';
}

export const copy = {
  en: {
    brand: { name: 'Firewatch', place: 'Lebanon and nearby region' },
    auth: { checking: 'Checking access' },
    login: {
      restricted: 'Restricted access',
      title: 'Sign in',
      username: 'Username',
      password: 'Password',
      hidePassword: 'Hide password',
      showPassword: 'Show password',
      signingIn: 'Signing in',
      wakingService: 'Waking the secure sign-in service',
      retrying: 'Service is waking up — retrying',
      submit: 'Sign in',
      failed: 'Unable to sign in.',
      invalidCredentials: 'Incorrect username or password.',
      rateLimited: (seconds?: number) => seconds
        ? `Too many sign-in attempts. Try again in about ${Math.max(1, Math.ceil(seconds / 60))} minute${seconds > 60 ? 's' : ''}.`
        : 'Too many sign-in attempts. Please wait before trying again.',
      notConfigured: 'Sign-in is not configured on the server. Please contact the administrator.',
      temporarilyUnavailable: 'The sign-in service is temporarily unavailable. Render may be waking up; please try again in a moment.',
      footer: 'NCNE - Fire monitoring workspace',
      switchLanguage: 'Switch to Arabic',
    },
    modes: {
      live: 'Live feeds',
      partial: 'Partial live',
      imported: 'Imported CSV',
      demoFallback: 'Demo fallback',
      demo: 'Demo data',
    },
    topbar: {
      latest: 'Latest',
      noObservations: 'No observations',
      lastChecked: 'Checked',
      refreshCadence: 'EUMETSAT every 10 min',
      returnLive: 'Return to live feeds',
      refresh: 'Refresh detections',
      importCsv: 'Import detection CSV',
      methodology: 'Open data methodology',
      signOut: 'Sign out',
      switchLanguage: 'Switch language',
    },
    status: {
      importedPaused: 'Local CSV is active. Automatic live refresh is paused.',
      loadingSatellite: 'Loading satellite index',
      restoreFeed: 'Restore feed',
      returnedLive: 'Returned to the configured live feeds.',
      imported: (count: number, rejected: number) => (
        `Imported ${count.toLocaleString()} detections${rejected ? `; ${rejected} rows rejected` : ''}.`
      ),
      noValidRows: 'No valid detection rows were found',
      csvFailed: 'CSV import failed',
      loadFailed: 'Unable to load detections',
      services: 'Satellite services',
      providerStates: {
        idle: 'Waiting',
        checking: 'Checking',
        ok: 'Healthy',
        degraded: 'Degraded',
        down: 'Unavailable',
        disabled: 'Disabled',
        stale: 'Check stale',
      },
    },
    summary: {
      clusters: 'Clusters',
      detections: 'Detections',
      summedFrp: 'Summed FRP',
    },
    filters: {
      label: 'Detection filters',
      heading: 'Filters',
      observationWindow: 'Observation window',
      confidence: 'Confidence',
      all: 'All',
      staticHeat: 'Static heat',
      staticHeatTitle: 'Include records marked as static or industrial heat sources',
      sources: 'Satellite source filters',
      sourceTitle: (label: string, resolution: string) => `${label}, nominal resolution ${resolution}`,
    },
    events: {
      heading: 'Fire clusters',
      grouped: (count: number) => `${count} grouped events`,
      sortTitle: 'Sort fire clusters',
      sortLabel: 'Sort clusters',
      latest: 'Latest',
      frp: 'FRP',
      detections: 'Detections',
      recent: 'Recent activity',
      monitoring: 'Monitoring',
      older: 'Older activity',
      emptyTitle: 'No matching clusters',
      emptyText: 'Adjust the source or confidence filters.',
    },
    detail: {
      aria: (name: string) => `${name} details`,
      priority: (priority: string) => `${priority} priority`,
      close: 'Close event details',
      to: 'to',
      detections: 'Detections',
      summedFrp: 'Summed FRP',
      peakFrp: 'Peak FRP',
      avgConfidence: 'Avg confidence',
      activity: 'Activity',
      activityHint: 'MW by observation time',
      sources: 'Sources',
      instruments: (count: number) => `${count} instruments`,
      latestObservations: 'Latest observations',
      localTime: 'Local time',
      exportCsv: 'Export CSV',
      envelope: (count: number) => `Envelope: ${count} observed H3 cells`,
      caveat: 'Detection envelope only. Not a mapped perimeter or spread forecast.',
    },
    map: {
      basemap: 'Basemap',
      street: 'Street',
      streetTitle: 'Street map',
      terrain: 'Terrain',
      terrainTitle: 'Terrain map',
      critical: 'Critical',
      high: 'High',
      watch: 'Watch',
      legendNote: 'H3 visualization envelopes',
      detections: 'detections',
      summedFrp: 'summed FRP',
    },
    methodology: {
      systemNotes: 'System notes',
      title: 'Data methodology',
      close: 'Close methodology',
      collectionTitle: '1. Collection',
      collection: "EUMETSAT's Meteosat-12 (MTG-I1), using its Flexible Combined Imager (FCI), supplies the 10-minute LSA SAF MTFRPPIXEL (LSA-509) observations delivered through the public Tabula Caloris compatibility bridge. The server independently checks the official LSA SAF feed's freshness. NASA FIRMS remains enabled for VIIRS and MODIS context when a free map key is configured.",
      normalizationTitle: '2. Normalization',
      normalization: 'Each thermal anomaly becomes a timestamped detection with coordinates, source, confidence and Fire Radiative Power. FRP is retained in megawatts as supplied by the upstream feed.',
      groupingTitle: '3. Event grouping',
      grouping: 'Detections are assigned to H3 resolution-7 cells. Neighboring cells are connected when consecutive observations are no more than 12 hours apart. MTG events preserve the source event anchor; other anchors are derived locally.',
      geometryTitle: '4. Map geometry',
      geometry: 'The colored envelope is the union of H3 resolution-9 visualization cells around observation coordinates. These cells group points; they are not satellite-pixel footprints, a fire perimeter, an ignition location, a burned-area product or a spread forecast.',
      warning: 'Satellite hotspots can include industrial heat, agricultural burning and other thermal anomalies. Clouds, scan gaps and sensor resolution can also hide active fire.',
      links: {
        firms: 'FIRMS Area API',
        lsa: 'LSA SAF fire data',
        algorithm: 'Detection algorithm',
        h3: 'H3 index',
      },
    },
    disclaimer: {
      title: 'Operational disclaimer',
      englishLabel: 'English',
      arabicLabel: 'العربية',
      english: "This map shows satellite thermal anomaly detections from EUMETSAT's Meteosat-12 (MTG-I1), using the LSA SAF MTFRPPIXEL (LSA-509) product delivered through a compatibility bridge, plus NASA FIRMS. A cluster means satellites detected heat in nearby pixels; it is not a confirmed fire perimeter, evacuation notice, or official emergency report. Clouds, smoke, terrain, sensor limits, and processing delays can hide or delay detections. Verify with local authorities and ground reports before acting.",
      arabic: 'تعرض هذه الخريطة رصداً حرارياً عبر الأقمار الصناعية من قمر الجيل الثالث من ميتيوسات (MTG) التابع لـ EUMETSAT، باستخدام منتج MTG-FCI المتاح عبر LSA SAF، إضافة إلى NASA FIRMS. المجموعة تعني أن الأقمار الصناعية رصدت حرارة في بكسلات قريبة؛ وهي ليست محيط حريق مؤكداً ولا إنذار إخلاء ولا بلاغاً رسمياً للطوارئ. قد تؤخر الغيوم أو الدخان أو التضاريس أو حدود المستشعر والمعالجة ظهور الرصد أو تخفيه. يجب التأكد من السلطات المحلية والمعلومات الميدانية قبل اتخاذ أي قرار.',
    },
    timeline: {
      aria: 'Detection timeline',
      title: (count: number, frp: string) => `${count} detections, ${frp} MW summed FRP`,
    },
  },
  ar: {
    brand: { name: 'مراقبة الحرائق', place: 'لبنان والمناطق المجاورة' },
    auth: { checking: 'جار التحقق من صلاحية الدخول' },
    login: {
      restricted: 'دخول محدود',
      title: 'تسجيل الدخول',
      username: 'اسم المستخدم',
      password: 'كلمة المرور',
      hidePassword: 'إخفاء كلمة المرور',
      showPassword: 'إظهار كلمة المرور',
      signingIn: 'جار تسجيل الدخول',
      wakingService: 'جار تشغيل خدمة الدخول الآمنة',
      retrying: 'الخدمة قيد التشغيل — جارٍ إعادة المحاولة',
      submit: 'تسجيل الدخول',
      failed: 'تعذر تسجيل الدخول.',
      invalidCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      rateLimited: (seconds?: number) => seconds
        ? `تم إيقاف محاولات الدخول مؤقتاً. أعد المحاولة بعد نحو ${Math.max(1, Math.ceil(seconds / 60))} دقيقة.`
        : 'تم إيقاف محاولات الدخول مؤقتاً. يرجى الانتظار قبل إعادة المحاولة.',
      notConfigured: 'خدمة تسجيل الدخول غير مضبوطة على الخادم. يرجى التواصل مع المسؤول.',
      temporarilyUnavailable: 'خدمة تسجيل الدخول غير متاحة مؤقتاً. قد يكون خادم Render قيد التشغيل؛ يرجى إعادة المحاولة بعد قليل.',
      footer: 'NCNE - مساحة مراقبة الحرائق',
      switchLanguage: 'التبديل إلى الإنجليزية',
    },
    modes: {
      live: 'مصادر مباشرة',
      partial: 'مصادر مباشرة جزئية',
      imported: 'ملف CSV مستورد',
      demoFallback: 'بيانات تجريبية احتياطية',
      demo: 'بيانات تجريبية',
    },
    topbar: {
      latest: 'آخر رصد',
      noObservations: 'لا توجد أرصاد',
      lastChecked: 'آخر فحص',
      refreshCadence: 'EUMETSAT كل ١٠ دقائق',
      returnLive: 'العودة إلى المصادر المباشرة',
      refresh: 'تحديث الأرصاد',
      importCsv: 'استيراد ملف CSV للأرصاد',
      methodology: 'فتح منهجية البيانات',
      signOut: 'تسجيل الخروج',
      switchLanguage: 'تبديل اللغة',
    },
    status: {
      importedPaused: 'ملف CSV المحلي مفعل. تم إيقاف التحديث التلقائي للمصادر المباشرة.',
      loadingSatellite: 'جار تحميل فهرس الأقمار الصناعية',
      restoreFeed: 'استعادة المصدر',
      returnedLive: 'تمت العودة إلى المصادر المباشرة المضبوطة.',
      imported: (count: number, rejected: number) => (
        `تم استيراد ${count.toLocaleString('ar-LB')} رصد${rejected ? `؛ تم رفض ${rejected.toLocaleString('ar-LB')} صف` : ''}.`
      ),
      noValidRows: 'لم يتم العثور على صفوف رصد صالحة',
      csvFailed: 'فشل استيراد ملف CSV',
      loadFailed: 'تعذر تحميل الأرصاد',
      services: 'خدمات الأقمار الصناعية',
      providerStates: {
        idle: 'بانتظار الفحص',
        checking: 'جارٍ الفحص',
        ok: 'تعمل',
        degraded: 'متدهورة',
        down: 'غير متاحة',
        disabled: 'معطلة',
        stale: 'الفحص قديم',
      },
    },
    summary: {
      clusters: 'المجموعات',
      detections: 'الأرصاد',
      summedFrp: 'مجموع FRP',
    },
    filters: {
      label: 'مرشحات الأرصاد',
      heading: 'المرشحات',
      observationWindow: 'نافذة الرصد',
      confidence: 'الثقة',
      all: 'الكل',
      staticHeat: 'حرارة ثابتة',
      staticHeatTitle: 'تضمين السجلات المصنفة كمصادر حرارة ثابتة أو صناعية',
      sources: 'مرشحات مصادر الأقمار الصناعية',
      sourceTitle: (label: string, resolution: string) => `${label}، الدقة الاسمية ${resolution}`,
    },
    events: {
      heading: 'مجموعات الحرائق',
      grouped: (count: number) => `${count.toLocaleString('ar-LB')} أحداث مجمعة`,
      sortTitle: 'فرز مجموعات الحرائق',
      sortLabel: 'فرز المجموعات',
      latest: 'الأحدث',
      frp: 'FRP',
      detections: 'الأرصاد',
      recent: 'نشاط حديث',
      monitoring: 'قيد المتابعة',
      older: 'نشاط أقدم',
      emptyTitle: 'لا توجد مجموعات مطابقة',
      emptyText: 'عدّل مرشحات المصدر أو الثقة.',
    },
    detail: {
      aria: (name: string) => `تفاصيل ${name}`,
      priority: (priority: string) => `أولوية ${priority}`,
      close: 'إغلاق تفاصيل الحدث',
      to: 'إلى',
      detections: 'الأرصاد',
      summedFrp: 'مجموع FRP',
      peakFrp: 'أعلى FRP',
      avgConfidence: 'متوسط الثقة',
      activity: 'النشاط',
      activityHint: 'MW حسب وقت الرصد',
      sources: 'المصادر',
      instruments: (count: number) => `${count.toLocaleString('ar-LB')} أجهزة`,
      latestObservations: 'آخر الأرصاد',
      localTime: 'التوقيت المحلي',
      exportCsv: 'تصدير CSV',
      envelope: (count: number) => `النطاق: ${count.toLocaleString('ar-LB')} خلايا H3 مرصودة`,
      caveat: 'النطاق يوضح الأرصاد فقط. ليس محيط حريق مرسوماً ولا توقعاً لانتشاره.',
    },
    map: {
      basemap: 'خريطة الأساس',
      street: 'شوارع',
      streetTitle: 'خريطة الشوارع',
      terrain: 'تضاريس',
      terrainTitle: 'خريطة التضاريس',
      critical: 'حرج',
      high: 'عال',
      watch: 'مراقبة',
      legendNote: 'نطاقات عرض H3',
      detections: 'أرصاد',
      summedFrp: 'مجموع FRP',
    },
    methodology: {
      systemNotes: 'ملاحظات النظام',
      title: 'منهجية البيانات',
      close: 'إغلاق المنهجية',
      collectionTitle: '١. الجمع',
      collection: 'يوفّر القمر Meteosat-12 (MTG-I1) التابع لـ EUMETSAT، باستخدام جهاز FCI، أرصاد منتج LSA SAF MTFRPPIXEL (LSA-509) كل ١٠ دقائق عبر جسر التوافق العام Tabula Caloris. ويتحقق الخادم بشكل مستقل من حداثة المصدر الرسمي لـ LSA SAF. وتبقى NASA FIRMS مفعّلة لتوفير سياق VIIRS وMODIS عند ضبط مفتاح خريطة مجاني.',
      normalizationTitle: '٢. التوحيد',
      normalization: 'يتم تحويل كل شذوذ حراري إلى رصد بوقت وإحداثيات ومصدر وثقة وقدرة إشعاعية للنار. تبقى قيمة FRP بالميغاواط كما يزودها المصدر.',
      groupingTitle: '٣. تجميع الأحداث',
      grouping: 'تسند الأرصاد إلى خلايا H3 بدقة 7. يتم ربط الخلايا المجاورة عندما لا يتجاوز الفاصل بين الأرصاد المتتالية 12 ساعة. تحتفظ أحداث MTG بخلية المصدر، بينما تستنتج الخلايا الأخرى محلياً.',
      geometryTitle: '٤. شكل الخريطة',
      geometry: 'النطاق الملون هو اتحاد خلايا H3 بدقة 9 لعرض مواقع الأرصاد وتجميعها. هذه الخلايا ليست بصمة بكسل القمر الصناعي ولا محيط حريق ولا نقطة اشتعال ولا منتج مساحة محترقة ولا توقع انتشار.',
      warning: 'قد تشمل النقاط الساخنة حرائق صناعية أو حرقاً زراعياً أو شذوذات حرارية أخرى. كما يمكن أن تخفي الغيوم وفجوات المسح ودقة المستشعر حرائق نشطة.',
      links: {
        firms: 'واجهة FIRMS Area API',
        lsa: 'بيانات حرائق LSA SAF',
        algorithm: 'خوارزمية الرصد',
        h3: 'فهرس H3',
      },
    },
    disclaimer: {
      title: 'تنبيه تشغيلي',
      englishLabel: 'English',
      arabicLabel: 'العربية',
      english: "This map shows satellite thermal anomaly detections from EUMETSAT's Meteosat-12 (MTG-I1), using the LSA SAF MTFRPPIXEL (LSA-509) product delivered through a compatibility bridge, plus NASA FIRMS. A cluster means satellites detected heat in nearby pixels; it is not a confirmed fire perimeter, evacuation notice, or official emergency report. Clouds, smoke, terrain, sensor limits, and processing delays can hide or delay detections. Verify with local authorities and ground reports before acting.",
      arabic: 'تعرض هذه الخريطة رصداً حرارياً عبر الأقمار الصناعية من قمر الجيل الثالث من ميتيوسات (MTG) التابع لـ EUMETSAT، باستخدام منتج MTG-FCI المتاح عبر LSA SAF، إضافة إلى NASA FIRMS. المجموعة تعني أن الأقمار الصناعية رصدت حرارة في بكسلات قريبة؛ وهي ليست محيط حريق مؤكداً ولا إنذار إخلاء ولا بلاغاً رسمياً للطوارئ. قد تؤخر الغيوم أو الدخان أو التضاريس أو حدود المستشعر والمعالجة ظهور الرصد أو تخفيه. يجب التأكد من السلطات المحلية والمعلومات الميدانية قبل اتخاذ أي قرار.',
    },
    timeline: {
      aria: 'خط زمني للأرصاد',
      title: (count: number, frp: string) => `${count.toLocaleString('ar-LB')} أرصاد، ${frp} MW مجموع FRP`,
    },
  },
} as const;

const priorityLabels: Record<Language, Record<EventPriority, string>> = {
  en: { critical: 'critical', high: 'high', watch: 'watch' },
  ar: { critical: 'حرجة', high: 'عالية', watch: 'مراقبة' },
};

const statusLabels: Record<Language, Record<EventStatus, string>> = {
  en: {
    recent: copy.en.events.recent,
    monitoring: copy.en.events.monitoring,
    stale: copy.en.events.older,
  },
  ar: {
    recent: copy.ar.events.recent,
    monitoring: copy.ar.events.monitoring,
    stale: copy.ar.events.older,
  },
};

const regionNamesAr: Record<string, string> = {
  Homs: 'حمص',
  'Al-Qusayr': 'القصير',
  'Rif Dimashq': 'ريف دمشق',
  Damascus: 'دمشق',
  Quneitra: 'القنيطرة',
  'Golan Heights': 'الجولان',
  'Northern Israel': 'شمال إسرائيل',
  Akkar: 'عكار',
  Tripoli: 'طرابلس',
  Zgharta: 'زغرتا',
  Batroun: 'البترون',
  Baalbek: 'بعلبك',
  Keserwan: 'كسروان',
  Beirut: 'بيروت',
  Metn: 'المتن',
  Zahle: 'زحلة',
  'West Bekaa': 'البقاع الغربي',
  Aley: 'عاليه',
  Chouf: 'الشوف',
  Jezzine: 'جزين',
  Sidon: 'صيدا',
  Nabatieh: 'النبطية',
  Tyre: 'صور',
  'Bint Jbeil': 'بنت جبيل',
};

const sourceLabelsAr: Record<string, string> = {
  VIIRS_SNPP_NRT: 'VIIRS سومي-NPP',
  VIIRS_NOAA20_NRT: 'VIIRS نوا-20',
  VIIRS_NOAA21_NRT: 'VIIRS نوا-21',
  MODIS_NRT: 'MODIS تيرا/أكوا',
  MTG_FCI_LSA_SAF: 'EUMETSAT LSA SAF MTFRPPIXEL (LSA-509) عبر Tabula Caloris',
  IMPORTED: 'ملف CSV مستورد',
};

export function priorityLabel(priority: EventPriority, language: Language) {
  return priorityLabels[language][priority];
}

export function statusLabel(status: EventStatus, language: Language) {
  return statusLabels[language][status];
}

export function eventName(name: string, language: Language) {
  if (language === 'en') return name;
  const region = name.replace(/\s+cluster$/, '');
  return `مجموعة ${regionNamesAr[region] || region}`;
}

export function sourceLabel(source: string, fallback: string, language: Language) {
  return language === 'ar' ? sourceLabelsAr[source] || fallback : fallback;
}

export function timeWindowLabel(hours: number, language: Language) {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return language === 'ar' ? `${minutes.toLocaleString('ar-LB')}د` : `${minutes}m`;
  }
  if (language === 'ar') return hours === 120 ? '٥ أيام' : `${hours.toLocaleString('ar-LB')}س`;
  return hours === 120 ? '5d' : `${hours}h`;
}
