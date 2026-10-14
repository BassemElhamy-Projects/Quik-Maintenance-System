import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Supabase Edge Function: admin-reset-password
 * Allows an authenticated Admin to securely reset another user's password
 * using the server-side Admin Auth API without exposing service_role keys to the client.
 */
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "لم يتم العثور على رمز المصادقة (Missing Authorization Header)." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceRoleKey || !supabaseUrl) {
      return new Response(
        JSON.stringify({ error: "خطأ في تهيئة الخادم السحابي (Server credentials missing)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verify caller identity with their authenticated JWT
    const clientForAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerError,
    } = await clientForAuth.auth.getUser();

    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "المستخدم غير مصرح له أو انتهت صلاحية الجلسة." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify caller is an active Admin in public.profiles
    const { data: callerProfile, error: profileError } = await clientForAuth
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (
      profileError ||
      !callerProfile ||
      callerProfile.role !== "admin" ||
      !callerProfile.is_active
    ) {
      return new Response(
        JSON.stringify({ error: "ليس لديك صلاحية مدير النظام لتنفيذ هذه العملية." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse and validate payload
    const { userId, newPassword } = await req.json();

    if (!userId || typeof userId !== "string") {
      return new Response(
        JSON.stringify({ error: "معرف المستخدم المستهدف مطلوب." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: "يجب ألا تقل كلمة المرور عن 6 خانات." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create elevated server-side Admin client with service_role key
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify target user exists
    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("id, username, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return new Response(
        JSON.stringify({ error: "المستخدم المستهدف غير موجود." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Update the target user's password via Admin Auth API (does not affect caller)
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateAuthError) {
      return new Response(
        JSON.stringify({ error: `فشل إعادة تعيين كلمة المرور: ${updateAuthError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Return safe response without password
    return new Response(
      JSON.stringify({
        success: true,
        message: `تم تعيين كلمة المرور الجديدة للمستخدم [${targetProfile.username}] بنجاح.`,
        targetUserId: targetProfile.id,
        targetUsername: targetProfile.username,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `حدث خطأ أثناء معالجة الطلب: ${err?.message || String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
