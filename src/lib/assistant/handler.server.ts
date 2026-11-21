import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, type UIMessage } from "ai";
import type { Database } from "@/integrations/supabase/types";
import { assistantInstructions, assistantRequestSchema, gatewayFailure, publicAssistantCard } from "./policy";
import { createResponsesCall } from "./responses.server.ts";
import { withLovableAiGatewayRunIdHeader } from "./run-id.server.ts";

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function handleAssistant(request: Request, reset = false): Promise<Response> {
  try {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return jsonError("تعذّر إعداد مساعد الأسئلة.", 503);
    const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return jsonError("سجّل الدخول لطرح سؤالك.", 401);
    const db = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      } },
    });
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return jsonError("انتهت جلسة الدخول؛ سجّل الدخول مجدداً.", 401);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (reset) {
      const userDb = createClient<Database>(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: admin, error } = await userDb.rpc("is_admin");
      if (error || !admin) return jsonError("إعادة تفعيل المساعد متاحة للإدارة فقط.", 403);
      const { error: resetError } = await supabaseAdmin.from("supporter_assistant_state").delete().eq("id", true);
      return resetError ? jsonError("تعذّر إعادة تفعيل المساعد.", 503) : Response.json({ ok: true });
    }
    const raw = await request.text();
    if (raw.length > 64000) return jsonError("السؤال أو المحادثة أطول من الحد المسموح.", 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return jsonError("تعذّر قراءة السؤال.", 400); }
    const parsed = assistantRequestSchema.safeParse(input);
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "السؤال غير صالح.", 400);
    const { data: paused, error: stateError } = await supabaseAdmin.from("supporter_assistant_state").select("status,message").eq("id", true).maybeSingle();
    if (stateError) return jsonError("تعذّر التحقق من إتاحة المساعد.", 503);
    if (paused) return jsonError(paused.message, paused.status);
    const { data: limit, error: limitError } = await supabaseAdmin.rpc("hit_rate_limit", { _bucket: "supporter_ai", _identity: `u:${auth.user.id}`, _limit: 10, _window_seconds: 300 });
    if (limitError) return jsonError("تعذّر التحقق من حدّ الاستخدام.", 503);
    const verdict = limit as { allowed?: boolean } | null;
    if (!verdict?.allowed) return jsonError("أسئلة كثيرة في وقت قصير. انتظر قليلاً قبل السؤال التالي.", 429);
    let card: ReturnType<typeof publicAssistantCard> = null;
    if (parsed.data.orphanId) {
      // Anonymous client: never use the caller's child-access privileges for model context.
      const { data: view, error } = await db.rpc("orphan_view", { _orphan: parsed.data.orphanId });
      if (error) return jsonError("تعذّر تحميل معلومات الملف المنشورة.", 503);
      card = publicAssistantCard(view);
      if (!card) return jsonError("هذا الملف غير منشور أو غير متاح للأسئلة.", 404);
    }
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return jsonError("مساعد الأسئلة غير مهيّأ حالياً.", 503);
    const messages: UIMessage[] = parsed.data.messages.map(m => ({ id: m.id, role: m.role, parts: m.parts.filter(p => p.type === "text" && typeof p.text === "string").map(p => ({ type: "text" as const, text: p.text ?? "" })) }));
    let failure: ReturnType<typeof gatewayFailure> | null = null;
    const call = createResponsesCall(request, {
      baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6.1-sol",
      onResponse: async response => {
        if (response.ok) return;
        let payload: unknown = null;
        try { payload = await response.clone().json(); } catch { /* Safe fallback below. */ }
        failure = gatewayFailure(response.status, payload);
        if (response.status === 402 || response.status === 403) {
          const { error } = await supabaseAdmin.from("supporter_assistant_state").upsert({ id: true, status: failure.status, message: failure.message, updated_at: new Date().toISOString() });
          if (error) console.error("assistant circuit persistence failed", error.code);
        }
      },
    }, await convertToModelMessages(messages), assistantInstructions(card));
    const stream = call.result.toUIMessageStreamResponse({
      originalMessages: messages, sendReasoning: true,
      onError: () => failure?.message ?? (request.signal.aborted ? "تم إيقاف الإجابة." : "تعذّر إكمال الإجابة. لم يُسجّل أي طلب كفالة."),
    });
    // Wait only for gateway headers, never the completed model response.
    const response = await withLovableAiGatewayRunIdHeader(stream, call.gateway, { "Cache-Control": "no-store" });
    if (failure) { await response.body?.cancel(); return jsonError(failure.message, failure.status); }
    return response;
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) return jsonError("تم إيقاف الإجابة.", 499);
    console.error("assistant request failed", error instanceof Error ? error.name : "unknown");
    return jsonError("تعذّر إكمال السؤال الآن. حاول لاحقاً.", 503);
  }
}
