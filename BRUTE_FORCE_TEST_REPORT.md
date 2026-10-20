# گزارش تست بروت‌فورس / دیکشنری کدهای Patreon
# Patreon Code Brute-Force & Dictionary Test Report

- **تاریخ تست:** 2026-10-20
- **ریپو / برنچ:** `eternity-lord/test12` — `arena/858cdd9c-test12` (توجه: ریپو در زمان تست **Public** بوده است)
- **کامیت‌های ورودی:** `fa515d2` (Extract assets.zip) و `6ebc01a` (Extract testing v5.zip)
- **محیط اجرا:** Python 3.11.2
- **نتیجه نهایی:** **۰ تطابق (MATCHES: 0)** — هیچ کد Patreon از داده‌های آپلودشده بازیابی نشد.
- **دلیل اصلی:** فایل حاوی هش کدها (`assets/public/assets/card-vault/reward_codes.json`) در هیچ‌کدام از دو آپلود وجود نداشت؛ بنابراین هش هدفِ واقعی برای بروت‌فورس در دسترس نبوده است. این گزارش تست انجام‌شده روی *همه* مقادیر SHA-256 موجود در آپلودها را با کد و لاگ کامل مستند می‌کند.

> نکته امنیتی: در اسکریپت تست، هر تطابق احتمالی به‌صورت **ماسک‌شده** (کاراکتر اول و آخر + طول) چاپ می‌شود. هیچ کد فعال و قابل‌استفاده‌ای — حتی در صورت پیدا شدن — در این سند منتشر نمی‌شود.

---

## ۱) ورودی‌های تست

چک‌سام فایل‌های اصلی ورودی:

```text
4c17cd4d28d476dd015ed83d049f3b74e4639dce575f8c94685580e8e6eca5ac  assets.zip
2d665fbc98a09fa44f5c0b3ce955dc52f7bb8c12abddb32774287161cb63f871  testing v5.zip
```

| ورودی | محتوا پس از استخراج |
|---|---|
| `assets.zip` | پوشه `assets/` — ۵۶۷ فایل، ~۵۱ مگابایت (فقط `scripts/` + `scenes/` + `story/` + `translations/`) |
| `testing v5.zip` | خروجی apktool از APK — ۶۳۳۰ فایل، ~۱۰۴ مگابایت (`smali/`, `res/`, `original/`, `assets/` ...) |

پوشه `assets/` در هر دو آپلود بایت‌به‌بایت یکسان است (`diff -qr` بدون خروجی).

## ۲) محدودیت حیاتی ورودی‌ها (چرا هش واقعی کدها تست نشد)

مقایسه با فهرست امضای APK اصلی (`testing v5/original/META-INF/MANIFEST.MF` — ۱۷۸۸ ورودی) نشان داد کل پوشه `assets/public/assets/` یعنی **۷۴۰ فایل** در آپلودها نیست، از جمله:

```text
assets/public/assets/card-vault/reward_codes.json        <- هش کدهای Patreon فقط در این فایل تعریف می‌شود
assets/public/assets/card-vault/{cards,characters,packs,rarities,reward_tiers,reward_seasons,drop_tables,duplicate_policy,bonus_cards}.json
assets/public/assets/protected-media/manifest.json + 591 فایل .bin (مدیای رمزنگاری‌شده)
assets/public/assets/onlyfun/creators/*.json
```

تنها اثری که از این فایل در دسترس است، دایجست **کل فایل** در مانیفست امضای APK است:

```text
Name: assets/public/assets/card-vault/reward_codes.json
SHA-256-Digest: uzmgr3EuXPNYN4vUwidhpVLQ+ZDzP11CSa08v84oaUA=
```

این مقدار، هش یک‌طرفه همه بایت‌های فایل JSON است؛ از آن نمی‌توان نه محتوای فایل و نه هش تک‌تک کدها را برگرداند (خاصیت preimage-resistant در SHA-256).

## ۳) مکانیزم بررسی کد در بازی (مرجع تست)

- `assets/public/scripts/card-vault-system.js:1061` — نرمال‌سازی: `trim().toUpperCase()`
- `card-vault-system.js:1068` — اعتبارسنجی فرمت: `/^[A-Z0-9_-]+$/` و طول ≤ ۱۲۸
- `card-vault-system.js:1077` — مقایسه نهایی: `sha256Hex(input.code)` برابر با یکی از `row.hashes` خوانده‌شده از `reward_codes.json` (بدون salt، بدون iteration — SHA-256 خالص و سریع)
- `assets/public/scripts/convo-runtime.js:6111-6115` — `getAccessCodes()` عمداً `{}` برمی‌گرداند؛ هیچ کد plain در ران‌تایم باندل نشده است.

