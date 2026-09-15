# Operational-KB MVP

دستیار راهنمای سامانه برای یک پروژه متوسط React/TypeScript و .NET. کد، API، endpoint، permission، وضعیت‌ها، مستندات، HTML و CSS را ingest می‌کند و برای سؤال‌های کاربران، راهنمای ساده و مستند با citation می‌سازد.

## قابلیت‌های MVP

- بازکردن چت جدید و پاک‌کردن context قبلی
- prompt قابل تنظیم برای agent و پاسخ end-user، نه developer
- تحلیل سؤال‌های مبهم قبل از پاسخ و abstain امن وقتی مدرک کافی نیست
- درک محدود اما واقعی از ساختار HTML و نقش CSS، بدون نسبت‌دادن منطق کسب‌وکار به ظاهر
- history محدود و قابل تنظیم، سقف سؤال، سقف evidence و timeout مدل
- retrieval فارسی/انگلیسی با aliasهای عملیاتی و citation اجباری

## اجرای ویندوز

```powershell
git checkout feat/chat-experience
npm install
Copy-Item .env.example .env
# LLM_BASE_URL, LLM_API_KEY و LLM_MODEL را در .env تنظیم کن
.\scripts\start-mvp.ps1 -ProjectPath "C:\Users\safapoor.p\Desktop\External Services\backup\ExternalService Full"
```

سپس `http://127.0.0.1:5051` را باز کن. دکمه «چت جدید» context را پاک می‌کند و تنظیمات agent و محدودیت‌ها از مسیر `/api/config` قابل نمایش هستند.

## تنظیمات مهم

`AGENT_NAME` نام دستیار، `AGENT_TONE` لحن، `MAX_HISTORY_MESSAGES` تعداد پیام‌های context، `MAX_QUESTION_CHARS` سقف سؤال، `MAX_EVIDENCE_CHARS` سقف بسته evidence، `ANSWER_MAX_TOKENS` سقف پاسخ و `LLM_TIMEOUT_MS` زمان انتظار مدل هستند.

## محدودیت واقعی

این MVP فقط از snapshot فعال و source ingest‌شده پاسخ می‌دهد. CSS برای ظاهر و ساختار است و به‌تنهایی permission یا اثر backend را ثابت نمی‌کند. برای بهره‌برداری واقعی، بعد از ingest پروژه ExternalService باید سؤال‌های واقعی تیم را benchmark و اصلاح کنیم.
