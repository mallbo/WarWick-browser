@echo off
chcp 65001 >nul
echo ========================================================
echo        WarWick Browser - اعداد مفتاح Antigravity AI
echo ========================================================
echo.
echo ادخل مفتاح Gemini API Key الخاص بك (او اضغط Enter للالغاء):
set /p API_KEY="> "
if "%API_KEY%"=="" goto end

echo GEMINI_API_KEY=%API_KEY%> "%~dp0.env"
echo.
echo [تم بنجاح] تم حفظ مفتاح الذكاء الاصطناعي في ملف .env
echo يمكنك الان تشغيل المتصفح والاستمتاع بميزات Antigravity كاملة!
echo.
pause
exit

:end
echo لم يتم ادخال اي مفتاح.
pause
