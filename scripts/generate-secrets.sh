#!/bin/bash

# =============================================================================
# Security Setup Script - فاحص
# =============================================================================
# هذا السكريبت يساعد في توليد المفاتيح السرية الآمنة
#
# الاستخدام:
#   chmod +x scripts/generate-secrets.sh
#   ./scripts/generate-secrets.sh
#
# ⚠️ لا ترفع الملفات الناتجة إلى Git
# =============================================================================

echo "🔐 توليد المفاتيح السرية لفاحص..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js غير مثبت${NC}"
    echo "يرجى تثبيت Node.js من: https://nodejs.org/"
    exit 1
fi

echo -e "${YELLOW}📝 توليد المفاتيح السرية...${NC}"
echo ""

# Generate secrets
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
RATE_LIMIT_PEPPER=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
APP_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
OTP_PEPPER=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Create secrets file
SECRETS_FILE=".secrets-generated.txt"

cat > $SECRETS_FILE << EOF
# =============================================================================
# المفاتيح السرية المولدة - $(date)
# =============================================================================
# ⚠️ احذف هذا الملف بعد نسخ القيم إلى .env.local
# ⚠️ لا ترفع هذا الملف إلى Git أبداً
# =============================================================================

# Application Secrets
SESSION_SECRET=$SESSION_SECRET
APP_SECRET=$APP_SECRET
RATE_LIMIT_PEPPER=$RATE_LIMIT_PEPPER
OTP_PEPPER=$OTP_PEPPER

# =============================================================================
# الخطوات التالية:
# =============================================================================
# 1. انسخ القيم أعلاه إلى ملف .env.local
# 2. أعد توليد Clerk keys من: https://dashboard.clerk.com
# 3. أعد توليد Supabase service role key من لوحة التحكم
# 4. غير ADMIN_ACCESS_CODE لكلمة مرور قوية
# 5. احذف هذا الملف بعد النسخ
#
# للتحقق من قوة كلمات المرور:
#   - 64+ حرف للمفاتيح الرئيسية
#   - 32+ حرف للمفاتيح الفرعية
#   - أرقام وحروف عشوائية فقط
# =============================================================================
EOF

echo -e "${GREEN}✅ تم توليد المفاتيح بنجاح!${NC}"
echo ""
echo -e "${YELLOW}📄 تم حفظ المفاتيح في: $SECRETS_FILE${NC}"
echo ""
echo -e "${RED}⚠️  تحذير أمني:${NC}"
echo "1. انسخ القيم من $SECRETS_FILE إلى .env.local"
echo "2. احذف ملف $SECRETS_FILE بعد النسخ"
echo "3. لا ترفع .env.local أو $SECRETS_FILE إلى Git"
echo ""
echo -e "${YELLOW}📋 الخطوات المتبقية:${NC}"
echo "• أعد توليد Clerk keys من لوحة التحكم"
echo "• أعد توليد Supabase service role key"
echo "• غير ADMIN_ACCESS_CODE لكلمة مرور قوية"
echo "• راجع ملف SECURITY.md للمزيد من التفاصيل"
echo ""
echo -e "${GREEN}🎉 انتهى!${NC}"
