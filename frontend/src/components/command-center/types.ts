import type { ComponentType } from 'react'
import type { GraphData } from '@/services/api'

export type NavKey = 'profile' | 'graph' | 'resources' | 'chat' | 'code' | 'progress'

export interface SessionStats {
  total_events: number
  chat_count: number
  resource_generated_count: number
  exercise_submitted_count: number
  code_executed_count: number
  exercise_passed_count: number
  exercise_failed_count: number
  daily_learning_minutes?: number
  streak_days?: number
}

export interface HeatmapItem {
  concept: string
  mastery_probability: number
  observation_count?: number
  is_mastered?: boolean
  sample_count?: number
  is_default?: boolean
  last_updated?: string | null
  explanation?: string
}

export interface SelectedHeatCell {
  row: string
  column: string
  value: number
  concept?: string
  observations?: number
  mastered?: boolean
}

export interface MasteryAnalysisResult {
  weakPoints: string[]
  reviewPoints: string[]
  recommendation: string
  analyzedAt: string
}

export interface HealthDetail {
  status: string
  llm_provider?: string
  graph_backend?: string
  database_stats?: Record<string, number>
}

export interface PathNode {
  id: string
  title: string
  mastery: number
  x: number
  y: number
  module: string
  difficulty: number
  state: 'mastered' | 'learning' | 'waiting' | 'current'
  icon: ComponentType<{ className?: string }>
}

export type KnowledgeEdge = GraphData['edges'][number]

export interface GraphLayoutNode {
  id: string
  name: string
  module: string
  difficulty: number
  x: number
  y: number
  color: string
}

export interface GraphLayoutData {
  nodes: GraphLayoutNode[]
  edges: KnowledgeEdge[]
}

export interface PersonalPathNode {
  id: string
  name: string
  mastery_probability?: number
  is_mastered?: boolean
  is_current?: boolean
  state?: 'mastered' | 'current' | 'waiting' | string
}

export interface PersonalPathEdge {
  source: string
  target: string
  reason?: string
  prerequisites?: string[]
  pitfalls?: string[]
}

export interface PersonalPathData {
  session_id?: string
  target_concept?: string
  path_nodes?: PersonalPathNode[]
  path_edges?: PersonalPathEdge[]
  mastered_concepts?: string[]
  path?: string[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agentName?: string
  isStreaming?: boolean
  timestamp: string
  tutorPayload?: TutorPayload
}

export type TutorPayload = {
  question: string
  hint?: string
  answer?: string
  canProvideAnswer?: boolean
  stage?: string
}

export type ExerciseView = {
  question: string
  starter_code: string
  expected_output: string
  hints: string[]
  solution: string
  raw: Record<string, any>
  answerLeaked: boolean
}

export type CodeRunResult = {
  stdout?: string
  stderr?: string
  [key: string]: any
}
