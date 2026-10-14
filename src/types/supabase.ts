export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'user';
export type MaintenanceStatus = 'جديد' | 'جاري العمل' | 'تم';
export type InspectionEvaluation = 'ممتاز' | 'جيد جدا' | 'جيد' | 'يحتاج متابعة';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          email: string;
          full_name: string;
          role: UserRole;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          email: string;
          full_name: string;
          role?: UserRole;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          email?: string;
          full_name?: string;
          role?: UserRole;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stations: {
        Row: {
          id: string;
          code: string;
          name: string;
          region: string;
          city: string | null;
          address: string | null;
          status: 'نشطة' | 'غير نشطة';
          phone: string | null;
          supervisor: string | null;
          notes: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          region: string;
          city?: string | null;
          address?: string | null;
          status?: 'نشطة' | 'غير نشطة';
          phone?: string | null;
          supervisor?: string | null;
          notes?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          region?: string;
          city?: string | null;
          address?: string | null;
          status?: 'نشطة' | 'غير نشطة';
          phone?: string | null;
          supervisor?: string | null;
          notes?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      section_counters: {
        Row: {
          section_name: string;
          last_number: number;
          updated_at: string;
        };
        Insert: {
          section_name: string;
          last_number?: number;
          updated_at?: string;
        };
        Update: {
          section_name?: string;
          last_number?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      maintenance_requests: {
        Row: {
          id: string;
          request_number: string;
          section: 'pumps' | 'tanks' | 'facilities';
          date: string;
          station_id: string | null;
          station_name: string;
          station_code: string;
          requester: string;
          request_type: string;
          maintenance_type: string;
          problem_description: string;
          closing_date: string | null;
          technician: string | null;
          action_taken: string | null;
          completion_notes: string | null;
          status: MaintenanceStatus;
          is_station_unmatched: boolean | null;
          original_station_value: string | null;
          unmatched_reason: string | null;
          source_sheet: string | null;
          source_row: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          request_number: string;
          section: 'pumps' | 'tanks' | 'facilities';
          date: string;
          station_id?: string | null;
          station_name: string;
          station_code: string;
          requester: string;
          request_type: string;
          maintenance_type: string;
          problem_description: string;
          closing_date?: string | null;
          technician?: string | null;
          action_taken?: string | null;
          completion_notes?: string | null;
          status?: MaintenanceStatus;
          is_station_unmatched?: boolean | null;
          original_station_value?: string | null;
          unmatched_reason?: string | null;
          source_sheet?: string | null;
          source_row?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          request_number?: string;
          section?: 'pumps' | 'tanks' | 'facilities';
          date?: string;
          station_id?: string | null;
          station_name?: string;
          station_code?: string;
          requester?: string;
          request_type?: string;
          maintenance_type?: string;
          problem_description?: string;
          closing_date?: string | null;
          technician?: string | null;
          action_taken?: string | null;
          completion_notes?: string | null;
          status?: MaintenanceStatus;
          is_station_unmatched?: boolean | null;
          original_station_value?: string | null;
          unmatched_reason?: string | null;
          source_sheet?: string | null;
          source_row?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      internal_inspections: {
        Row: {
          id: string;
          inspection_number: string;
          date: string;
          station_id: string | null;
          station_name: string;
          station_code: string;
          inspection_type: string;
          inspector_name: string;
          evaluation: InspectionEvaluation;
          notes: string | null;
          is_station_unmatched: boolean | null;
          original_station_value: string | null;
          unmatched_reason: string | null;
          source_sheet: string | null;
          source_row: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inspection_number: string;
          date: string;
          station_id?: string | null;
          station_name: string;
          station_code: string;
          inspection_type: string;
          inspector_name: string;
          evaluation?: InspectionEvaluation;
          notes?: string | null;
          is_station_unmatched?: boolean | null;
          original_station_value?: string | null;
          unmatched_reason?: string | null;
          source_sheet?: string | null;
          source_row?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          inspection_number?: string;
          date?: string;
          station_id?: string | null;
          station_name?: string;
          station_code?: string;
          inspection_type?: string;
          inspector_name?: string;
          evaluation?: InspectionEvaluation;
          notes?: string | null;
          is_station_unmatched?: boolean | null;
          original_station_value?: string | null;
          unmatched_reason?: string | null;
          source_sheet?: string | null;
          source_row?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      incident_records: {
        Row: {
          id: string;
          incident_number: string;
          region: string;
          station_id: string | null;
          station_name: string;
          station_code: string;
          date: string;
          time: string;
          incident_type: string;
          causing_party: string;
          vehicle_type: string | null;
          general_info: string | null;
          description: string;
          prevention_suggestions: string | null;
          responsible_party_report: string | null;
          notes: string | null;
          reporter_name_and_signature: string | null;
          is_station_unmatched: boolean | null;
          original_station_value: string | null;
          unmatched_reason: string | null;
          source_sheet: string | null;
          source_row: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          incident_number: string;
          region: string;
          station_id?: string | null;
          station_name: string;
          station_code: string;
          date: string;
          time: string;
          incident_type: string;
          causing_party: string;
          vehicle_type?: string | null;
          general_info?: string | null;
          description: string;
          prevention_suggestions?: string | null;
          responsible_party_report?: string | null;
          notes?: string | null;
          reporter_name_and_signature?: string | null;
          is_station_unmatched?: boolean | null;
          original_station_value?: string | null;
          unmatched_reason?: string | null;
          source_sheet?: string | null;
          source_row?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          incident_number?: string;
          region?: string;
          station_id?: string | null;
          station_name?: string;
          station_code?: string;
          date?: string;
          time?: string;
          incident_type?: string;
          causing_party?: string;
          vehicle_type?: string | null;
          general_info?: string | null;
          description?: string;
          prevention_suggestions?: string | null;
          responsible_party_report?: string | null;
          notes?: string | null;
          reporter_name_and_signature?: string | null;
          is_station_unmatched?: boolean | null;
          original_station_value?: string | null;
          unmatched_reason?: string | null;
          source_sheet?: string | null;
          source_row?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          user_email: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          user_email?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          user_email?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cloud_backups: {
        Row: {
          id: string;
          filename: string;
          backup_type: 'automatic' | 'manual' | 'safety';
          status: 'successful' | 'failed';
          size_bytes: number;
          created_by: string | null;
          created_by_name: string;
          record_counts: Json;
          snapshot_data: Json;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          filename: string;
          backup_type: 'automatic' | 'manual' | 'safety';
          status?: 'successful' | 'failed';
          size_bytes?: number;
          created_by?: string | null;
          created_by_name?: string;
          record_counts?: Json;
          snapshot_data?: Json;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          filename?: string;
          backup_type?: 'automatic' | 'manual' | 'safety';
          status?: 'successful' | 'failed';
          size_bytes?: number;
          created_by?: string | null;
          created_by_name?: string;
          record_counts?: Json;
          snapshot_data?: Json;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_next_section_sequence: {
        Args: {
          p_section: string;
        };
        Returns: string;
      };
      get_next_section_sequence_batch: {
        Args: {
          p_section: string;
          p_count: number;
        };
        Returns: {
          start_seq: string;
          end_seq: string;
        }[];
      };
      renumber_all_section_requests: {
        Args: Record<PropertyKey, never>;
        Returns: { success: boolean };
      };
      get_auth_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_active_authenticated: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      has_active_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role_enum: UserRole;
      maintenance_status_enum: MaintenanceStatus;
      inspection_eval_enum: InspectionEvaluation;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
