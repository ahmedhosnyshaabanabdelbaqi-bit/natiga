# نشر نسخة الكود على سيرفر آخر

الملف `child-source-2.0.2.zip` يحتوي كود التطبيق كاملًا والواجهة المبنية، مع ملفات الاعتماد والاختبارات والوثائق. لا يحتوي قاعدة مرضى أو أسرارًا أو كلمات مرور أو `node_modules`.

يتطلب Node.js 24 أو أحدث. بعد فك الضغط، نفّذ `npm ci` ثم `npm run build`. عيّن مجلد بيانات دائمًا عبر `DATA_DIR`، واضبط اسم المستشفى وكلمة مرور إدارة جديدة عبر `HOSPITAL_NAME` و`INITIAL_ADMIN_PASSWORD`، ثم نفّذ `npm run setup` مرة واحدة والخدمة متوقفة. يجب أن تكون كلمة مرور الإعداد 16 حرفًا على الأقل. شغّل الخدمة بـ`npm start` مع الاحتفاظ بنفس `DATA_DIR` في كل تشغيل. راجع `.env.example` لإعدادات المنفذ والجلسات والنسخ الاحتياطي.

مثال Linux بعد فك الضغط داخل `/opt/child`:

```bash
cd /opt/child
npm ci
npm run build
export DATA_DIR=/var/lib/child/data
export HOSPITAL_NAME='اسم المستشفى'
read -r -s -p 'كلمة مرور الإدارة الجديدة: ' INITIAL_ADMIN_PASSWORD
echo
export INITIAL_ADMIN_PASSWORD
npm run setup
unset INITIAL_ADMIN_PASSWORD
npm start
```

إذا كنت تريد نقل **بيانات** المستشفى الحالية أيضًا، فذلك إجراء منفصل يحتاج نسخة احتياطية مشفّرة ومفتاحها وإعدادات الصلاحيات على الوجهة. لا تنسخ مجلد بيانات الخدمة وهي تعمل، ولا تستخدم بيانات حساب الإدارة الحالية كقيمة افتراضية لسيرفر جديد.
