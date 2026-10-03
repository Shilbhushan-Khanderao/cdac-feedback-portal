
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "batches": {
                  Row: {
                    "active": boolean,"id": string,"label": string
                  }
                  Insert: {
                    "active"?: boolean,"id"?: string,"label": string
                  }
                  Update: {
                    "active"?: boolean,"id"?: string,"label"?: string
                  }
                  Relationships: [
                    
                  ]
                },"centres": {
                  Row: {
                    "id": string,"kind": string,"name": string,"parent_id": string | null
                  }
                  Insert: {
                    "id"?: string,"kind": string,"name": string,"parent_id"?: string | null
                  }
                  Update: {
                    "id"?: string,"kind"?: string,"name"?: string,"parent_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "centres_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "centres"
      referencedColumns: ["id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "active": boolean,"code": string,"id": string,"name": string
                  }
                  Insert: {
                    "active"?: boolean,"code": string,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"faculty": {
                  Row: {
                    "active": boolean,"centre_id": string | null,"id": string,"name": string
                  }
                  Insert: {
                    "active"?: boolean,"centre_id"?: string | null,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"centre_id"?: string | null,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "faculty_centre_id_fkey"
      columns: ["centre_id"]
isOneToOne: false
      referencedRelation: "centres"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback_sessions": {
                  Row: {
                    "batch_id": string,"centre_id": string,"closes_at": string,"course_id": string,"created_at": string,"created_by": string | null,"faculty": (string)[],"id": string,"module_id": string,"opens_at": string,"questions": NonNullable<Json>
                  }
                  Insert: {
                    "batch_id": string,"centre_id": string,"closes_at": string,"course_id": string,"created_at"?: string,"created_by"?: string | null,"faculty"?: (string)[],"id"?: string,"module_id": string,"opens_at": string,"questions"?: NonNullable<Json>
                  }
                  Update: {
                    "batch_id"?: string,"centre_id"?: string,"closes_at"?: string,"course_id"?: string,"created_at"?: string,"created_by"?: string | null,"faculty"?: (string)[],"id"?: string,"module_id"?: string,"opens_at"?: string,"questions"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_sessions_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_sessions_centre_id_fkey"
      columns: ["centre_id"]
isOneToOne: false
      referencedRelation: "centres"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_sessions_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_sessions_module_id_fkey"
      columns: ["module_id"]
isOneToOne: false
      referencedRelation: "modules"
      referencedColumns: ["id"]
    }
                  ]
                },"modules": {
                  Row: {
                    "active": boolean,"course_id": string,"id": string,"name": string,"short_name": string | null,"sort_order": number
                  }
                  Insert: {
                    "active"?: boolean,"course_id": string,"id"?: string,"name": string,"short_name"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "active"?: boolean,"course_id"?: string,"id"?: string,"name"?: string,"short_name"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "modules_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "active": boolean,"id": string,"kind": string,"options": (string)[],"sort_order": number,"text": string
                  }
                  Insert: {
                    "active"?: boolean,"id"?: string,"kind": string,"options"?: (string)[],"sort_order"?: number,"text": string
                  }
                  Update: {
                    "active"?: boolean,"id"?: string,"kind"?: string,"options"?: (string)[],"sort_order"?: number,"text"?: string
                  }
                  Relationships: [
                    
                  ]
                },"responses": {
                  Row: {
                    "answers": NonNullable<Json>,"id": string,"session_id": string
                  }
                  Insert: {
                    "answers": NonNullable<Json>,"id"?: string,"session_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"id"?: string,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "responses_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "feedback_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_roster": {
                  Row: {
                    "centre_id": string | null,"course_id": string | null,"email": string,"full_name": string,"role": string
                  }
                  Insert: {
                    "centre_id"?: string | null,"course_id"?: string | null,"email": string,"full_name": string,"role": string
                  }
                  Update: {
                    "centre_id"?: string | null,"course_id"?: string | null,"email"?: string,"full_name"?: string,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_roster_centre_id_fkey"
      columns: ["centre_id"]
isOneToOne: false
      referencedRelation: "centres"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_roster_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"student_roster": {
                  Row: {
                    "batch_id": string,"centre_id": string,"course_id": string,"email": string,"full_name": string,"prn": string
                  }
                  Insert: {
                    "batch_id": string,"centre_id": string,"course_id": string,"email": string,"full_name": string,"prn": string
                  }
                  Update: {
                    "batch_id"?: string,"centre_id"?: string,"course_id"?: string,"email"?: string,"full_name"?: string,"prn"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_roster_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_roster_centre_id_fkey"
      columns: ["centre_id"]
isOneToOne: false
      referencedRelation: "centres"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_roster_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "email": string,"session_id": string,"submitted_at": string
                  }
                  Insert: {
                    "email": string,"session_id": string,"submitted_at"?: string
                  }
                  Update: {
                    "email"?: string,"session_id"?: string,"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_email_fkey"
      columns: ["email"]
isOneToOne: false
      referencedRelation: "student_roster"
      referencedColumns: ["email"]
    },{
      foreignKeyName: "submissions_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "feedback_sessions"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "cohort_sizes": {
                  Row: {
                    "batch_id": string | null,"centre_id": string | null,"course_id": string | null,"students": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_roster_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_roster_centre_id_fkey"
      columns: ["centre_id"]
isOneToOne: false
      referencedRelation: "centres"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_roster_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "can_manage":
{ Args: { "p_centre": string,"p_course": string }; Returns: boolean
                           },
"hook_restrict_signup_to_roster":
{ Args: { "event": Json }; Returns: Json
                           },
"in_my_cohort":
{ Args: { "p_batch": string,"p_centre": string,"p_course": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_my_centre":
{ Args: { "p_centre": string }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"submit_feedback":
{ Args: { "p_answers": Json,"p_session": string }; Returns: undefined
                           },
"whoami":
{ Args: Record<PropertyKey, never>; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
