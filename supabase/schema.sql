-- ==============================================================================
-- QUIK FUEL MAINTENANCE SYSTEM (نظام إدارة الصيانة - محطات كويك للوقود)
-- SUPABASE POSTGRESQL PRODUCTION SCHEMA & SECURITY (2-ROLE ARCHITECTURE)
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS & DOMAINS
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE maintenance_status_enum AS ENUM ('جديد', 'جاري العمل', 'تم');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE inspection_eval_enum AS ENUM ('ممتاز', 'جيد جدا', 'جيد', 'يحتاج متابعة');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES TABLE (Linked to auth.users with Unique Username)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'user',
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (LOWER(username));

-- 4. STATIONS TABLE (دليل المحطات المركزية)
CREATE TABLE IF NOT EXISTS public.stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    city TEXT,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'نشطة' CHECK (status IN ('نشطة', 'غير نشطة')),
    phone TEXT,
    supervisor TEXT,
    notes TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. SECTION COUNTERS TABLE (Atomic sequential numbering per section)
CREATE TABLE IF NOT EXISTS public.section_counters (
    section_name TEXT PRIMARY KEY,
    last_number BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. ATOMIC CONCURRENCY-SAFE NUMBERING FUNCTION
CREATE OR REPLACE FUNCTION public.get_next_section_sequence(p_section TEXT)
RETURNS TEXT AS $$
DECLARE
    v_next BIGINT;
    v_clean_section TEXT;
    v_max_db BIGINT := 0;
BEGIN
    -- 1. Reject unauthenticated calls
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول لتوليد الأرقام التسلسلية'
            USING ERRCODE = '42501';
    END IF;

    v_clean_section := LOWER(TRIM(p_section));

    -- 2. Strictly validate allowed sections
    IF v_clean_section NOT IN ('pumps', 'tanks', 'facilities', 'inspections', 'incidents') THEN
        RAISE EXCEPTION 'قسم غير صالح: % (الأقسام المسموح بها: pumps, tanks, facilities, inspections, incidents)', p_section
            USING ERRCODE = '22023';
    END IF;

    -- 3. Calculate current maximum numeric number in database for safety lock
    IF v_clean_section IN ('pumps', 'tanks', 'facilities') THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(request_number, '\D', '', 'g'), '')::BIGINT), 0)
        INTO v_max_db
        FROM public.maintenance_requests
        WHERE section = v_clean_section;
    ELSIF v_clean_section = 'inspections' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(inspection_number, '\D', '', 'g'), '')::BIGINT), 0)
        INTO v_max_db
        FROM public.internal_inspections;
    ELSIF v_clean_section = 'incidents' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(incident_number, '\D', '', 'g'), '')::BIGINT), 0)
        INTO v_max_db
        FROM public.incident_records;
    END IF;

    -- 4. Atomic sequence increment with GREATEST safety lock against existing records
    INSERT INTO public.section_counters (section_name, last_number, updated_at)
    VALUES (v_clean_section, v_max_db + 1, now())
    ON CONFLICT (section_name)
    DO UPDATE SET 
        last_number = GREATEST(public.section_counters.last_number, v_max_db) + 1,
        updated_at = now()
    RETURNING last_number INTO v_next;

    RETURN v_next::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_next_section_sequence(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_next_section_sequence(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_next_section_sequence(TEXT) TO authenticated;

-- 6B. ATOMIC BATCH SEQUENCE GENERATOR FOR HIGH-PERFORMANCE IMPORTS
CREATE OR REPLACE FUNCTION public.get_next_section_sequence_batch(p_section TEXT, p_count INTEGER)
RETURNS TABLE (start_seq BIGINT, end_seq BIGINT) AS $$
DECLARE
    v_clean_section TEXT;
    v_end BIGINT;
    v_start BIGINT;
    v_max_db BIGINT := 0;
BEGIN
    -- 1. Reject unauthenticated calls
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول لتوليد الأرقام التسلسلية'
            USING ERRCODE = '42501';
    END IF;

    IF p_count IS NULL OR p_count <= 0 THEN
        RAISE EXCEPTION 'العدد المطلوب يجب أن يكون أكبر من الصفر'
            USING ERRCODE = '22023';
    END IF;

    v_clean_section := LOWER(TRIM(p_section));

    -- 2. Strictly validate allowed sections
    IF v_clean_section NOT IN ('pumps', 'tanks', 'facilities', 'inspections', 'incidents') THEN
        RAISE EXCEPTION 'قسم غير صالح: % (الأقسام المسموح بها: pumps, tanks, facilities, inspections, incidents)', p_section
            USING ERRCODE = '22023';
    END IF;

    -- 3. Calculate current maximum numeric number in database for safety lock
    IF v_clean_section IN ('pumps', 'tanks', 'facilities') THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(request_number, '\D', '', 'g'), '')::BIGINT), 0)
        INTO v_max_db
        FROM public.maintenance_requests
        WHERE section = v_clean_section;
    ELSIF v_clean_section = 'inspections' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(inspection_number, '\D', '', 'g'), '')::BIGINT), 0)
        INTO v_max_db
        FROM public.internal_inspections;
    ELSIF v_clean_section = 'incidents' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(incident_number, '\D', '', 'g'), '')::BIGINT), 0)
        INTO v_max_db
        FROM public.incident_records;
    END IF;

    -- 4. Atomic sequence batch increment with GREATEST safety lock against existing records
    INSERT INTO public.section_counters (section_name, last_number, updated_at)
    VALUES (v_clean_section, v_max_db + p_count, now())
    ON CONFLICT (section_name)
    DO UPDATE SET 
        last_number = GREATEST(public.section_counters.last_number, v_max_db) + p_count,
        updated_at = now()
    RETURNING last_number INTO v_end;

    v_start := v_end - p_count + 1;
    RETURN QUERY SELECT v_start, v_end;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_next_section_sequence_batch(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_next_section_sequence_batch(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_next_section_sequence_batch(TEXT, INTEGER) TO authenticated;

-- 7. MAINTENANCE REQUESTS TABLE (المضخات، الخزانات، المرافق)
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number TEXT NOT NULL,
    section TEXT NOT NULL CHECK (section IN ('pumps', 'tanks', 'facilities')),
    date DATE NOT NULL,
    station_id UUID REFERENCES public.stations(id) ON DELETE SET NULL,
    station_name TEXT NOT NULL,
    station_code TEXT NOT NULL,
    requester TEXT NOT NULL,
    request_type TEXT NOT NULL,
    maintenance_type TEXT NOT NULL,
    problem_description TEXT NOT NULL,
    closing_date DATE,
    technician TEXT,
    action_taken TEXT,
    completion_notes TEXT,
    status maintenance_status_enum NOT NULL DEFAULT 'جديد',
    is_station_unmatched BOOLEAN DEFAULT false,
    original_station_value TEXT,
    unmatched_reason TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_section_request_number UNIQUE (section, request_number)
);

-- 8. INTERNAL INSPECTIONS TABLE (التفتيش الدوري)
CREATE TABLE IF NOT EXISTS public.internal_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_number TEXT NOT NULL UNIQUE,
    date DATE NOT NULL,
    station_id UUID REFERENCES public.stations(id) ON DELETE SET NULL,
    station_name TEXT NOT NULL,
    station_code TEXT NOT NULL,
    inspection_type TEXT NOT NULL,
    inspector_name TEXT NOT NULL,
    evaluation inspection_eval_enum NOT NULL DEFAULT 'جيد',
    notes TEXT,
    is_station_unmatched BOOLEAN DEFAULT false,
    original_station_value TEXT,
    unmatched_reason TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. INCIDENT RECORDS TABLE (سجل الحوادث)
CREATE TABLE IF NOT EXISTS public.incident_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_number TEXT NOT NULL UNIQUE,
    region TEXT NOT NULL,
    station_id UUID REFERENCES public.stations(id) ON DELETE SET NULL,
    station_name TEXT NOT NULL,
    station_code TEXT NOT NULL,
    date DATE NOT NULL,
    time TEXT NOT NULL,
    incident_type TEXT NOT NULL,
    causing_party TEXT NOT NULL,
    vehicle_type TEXT,
    general_info TEXT,
    description TEXT NOT NULL,
    prevention_suggestions TEXT,
    responsible_party_report TEXT,
    notes TEXT,
    reporter_name_and_signature TEXT,
    is_station_unmatched BOOLEAN DEFAULT false,
    original_station_value TEXT,
    unmatched_reason TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. AUDIT LOGS TABLE (سجل تدقيق العمليات والمستخدمين)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10.1. CLOUD BACKUPS TABLE (نظام النسخ الاحتياطي السحابي)
CREATE TABLE IF NOT EXISTS public.cloud_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT UNIQUE NOT NULL,
    backup_type TEXT NOT NULL CHECK (backup_type IN ('automatic', 'manual', 'safety')),
    status TEXT NOT NULL DEFAULT 'successful' CHECK (status IN ('successful', 'failed')),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name TEXT NOT NULL DEFAULT 'نظام كويك السحابي',
    record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 11. INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_stations_code ON public.stations(code);
CREATE INDEX IF NOT EXISTS idx_stations_status ON public.stations(status);

CREATE INDEX IF NOT EXISTS idx_maint_section ON public.maintenance_requests(section);
CREATE INDEX IF NOT EXISTS idx_maint_date ON public.maintenance_requests(date);
CREATE INDEX IF NOT EXISTS idx_maint_station_code ON public.maintenance_requests(station_code);
CREATE INDEX IF NOT EXISTS idx_maint_station_id ON public.maintenance_requests(station_id);
CREATE INDEX IF NOT EXISTS idx_maint_status ON public.maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maint_created_at ON public.maintenance_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_maint_section_reqnum ON public.maintenance_requests(section, request_number);

CREATE INDEX IF NOT EXISTS idx_insp_date ON public.internal_inspections(date);
CREATE INDEX IF NOT EXISTS idx_insp_station_code ON public.internal_inspections(station_code);
CREATE INDEX IF NOT EXISTS idx_insp_station_id ON public.internal_inspections(station_id);
CREATE INDEX IF NOT EXISTS idx_insp_created_at ON public.internal_inspections(created_at);

CREATE INDEX IF NOT EXISTS idx_inc_date ON public.incident_records(date);
CREATE INDEX IF NOT EXISTS idx_inc_station_code ON public.incident_records(station_code);
CREATE INDEX IF NOT EXISTS idx_inc_station_id ON public.incident_records(station_id);
CREATE INDEX IF NOT EXISTS idx_inc_created_at ON public.incident_records(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity, entity_id);

-- ==============================================================================
-- 12. ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS user_role_enum AS $$
DECLARE
    v_role user_role_enum;
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid() AND is_active = true;

    RETURN COALESCE(v_role, 'user'::user_role_enum);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (public.get_auth_user_role() = 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_active_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_active_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE role = 'admin' AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.has_active_admin() TO anon, authenticated;

-- ==============================================================================
-- 12.1. LAST ACTIVE ADMIN PROTECTION TRIGGER (حماية آخر مدير نظام نشط)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_last_active_admin()
RETURNS TRIGGER AS $$
DECLARE
    v_remaining_admins INT;
BEGIN
    -- 1. On DELETE: Check if deleting an active admin leaves zero active admins
    IF TG_OP = 'DELETE' THEN
        IF OLD.role = 'admin' AND OLD.is_active = true THEN
            SELECT COUNT(*) INTO v_remaining_admins
            FROM public.profiles
            WHERE role = 'admin' AND is_active = true AND id != OLD.id;

            IF v_remaining_admins < 1 THEN
                RAISE EXCEPTION 'يجب أن يوجد مدير نظام واحد على الأقل نشط في النظام (لا يمكن حذف آخر مدير نظام)'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    -- 2. On UPDATE: Check if deactivating or demoting an active admin leaves zero active admins
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.role = 'admin' AND OLD.is_active = true) AND
           (NEW.role != 'admin' OR NEW.is_active != true) THEN
            
            SELECT COUNT(*) INTO v_remaining_admins
            FROM public.profiles
            WHERE role = 'admin' AND is_active = true AND id != OLD.id;

            IF v_remaining_admins < 1 THEN
                RAISE EXCEPTION 'يجب أن يوجد مدير نظام واحد على الأقل نشط في النظام (لا يمكن تعطيل أو خفض رتبة آخر مدير نظام)'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_last_active_admin ON public.profiles;
CREATE TRIGGER trg_protect_last_active_admin
    BEFORE UPDATE OR DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_last_active_admin();

-- ==============================================================================
-- 13. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_backups ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 14. RLS POLICIES DEFINITION
-- ==============================================================================

-- PROFILES
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.is_active_authenticated());

