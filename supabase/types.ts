// Auto-generated types for Supabase schema (voice tracker)
// Source  : supabase/migrations/001_voice_tracker.sql
// Updated : 2026-04-21
//
// 이 파일은 Supabase CLI 자동 생성 형식을 수동으로 작성한 것입니다.
// Supabase CLI 사용 가능해지면 아래 명령으로 재생성하세요:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > supabase/types.ts

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
      voice_raw_posts: {
        Row: {
          id: number
          source: string
          external_id: string
          url: string | null
          title: string | null
          body: string | null
          author: string | null
          posted_at: string
          collected_at: string | null
          sentiment: string | null
          categories: Json | null
          issue_summary: string | null
          keywords: Json | null
          classified_at: string | null
        }
        Insert: {
          id?: number
          source: string
          external_id: string
          url?: string | null
          title?: string | null
          body?: string | null
          author?: string | null
          posted_at: string
          collected_at?: string | null
          sentiment?: string | null
          categories?: Json | null
          issue_summary?: string | null
          keywords?: Json | null
          classified_at?: string | null
        }
        Update: {
          id?: number
          source?: string
          external_id?: string
          url?: string | null
          title?: string | null
          body?: string | null
          author?: string | null
          posted_at?: string
          collected_at?: string | null
          sentiment?: string | null
          categories?: Json | null
          issue_summary?: string | null
          keywords?: Json | null
          classified_at?: string | null
        }
        Relationships: []
      }
      voice_hourly_stats: {
        Row: {
          hour: string
          total_count: number | null
          positive_count: number | null
          negative_count: number | null
          neutral_count: number | null
          categories: Json | null
          top_keywords: Json | null
          updated_at: string | null
        }
        Insert: {
          hour: string
          total_count?: number | null
          positive_count?: number | null
          negative_count?: number | null
          neutral_count?: number | null
          categories?: Json | null
          top_keywords?: Json | null
          updated_at?: string | null
        }
        Update: {
          hour?: string
          total_count?: number | null
          positive_count?: number | null
          negative_count?: number | null
          neutral_count?: number | null
          categories?: Json | null
          top_keywords?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      voice_daily_stats: {
        Row: {
          day: string
          total_count: number | null
          positive_count: number | null
          negative_count: number | null
          neutral_count: number | null
          categories: Json | null
          top_keywords: Json | null
          top_issues: Json | null
          updated_at: string | null
        }
        Insert: {
          day: string
          total_count?: number | null
          positive_count?: number | null
          negative_count?: number | null
          neutral_count?: number | null
          categories?: Json | null
          top_keywords?: Json | null
          top_issues?: Json | null
          updated_at?: string | null
        }
        Update: {
          day?: string
          total_count?: number | null
          positive_count?: number | null
          negative_count?: number | null
          neutral_count?: number | null
          categories?: Json | null
          top_keywords?: Json | null
          top_issues?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// 편의 타입 — Supabase 공식 CLI 출력과 동일한 헬퍼
export type Tables<
  T extends keyof Database['public']['Tables']
> = Database['public']['Tables'][T]['Row']

export type TablesInsert<
  T extends keyof Database['public']['Tables']
> = Database['public']['Tables'][T]['Insert']

export type TablesUpdate<
  T extends keyof Database['public']['Tables']
> = Database['public']['Tables'][T]['Update']

export type Enums<
  T extends keyof Database['public']['Enums']
> = Database['public']['Enums'][T]
