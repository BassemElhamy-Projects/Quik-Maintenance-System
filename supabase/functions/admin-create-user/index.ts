import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Supabase Edge Function: admin-create-user
 * Allows an authenticated Admin to create a new user (Admin or User)
 * using the server-side service role key without exposing secrets to the client.
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
        JSON.stringify({ error: "إعدادات الخادم غير مكتملة." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Authenticate caller and verify Admin role
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "غير مصرح (Missing authorization header)." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "جلسة المستخدم غير صالحة." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check caller's active admin profile
    const { data: callerProfile, error: profError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ error: "عفواً، هاته العملية ممتلثة فقط لمدير النظام المفعل." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request payload
    const { username, password, fullName, role, phone } = await req.json();

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

    const userRole = (role === "admin") ? "admin" : "user";
    const internalEmail = `${cleanUsername}@quik.internal`;

    // 3. Create user in Auth via Admin API
    let authUserId: string | null = null;
    const { data: createdAuth, error: createError } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        full_name: (fullName || cleanUsername).trim(),
        role: userRole,
        phone: (phone || "").trim() || null
      }
    });

    if (createError) {
      // Handle user already registered case safely
      if (createError.message.includes("already") || createError.message.includes("registered")) {
        const { data: usersData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 100 });
        const existing = usersData?.users.find(u => u.email === internalEmail || u.user_metadata?.username === cleanUsername);
        if (existing) {
          const { data: updatedData, error: updateErr } = await adminClient.auth.admin.updateUserById(existing.id, {
            password: password,
            email_confirm: true,
            user_metadata: {
              username: cleanUsername,
              full_name: (fullName || cleanUsername).trim(),
              role: userRole,
              phone: (phone || "").trim() || null
            }
          });
          if (updateErr) {
            return new Response(
              JSON.stringify({ error: `فشل تحديث بيانات المستخدم القائم: ${updateErr.message}` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          authUserId = updatedData.user.id;
        } else {
          return new Response(
            JSON.stringify({ error: `فشل إنشاء المستخدم: ${createError.message}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: `فشل إنشاء المستخدم: ${createError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (createdAuth?.user) {
      authUserId = createdAuth.user.id;
    }

    if (!authUserId) {
      return new Response(
        JSON.stringify({ error: "تعذر الحصول على معرف المستخدم." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create or update profiles row
    const { error: profUpsertError } = await adminClient.from("profiles").upsert({
      id: authUserId,
      username: cleanUsername,
      email: internalEmail,
      full_name: (fullName || cleanUsername).trim(),
      role: userRole,
      phone: (phone || "").trim() || null,
      is_active: true
    });

    if (profUpsertError) {
      return new Response(
        JSON.stringify({ error: `فشل حفظ الملف الشخصي: ${profUpsertError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `تم إضافة المستخدم [${cleanUsername}] بنجاح.`,
        username: cleanUsername,
        role: userRole
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