DROP POLICY IF EXISTS "profiles_admin_manage" ON public.profiles;
CREATE POLICY "profiles_admin_manage" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Allow initial admin initialization when 0 profiles exist
DROP POLICY IF EXISTS "profiles_first_admin_insert" ON public.profiles;
CREATE POLICY "profiles_first_admin_insert" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT COUNT(*) FROM public.profiles) = 0 OR public.is_admin());

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id AND public.is_active_authenticated())
    WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- STATIONS
DROP POLICY IF EXISTS "stations_select" ON public.stations;
CREATE POLICY "stations_select" ON public.stations
    FOR SELECT TO authenticated
    USING (public.is_active_authenticated());

DROP POLICY IF EXISTS "stations_admin_write" ON public.stations;
CREATE POLICY "stations_admin_write" ON public.stations
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- SECTION COUNTERS
DROP POLICY IF EXISTS "counters_select" ON public.section_counters;
CREATE POLICY "counters_select" ON public.section_counters
    FOR SELECT TO authenticated
    USING (public.is_active_authenticated());

DROP POLICY IF EXISTS "counters_admin_manage" ON public.section_counters;
CREATE POLICY "counters_admin_manage" ON public.section_counters
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- MAINTENANCE REQUESTS
DROP POLICY IF EXISTS "maint_select" ON public.maintenance_requests;
CREATE POLICY "maint_select" ON public.maintenance_requests
    FOR SELECT TO authenticated
    USING (public.is_active_authenticated());

