/**
 * Roles and permissions matrix (contract §4.4). Reference data seeded by
 * `npm run db:seed`. The RBAC module owns the semantics of these strings;
 * the seed only ADDS roles/permissions/links (it never removes an admin's
 * customization of a role).
 *
 * Naming: <area>.<action>. `*.read` permissions cover admin listing of
 * non-public data (drafts etc.); public data needs no permission.
 */
export interface PermissionDef {
  key: string;
  group: string;
  descriptionEn: string;
  descriptionAr: string;
}

const p = (key: string, descriptionEn: string, descriptionAr: string): PermissionDef => ({
  key,
  group: key.split('.')[0],
  descriptionEn,
  descriptionAr,
});

export const PERMISSIONS: PermissionDef[] = [
  // users & access
  p('users.read', 'View users', 'عرض المستخدمين'),
  p(
    'users.manage',
    'Edit users and assign non-admin roles',
    'تعديل المستخدمين وإسناد الأدوار غير الإدارية',
  ),
  p('users.manage_admins', 'Assign/revoke owner and admin roles', 'إسناد وسحب دور المالك والمدير'),
  p('users.block', 'Block / unblock users', 'حظر المستخدمين ورفع الحظر'),
  p('users.delete', 'Delete user accounts', 'حذف حسابات المستخدمين'),
  p('roles.read', 'View roles and permissions', 'عرض الأدوار والصلاحيات'),
  p('roles.manage', 'Create and edit roles', 'إنشاء الأدوار وتعديلها'),
  p('audit.read', 'View the audit log', 'عرض سجل التدقيق'),
  // settings
  p('settings.read', 'View settings', 'عرض الإعدادات'),
  p(
    'settings.write',
    'Edit settings (branding, home, flags, share)',
    'تعديل الإعدادات (الهوية، الرئيسية، الميزات، المشاركة)',
  ),
  p('markets.write', 'Manage markets and currencies', 'إدارة الأسواق والعملات'),
  p('translations.write', 'Edit UI translations', 'تعديل ترجمات الواجهة'),
  p('integrations.read', 'View integration status', 'عرض حالة التكاملات'),
  p('integrations.write', 'Configure integrations', 'ضبط التكاملات'),
  // editorial
  p('articles.read', 'View all articles incl. drafts', 'عرض كل المواد بما فيها المسودات'),
  p('articles.create', 'Create articles', 'إنشاء المواد'),
  p('articles.update', 'Edit own articles', 'تعديل المواد الخاصة'),
  p('articles.update_any', "Edit anyone's articles", 'تعديل مواد الآخرين'),
  p('articles.submit', 'Submit articles for review', 'إرسال المواد للمراجعة'),
  p('articles.review', 'Approve / reject articles in review', 'اعتماد المواد أو رفضها'),
  p('articles.publish', 'Publish / schedule articles', 'نشر المواد وجدولتها'),
  p('articles.archive', 'Archive articles', 'أرشفة المواد'),
  p('articles.delete', 'Delete articles', 'حذف المواد'),
  p('articles.restore_revision', 'Restore a previous revision', 'استعادة إصدار سابق'),
  p('categories.write', 'Manage categories', 'إدارة التصنيفات'),
  p('tags.write', 'Manage tags', 'إدارة الوسوم'),
  p('rss.read', 'View RSS feeds and items', 'عرض مصادر RSS وعناصرها'),
  p('rss.manage', 'Manage RSS feeds and imports', 'إدارة مصادر RSS والاستيراد'),
  p('encyclopedia.write', 'Write encyclopedia entries', 'كتابة مواد الموسوعة'),
  p(
    'encyclopedia.review',
    'Technically review encyclopedia entries',
    'المراجعة الفنية لمواد الموسوعة',
  ),
  p('encyclopedia.publish', 'Publish encyclopedia entries', 'نشر مواد الموسوعة'),
  // vehicles
  p('vehicles.read', 'View catalog incl. drafts', 'عرض دليل السيارات بما فيه المسودات'),
  p(
    'vehicles.write',
    'Edit brands, models, variants and specs',
    'تعديل الماركات والموديلات والفئات والمواصفات',
  ),
  p('vehicles.publish', 'Publish catalog entries', 'نشر عناصر الدليل'),
  p('vehicles.delete', 'Delete catalog entries', 'حذف عناصر الدليل'),
  p('specs.verify', 'Mark data points as verified', 'توثيق المواصفات'),
  p('prices.write', 'Edit prices and price history', 'تعديل الأسعار وتاريخها'),
  p('sources.write', 'Manage data sources', 'إدارة مصادر البيانات'),
  p('comparisons.curate', 'Curate featured comparisons', 'إدارة المقارنات المختارة'),
  // search
  p(
    'search.manage',
    'Manage search aliases and rebuild the search index',
    'إدارة مرادفات البحث وإعادة بناء فهرس البحث',
  ),
  // media & tours
  p('media.read', 'Browse the media library', 'تصفح مكتبة الوسائط'),
  p('media.upload', 'Upload media', 'رفع الوسائط'),
  p('media.manage', 'Replace / delete media', 'استبدال الوسائط وحذفها'),
  p('licenses.write', 'Record rights and licences', 'تسجيل الحقوق والتراخيص'),
  p('tours.read', 'View tours incl. drafts', 'عرض الجولات بما فيها المسودات'),
  p('tours.write', 'Edit tours, scenes and hotspots', 'تعديل الجولات والمشاهد والنقاط'),
  p('tours.publish', 'Publish tours', 'نشر الجولات'),
  p(
    'tours.approve_reference',
    'Approve reference tours of similar trims',
    'اعتماد الجولات المرجعية لفئات قريبة',
  ),
  // stations
  p('stations.read', 'View stations incl. unpublished', 'عرض المحطات بما فيها غير المنشورة'),
  p('stations.write', 'Edit stations, points and connectors', 'تعديل المحطات ونقاط الشحن والمنافذ'),
  p('stations.publish', 'Publish / hide stations', 'نشر المحطات وإخفاؤها'),
  p('stations.delete', 'Delete stations', 'حذف المحطات'),
  p('stations.import', 'Run station imports and syncs', 'تشغيل استيراد ومزامنة المحطات'),
  p('tariffs.write', 'Edit tariffs', 'تعديل التعرفة'),
  p('reports.read', 'View station reports', 'عرض بلاغات المحطات'),
  p('reports.moderate', 'Resolve station reports', 'معالجة بلاغات المحطات'),
  // community
  p('community.read', 'View community content incl. hidden', 'عرض محتوى المجتمع بما فيه المخفي'),
  p(
    'community.moderate',
    'Moderate reviews, comments and Q&A',
    'الإشراف على التقييمات والتعليقات والأسئلة',
  ),
  p(
    'community.verify_owners',
    'Review car ownership verifications (verified owner badge)',
    'مراجعة طلبات توثيق ملكية السيارات (شارة المالك الموثّق)',
  ),
  // other modules
  p('notifications.read', 'View notification campaigns', 'عرض حملات الإشعارات'),
  p(
    'notifications.send',
    'Create and send notification campaigns',
    'إنشاء حملات الإشعارات وإرسالها',
  ),
  p('ads.read', 'View ads', 'عرض الإعلانات'),
  p('ads.manage', 'Manage ad placements and campaigns', 'إدارة مواضع وحملات الإعلانات'),
  p('directory.write', 'Edit the services directory', 'تعديل دليل الخدمات'),
  p('directory.verify', 'Verify directory contact details', 'التحقق من بيانات التواصل في الدليل'),
  p('imports.read', 'View import jobs', 'عرض مهام الاستيراد'),
  p('imports.run', 'Run CSV imports', 'تشغيل استيراد CSV'),
  p('data.export', 'Export data', 'تصدير البيانات'),
  p('analytics.read', 'View usage and content reports', 'عرض تقارير الاستخدام والمحتوى'),
  p('system.read', 'View system status and jobs', 'عرض حالة النظام والمهام'),
  p('system.jobs', 'Retry / cancel background jobs', 'إعادة تشغيل المهام الخلفية وإلغاؤها'),
];