## ۴) متد تست

1. **جمع‌آوری همه اهداف:** استخراج هر رشته ۶۴کاراکتری hex از کل آپلودها + همه دایجست‌های `MANIFEST.MF`/`CERT.SF` (تبدیل base64 به hex) = **۳۵۳۲ مقدار SHA-256 یکتا**.
2. **Sweep متن خام:** جستجوی `reward_codes.json`، عبارت `accessCodes`، و فیلدهای JSON با نام‌های `code/password/secret/...`
3. **تولید کاندیدها (دیکشنری برگرفته از خود کد):** نام کاراکترها، نام تیرها، عنوان بازی، IDهای قابل‌مشاهده در سورس (به‌صورت verbatim)، ترکیب با جداکننده‌های `""`, `-`, `_`، سال‌ها و بازه‌های روز (`2026`, `16_20` ...)، و توکن‌های برداشت‌شده از سه فایل امنیتی.
4. **بروت‌فورس exhaust:** همه اعداد ۰ تا ۹۹۹٬۹۹۹ و همه رشته‌های A-Z تا طول ۴.
5. **مقایسه:** هر کاندید با همان نرمال‌سازی بازی هش و با مجموعه اهداف مقایسه شد؛ خروجی تطابق (در صورت وجود) ماسک‌شده است.

## ۵) کد تست (اسکریپت اصلی)

