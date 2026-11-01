<div align="center">

<img src="frontend/public/brand/tanpoosh-wordmark.svg" alt="TANPOOSH" width="260" />

# تن‌پوش · فروشگاه، رگال و استودیوی استایل

**از انتخاب لباس تا دیدن یک استایل کامل؛ در یک فروشگاه فارسی و راست‌چین.**

![Next.js](https://img.shields.io/badge/Next.js-16-20221f?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-20221f?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Django](https://img.shields.io/badge/Django-Backend-092e20?logo=django)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169e1?logo=postgresql&logoColor=white)
![RTL](https://img.shields.io/badge/Persian-RTL-c9b99a)

[نمایش تصویری](#gallery) · [رگال تعاملی](#rack) · [استودیوی استایل](#studio) · [امکانات](#features) · [شروع سریع](#getting-started) · [معماری](#architecture) · [بررسی پروژه](#checks)

<img src="docs/screenshots/home.png" alt="صفحهٔ اصلی تن‌پوش با تصویر مدل و پیشنهادهای استایل" width="100%" />

</div>

تن‌پوش یک پروژهٔ کامل فروشگاه پوشاک مردانه با رابط فارسی، قیمت‌های تومانی و طراحی واکنش‌گراست. محصولات را مرور کنید، روی رگال سه‌بعدی لباس‌ها را با ماوس بگیرید و بکشید، یا در استودیوی استایل یک ست کامل بسازید. انتخاب سایز و خرید در همهٔ این مسیرها به کاتالوگ و سبد مشترک فروشگاه وصل است. پنل اختصاصی مدیریت هم برای محصولات، موجودی، سفارش‌ها و محتوای فروشگاه در دسترس است.

> تصاویر این README از اجرای واقعی برنامه گرفته شده‌اند. داده‌ها و تصاویر محصولات نمایشی‌اند؛ پرداخت در حالت محلی شبیه‌سازی می‌شود و ایمیل‌ها به Mailpit می‌روند.

| خرید | رگال تعاملی | ساخت استایل | مدیریت |
|---|---|---|---|
| کاتالوگ، جست‌وجو، فیلتر، رنگ و سایز، سبد و سفارش | ۸ لباس، درگ مستقیم، کشش پارچه و نمای نزدیک | ۱۷ محصول، ۳۱ انتخاب رنگ و ۲٬۵۲۰ ترکیب | نقش‌ها و مجوزها، موجودی، سفارش، گزارش و محتوا |

<a id="gallery"></a>
## نمایش تصویری پروژه

برای دیدن جزئیات روی تصویرها کلیک کنید.

### فروشگاه؛ از ویترین تا انتخاب محصول

| کاتالوگ و فیلترها | جزئیات محصول |
|---|---|
| [![کاتالوگ تن‌پوش](docs/screenshots/shop.png)](docs/screenshots/shop.png) | [![صفحهٔ محصول](docs/screenshots/product.png)](docs/screenshots/product.png) |
| کارت‌های محصول، دسته‌بندی و مرتب‌سازی | عکس محصول، انتخاب رنگ، سایز و افزودن به سبد |

<a id="rack"></a>
### رگال تعاملی؛ لباس را بگیر و کشف کن

[![رگال سه‌بعدی تن‌پوش با چوب‌لباسی‌های چوبی و فاصلهٔ مستقل لباس‌ها](docs/screenshots/rack.png)](docs/screenshots/rack.png)

از بخش «رگال را ورق بزن» در صفحهٔ اصلی یا لینک «رگال» در منو وارد `/rack` شوید. هشت لباس از کاتالوگ فروشگاه روی یک رگال سه‌بعدی نمایش داده می‌شوند؛ لباس وسط روبه‌رو قرار می‌گیرد و باقی لباس‌ها با زاویه و فاصلهٔ متناسب با عرضشان کنار آن می‌ایستند.

- **گرفتن و کشیدن خود لباس:** محل تماس ماوس روی سطح لباس تشخیص داده می‌شود؛ پارچه از همان نقطه خم و کشیده می‌شود و یقه به چوب‌لباسی متصل می‌ماند. پس از رهاکردن، لباس با حرکت فنری آرام می‌گیرد.
- **مرور رگال:** درگ، چرخ ماوس، دکمه‌های قبلی و بعدی و انتخاب مستقیم لباس؛ فاصله‌ها هنگام جابه‌جایی هم تنظیم می‌شوند.
- **خرید از نمای نزدیک:** دیدن زاویه‌های مختلف، قیمت و سایزهای موجود، انتخاب سایز، انیمیشن پاکت خرید و افزودن به سبد اصلی فروشگاه.
- **اجرای سبک‌تر:** تصاویر WebP با همان ابعاد، توقف رندر پس از آرام‌گرفتن صحنه، پشتیبانی از کاهش حرکت و نمای تصویری جایگزین هنگام خطای WebGL.

| ورودی رگال در صفحهٔ اصلی | گرفتن و کشیدن پارچه |
|---|---|
| [![بخش ورود به رگال در صفحهٔ اصلی](docs/screenshots/home-rack.png)](docs/screenshots/home-rack.png) | [![تغییر شکل لباس در حالی که با ماوس گرفته و کشیده شده است](docs/screenshots/rack-drag.png)](docs/screenshots/rack-drag.png) |

| نمای نزدیک و انتخاب سایز | سبد مشترک فروشگاه |
|---|---|
| [![جزئیات محصول و انتخاب سایز در رگال](docs/screenshots/rack-product.png)](docs/screenshots/rack-product.png) | [![لباس انتخاب‌شده از رگال در سبد خرید فروشگاه](docs/screenshots/rack-cart.png)](docs/screenshots/rack-cart.png) |

<details>
<summary>رگال و انتخاب محصول در موبایل</summary>
<br />
<img src="docs/screenshots/rack-mobile.png" alt="نمای رگال در موبایل" width="280" />
<img src="docs/screenshots/rack-product-mobile.png" alt="نمای نزدیک لباس و انتخاب سایز در موبایل" width="280" />
<br />
<img src="docs/screenshots/home-rack-mobile.png" alt="بخش ورود به رگال در صفحهٔ اصلی موبایل" width="280" />
</details>

جزئیات اتصال به کاتالوگ، هندسهٔ لباس‌ها و رفتار تعامل در [راهنمای رگال](frontend/src/rack/README.md) آمده است.

<a id="studio"></a>
### استودیوی استایل؛ لباس‌ها را کنار هم ببینید

![استودیوی استایل با یک ست کلاسیک و عینک](docs/screenshots/studio.png)

یک بالاپوش، شلوار و کفش انتخاب کنید؛ عینک را هم در صورت تمایل اضافه کنید. با «نمایش استایل»، نتیجه روی یک مدل خیالی ثابت نمایش داده می‌شود. تغییر رنگ یا محصول به پیش‌نمایش تازه نیاز دارد؛ سایز برای انتخاب موجودی است و فرم بدن را شبیه‌سازی نمی‌کند.

- ترکیب عکس‌های آماده با دوربین، ژست و نور ثابت؛ پیش‌نمایش بدون کلید API یا تولید آنلاین تصویر.
- انتخاب رنگ و سایز، قیمت کل ست و افزودن یک‌جای لباس‌های انتخابی به سبد.
- پیشنهادهای آماده، واگرد و ازنو، بزرگ‌نمایی و دریافت تصویر JPEG.
- ذخیره و اشتراک‌گذاری استایل‌ها و بازکردن دوبارهٔ انتخاب‌ها.

| بخش | انتخاب‌های محصول و رنگ |
|---|---:|
| بالاپوش | ۱۵ |
| شلوار | ۷ |
| کفش | ۶ |
| عینک | ۳ + بدون عینک |
| ترکیب‌ها | **۱۵ × ۷ × ۶ × ۴ = ۲٬۵۲۰** |

استودیو از لایه‌های دوبعدی عکس استفاده می‌کند. پیش‌نمایش و خروجی JPEG از هندسه و ترتیب لایهٔ مشترک استفاده می‌کنند. لباس‌های رویی در فروشگاه فروخته می‌شوند و در استودیو حضور ندارند. جزئیات فنی در [راهنمای تصاویر استودیو](docs/STUDIO_IMAGES.md) آمده است.

### پیشنهادهای تعاملی در صفحهٔ اصلی

![پیشنهادهای استایل در صفحهٔ اصلی](docs/screenshots/home-looks.png)

بین ست‌های آماده جابه‌جا شوید، لباس‌های هر ست را ببینید و همان انتخاب را برای شخصی‌سازی در استودیو باز کنید.

### پنل مدیریت؛ عملیات فروشگاه در یک محیط فارسی

| داشبورد مدیریت | مدیریت محصولات |
|---|---|
| [![داشبورد مدیر](docs/screenshots/admin.png)](docs/screenshots/admin.png) | [![فهرست محصولات پنل مدیریت](docs/screenshots/admin-products.png)](docs/screenshots/admin-products.png) |
| آمار پرداخت‌های آزمایشی و دسترسی به بخش‌های مدیریتی | جست‌وجو، مشاهده و ویرایش کاتالوگ |

### تجربهٔ موبایل

<details>
<summary>دیدن صفحهٔ اصلی در نمایشگر موبایل</summary>
<br />
<img src="docs/screenshots/mobile.png" alt="صفحهٔ اصلی تن‌پوش در موبایل" width="320" />
</details>

<a id="features"></a>
## امکانات اصلی

| بخش | امکانات |
|---|---|
| ویترین | مجموعه‌ها، محصولات پیشنهادی، ریل افقی محصولات و پیشنهادهای استایل |
| رگال | صحنهٔ سه‌بعدی، درگ لباس و کشش پارچه، فاصله‌گذاری پویا، نمای نزدیک و خرید از کاتالوگ اصلی |
| کاتالوگ | جست‌وجو و فیلتر، انتخاب رنگ و سایز، عکس و موجودی هر تنوع |
| خرید | سبد مهمان و مشتری، ادغام سبد پس از ورود، کد تخفیف و روش ارسال |
| سفارش | رزرو موجودی، پرداخت آزمایشی، تلاش مجدد پرداخت و پیگیری سفارش |
| حساب کاربری | آدرس‌ها، علاقه‌مندی‌ها، سفارش‌ها، استایل‌های ذخیره‌شده و درخواست مرجوعی |
| مدیریت | محصولات، دسته‌بندی، موجودی، سفارش، مرجوعی، پرداخت و بازپرداخت |
| عملیات فروشگاه | کوپن، ارسال، مشتریان، کارکنان، نقدها، پشتیبانی، محتوا و تنظیمات |
| دسترسی | نقش‌های مالک، مدیر کاتالوگ، مدیر سفارش و مالی؛ ثبت رویدادهای مدیریتی |
| رابط | فارسی و راست‌چین، فونت Estedad، طراحی واکنش‌گرا و پیام‌های خطای فارسی |

<a id="getting-started"></a>
## شروع سریع

### اجرای پروژهٔ آماده در ویندوز

پس از نصب وابستگی‌ها و آماده‌سازی سرویس‌های محلی، روی **`START_TANPOOSH.cmd`** دوبار کلیک کنید یا از ریشهٔ پروژه اجرا کنید:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-local.ps1 -OpenBrowser
```

| مسیر | کاربرد |
|---|---|
| `http://localhost:8088` | فروشگاه |
| `http://localhost:8088/rack` | رگال تعاملی لباس |
| `http://localhost:8088/studio` | استودیوی استایل |
| `http://localhost:8088/manage/login` | ورود مدیر |
| `http://127.0.0.1:8025` | صندوق ایمیل آزمایشی Mailpit |

### نصب از ابتدا

پیش‌نیازها: **Python 3.12، Node.js 24، PostgreSQL 18، Redis، Mailpit و Caddy**. لانچر ویندوز از ابزارهای قابل‌حمل در `.local-tools/` استفاده می‌کند؛ مسیر ابزارهای نصب‌شده روی سیستم خود را مطابق [راهنمای نصب](QUICKSTART.md) تنظیم کنید.

```powershell
git clone https://github.com/hamidshaikhy/tanpoosh.git
cd tanpoosh
py -3.12 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
```

پایگاه دادهٔ `tanpoosh` و کاربر آن را بسازید و PostgreSQL، Redis و Mailpit را اجرا کنید. رمز پایگاه داده را در فایل محلی `.local-tools/pg-app-password.txt` قرار دهید. سپس:

```powershell
backend/.venv/Scripts/python.exe backend/scripts/init_local_env.py
backend/.venv/Scripts/python.exe backend/scripts/sync_frontend_env.py
backend/.venv/Scripts/python.exe backend/manage.py migrate
backend/.venv/Scripts/python.exe backend/manage.py seed_store
backend/.venv/Scripts/python.exe backend/manage.py refresh_demo_catalog
backend/.venv/Scripts/python.exe backend/manage.py bootstrap_owner --generate
cd frontend
npm ci
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-local.ps1 -OpenBrowser
```

نام کاربری اولیهٔ مدیر `tanpoosh_admin` است. رمز ساخته‌شده در `backend/.local-credentials/owner.txt` ذخیره می‌شود؛ رمزها و فایل‌های `.env` در Git قرار نمی‌گیرند. برای تغییر رمز مدیر:

```powershell
backend/.venv/Scripts/python.exe backend/manage.py set_staff_password --username tanpoosh_admin
```

در اجرای محلی، ورود مدیر فقط با نام کاربری و رمز انجام می‌شود (`MFA_DEV_BYPASS=true`). با تنظیم این گزینه روی `false` می‌توان تأیید دومرحله‌ای را فعال کرد. تنظیمات production تأیید دومرحله‌ای را الزامی می‌کنند.

اجرای اختیاری با Docker Compose و توضیح سرویس‌ها در [راهنمای عملیات](docs/RUNBOOK.md) و [فایل Compose](docker-compose.yml) آمده است.

<a id="architecture"></a>
## معماری و فناوری‌ها

```mermaid
flowchart LR
    Browser["مرورگر · فروشگاه / رگال / استودیو / مدیریت"] --> Caddy["Caddy · localhost:8088"]
    Caddy --> Next["Next.js · React · TypeScript"]
    Caddy --> Django["Django REST API"]
    Next --> Django
    Django --> Postgres["PostgreSQL · محصولات و سفارش‌ها"]
    Django --> Redis["Redis · کش و محدودیت درخواست"]
    Worker["Celery · کارهای پس‌زمینه"] --> Postgres
    Worker --> Redis
    Worker --> Mailpit["Mailpit · ایمیل آزمایشی"]
```

| لایه | فناوری |
|---|---|
| فرانت‌اند | Next.js App Router، React، TypeScript، Tailwind CSS |
| داده و وضعیت رابط | TanStack Query، Zustand، React Hook Form و Zod |
| API | Django و Django REST Framework، قرارداد OpenAPI |
| داده و پردازش | PostgreSQL، Redis و Celery |
| استودیو | لایه‌های WebP، SVG برای نمایش و Canvas2D برای خروجی |
| رگال | Three.js و WebGL، هندسهٔ بافت‌دار لباس، انتخاب با Raycaster و تغییر شکل فنری سطح |
| تست | pytest، Vitest و Playwright |
| سرویس‌های محلی | Caddy و Mailpit |

```text
backend/                 API، مدل‌ها، مجوزها، مهاجرت‌ها و تست‌ها
  fixtures/seed/         کاتالوگ و تصاویر اولیهٔ محصولات
frontend/
  src/app/               مسیرهای فروشگاه، حساب و مدیریت
  src/studio/            انتخاب لباس و ترکیب عکس‌های استایل
  src/rack/              صحنهٔ سه‌بعدی، تعامل پارچه و نمای نزدیک محصول
  src/manage/            رابط پنل مدیریت
  public/                نشان تجاری، تصاویر استودیو و هندسه و بافت لباس‌های رگال
docs/                    معماری، عملیات و تصاویر README
infra/                   تنظیمات پراکسی
tools/                   اجرا، توقف و ابزارهای نگهداری
```

[معماری کامل](docs/ARCHITECTURE.md) · [عملیات و پشتیبان‌گیری](docs/RUNBOOK.md) · [منابع تصاویر و فونت](docs/ASSET_MANIFEST.md)

<a id="checks"></a>
## بررسی پروژه

از پوشهٔ `backend/`:

```powershell
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check apps tests config scripts
.venv/Scripts/python.exe manage.py makemigrations --check --dry-run
```

از پوشهٔ `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

برای تست‌های مرورگر، سرویس‌ها باید روشن باشند و Chrome نصب باشد. کاربران تست از حساب مدیر اصلی جدا هستند. توضیح تولید و بررسی قرارداد API و ساخت جداگانهٔ Next در [QUICKSTART.md](QUICKSTART.md) آمده است.

برای اجرای مستقل چهار تست رگال روی فروشگاه محلی، بدون اجرای آماده‌سازی حساب‌ها و داده‌های مجموعهٔ اصلی تست، از پوشهٔ `frontend/` اجرا کنید:

```powershell
node scripts/check-rack.mjs
```

این تست‌ها ورود از صفحهٔ اصلی، انتخاب سایز و افزودن به سبد، نمایش موبایل، گرفتن و رهاکردن پارچه و حالت خطای بارگیری را بررسی می‌کنند.

برای تازه‌کردن عکس‌های README، از پوشهٔ `frontend/` و با حساب محلی مدیر اجرا کنید:

```powershell
node scripts/capture-readme.mjs
```

برای تازه‌کردن تصاویر رگال، بخش ورودی صفحهٔ اصلی و نمایش موبایل، بدون ورود مدیر:

```powershell
node scripts/capture-rack-readme.mjs
```

## محدودهٔ پروژه

این نسخه برای نمایش و تمرین محلی آماده شده است. پرداخت پیش‌فرض آزمایشی است، ایمیل‌ها در صندوق محلی ثبت می‌شوند و تصاویر لباس‌ها مفهوم‌های تصویری ساختگی هستند. استودیو نمای ترکیبی لباس‌ها را نشان می‌دهد و اندازه یا تن‌خور واقعی را پیش‌بینی نمی‌کند. هندسهٔ لباس‌های رگال از عکس‌های روبه‌رو ساخته شده و پشت لباس‌ها بافت سادهٔ هم‌رنگ دارد؛ کشش نمایشی پارچه، شبیه‌سازی دقیق جنس و تن‌خور نیست. استقرار عمومی به تنظیمات production و سرویس‌های واقعی پرداخت، ایمیل و ذخیره‌سازی نیاز دارد.
