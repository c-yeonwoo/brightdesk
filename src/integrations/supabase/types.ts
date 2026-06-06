export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      fundamentals: {
        Row: {
          as_of: string
          debt_ratio: number | null
          dividend_yield: number | null
          fetched_at: string
          id: string
          pbr: number | null
          per: number | null
          revenue_growth: number | null
          roe: number | null
          source: string | null
          ticker: string
        }
        Insert: {
          as_of: string
          debt_ratio?: number | null
          dividend_yield?: number | null
          fetched_at?: string
          id?: string
          pbr?: number | null
          per?: number | null
          revenue_growth?: number | null
          roe?: number | null
          source?: string | null
          ticker: string
        }
        Update: {
          as_of?: string
          debt_ratio?: number | null
          dividend_yield?: number | null
          fetched_at?: string
          id?: string
          pbr?: number | null
          per?: number | null
          revenue_growth?: number | null
          roe?: number | null
          source?: string | null
          ticker?: string
        }
        Relationships: []
      }
      indicators: {
        Row: {
          computed_at: string
          date: string
          id: string
          ma120: number | null
          ma20: number | null
          ma60: number | null
          macd: number | null
          macd_hist: number | null
          macd_signal: number | null
          rsi14: number | null
          ticker: string
        }
        Insert: {
          computed_at?: string
          date: string
          id?: string
          ma120?: number | null
          ma20?: number | null
          ma60?: number | null
          macd?: number | null
          macd_hist?: number | null
          macd_signal?: number | null
          rsi14?: number | null
          ticker: string
        }
        Update: {
          computed_at?: string
          date?: string
          id?: string
          ma120?: number | null
          ma20?: number | null
          ma60?: number | null
          macd?: number | null
          macd_hist?: number | null
          macd_signal?: number | null
          rsi14?: number | null
          ticker?: string
        }
        Relationships: []
      }
      kb_facts: {
        Row: {
          domain: Database["public"]["Enums"]["kb_domain"]
          fact_key: string
          first_seen_at: string
          id: string
          is_active: boolean
          related_tickers: string[] | null
          reliability: number | null
          sentiment: number | null
          source_doc_ids: string[] | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          domain: Database["public"]["Enums"]["kb_domain"]
          fact_key: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          related_tickers?: string[] | null
          reliability?: number | null
          sentiment?: number | null
          source_doc_ids?: string[] | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          domain?: Database["public"]["Enums"]["kb_domain"]
          fact_key?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          related_tickers?: string[] | null
          reliability?: number | null
          sentiment?: number | null
          source_doc_ids?: string[] | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          cash: number
          created_at: string
          date: string
          holdings_value: number
          id: string
          portfolio_id: string
          total_value: number
        }
        Insert: {
          cash: number
          created_at?: string
          date: string
          holdings_value: number
          id?: string
          portfolio_id: string
          total_value: number
        }
        Update: {
          cash?: number
          created_at?: string
          date?: string
          holdings_value?: number
          id?: string
          portfolio_id?: string
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          cash: number
          created_at: string
          id: string
          initial_cash: number
          kind: string
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          cash?: number
          created_at?: string
          id?: string
          initial_cash?: number
          kind?: string
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          cash?: number
          created_at?: string
          id?: string
          initial_cash?: number
          kind?: string
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_price: number
          id: string
          portfolio_id: string
          qty: number
          ticker: string
          updated_at: string
        }
        Insert: {
          avg_price?: number
          id?: string
          portfolio_id: string
          qty?: number
          ticker: string
          updated_at?: string
        }
        Update: {
          avg_price?: number
          id?: string
          portfolio_id?: string
          qty?: number
          ticker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          close: number
          date: string
          high: number
          id: string
          inserted_at: string
          low: number
          open: number
          source: string
          ticker: string
          volume: number
        }
        Insert: {
          close: number
          date: string
          high: number
          id?: string
          inserted_at?: string
          low: number
          open: number
          source?: string
          ticker: string
          volume?: number
        }
        Update: {
          close?: number
          date?: string
          high?: number
          id?: string
          inserted_at?: string
          low?: number
          open?: number
          source?: string
          ticker?: string
          volume?: number
        }
        Relationships: []
      }
      raw_documents: {
        Row: {
          body: string | null
          collected_at: string
          content_hash: string | null
          external_id: string | null
          id: string
          meta: Json | null
          processed_at: string | null
          published_at: string | null
          r2_key: string | null
          reliability: number | null
          source: Database["public"]["Enums"]["source_type"]
          title: string | null
        }
        Insert: {
          body?: string | null
          collected_at?: string
          content_hash?: string | null
          external_id?: string | null
          id?: string
          meta?: Json | null
          processed_at?: string | null
          published_at?: string | null
          r2_key?: string | null
          reliability?: number | null
          source: Database["public"]["Enums"]["source_type"]
          title?: string | null
        }
        Update: {
          body?: string | null
          collected_at?: string
          content_hash?: string | null
          external_id?: string | null
          id?: string
          meta?: Json | null
          processed_at?: string | null
          published_at?: string | null
          r2_key?: string | null
          reliability?: number | null
          source?: Database["public"]["Enums"]["source_type"]
          title?: string | null
        }
        Relationships: []
      }
      rebalance_recommendations: {
        Row: {
          actions: Json
          expected_return: number | null
          expected_risk: number | null
          generated_at: string
          id: string
          portfolio_id: string
          rationale: string | null
        }
        Insert: {
          actions?: Json
          expected_return?: number | null
          expected_risk?: number | null
          generated_at?: string
          id?: string
          portfolio_id: string
          rationale?: string | null
        }
        Update: {
          actions?: Json
          expected_return?: number | null
          expected_risk?: number | null
          generated_at?: string
          id?: string
          portfolio_id?: string
          rationale?: string | null
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          created_at: string
          id: string
          mdd: number | null
          name: string
          params: Json
          ran_at: string | null
          score: number | null
          sharpe: number | null
          total_return: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          mdd?: number | null
          name: string
          params?: Json
          ran_at?: string | null
          score?: number | null
          sharpe?: number | null
          total_return?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          mdd?: number | null
          name?: string
          params?: Json
          ran_at?: string | null
          score?: number | null
          sharpe?: number | null
          total_return?: number | null
        }
        Relationships: []
      }
      signal_outcomes: {
        Row: {
          entry_date: string
          entry_price: number
          evaluated_at: string
          hit: boolean | null
          id: string
          kind: string
          ret_20d: number | null
          ret_5d: number | null
          score: number | null
          signal_id: string
          ticker: string
        }
        Insert: {
          entry_date: string
          entry_price: number
          evaluated_at?: string
          hit?: boolean | null
          id?: string
          kind: string
          ret_20d?: number | null
          ret_5d?: number | null
          score?: number | null
          signal_id: string
          ticker: string
        }
        Update: {
          entry_date?: string
          entry_price?: number
          evaluated_at?: string
          hit?: boolean | null
          id?: string
          kind?: string
          ret_20d?: number | null
          ret_5d?: number | null
          score?: number | null
          signal_id?: string
          ticker?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          confidence: number | null
          created_at: string
          fact_ids: string[] | null
          fundamental_score: number | null
          id: string
          kb_score: number | null
          kind: Database["public"]["Enums"]["signal_kind"]
          macd_hist: number | null
          reasons: Json
          rsi14: number | null
          score: number
          technical_score: number | null
          ticker: string
          ts: string
          weights: Json | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          fact_ids?: string[] | null
          fundamental_score?: number | null
          id?: string
          kb_score?: number | null
          kind: Database["public"]["Enums"]["signal_kind"]
          macd_hist?: number | null
          reasons?: Json
          rsi14?: number | null
          score?: number
          technical_score?: number | null
          ticker: string
          ts?: string
          weights?: Json | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          fact_ids?: string[] | null
          fundamental_score?: number | null
          id?: string
          kb_score?: number | null
          kind?: Database["public"]["Enums"]["signal_kind"]
          macd_hist?: number | null
          reasons?: Json
          rsi14?: number | null
          score?: number
          technical_score?: number | null
          ticker?: string
          ts?: string
          weights?: Json | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          executed_at: string
          fee: number
          id: string
          note: string | null
          portfolio_id: string
          price: number
          qty: number
          side: Database["public"]["Enums"]["txn_side"]
          signal_id: string | null
          tax: number
          ticker: string
        }
        Insert: {
          executed_at?: string
          fee?: number
          id?: string
          note?: string | null
          portfolio_id: string
          price: number
          qty: number
          side: Database["public"]["Enums"]["txn_side"]
          signal_id?: string | null
          tax?: number
          ticker: string
        }
        Update: {
          executed_at?: string
          fee?: number
          id?: string
          note?: string | null
          portfolio_id?: string
          price?: number
          qty?: number
          side?: Database["public"]["Enums"]["txn_side"]
          signal_id?: string | null
          tax?: number
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_portfolio_inputs: {
        Row: {
          avg_price: number | null
          created_at: string
          id: string
          portfolio_id: string
          qty: number
          ticker: string
        }
        Insert: {
          avg_price?: number | null
          created_at?: string
          id?: string
          portfolio_id: string
          qty: number
          ticker: string
        }
        Update: {
          avg_price?: number | null
          created_at?: string
          id?: string
          portfolio_id?: string
          qty?: number
          ticker?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _invoke_cron: { Args: { endpoint: string }; Returns: number }
    }
    Enums: {
      kb_domain: "macro" | "theme" | "news" | "politics"
      signal_kind: "BUY" | "SELL" | "HOLD"
      source_type: "broker_pdf" | "mijueun_youtube" | "snoomi_kakao" | "news"
      txn_side: "BUY" | "SELL"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      kb_domain: ["macro", "theme", "news", "politics"],
      signal_kind: ["BUY", "SELL", "HOLD"],
      source_type: ["broker_pdf", "mijueun_youtube", "snoomi_kakao", "news"],
      txn_side: ["BUY", "SELL"],
    },
  },
} as const