```python
#!/usr/bin/env python3
"""
Offline dictionary / brute-force audit against every SHA-256 value present
in the provided uploads (assets.zip + testing v5.zip extracts).

Important: this script does NOT contain the real Patreon-code hash list.
The file assets/public/assets/card-vault/reward_codes.json was not present
in either upload, so this run can only test candidates against the SHA-256
values that ARE present (story-file hashes + APK signing-manifest digests).
Any match is printed MASKED (first/last char + length) by design.
"""
import os, re, hashlib, time, base64, itertools

# ---- 1) Collect EVERY hash-like target present in the uploads ----
targets = {}  # hex -> source
hex64 = re.compile(r"\b[a-f0-9]{64}\b")
for root, dirs, files in os.walk("assets"):
    for f in files:
        p = os.path.join(root, f)
        try:
            data = open(p, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        for m in hex64.findall(data):
            targets.setdefault(m, p)

# APK signing-manifest digests (base64 SHA-256 of whole files)
for mf in ["testing v5/original/META-INF/MANIFEST.MF",
           "testing v5/original/META-INF/CERT.SF"]:
    if not os.path.exists(mf):
        continue
    txt = open(mf, encoding="utf-8", errors="ignore").read() \
              .replace("\r\n ", "").replace("\n ", "")
    for b64 in re.findall(r"SHA-256-Digest: ([A-Za-z0-9+/=]+)", txt):
        try:
            targets.setdefault(base64.b64decode(b64).hex(), mf + " (file digest)")
        except Exception:
            pass

tset = set(targets)
print(f"targets: {len(tset)} unique SHA-256 values (459 in JS/JSON + APK file digests)")

# Sanity: our hashing == game's sha256Hex = plain SHA-256 of the
# TRIMMED + UPPERCASED code (card-vault-system.js:1061,1068,1077)
print("sanity SHA256('TEST') =", hashlib.sha256(b"TEST").hexdigest())

# ---- 2) Candidate generation: codebase-derived dictionary ----
chars = ["mason", "Hailey", "lena", "evelyn", "aiden", "Nicolas", "tutor"]
tiers = ["voyeur", "biglover", "big_lover", "ntroverlord", "ntr_overlord",
         "ultimate", "ultimatesupporter", "fullsupport", "supporter"]
words = ["intercepted", "patreon", "premium", "unlock", "gallery", "master",
         "secret", "code", "update", "chapter", "bonus", "reward",
         "cardvault", "card", "vault", "dev", "developer", "timeline",
         "test", "testing", "frenchtr", "ntr", "nts", "love", "day", "days",
         "v5", "special", "vip", "full", "access", "points", "support", "tier"]
nums  = ["", "1", "2", "5", "9", "15", "16", "20", "100", "500", "1000",
         "2024", "2025", "2026", "2027", "16_20", "9_15", "1620", "915",
         "123", "1234", "69", "99"]
seps  = ["", "-", "_"]

curated = set()
bases = chars + tiers + words
for a in bases:
    curated.add(a.upper())
for a, b in itertools.product(chars + tiers + words, repeat=2):
    for s in seps:
        curated.add((a + s + b).upper())
for a in bases:
    for n in nums:
        for s in seps:
            if n:
                curated.add((a + s + n).upper())
                curated.add((n + s + a).upper())
for c in chars:
    for rng in ["DAY16", "DAY16_20", "DAY9_15", "16_20", "DAY9", "DAY15", "DAY20"]:
        for s in seps:
            curated.add((c + s + rng).upper())
            curated.add((rng + s + c).upper())
            for y in ["2026", "2025", ""]:
                curated.add((c + s + rng + (s + y if y else "")).upper())

# Code IDs visible in source, used verbatim as candidates (common mistake)
for cid in ["lena_day16_20_2026_v1", "hailey_day16_20_2026_v1", "mason_day9_15",
            "card_vault_bonus_1000_2026_v1", "patreon_master_unlock_v1",
            "patreon_lena_day16_20_unlock_v1", "patreon_mason_day9_15_unlock_v1",
            "patreon_hailey_day16_20_unlock_v1", "gallery_full_unlock_v1",
            "dev_timeline_unlock_v1"]:
    curated.add(cid.upper())
    curated.add(cid.upper().replace("_", "-"))

# Harvested single tokens from the security-relevant scripts
tok = re.compile(r"[A-Za-z][A-Za-z0-9_-]{2,30}")
for p in ["assets/public/scripts/card-vault-system.js",
          "assets/public/scripts/convo-runtime.js",
          "assets/public/scripts/entitlement-service.js"]:
    for t in tok.findall(open(p, encoding="utf-8", errors="ignore").read()):
        u = t.upper()
        if re.fullmatch(r"[A-Z0-9_-]+", u):
            curated.add(u)

# ---- 3) Test every candidate (game normalisation: trim + uppercase) ----
def mask(s):
    return (s[:1] + "*" * (len(s) - 2) + s[-1:] if len(s) > 2 else "***") \
           + f" (len={len(s)})"

found = []
n = 0
def test(cand):
    global n
    n += 1
    h = hashlib.sha256(cand.encode()).hexdigest()
    if h in tset:
        found.append((mask(cand), targets[h]))

t0 = time.time()
for c in curated:
    test(c)
print(f"dictionary candidates tested: {n:,}")

m0 = n
for i in range(1000000):                      # exhaustive numeric 0..999999
    test(str(i))
print(f"+ numeric exhaustive: {n - m0:,}")

m0 = n
for L in range(1, 5):                         # exhaustive A-Z, length 1..4
    for t in itertools.product("ABCDEFGHIJKLMNOPQRSTUVWXYZ", repeat=L):
        test("".join(t))
print(f"+ A-Z exhaustive len<=4: {n - m0:,}")

dt = time.time() - t0
print(f"TOTAL {n:,} candidates in {dt:.1f}s ({n/dt:,.0f}/s)  ->  MATCHES: {len(found)}")
for m, src in found:
    print("MATCH(masked):", m, "in", src)

```

## ۶) کد Sweepهای تکمیلی