DROP POLICY IF EXISTS "maint_insert" ON public.maintenance_requests;
CREATE POLICY "maint_insert" ON public.maintenance_requests
    FOR INSERT TO authenticated
    WITH CHECK (public.is_active_authenticated());

DROP POLICY IF EXISTS "maint_update" ON public.maintenance_requests;
CREATE POLICY "maint_update" ON public.maintenance_requests
    FOR UPDATE TO authenticated
    USING (public.is_active_authenticated())
    WITH CHECK (public.is_active_authenticated());

DROP POLICY IF EXISTS "maint_delete" ON public.maintenance_requests;
CREATE POLICY "maint_delete" ON public.maintenance_requests
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- INTERNAL INSPECTIONS
DROP POLICY IF EXISTS "insp_select" ON public.internal_inspections;
CREATE POLICY "insp_select" ON public.internal_inspections
    FOR SELECT TO authenticated
    USING (public.is_active_authenticated());

DROP POLICY IF EXISTS "insp_insert" ON public.internal_inspections;
CREATE POLICY "insp_insert" ON public.internal_inspections
    FOR INSERT TO authenticated
    WITH CHECK (public.is_active_authenticated());

DROP POLICY IF EXISTS "insp_update" ON public.internal_inspections;
CREATE POLICY "insp_update" ON public.internal_inspections
    FOR UPDATE TO authenticated
    USING (public.is_active_authenticated())
    WITH CHECK (public.is_active_authenticated());

