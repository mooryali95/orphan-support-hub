-- =====================================================================
-- محاكاة بيئة Supabase على PostgreSQL عادي
-- =====================================================================
-- تتيح تشغيل مجموعات فحص RLS في أي مكان — CI أو جهاز محلي — بلا Supabase.
-- تُنشئ الأدوار الثلاثة وschema المصادقة ودالة auth.uid() كما تعرّفها Supabase.
--
-- ليست جزءاً من هجرات المنتج ولا تُطبَّق على قاعدة حقيقية.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  email_confirmed_at TIMESTAMPTZ,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- نفس تعريف Supabase: يقرأ sub من مطالبات JWT المحقونة في إعدادات الجلسة.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- محاكاة تخزين Supabase
-- ---------------------------------------------------------------------
-- سياسات التخزين هي الحارس الوحيد على وثائق اليتيم (هوية، شهادة وفاة،
-- إثبات وصاية)، فلا يجوز أن تبقى بلا فحص. هذه أعمدة `storage.objects`
-- التي تعتمد عليها السياسات: `bucket_id` و`name` و`owner`.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public BOOLEAN NOT NULL DEFAULT false,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL REFERENCES storage.buckets(id),
  name TEXT NOT NULL,
  owner UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);

-- نفس تعريف Supabase: يقسّم المسار إلى أجزاء، فـ`(storage.foldername(name))[1]`
-- هو المجلّد الأول — وعليه تُبنى العزلة بين ملفّات الأيتام.
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts TEXT[];
BEGIN
  _parts := string_to_array(name, '/');
  RETURN _parts[1:array_length(_parts, 1) - 1];
END $$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(TEXT) TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT ALL ON storage.buckets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
GRANT ALL ON storage.objects TO service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- صلاحيات Supabase الافتراضية على public
-- ---------------------------------------------------------------------
-- كل مشروعٍ مستضاف على Supabase يحمل هذه الأسطر الثلاثة: أيّ جدولٍ أو
-- دالّةٍ أو تسلسلٍ يُنشأ في public يُمنح لـ anon وauthenticated كاملاً.
-- غيابها هنا جعل الفحوص تمرّ على قاعدةٍ أضيق من البثّ (DB-04، DB-09):
-- الحذف المفتوح على البثّ كان محجوباً في المحاكاة فلم يُرَ. فكلّ هجرةٍ
-- جديدة تُختبر الآن بالصلاحيات التي ستلقاها فعلاً، وعليها أن تسحب
-- (`REVOKE ALL ... FROM anon, authenticated`) قبل أن تمنح.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