```python
import os, re, json, collections

print("== sweep 1: target file presence ==")
hits = [os.path.join(r, f) for r, _, fs in os.walk(".")
        if ".git" not in r.split(os.sep) for f in fs if f == "reward_codes.json"]
print("reward_codes.json found:", hits if hits else "NONE")

print("\n== sweep 2: files mentioning accessCodes ==")
for root, dirs, files in os.walk("."):
    if ".git" in root.split(os.sep):
        continue
    for f in files:
        p = os.path.join(root, f)
        try:
            d = open(p, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        if "accessCodes" in d:
            print(p)

print("\n== sweep 3: every 64-char hex string, by file ==")
hex64 = re.compile(r"\b[a-f0-9]{64}\b")
found, locs = collections.Counter(), {}
for root, dirs, files in os.walk("."):
    if ".git" in root.split(os.sep):
        continue
    for f in files:
        p = os.path.join(root, f)
        try:
            data = open(p, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        ms = hex64.findall(data)
        if ms:
            found[p] = len(ms); locs[p] = set(ms)
for p, c in found.most_common():
    print(c, p, "unique:", len(locs[p]))
print("TOTAL unique 64hex:", len(set().union(*locs.values())) if locs else 0)

print("\n== sweep 4: JSON fields named code/password/secret ==")
hits = []
def walk(o, path, file):
    if isinstance(o, dict):
        for k, v in o.items():
            if k.lower() in ("code", "accesscode", "patreoncode",
                             "password", "secret", "unlockcode") \
               and isinstance(v, str) and v:
                hits.append((file, path + "/" + k, v[:80]))
            walk(v, path + "/" + k, file)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            walk(v, f"{path}[{i}]", file)
for root, _, files in os.walk("assets"):
    for f in files:
        if f.endswith(".json"):
            p = os.path.join(root, f)
            try:
                walk(json.load(open(p, encoding="utf-8", errors="ignore")), "", p)
            except Exception:
                pass
print("JSON fields literally named code/password/secret with string values:", len(hits))
for h in hits[:20]:
    print(h)

```

## ۷) لاگ کامل اجرا — اسکریپت اصلی

```text
$ python3 brute_force_audit.py
targets: 3532 unique SHA-256 values (459 in JS/JSON + APK file digests)
sanity SHA256('TEST') = 94ee059335e587e501cc4bf90613e0814f00a7b08bc7c648fd865a2af6a22cc2
dictionary candidates tested: 21,041
+ numeric exhaustive: 1,000,000
+ A-Z exhaustive len<=4: 475,254
TOTAL 1,496,295 candidates in 0.9s (1,707,150/s)  ->  MATCHES: 0
```

## ۸) لاگ کامل اجرا — Sweepهای تکمیلی

```text
$ python3 aux_sweeps.py
== sweep 1: target file presence ==
reward_codes.json found: NONE

== sweep 2: files mentioning accessCodes ==
./assets/public/scripts/card-vault-system.js
./testing v5/assets/public/scripts/card-vault-system.js

== sweep 3: every 64-char hex string, by file ==
496 ./assets/public/scripts/game-time-manifest.js unique: 457
496 ./testing v5/assets/public/scripts/game-time-manifest.js unique: 457
2 ./assets/public/story/gallery_eligibility_registry.json unique: 2
2 ./testing v5/assets/public/story/gallery_eligibility_registry.json unique: 2
1 ./assets/public/scripts/generated/story-graph.manifest.json unique: 1
1 ./testing v5/assets/public/scripts/generated/story-graph.manifest.json unique: 1
TOTAL unique 64hex: 459

== sweep 4: JSON fields named code/password/secret ==
JSON fields literally named code/password/secret with string values: 0
```

## ۹) جدول نتایج

| دسته کاندید | تعداد تست‌شده | تطابق |
|---|---:|---:|
| دیکشنری برگرفته از کدبیس | 21,041 | 0 |
| exhaust عددی (0 .. 999999) | 1,000,000 | 0 |
| exhaust حروف A-Z (طول ۱ تا ۴) | 475,254 | 0 |
| **جمع** | **1,496,295** | **0** |

- زمان و نرخ این اجرا: در خط `TOTAL` لاگ بخش ۷ (حدود ۱٫۷ میلیون هش/ثانیه تک‌هسته در پایتون).
- Sweep متن خام: `reward_codes.json` یافت نشد؛ `accessCodes` فقط در فایل منطق `card-vault-system.js` (هر دو کپی) است؛ فیلد JSON با نام code/password/secret: **۰**.
- طبقه‌بندی هش‌های hex موجود در JS/JSON: ۴۵۷ مقدار یکتا در `game-time-manifest.js` (هش فایل/متن استوری)، ۲ مقدار در `gallery_eligibility_registry.json` (یکی از آن‌ها با manifest مشترک است) و ۱ چک‌سام در `story-graph.manifest.json` — در مجموع ۴۵۹ مقدار یکتا و هیچ‌کدام هش کد دسترسی نیستند.

## ۱۰) تفسیر نتیجه

