export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      airports: {
        Row: {
          city: string | null
          iata: string
          lat: number | null
          lng: number | null
          name: string
          region: string | null
          source: string | null
        }
        Insert: {
          city?: string | null
          iata: string
          lat?: number | null
          lng?: number | null
          name: string
          region?: string | null
          source?: string | null
        }
        Update: {
          city?: string | null
          iata?: string
          lat?: number | null
          lng?: number | null
          name?: string
          region?: string | null
          source?: string | null
        }
        Relationships: []
      }
      availability_cache: {
        Row: {
          award_route_id: string
          cabin: string
          date: string
          fetched_at: string
          id: string
          seats_available: number
          source: string
        }
        Insert: {
          award_route_id: string
          cabin: string
          date: string
          fetched_at?: string
          id?: string
          seats_available?: number
          source?: string
        }
        Update: {
          award_route_id?: string
          cabin?: string
          date?: string
          fetched_at?: string
          id?: string
          seats_available?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_cache_award_route_id_fkey"
            columns: ["award_route_id"]
            referencedRelation: "award_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      award_routes: {
        Row: {
          booking_url: string | null
          cabin: string
          destination_airports: string[] | null
          destination_region: string
          id: string
          is_active: boolean
          last_verified_at: string | null
          name: string
          notes: string | null
          origin_airports: string[] | null
          origin_region: string
          points_oneway: number
          program_currency_id: string
          taxes_fees_usd_est: number
        }
        Insert: {
          booking_url?: string | null
          cabin: string
          destination_airports?: string[] | null
          destination_region: string
          id?: string
          is_active?: boolean
          last_verified_at?: string | null
          name: string
          notes?: string | null
          origin_airports?: string[] | null
          origin_region: string
          points_oneway: number
          program_currency_id: string
          taxes_fees_usd_est?: number
        }
        Update: {
          booking_url?: string | null
          cabin?: string
          destination_airports?: string[] | null
          destination_region?: string
          id?: string
          is_active?: boolean
          last_verified_at?: string | null
          name?: string
          notes?: string | null
          origin_airports?: string[] | null
          origin_region?: string
          points_oneway?: number
          program_currency_id?: string
          taxes_fees_usd_est?: number
        }
        Relationships: [
          {
            foreignKeyName: "award_routes_program_currency_id_fkey"
            columns: ["program_currency_id"]
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      card_catalog: {
        Row: {
          affiliate_url: string | null
          annual_fee: number
          application_rules: Json | null
          currency_id: string
          discontinued_at: string | null
          id: string
          is_active: boolean
          issuer: string
          name: string
          notes: string | null
          unlocks_transfers: boolean
        }
        Insert: {
          affiliate_url?: string | null
          annual_fee?: number
          application_rules?: Json | null
          currency_id: string
          discontinued_at?: string | null
          id?: string
          is_active?: boolean
          issuer: string
          name: string
          notes?: string | null
          unlocks_transfers?: boolean
        }
        Update: {
          affiliate_url?: string | null
          annual_fee?: number
          application_rules?: Json | null
          currency_id?: string
          discontinued_at?: string | null
          id?: string
          is_active?: boolean
          issuer?: string
          name?: string
          notes?: string | null
          unlocks_transfers?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "card_catalog_currency_id_fkey"
            columns: ["currency_id"]
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          alliance: string | null
          cashback_cpp: number
          id: string
          is_active: boolean
          kind: string
          name: string
          notes: string | null
          requires_unlock: boolean
          transfer_cpp: number
        }
        Insert: {
          alliance?: string | null
          cashback_cpp?: number
          id?: string
          is_active?: boolean
          kind: string
          name: string
          notes?: string | null
          requires_unlock?: boolean
          transfer_cpp?: number
        }
        Update: {
          alliance?: string | null
          cashback_cpp?: number
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          notes?: string | null
          requires_unlock?: boolean
          transfer_cpp?: number
        }
        Relationships: []
      }
      earning_rates: {
        Row: {
          cap_monthly_usd: number | null
          card_id: string
          category: string
          id: string
          notes: string | null
          rate: number
        }
        Insert: {
          cap_monthly_usd?: number | null
          card_id: string
          category: string
          id?: string
          notes?: string | null
          rate: number
        }
        Update: {
          cap_monthly_usd?: number | null
          card_id?: string
          category?: string
          id?: string
          notes?: string | null
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "earning_rates_card_id_fkey"
            columns: ["card_id"]
            referencedRelation: "card_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          cabin: string
          created_at: string
          destination_airport: string | null
          destination_region: string | null
          flexibility: string
          id: string
          num_travelers: number
          origin_airport: string
          title: string
          travel_month: string | null
          user_id: string
        }
        Insert: {
          cabin: string
          created_at?: string
          destination_airport?: string | null
          destination_region?: string | null
          flexibility?: string
          id?: string
          num_travelers?: number
          origin_airport: string
          title: string
          travel_month?: string | null
          user_id: string
        }
        Update: {
          cabin?: string
          created_at?: string
          destination_airport?: string | null
          destination_region?: string | null
          flexibility?: string
          id?: string
          num_travelers?: number
          origin_airport?: string
          title?: string
          travel_month?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          job_name: string
          started_at: string
          stats: Json | null
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          started_at?: string
          stats?: Json | null
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          started_at?: string
          stats?: Json | null
          status?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          generated_at: string
          goal_id: string
          id: string
          strategies: Json
          user_id: string
        }
        Insert: {
          generated_at?: string
          goal_id: string
          id?: string
          strategies: Json
          user_id: string
        }
        Update: {
          generated_at?: string
          goal_id?: string
          id?: string
          strategies?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_goal_id_fkey"
            columns: ["goal_id"]
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          home_airport: string | null
          id: string
          monthly_spend: Json
          role: string
        }
        Insert: {
          created_at?: string
          home_airport?: string | null
          id: string
          monthly_spend?: Json
          role?: string
        }
        Update: {
          created_at?: string
          home_airport?: string | null
          id?: string
          monthly_spend?: Json
          role?: string
        }
        Relationships: []
      }
      staging_changes: {
        Row: {
          confidence: number | null
          created_at: string
          diff: Json | null
          id: string
          proposed: Json
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          source_urls: string[] | null
          status: string
          target_id: string | null
          target_table: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          diff?: Json | null
          id?: string
          proposed: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          source_urls?: string[] | null
          status?: string
          target_id?: string | null
          target_table: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          diff?: Json | null
          id?: string
          proposed?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          source_urls?: string[] | null
          status?: string
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_changes_reviewed_by_fkey"
            columns: ["reviewed_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_bonuses: {
        Row: {
          bonus_pct: number
          ends_at: string
          id: string
          source_url: string | null
          starts_at: string
          status: string
          transfer_partner_id: string
        }
        Insert: {
          bonus_pct: number
          ends_at: string
          id?: string
          source_url?: string | null
          starts_at: string
          status?: string
          transfer_partner_id: string
        }
        Update: {
          bonus_pct?: number
          ends_at?: string
          id?: string
          source_url?: string | null
          starts_at?: string
          status?: string
          transfer_partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_bonuses_transfer_partner_id_fkey"
            columns: ["transfer_partner_id"]
            referencedRelation: "transfer_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_partners: {
        Row: {
          from_currency_id: string
          id: string
          increment: number | null
          is_active: boolean
          min_transfer: number | null
          notes: string | null
          ratio_den: number
          ratio_num: number
          to_currency_id: string
          transfer_hours_est: number
        }
        Insert: {
          from_currency_id: string
          id?: string
          increment?: number | null
          is_active?: boolean
          min_transfer?: number | null
          notes?: string | null
          ratio_den: number
          ratio_num: number
          to_currency_id: string
          transfer_hours_est?: number
        }
        Update: {
          from_currency_id?: string
          id?: string
          increment?: number | null
          is_active?: boolean
          min_transfer?: number | null
          notes?: string | null
          ratio_den?: number
          ratio_num?: number
          to_currency_id?: string
          transfer_hours_est?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfer_partners_from_currency_id_fkey"
            columns: ["from_currency_id"]
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_partners_to_currency_id_fkey"
            columns: ["to_currency_id"]
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cards: {
        Row: {
          card_id: string
          id: string
          opened_at: string | null
          points_balance: number
          user_id: string
        }
        Insert: {
          card_id: string
          id?: string
          opened_at?: string | null
          points_balance?: number
          user_id: string
        }
        Update: {
          card_id?: string
          id?: string
          opened_at?: string | null
          points_balance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cards_card_id_fkey"
            columns: ["card_id"]
            referencedRelation: "card_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cards_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_offers: {
        Row: {
          card_id: string
          ends_at: string | null
          id: string
          is_active: boolean
          min_spend_usd: number
          points: number
          source_url: string | null
          window_months: number
        }
        Insert: {
          card_id: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_spend_usd: number
          points: number
          source_url?: string | null
          window_months: number
        }
        Update: {
          card_id?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_spend_usd?: number
          points?: number
          source_url?: string | null
          window_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "welcome_offers_card_id_fkey"
            columns: ["card_id"]
            referencedRelation: "card_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

