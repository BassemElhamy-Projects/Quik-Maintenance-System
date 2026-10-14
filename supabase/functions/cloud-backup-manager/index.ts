import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Supabase Edge Function: cloud-backup-manager
 * Enterprise Cloud Backup System for Quik Fuel Maintenance System.
 * Strictly requires an active Admin caller authenticated via Supabase Auth JWT.
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
        JSON.stringify({ error: "إعدادات الخدمة السحابية غير مكتملة." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Authenticate caller and verify active Admin role
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "غير مصرح (Missing authorization token)." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "جلسة التوثيق غير صالحة أو منتهية." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUser = userData.user;

    // Check caller's active admin profile
    const { data: callerProfile, error: profError } = await adminClient
      .from("profiles")
      .select("id, full_name, username, role, is_active")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (profError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ error: "عفواً، هذه العملية مقتصرة فقط على مدراء النظام المفعّلين." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerName = callerProfile.full_name || callerProfile.username || "مدير النظام";

    // 2. Parse payload and action
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    // ------------------------------------------------------------------------
    // ACTION: LIST CLOUD BACKUPS
    // ------------------------------------------------------------------------
    if (action === "list") {
      const { data: backups, error: listError } = await adminClient
        .from("cloud_backups")
        .select("id, filename, backup_type, status, size_bytes, created_by, created_by_name, record_counts, notes, created_at")
        .order("created_at", { ascending: false });

      if (listError) {
        return new Response(
          JSON.stringify({ error: `فشل قراءة سجل النسخ الاحتياطية السحابية: ${listError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, backups: backups || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------------------------------------------------------------------
    // ACTION: GET FULL BACKUP WITH SNAPSHOT DATA
    // ------------------------------------------------------------------------
    if (action === "get") {
      const backupId = body.backup_id;
      if (!backupId) {
        return new Response(
          JSON.stringify({ error: "يرجى تحديد معرف النسخة الاحتياطية." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: backup, error: getError } = await adminClient
        .from("cloud_backups")
        .select("*")
        .eq("id", backupId)
        .maybeSingle();

      if (getError || !backup) {
        return new Response(
          JSON.stringify({ error: "تعذر العثور على النسخة الاحتياطية المطلوبة." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, backup }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------------------------------------------------------------------
    // ACTION: CREATE CLOUD BACKUP (STRICT DATASET INTEGRITY VERIFICATION)
    // ------------------------------------------------------------------------
    if (action === "create") {
      const backupType = body.backup_type || "manual"; // 'automatic' | 'manual' | 'safety'
      const notes = body.notes || null;

      try {
        // Fetch full snapshot of all 7 database tables
        const [
          profilesRes,
          stationsRes,
          countersRes,
          maintRes,
          inspRes,
          incRes,
          auditRes
        ] = await Promise.all([
          adminClient.from("profiles").select("*"),
          adminClient.from("stations").select("*"),
          adminClient.from("section_counters").select("*"),
          adminClient.from("maintenance_requests").select("*"),
          adminClient.from("internal_inspections").select("*"),
          adminClient.from("incident_records").select("*"),
          adminClient.from("audit_logs").select("*")
        ]);

        // Strict verification: If ANY query fails, fail immediately without creating corrupt/partial backup
        if (profilesRes.error) throw new Error(`فشل قراءة جدول المستخدمين: ${profilesRes.error.message}`);
        if (stationsRes.error) throw new Error(`فشل قراءة جدول المحطات: ${stationsRes.error.message}`);
        if (countersRes.error) throw new Error(`فشل قراءة جدول العدادات: ${countersRes.error.message}`);
        if (maintRes.error) throw new Error(`فشل قراءة جدول طلبات الصيانة: ${maintRes.error.message}`);
        if (inspRes.error) throw new Error(`فشل قراءة جدول التفتيش الدوري: ${inspRes.error.message}`);
        if (incRes.error) throw new Error(`فشل قراءة جدول بلاغات الحوادث: ${incRes.error.message}`);
        if (auditRes.error) throw new Error(`فشل قراءة سجل التدقيق: ${auditRes.error.message}`);

        const profilesData = profilesRes.data || [];
        const stationsData = stationsRes.data || [];
        const countersData = countersRes.data || [];
        const maintData = maintRes.data || [];
        const inspData = inspRes.data || [];
        const incData = incRes.data || [];
        const auditData = auditRes.data || [];

        const recordCounts = {
          profiles: profilesData.length,
          stations: stationsData.length,
          section_counters: countersData.length,
          maintenance_requests: maintData.length,
          internal_inspections: inspData.length,
          incident_records: incData.length,
          audit_logs: auditData.length
        };

        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, "-");
        let prefix = "ManualCloudBackup";
        if (backupType === "automatic") prefix = "AutoCloudBackup";
        if (backupType === "safety") prefix = "SafetyCloudBackup";

        const filename = `${prefix}_${dateStr}.json`;

        const snapshotData = {
          backupVersion: 2,
          architecture: "supabase_cloud_only",
          createdAt: now.toISOString(),
          backupType,
          filename,
          recordCounts,
          tables: {
            profiles: profilesData,
            stations: stationsData,
            section_counters: countersData,
            maintenance_requests: maintData,
            internal_inspections: inspData,
            incident_records: incData,
            audit_logs: auditData
          }
        };

        const serialized = JSON.stringify(snapshotData);
        const sizeBytes = new TextEncoder().encode(serialized).length;

        // Insert new backup record into cloud_backups
        const { data: insertedBackup, error: insertError } = await adminClient
          .from("cloud_backups")
          .insert({
            filename,
            backup_type: backupType,
            status: "successful",
            size_bytes: sizeBytes,
            created_by: callerUser.id,
            created_by_name: callerName,
            record_counts: recordCounts,
            snapshot_data: snapshotData,
            notes
          })
          .select()
          .single();

        if (insertError) {
          throw new Error(`فشل حفظ النسخة الاحتياطية في قاعدة البيانات: ${insertError.message}`);
        }

        // Automatic Backup Pruning: Strictly keep latest 7 successful automatic backups
        if (backupType === "automatic") {
          const { data: autoBackups } = await adminClient
            .from("cloud_backups")
            .select("id, created_at")
            .eq("backup_type", "automatic")
            .eq("status", "successful")
            .order("created_at", { ascending: false });

          if (autoBackups && autoBackups.length > 7) {
            const oldBackupsToDelete = autoBackups.slice(7);
            const deleteIds = oldBackupsToDelete.map(b => b.id);
            await adminClient
              .from("cloud_backups")
              .delete()
              .in("id", deleteIds);
          }
        }

        // Log audit event
        await adminClient.from("audit_logs").insert({
          user_id: callerUser.id,
          user_email: callerUser.email,
          action: "BACKUP_CREATED",
          entity: "cloud_backups",
          entity_id: insertedBackup.id,
          new_data: { filename, backup_type: backupType, record_counts: recordCounts, size_bytes: sizeBytes }
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `تم إنشاء النسخة الاحتياطية السحابية [${filename}] بنجاح.`,
            backup: insertedBackup
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        // Log backup failure audit log
        await adminClient.from("audit_logs").insert({
          user_id: callerUser.id,
          user_email: callerUser.email,
          action: "BACKUP_FAILED",
          entity: "cloud_backups",
          new_data: { error: err?.message || String(err), backup_type: backupType }
        });

        return new Response(
          JSON.stringify({ error: `فشل إنشاء النسخة الاحتياطية: ${err?.message || String(err)}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ------------------------------------------------------------------------
    // ACTION: RESTORE DATABASE FROM CLOUD BACKUP (STRICT TRANSACTIONAL-LIKE RESTORATION)
    // ------------------------------------------------------------------------
    if (action === "restore") {
      const backupId = body.backup_id;
      if (!backupId) {
        return new Response(
          JSON.stringify({ error: "يرجى تحديد النسخة الاحتياطية المراد استعادتها." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch backup record
      const { data: targetBackup, error: fetchErr } = await adminClient
        .from("cloud_backups")
        .select("*")
        .eq("id", backupId)
        .maybeSingle();

      if (fetchErr || !targetBackup || !targetBackup.snapshot_data) {
        return new Response(
          JSON.stringify({ error: "تعذر قراءة بيانات النسخة الاحتياطية المطلوبة." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const snapshot = targetBackup.snapshot_data;
      if (!snapshot.tables || typeof snapshot.tables !== "object") {
        return new Response(
          JSON.stringify({ error: "ملف النسخة الاحتياطية تالف أو غير متوافق مع بنية النظام." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. AUTOMATIC SAFETY BACKUP BEFORE RESTORE (Strictly verified)
      let safetyBackupId: string | null = null;
      try {
        const [
          curProfRes,
          curStRes,
          curCntRes,
          curMaintRes,
          curInspRes,
          curIncRes,
          curAuditRes
        ] = await Promise.all([
          adminClient.from("profiles").select("*"),
          adminClient.from("stations").select("*"),
          adminClient.from("section_counters").select("*"),
          adminClient.from("maintenance_requests").select("*"),
          adminClient.from("internal_inspections").select("*"),
          adminClient.from("incident_records").select("*"),
          adminClient.from("audit_logs").select("*")
        ]);

        if (curProfRes.error || curStRes.error || curCntRes.error || curMaintRes.error || curInspRes.error || curIncRes.error || curAuditRes.error) {
          throw new Error("تعذر قراءة الحالة الراهنة لقاعدة البيانات لإنشاء نسخة الأمان.");
        }

        const safetyCounts = {
          profiles: (curProfRes.data || []).length,
          stations: (curStRes.data || []).length,
          section_counters: (curCntRes.data || []).length,
          maintenance_requests: (curMaintRes.data || []).length,
          internal_inspections: (curInspRes.data || []).length,
          incident_records: (curIncRes.data || []).length,
          audit_logs: (curAuditRes.data || []).length
        };

        const now = new Date();
        const safetyFilename = `SafetyCloudBackup_BeforeRestore_${now.toISOString().replace(/[:.]/g, "-")}.json`;
        const safetySnapshot = {
          backupVersion: 2,
          createdAt: now.toISOString(),
          backupType: "safety",
          filename: safetyFilename,
          recordCounts: safetyCounts,
          tables: {
            profiles: curProfRes.data || [],
            stations: curStRes.data || [],
            section_counters: curCntRes.data || [],
            maintenance_requests: curMaintRes.data || [],
            internal_inspections: curInspRes.data || [],
            incident_records: curIncRes.data || [],
            audit_logs: curAuditRes.data || []
          }
        };

        const { data: createdSafety, error: safetyErr } = await adminClient
          .from("cloud_backups")
          .insert({
            filename: safetyFilename,
            backup_type: "safety",
            status: "successful",
            size_bytes: new TextEncoder().encode(JSON.stringify(safetySnapshot)).length,
            created_by: callerUser.id,
            created_by_name: callerName,
            record_counts: safetyCounts,
            snapshot_data: safetySnapshot,
            notes: `نسخة أمان أوتوماتيكية تم إنشاؤها قبل استعادة النسخة [${targetBackup.filename}]`
          })
          .select()
          .single();

        if (safetyErr) {
          throw new Error(`فشل إنشاء نسخة الأمان الأوتوماتيكية: ${safetyErr.message}`);
        }
        safetyBackupId = createdSafety.id;
      } catch (safetyError: any) {
        return new Response(
          JSON.stringify({ error: `تم إلغاء عملية الاستعادة لحماية البيانات: ${safetyError?.message || String(safetyError)}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log RESTORE_STARTED
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_email: callerUser.email,
        action: "RESTORE_STARTED",
        entity: "cloud_backups",
        entity_id: targetBackup.id,
        new_data: { target_filename: targetBackup.filename, safety_backup_id: safetyBackupId }
      });

      // 2. RESTORE DATABASE ATOMICALLY VIA POSTGRESQL TRANSACTION RPC
      try {
        const { data: rpcRes, error: rpcErr } = await adminClient.rpc("restore_cloud_backup_snapshot", {
          p_snapshot: snapshot
        });

        if (rpcErr) {
          throw new Error(`فشل تنفيذ استعادة قاعدة البيانات السحابية: ${rpcErr.message}`);
        }

        if (rpcRes && rpcRes.error) {
          throw new Error(rpcRes.error);
        }

        // Log RESTORE_COMPLETED
        await adminClient.from("audit_logs").insert({
          user_id: callerUser.id,
          user_email: callerUser.email,
          action: "RESTORE_COMPLETED",
          entity: "cloud_backups",
          entity_id: targetBackup.id,
          new_data: { target_filename: targetBackup.filename, safety_backup_id: safetyBackupId }
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `تم استعادة قاعدة البيانات السحابية بنجاح من النسخة [${targetBackup.filename}].`,
            safetyBackupId
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (restoreErr: any) {
        // Log RESTORE_FAILED
        await adminClient.from("audit_logs").insert({
          user_id: callerUser.id,
          user_email: callerUser.email,
          action: "RESTORE_FAILED",
          entity: "cloud_backups",
          entity_id: targetBackup.id,
          new_data: { error: restoreErr?.message || String(restoreErr), safety_backup_id: safetyBackupId }
        });

        return new Response(
          JSON.stringify({
            error: `فشلت عملية الاستعادة: ${restoreErr?.message || String(restoreErr)}. تم الاحتفاظ بنسخة الأمان الأوتوماتيكية.`
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ------------------------------------------------------------------------
    // ACTION: DELETE CLOUD BACKUP
    // ------------------------------------------------------------------------
    if (action === "delete") {
      const backupId = body.backup_id;
      if (!backupId) {
        return new Response(
          JSON.stringify({ error: "يرجى تحديد معرف النسخة المراد حذفها." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: targetBackup } = await adminClient
        .from("cloud_backups")
        .select("filename")
        .eq("id", backupId)
        .maybeSingle();

      const { error: deleteErr } = await adminClient
        .from("cloud_backups")
        .delete()
        .eq("id", backupId);

      if (deleteErr) {
        return new Response(
          JSON.stringify({ error: `فشل حذف النسخة الاحتياطية: ${deleteErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log audit event
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_email: callerUser.email,
        action: "BACKUP_DELETED",
        entity: "cloud_backups",
        entity_id: backupId,
        old_data: { filename: targetBackup?.filename || backupId }
      });

      return new Response(
        JSON.stringify({ success: true, message: "تم حذف النسخة الاحتياطية السحابية بنجاح." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "الإجراء المطلوب غير معروف." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `حدث خطأ غير متوقع: ${err?.message || String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