DROP POLICY IF EXISTS "insp_delete" ON public.internal_inspections;
CREATE POLICY "insp_delete" ON public.internal_inspections
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- INCIDENT RECORDS
DROP POLICY IF EXISTS "inc_select" ON public.incident_records;
CREATE POLICY "inc_select" ON public.incident_records
    FOR SELECT TO authenticated
    USING (public.is_active_authenticated());

DROP POLICY IF EXISTS "inc_insert" ON public.incident_records;
CREATE POLICY "inc_insert" ON public.incident_records
    FOR INSERT TO authenticated
    WITH CHECK (public.is_active_authenticated());

DROP POLICY IF EXISTS "inc_update" ON public.incident_records;
CREATE POLICY "inc_update" ON public.incident_records
    FOR UPDATE TO authenticated
    USING (public.is_active_authenticated())
    WITH CHECK (public.is_active_authenticated());

DROP POLICY IF EXISTS "inc_delete" ON public.incident_records;
CREATE POLICY "inc_delete" ON public.incident_records
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- AUDIT LOGS (Admin read, authenticated insert, no update/delete)
DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_logs;
CREATE POLICY "audit_select_admin" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (public.is_active_authenticated());

-- CLOUD BACKUPS (Admin only read and full management)
DROP POLICY IF EXISTS "cloud_backups_admin_select" ON public.cloud_backups;
CREATE POLICY "cloud_backups_admin_select" ON public.cloud_backups
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "cloud_backups_admin_manage" ON public.cloud_backups;
CREATE POLICY "cloud_backups_admin_manage" ON public.cloud_backups
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 10. ATOMIC TRANSACTIONAL CLOUD BACKUP RESTORE RPC FUNCTION
CREATE OR REPLACE FUNCTION public.restore_cloud_backup_snapshot(p_snapshot JSONB)
RETURNS JSONB AS $$
DECLARE
    v_tables JSONB;
    v_item JSONB;
