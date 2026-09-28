# استرجاع التحديث وقفل قاعدة البيانات

من إصدار 2.0.2 يسجل قفل قاعدة البيانات هوية إقلاع Linux ووقت بداية العملية إلى جانب PID. إذا انتهت الخدمة وأعاد النظام استخدام رقم PID لبرنامج آخر، يمكن تمييز القفل القديم واستعادة التشغيل تلقائيًا. يظل القفل حيًا إذا طابقت الهوية، ويظل القفل غير المقروء أو غير الموثوق بحاجة لفحص يدوي. سجلات القفل القديمة من 2.0.1 تقبل الاسترجاع تلقائيًا فقط إذا ثبت انتهاء PID؛ أثناء ترقية نظيفة تزيل الخدمة قفلها القديم عند التوقف ثم تكتب الصيغة الجديدة عند البدء.

`scripts/install-update-service.sh` يحتوي قالب المنسق المثبت في `/usr/local/sbin/child-egsystem-update`. يوقف المنسق التطبيق، يتحقق من الحزمة، ينشئ نسخة بيانات مشفرة، يبدّل الكود، ثم يشغّل الخدمة ويفحص الإصدار. فشل بدء الخدمة الجديدة أو فشل صحتها ينتقل إلى استعادة الكود والبيانات السابقين. لا يُعلن نجاح الرجوع إلا بعد نجاح صحة الإصدار السابق.

تثبيت حزمة التطبيق وحدها لا يستبدل الملف المثبت بصلاحية root. لتحديث المنسق الموجود قبل الترقية، افحصه أولًا وتأكد أنه يطابق القالب المتوقع. الأوامر التالية لا توقف أو تبدأ خدمة؛ تستبدل فقط كتلة بدء الإصدار الجديد بعد حفظ نسخة أصلية والتحقق من صياغة Bash. يرفض الإجراء ملفًا رمزيًا أو ملكية غير root أو قالبًا غير متوقع. إن كان التعديل موجودًا بالفعل فلا يعيد الكتابة.

```bash
sudo python3 - <<'PY'
from pathlib import Path
import hashlib, os, shutil, stat, subprocess, tempfile, time

target = Path('/usr/local/sbin/child-egsystem-update')
if target.is_symlink() or not target.is_file():
    raise SystemExit('Expected a regular coordinator file')
metadata = target.stat()
if metadata.st_uid != 0:
    raise SystemExit('Coordinator must be owned by root')
original = target.read_text()
old = '''if run_phase apply; then
  systemctl start "$SERVICE"
  ok=0
  for _ in {1..45}; do if run_phase verify-new >/dev/null 2>&1; then ok=1; break; fi; sleep 1; done
'''
new = '''if run_phase apply; then
  ok=0
  if systemctl start "$SERVICE"; then
    for _ in {1..45}; do if run_phase verify-new >/dev/null 2>&1; then ok=1; break; fi; sleep 1; done
  fi
'''
if old not in original and original.count(new) == 1:
    subprocess.run(['/bin/bash', '-n', str(target)], check=True)
    print('Coordinator already updated')
    raise SystemExit(0)
if original.count(old) != 1:
    raise SystemExit('Unexpected coordinator; inspect before patching')
updated = original.replace(old, new, 1)
backup = target.with_name(target.name + '.before-2.0.1-' + str(time.time_ns()))
with backup.open('x') as output:
    output.write(original)
shutil.copystat(target, backup)
os.chown(backup, metadata.st_uid, metadata.st_gid)
temporary = None
try:
    with tempfile.NamedTemporaryFile('w', dir=target.parent, prefix='.child-update-', delete=False) as output:
        temporary = Path(output.name)
        output.write(updated)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, stat.S_IMODE(metadata.st_mode))
    os.chown(temporary, metadata.st_uid, metadata.st_gid)
    subprocess.run(['/bin/bash', '-n', str(temporary)], check=True)
    current = target.stat()
    if (current.st_ino, current.st_dev, current.st_mtime_ns) != (metadata.st_ino, metadata.st_dev, metadata.st_mtime_ns) or target.read_text() != original:
        raise SystemExit('Coordinator changed during patching')
    os.replace(temporary, target)
    temporary = None
finally:
    if temporary is not None:
        temporary.unlink(missing_ok=True)
print('Backup:', backup)
print('Updated SHA256:', hashlib.sha256(target.read_bytes()).hexdigest())
PY
```

في أول ترقية من إصدار لا يحتوي استرجاع القفل، ينفّذ `apply` النسخ الاحتياطي بكود الإصدار القديم قبل تبديل الملفات. يجب التحقق من خروج الخدمة القديمة وإزالة قفلها طبيعيًا. القفل المتبقي لا يُحذف دون فحص PID والخدمة فعليًا. بعد التبديل يستخدم بدء التطبيق واسترجاع البيانات الكود الجديد.

التحقق المحلي شمل تنفيذ منطق المنسق في Bash مع بدائل للخدمة والعامل: فشل بدء الجديد، استنفاد فحص الصحة، نجاح التثبيت، وفشل بدء القديم. وشملت اختبارات القفل عملية منتهية فعلية، ورفض العمليات الحية وEPERM والسجلات المجهولة، والتنافس بين أربع عمليات، ومنع callback قديم من حذف ملكية أحدث. هذه اختبارات معزولة وليست إثباتًا لحالة systemd أو صلاحيات ملفات السيرفر الحالي.