- این تست ثابت می‌کند در داده‌های آپلودشده **هیچ کد plain و هیچ هش کدی وجود ندارد** که با دیکشنری برگرفته از کد یا با بروت‌فورس کوتاه قابل بازیابی باشد.
- این تست **قدرت کدهای واقعی را ثابت یا رد نمی‌کند**؛ چون هش آن‌ها (`reward_codes.json`) در ورودی نبوده است. اگر کدها آنتروپی بالا داشته باشند، با در اختیار داشتن هش هم عملاً کرک‌ناپذیرند؛ اگر کوتاه/الگودار باشند، به‌دلیل SHA-256 خالص (بدون salt/iteration) با نرخ‌های GPU به‌سرعت می‌شکنند.
- برای تست قطعی، همین اسکریپت باید **به‌صورت داخلی و خصوصی** علیه فیلد `hashes` در فایل واقعی `reward_codes.json` اجرا شود. آن فایل را در ریپوی Public آپلود نکنید.
- صرف‌نظر از نتیجه آن تست، مسیر اصلی دور زدن این بیلد شکستن هش نیست (بخش ۱۱).

## ۱۱) یافته‌های مرتبط و لیست اصلاحیه برای برنامه‌نویس‌ها

| ID | شدت | یافته | مرجع |
|---|---|---|---|
| F-01 | بحرانی | API آنلاک عمومی بدون کد روی `window.Game` | `convo-runtime.js:13169` (`unlockPatreonMaster`)، `13145` (`setPatreonUnlockRelease`)، بدنه در `6060-6079` |
| F-02 | بحرانی | Entitlement فقط فلگ `"1"` در localStorage | `entitlement-service.js:4-18`؛ کلیدها در `save-system.js:5`، `settings-scene.js:18-21` |
| F-03 | بحرانی | محتوای داستانی پریمیوم (DAY16–20) به‌صورت JSON خام داخل بیلد است | `assets/public/story/DAY16..DAY20/` |
| F-04 | بالا | امضای لجر با رشته هاردکد + اکسپورت توابع نوشتن/هش | `card-vault-system.js:10-12`، `214`، `2532`، `2545` |
| F-05 | بالا | کدها اشتراکی، بدون انقضا، `once_per_install` و چک با SHA-256 سریع بدون salt | `card-vault-system.js:1068`، `1077`، `1102-1103` |
| F-06 | بالا | کلید AES مدیای «پروتکت‌شده» از عبارت هاردکد مشتق می‌شود (فقط obfuscation) | `protected-media-resolver.js:2` و تابع `key()` |
| F-07 | متوسط | `allowBackup=true`، مساحت وسیع FileProvider (`external-path "."`)، `<access origin="*">`، `minSdkVersion 22` | `AndroidManifest.xml`، `res/xml/file_paths.xml`، `res/xml/config.xml`، `apktool.json` |
| F-08 | متوسط | شیپ شدن ابزار توسعه Node در باندل بازی؛ URL پلیسهولدر تیرها | `translate-update.js:1-23`، `convo-runtime.js:3806-3929` |

**اقدام‌های پیشنهادی (خلاصه):** حذف APIهای F-01 از بیلد پروڈاکشن؛ انتقال احراز و redeem به سرور (Patreon API/OAuth) با توکن امضاشده نامتقارن و کدهای یک‌بارمصرف per-account با انقضا و rate-limit؛ عدم شیپ محتوای پریمیوم در بیلد رایگان و تحویل پس از احراز؛ `allowBackup=false`؛ حذف ابزار F-08 از باندل؛ Private کردن ریپو و rotate کردن هر کدی که در تست داخلی ضعیف تشخیص داده شود.

**معیار پذیرش پس از اصلاح:** ست‌کردن دستی فلگ‌های localStorage، صدا زدن APIهای عمومی آنلاک، جعل لجر لوکال و خواندن مستقیم فایل‌های پریمیوم از داخل APK — همه باید ناموفق باشند.

## ۱۲) بازتولید تست

```bash
# در ریشه ریپو، پس از استخراج هر دو زیپ:
python3 brute_force_audit.py   # کد کامل در بخش ۵
python3 aux_sweeps.py          # کد کامل در بخش ۶
```

خروجی مورد انتظار روی همین ورودی‌ها دقیقاً لاگ‌های بخش‌های ۷ و ۸ است (زمان/نرخ اجرا بسته به سخت‌افزار کمی تغییر می‌کند؛ تعداد کاندیدها و `MATCHES: 0` ثابت است).

---

## ۱۳) الحاقیه (2026-10-20): فایل `manifest.json` دریافتی جداگانه

فایلی که بعداً ارسال شد، مانیفست **protected-media** است — نه `reward_codes.json`:

```text
مسیر اصلی در APK : assets/public/assets/protected-media/manifest.json
SHA-256 فایل      : f93f10cc1f4e764c2b868216145920d2464c3276008c1352c32e40100c24aec4
تطابق با MANIFEST.MF امضای APK: MATCH (دقیقاً همان فایل داخل APK است)
ساختار: { version: 1, algorithm: "A256GCM", records: { <8-hex key>: {record, mime, bytes, sha256} } }
رکوردها: 591  (562 image/jpeg, 17 image/png, 12 video/mp4)
جمع بایت اعلام‌شده: 146,897,685 (~140.1 MiB)
```

### نتایج بررسی این فایل

1. **کامل و سازگار با موجودی APK:** هر ۵۹۱ نام فایل `.bin` در این مانیفست دقیقاً با فهرست `MANIFEST.MF` یکسان است (بدون رکورد اضافه یا گمشده).
2. **فیلد `sha256` هر رکورد، هش محتوای رمزگشایی‌شده (plaintext) است، نه فایل رمزشده:** در ۰ از ۵۹۱ مورد با دایجست فایل `.bin` در `MANIFEST.MF` برابر بود؛ و در **۶ مورد** دقیقاً با دایجست یک کپی plain همان تصویر در جای دیگری از APK برابر است (همان محتوا در دو مسیر متفاوت، از جمله جفت‌پوشه‌های واریانت male/female کاراکتر mason). کد ران‌تایم (`protected-media-resolver.js`) این فیلد را اصلاً مصرف یا وریفای نمی‌کند.
3. **کلیدهای رکوردها (FNV-1a سی‌ودوبیتی روی مسیر منطقی فایل، تابع `hashPath` در ریسالور) پنهان‌سازی مؤثری نیستند:** با بازتولید همان تابع و تغذیه ۸۱۶ مسیر مدیای literal برداشت‌شده از JS/HTML/JSONهای استخراج‌شده، **۴۷۳ از ۵۹۱ کلید (۸۰٫۰٪)** فوراً به مسیر منطقی اصلی‌شان برگردانده شدند (عمدتاً زیر `assets/pictures/Conversation|conversation|evidence|onlyfun|snapgram` و ۵ آواتار). ۱۱۸ کلید باقی‌مانده همگی JPEG هستند و مسیرشان در فایل‌های موجود literal نیست — به‌احتمال زیاد در کانفیگ‌های هنوز گمشده (مثل `cards.json`) تعریف شده‌اند. تلاش با جایگزینی پوشه‌های واریانت جنسیتی mason پوشش را بیشتر نکرد.
4. **اثر بر تست Patreon: هیچ.** این مانیفست هیچ هش کد دسترسی ندارد؛ نتیجه بخش‌های ۷ تا ۱۰ بدون تغییر می‌ماند. با این فایل، شمار فایل‌های گمشده از ۷۴۰ به ۷۳۹ رسید؛ فایل‌های رمزشده `.bin` و به‌ویژه `reward_codes.json` همچنان در آپلودها نیستند.
5. **ریسک باقی‌مانده مدیا (تکمیل F-06):** در APK واقعی، ترکیب «مانیفست + عبارت هاردکد مشتق‌ساز کلید در ریسالور + فایل‌های `.bin`» یعنی رمزگشایی آفلاین هر ۵۹۱ مدیا بدون هیچ entitlement؛ تابع `resolve()` پیش از رمزگشایی هیچ بررسی مجوزی انجام نمی‌دهد (تابع `authorize()` جدا و اختیاری در کال‌بک‌های UI است) و روی خود مانیفست هم هیچ امضا/وریفای انجام نمی‌شود.

### کد بازتولید نگاشت کلیدها (خلاصه)

```python
import re
def hash_path(value):  # همان FNV-1a 32-bit ریسالور روی مسیر lowercase
    text = str(value).replace("\\", "/").split("?")[0].split("#")[0].lower().lstrip("./")
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return format(h, "08x")
# candidates = هر رشته شبیه مسیر مدیا در JS/HTML/JSON -> hash_path(candidate) in manifest["records"]
```

### محل قرارگیری در این ریپو

فایل بدون هیچ تغییری (همان SHA-256 بالا) در مسیر اصلی‌اش در هر دو درخت استخراج‌شده قرار گرفت:

- `assets/public/assets/protected-media/manifest.json`
- `testing v5/assets/public/assets/protected-media/manifest.json`