export interface RoleDef {
  key: string;
  nameEn: string;
  nameAr: string;
  description: string;
  permissions: string[] | '*';
}

const EDITOR = [
  'articles.read',
  'articles.create',
  'articles.update',
  'articles.submit',
  'tags.write',
  'rss.read',
  'encyclopedia.write',
  'media.read',
  'media.upload',
  'licenses.write',
  'vehicles.read',
  'tours.read',
  'comparisons.curate',
];

export const ROLES: RoleDef[] = [
  {
    key: 'owner',
    nameEn: 'Owner',
    nameAr: 'المالك',
    description: 'Full access including admin management.',
    permissions: '*',
  },
  {
    key: 'admin',
    nameEn: 'Administrator',
    nameAr: 'مدير',
    description: 'Full access except managing owners/admins.',
    permissions: PERMISSIONS.map((x) => x.key).filter((k) => k !== 'users.manage_admins'),
  },
  {
    key: 'editor',
    nameEn: 'Editor',
    nameAr: 'محرر',
    description: 'Writes news, reviews, guides and encyclopedia drafts.',
    permissions: EDITOR,
  },
  {
    key: 'content_reviewer',
    nameEn: 'Content reviewer',
    nameAr: 'مراجع محتوى',
    description: 'Reviews, publishes and archives content; approves reference tours.',
    permissions: [
      ...EDITOR,
      'articles.update_any',
      'articles.review',
      'articles.publish',
      'articles.archive',
      'articles.restore_revision',
      'categories.write',
      'rss.manage',
      'search.manage',
      'encyclopedia.review',
      'encyclopedia.publish',
      'tours.publish',
      'tours.approve_reference',
      'analytics.read',
    ],
  },
  {
    key: 'vehicle_data_manager',
    nameEn: 'Vehicle data manager',
    nameAr: 'مسؤول بيانات السيارات',
    description: 'Maintains the car catalog, specs, sources, prices, media and tours.',
    permissions: [
      'vehicles.read',
      'vehicles.write',
      'vehicles.publish',
      'specs.verify',
      'prices.write',
      'sources.write',
      'comparisons.curate',
      'search.manage',
      'media.read',
      'media.upload',
      'media.manage',
      'licenses.write',
      'tours.read',
      'tours.write',
      'imports.read',
      'imports.run',
      'analytics.read',
    ],
  },
  {
    key: 'station_manager',
    nameEn: 'Station manager',
    nameAr: 'مسؤول المحطات',
    description: 'Maintains charging stations, tariffs, imports and station reports.',
    permissions: [
      'stations.read',
      'stations.write',
      'stations.publish',
      'stations.import',
      'tariffs.write',
      'reports.read',
      'reports.moderate',
      'sources.write',
      'media.read',
      'media.upload',
      'directory.write',
      'directory.verify',
      'imports.read',
      'imports.run',
      'integrations.read',
    ],
  },
  {
    key: 'community_moderator',
    nameEn: 'Community moderator',
    nameAr: 'مشرف مجتمع',
    description: 'Moderates reviews, comments, Q&A and user reports.',
    permissions: [
      'community.read',
      'community.moderate',
      'community.verify_owners',
      'users.read',
      'users.block',
      'reports.read',
    ],
  },
  {
    key: 'user',
    nameEn: 'User',
    nameAr: 'مستخدم',
    description: 'Registered user (no admin permissions).',
    permissions: [],
  },
];

/** Role automatically given to every registered user. */
export const DEFAULT_USER_ROLE = 'user';