BEGIN
    -- Strict security: Only service_role can execute restore
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'غير مصرح: استعادة النسخة الاحتياطية مقتصرة على خدمة النظام الموثوقة'
            USING ERRCODE = '42501';
    END IF;

    IF p_snapshot IS NULL OR NOT (p_snapshot ? 'tables') THEN
        RAISE EXCEPTION 'بيانات النسخة الاحتياطية غير صالحة'
            USING ERRCODE = '22023';
    END IF;

    v_tables := p_snapshot->'tables';

    -- 1. Stations table
    IF v_tables ? 'stations' AND jsonb_typeof(v_tables->'stations') = 'array' THEN
        DELETE FROM public.stations WHERE id <> '00000000-0000-0000-0000-000000000000';
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_tables->'stations') LOOP
            INSERT INTO public.stations (
                id, code, name, region, city, address, status, phone, supervisor, notes, is_default, created_at, updated_at
            ) VALUES (
                COALESCE((v_item->>'id')::UUID, gen_random_uuid()),
                v_item->>'code',
                v_item->>'name',
                COALESCE(v_item->>'region', 'عسير'),
                v_item->>'city',
                v_item->>'address',
                COALESCE(v_item->>'status', 'نشطة'),
                v_item->>'phone',
                v_item->>'supervisor',
                v_item->>'notes',
                COALESCE((v_item->>'is_default')::BOOLEAN, false),
                COALESCE((v_item->>'created_at')::TIMESTAMPTZ, now()),
                COALESCE((v_item->>'updated_at')::TIMESTAMPTZ, now())
            )
            ON CONFLICT (id) DO UPDATE SET
                code = EXCLUDED.code,
                name = EXCLUDED.name,
                region = EXCLUDED.region,
                city = EXCLUDED.city,
                address = EXCLUDED.address,
                status = EXCLUDED.status,
                phone = EXCLUDED.phone,
                supervisor = EXCLUDED.supervisor,
                notes = EXCLUDED.notes,
                is_default = EXCLUDED.is_default,
                updated_at = EXCLUDED.updated_at;
        END LOOP;
    END IF;

    -- 2. Section counters
    IF v_tables ? 'section_counters' AND jsonb_typeof(v_tables->'section_counters') = 'array' THEN
        DELETE FROM public.section_counters;
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_tables->'section_counters') LOOP
            INSERT INTO public.section_counters (section_name, last_number, updated_at)
            VALUES (
                v_item->>'section_name',
                COALESCE((v_item->>'last_number')::BIGINT, 0),
                COALESCE((v_item->>'updated_at')::TIMESTAMPTZ, now())
            )
            ON CONFLICT (section_name) DO UPDATE SET
                last_number = EXCLUDED.last_number,
                updated_at = EXCLUDED.updated_at;
        END LOOP;
    END IF;

    -- 3. Maintenance Requests
    IF v_tables ? 'maintenance_requests' AND jsonb_typeof(v_tables->'maintenance_requests') = 'array' THEN
        DELETE FROM public.maintenance_requests WHERE id <> '00000000-0000-0000-0000-000000000000';
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_tables->'maintenance_requests') LOOP
            INSERT INTO public.maintenance_requests (
                id, request_number, section, date, station_id, station_name, station_code,
                requester, request_type, maintenance_type, problem_description, closing_date,
                technician, action_taken, completion_notes, status, is_station_unmatched,
                original_station_value, unmatched_reason, source_sheet, source_row,
                created_by, created_at, updated_at
            ) VALUES (
                COALESCE((v_item->>'id')::UUID, gen_random_uuid()),
                v_item->>'request_number',
                v_item->>'section',
                (v_item->>'date')::DATE,
                CASE WHEN (v_item->>'station_id') IS NOT NULL AND (v_item->>'station_id') <> '' THEN (v_item->>'station_id')::UUID ELSE NULL END,
                v_item->>'station_name',
                v_item->>'station_code',
                v_item->>'requester',
                v_item->>'request_type',
                v_item->>'maintenance_type',
                v_item->>'problem_description',
                CASE WHEN (v_item->>'closing_date') IS NOT NULL AND (v_item->>'closing_date') <> '' THEN (v_item->>'closing_date')::DATE ELSE NULL END,
                v_item->>'technician',
                v_item->>'action_taken',
                v_item->>'completion_notes',
                COALESCE((v_item->>'status')::public.maintenance_status_enum, 'جديد'),
                COALESCE((v_item->>'is_station_unmatched')::BOOLEAN, false),
                v_item->>'original_station_value',
                v_item->>'unmatched_reason',
                v_item->>'source_sheet',
                (v_item->>'source_row')::INTEGER,
                CASE WHEN (v_item->>'created_by') IS NOT NULL AND (v_item->>'created_by') <> '' THEN (v_item->>'created_by')::UUID ELSE NULL END,
                COALESCE((v_item->>'created_at')::TIMESTAMPTZ, now()),
                COALESCE((v_item->>'updated_at')::TIMESTAMPTZ, now())
            );
        END LOOP;
    END IF;

    -- 4. Internal Inspections
    IF v_tables ? 'internal_inspections' AND jsonb_typeof(v_tables->'internal_inspections') = 'array' THEN
        DELETE FROM public.internal_inspections WHERE id <> '00000000-0000-0000-0000-000000000000';
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_tables->'internal_inspections') LOOP
            INSERT INTO public.internal_inspections (
                id, inspection_number, date, station_id, station_name, station_code,
                inspection_type, inspector_name, evaluation, notes, is_station_unmatched,
                original_station_value, unmatched_reason, source_sheet, source_row,
                created_by, created_at, updated_at
            ) VALUES (
                COALESCE((v_item->>'id')::UUID, gen_random_uuid()),
                v_item->>'inspection_number',
                (v_item->>'date')::DATE,
                CASE WHEN (v_item->>'station_id') IS NOT NULL AND (v_item->>'station_id') <> '' THEN (v_item->>'station_id')::UUID ELSE NULL END,
                v_item->>'station_name',
                v_item->>'station_code',
                v_item->>'inspection_type',
                v_item->>'inspector_name',
                COALESCE((v_item->>'evaluation')::public.inspection_eval_enum, 'جيد'),
                v_item->>'notes',
                COALESCE((v_item->>'is_station_unmatched')::BOOLEAN, false),
                v_item->>'original_station_value',
                v_item->>'unmatched_reason',
                v_item->>'source_sheet',
                (v_item->>'source_row')::INTEGER,
                CASE WHEN (v_item->>'created_by') IS NOT NULL AND (v_item->>'created_by') <> '' THEN (v_item->>'created_by')::UUID ELSE NULL END,
                COALESCE((v_item->>'created_at')::TIMESTAMPTZ, now()),
                COALESCE((v_item->>'updated_at')::TIMESTAMPTZ, now())
            );
        END LOOP;
    END IF;

    -- 5. Incident Records
    IF v_tables ? 'incident_records' AND jsonb_typeof(v_tables->'incident_records') = 'array' THEN
        DELETE FROM public.incident_records WHERE id <> '00000000-0000-0000-0000-000000000000';
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_tables->'incident_records') LOOP
            INSERT INTO public.incident_records (
                id, incident_number, region, station_id, station_name, station_code,
                date, time, incident_type, causing_party, vehicle_type, general_info,
                description, prevention_suggestions, responsible_party_report, notes,
                reporter_name_and_signature, is_station_unmatched, original_station_value,
                unmatched_reason, source_sheet, source_row, created_by, created_at, updated_at
            ) VALUES (
                COALESCE((v_item->>'id')::UUID, gen_random_uuid()),
                v_item->>'incident_number',
                COALESCE(v_item->>'region', 'عسير'),
                CASE WHEN (v_item->>'station_id') IS NOT NULL AND (v_item->>'station_id') <> '' THEN (v_item->>'station_id')::UUID ELSE NULL END,
                v_item->>'station_name',
                v_item->>'station_code',
                (v_item->>'date')::DATE,
                v_item->>'time',
                v_item->>'incident_type',
                v_item->>'causing_party',
                v_item->>'vehicle_type',
                v_item->>'general_info',
                v_item->>'description',
                v_item->>'prevention_suggestions',
                v_item->>'responsible_party_report',
                v_item->>'notes',
                v_item->>'reporter_name_and_signature',
                COALESCE((v_item->>'is_station_unmatched')::BOOLEAN, false),
                v_item->>'original_station_value',
                v_item->>'unmatched_reason',
                v_item->>'source_sheet',
                (v_item->>'source_row')::INTEGER,
                CASE WHEN (v_item->>'created_by') IS NOT NULL AND (v_item->>'created_by') <> '' THEN (v_item->>'created_by')::UUID ELSE NULL END,
                COALESCE((v_item->>'created_at')::TIMESTAMPTZ, now()),
                COALESCE((v_item->>'updated_at')::TIMESTAMPTZ, now())
            );
        END LOOP;
    END IF;

    -- 6. Profiles (selective upsert to preserve account access)
    IF v_tables ? 'profiles' AND jsonb_typeof(v_tables->'profiles') = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_tables->'profiles') LOOP
            INSERT INTO public.profiles (id, username, full_name, role, is_active, updated_at)
            VALUES (
                (v_item->>'id')::UUID,
                v_item->>'username',
                v_item->>'full_name',
                COALESCE((v_item->>'role')::public.user_role_enum, 'editor'),
                COALESCE((v_item->>'is_active')::BOOLEAN, true),
                COALESCE((v_item->>'updated_at')::TIMESTAMPTZ, now())
            )
            ON CONFLICT (id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                role = EXCLUDED.role,
                is_active = EXCLUDED.is_active,
                updated_at = EXCLUDED.updated_at;
        END LOOP;
    END IF;

    -- Re-calculate section counters dynamically and renumber records sequentially 1..N
    PERFORM public.renumber_all_section_requests();

    RETURN jsonb_build_object('success', true, 'restored_at', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.restore_cloud_backup_snapshot(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_cloud_backup_snapshot(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.restore_cloud_backup_snapshot(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_cloud_backup_snapshot(JSONB) TO service_role;

-- 12. AUTHORITATIVE RENUMBERING PROCEDURE FOR ALL SECTIONS
CREATE OR REPLACE FUNCTION public.renumber_all_section_requests()
RETURNS JSONB AS $$
BEGIN
    -- 1. Temporarily un-index request numbers to avoid unique constraint violations during renumbering
    UPDATE public.maintenance_requests
    SET request_number = 'TEMP_' || id::text;

    -- 2. Renumber sequentially starting from 1 for each maintenance section
    WITH renumbered AS (
        SELECT id,
               section,
               ROW_NUMBER() OVER (
                   PARTITION BY section 
                   ORDER BY COALESCE(date, '1970-01-01'::date) ASC, 
                            COALESCE(created_at, '1970-01-01'::timestamptz) ASC, 
                            id ASC
               )::TEXT AS new_num
        FROM public.maintenance_requests
    )
    UPDATE public.maintenance_requests m
    SET request_number = r.new_num
    FROM renumbered r
    WHERE m.id = r.id;

    -- 3. Renumber Inspections 1..N
    UPDATE public.internal_inspections
    SET inspection_number = 'TEMP_' || id::text;

    WITH renumbered_ins AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   ORDER BY COALESCE(date, '1970-01-01'::date) ASC, 
                            COALESCE(created_at, '1970-01-01'::timestamptz) ASC, 
                            id ASC
               )::TEXT AS new_num
        FROM public.internal_inspections
    )
    UPDATE public.internal_inspections i
    SET inspection_number = r.new_num
    FROM renumbered_ins r
    WHERE i.id = r.id;

    -- 4. Renumber Incidents 1..N
    UPDATE public.incident_records
    SET incident_number = 'TEMP_' || id::text;

    WITH renumbered_inc AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   ORDER BY COALESCE(date, '1970-01-01'::date) ASC, 
                            COALESCE(created_at, '1970-01-01'::timestamptz) ASC, 
                            id ASC
               )::TEXT AS new_num
        FROM public.incident_records
    )
    UPDATE public.incident_records inc
    SET incident_number = r.new_num
    FROM renumbered_inc r
    WHERE inc.id = r.id;

    -- 5. Synchronize section_counters table with exact record counts per section
    INSERT INTO public.section_counters (section_name, last_number, updated_at)
    VALUES 
        ('pumps', COALESCE((SELECT COUNT(*) FROM public.maintenance_requests WHERE section = 'pumps'), 0), now()),
        ('tanks', COALESCE((SELECT COUNT(*) FROM public.maintenance_requests WHERE section = 'tanks'), 0), now()),
        ('facilities', COALESCE((SELECT COUNT(*) FROM public.maintenance_requests WHERE section = 'facilities'), 0), now()),
        ('inspections', COALESCE((SELECT COUNT(*) FROM public.internal_inspections), 0), now()),
        ('incidents', COALESCE((SELECT COUNT(*) FROM public.incident_records), 0), now())
    ON CONFLICT (section_name) DO UPDATE SET
        last_number = EXCLUDED.last_number,
        updated_at = EXCLUDED.updated_at;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.renumber_all_section_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renumber_all_section_requests() FROM anon;
GRANT EXECUTE ON FUNCTION public.renumber_all_section_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.renumber_all_section_requests() TO service_role;
