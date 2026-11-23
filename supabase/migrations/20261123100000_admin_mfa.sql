-- =====================================================================
-- المصادقة الثنائية للإدارة
-- =====================================================================
-- الدخول بالبريد وحده يجعل صندوق البريد مفتاح المنصّة. من الآن:
-- مديرٌ فعّل عاملاً موثّقاً (TOTP) لا تُقبل صلاحيته إلا بجلسة aal2.
-- مديرٌ لم يفعّل بعد يبقى مديراً (لا قفل مفاجئ)، والواجهة تُلزمه بالتفعيل
-- قبل فتح لوحة الإدارة.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
     AND (
       COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       OR NOT EXISTS (
         SELECT 1 FROM auth.mfa_factors f
         WHERE f.user_id = auth.uid() AND f.status = 'verified'
       )
     );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
