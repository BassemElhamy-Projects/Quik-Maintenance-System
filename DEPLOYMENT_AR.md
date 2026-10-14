# نشر Quik Maintenance System كموقع ويب

هذه الحزمة تحتوي على كود واجهة الويب وملفات Supabase اللازمة لإعداد النشر. لا تحتوي على ملفات إصدار Windows أو مجلد النسخ الاحتياطية المحلية.

## استضافة الواجهة على Cloudflare Pages (خطة مجانية كبداية)

1. ارفع محتويات هذا المجلد إلى مستودع GitHub خاص. تأكد من عدم رفع أي ملف `.env` أو JSON يحتوي على بيانات تشغيلية.
2. من Cloudflare Dashboard افتح Workers & Pages ثم أنشئ Pages project واربط مستودع GitHub.
3. إعدادات البناء:
   - Framework preset: Vite
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
4. من إعدادات المشروع أضف متغيرات البيئة التي يتوقعها `src/services/supabaseClient.ts`:
   - `VITE_SUPABASE_URL` = عنوان مشروع Supabase الحالي
   - `VITE_SUPABASE_ANON_KEY` = مفتاح publishable/anon العام الخاص بالمشروع
5. أعد النشر بعد إضافة المتغيرات؛ Vite يضمّن قيم `VITE_*` وقت البناء.
6. افتح رابط Pages الناتج واختبر تسجيل الدخول والعمليات الأساسية من حساب مستخدم حقيقي.

## مهم قبل تسليم الرابط للموظفين

- لا تضع `service_role` أو أي `sb_secret_*` في متغير `VITE_*` أو في كود المتصفح.
- المفتاح العام ليس بديلًا عن RLS؛ راجع سياسات كل جدول وصلاحيات الأدوار.
- تحقق من أن Supabase Auth يسمح بعنوان الموقع الجديد ضمن Site URL وRedirect URLs عند استخدام تدفقات إعادة التوجيه.
- يتضمن المستودع `supabase/functions` و`supabase/schema.sql`، لكن رفع الواجهة لا ينشر Edge Functions ولا يطبق SQL تلقائيًا. لا تعِد تطبيق `schema.sql` على قاعدة بيانات الإنتاج بشكل أعمى؛ راجع التغييرات أولًا، واحتفظ بنسخة أمان. انشر الوظائف المطلوبة إلى مشروع Supabase الحالي باستخدام Supabase CLI بعد تسجيل الدخول وربط project ref الصحيح، مثل:
  `supabase link --project-ref YOUR_PROJECT_REF`
  `supabase functions deploy init-first-admin`
  `supabase functions deploy admin-create-user`
  `supabase functions deploy admin-reset-password`
  `supabase functions deploy cloud-backup-manager`
- لا تنفذ `init-first-admin` على مشروع قائم إلا إذا كنت متأكدًا أن إجراء تهيئة المدير الأول مطلوب وآمن وفق كود الوظيفة.
- أنشئ/تحقق من حسابات الموظفين والأدوار من واجهة الإدارة بعد النشر، ولا تشارك حساب مدير واحد مع الجميع.
- اختبر نسخة JSON احتياطية واستعادتها، وتأكد أن النسخة تُحفظ خارج مستودع الكود.

## البناء محليًا

```bash
npm ci
npm run lint
npm run build
```

يجب أن ينتج البناء مجلد `dist`. الحزمة لا تحتوي على `node_modules` أو ناتج build جاهز؛ منصة الاستضافة ستبنيه أثناء النشر.

## ملاحظة حالة الجاهزية

إعداد الحزمة لا يعني أن الموقع أصبح منشورًا. لا يمكن إتمام النشر أو التأكد من حسابات الموظفين وسياسات Supabase دون الوصول إلى حساب الاستضافة ومشروع Supabase الفعلي.
