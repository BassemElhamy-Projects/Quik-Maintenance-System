import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Supabase Edge Function: init-first-admin
 * Securely initializes the very first Admin account on the server.
 * Rejects requests if any active Admin already exists in the system.
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceRoleKey || !supabaseUrl) {
      return new Response(
        JSON.stringify({ error: "خطأ في تهيئة الخادم السحابي (Server credentials missing)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Verify that ZERO active admins exist in profiles
    const { count, error: countErr } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if (countErr) {
      return new Response(
        JSON.stringify({ error: `فشل التحقق من حالة النظام: ${countErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if ((count ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: "تمت تهيئة مدير النظام مسبقاً. التسجيل الذاتي محظور." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse payload
    const { username, password, fullName, phone } = await req.json();

    const cleanUsername = (username || "").trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3 || !/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return new Response(
        JSON.stringify({ error: "اسم المستخدم يجب أن يتكون من 3 أحرف إنجليزية أو أرقام أو شرطة سفلية على الأقل." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "يجب ألا تقل كلمة المرور عن 6 خانات." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const internalEmail = `${cleanUsername}@quik.local`;

    // 3. Create Admin user in Auth via Admin API (email pre-confirmed)
    let authUserId: string | null = null;
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        full_name: (fullName || "مدير النظام الأول").trim(),
        role: "admin",
        phone: (phone || "").trim() || null
      }
    });

    if (authErr) {
      // If user already exists in auth.users from a prior signup attempt but zero active admins exist
      if (authErr.message.includes('already') || authErr.message.includes('registered')) {
        const { data: usersData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 100 });
        const existing = usersData?.users.find(u => u.email === internalEmail);
        if (existing) {
          const { data: updatedData, error: updateErr } = await adminClient.auth.admin.updateUserById(existing.id, {
            password: password,
            email_confirm: true,
            user_metadata: {
              username: cleanUsername,
              full_name: (fullName || "مدير النظام الأول").trim(),
              role: "admin",
              phone: (phone || "").trim() || null
            }
          });
          if (updateErr) {
            return new Response(
              JSON.stringify({ error: `فشل تحديث بيانات المدير: ${updateErr.message}` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          authUserId = updatedData.user.id;
        } else {
          return new Response(
            JSON.stringify({ error: `فشل إنشاء حساب المدير: ${authErr.message}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: `فشل إنشاء حساب المدير: ${authErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (authData?.user) {
      authUserId = authData.user.id;
    }

    if (!authUserId) {
      return new Response(
        JSON.stringify({ error: "تعذر إنشاء مستخدم المصادقة." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Upsert profile in public.profiles
    const { error: profErr } = await adminClient.from("profiles").upsert({
      id: authUserId,
      username: cleanUsername,
      email: internalEmail,
      full_name: (fullName || "مدير النظام الأول").trim(),
      role: "admin",
      phone: (phone || "").trim() || null,
      is_active: true
    });

    if (profErr) {
      console.warn("[INIT-ADMIN] Profile upsert notice:", profErr.message);
    }

    // 5. Return safe metadata without password
    return new Response(
      JSON.stringify({
        success: true,
        message: `تم إنشاء حساب مدير النظام الأول [${cleanUsername}] بنجاح.`,
        username: cleanUsername,
        role: "admin"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `حدث خطأ: ${err?.message || String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
