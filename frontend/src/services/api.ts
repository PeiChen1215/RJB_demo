/**
 * 需求：前端与后端 REST/SSE 通信层。
 * 功能：
 *   - 配置 axios 实例与统一 baseURL；
 *   - 定义会话、图谱、资源相关接口类型与 API 方法；
 *   - 封装流式接口（chatStream / generateStream）供组件消费。
 * 主要类型：
 *   - SessionResponse / AgentResponse / GraphData / ChatRequest
 * TODO:
 *  - [已完成] 基础 REST 接口封装
 *  - [已完成] SSE 流式接口封装
 *  - [待完成] 统一错误处理与重试机制
 *  - [待完成] 请求/响应拦截器（token、日志、loading）
 *  - [待完成] 类型细化（any 替换为具体结构）
 */
import axios from 'axios'

// axios 实例，baseURL 与后端 /api 前缀对齐
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = typeof window === 'undefined' ? '' : window.localStorage.getItem('eduhive.auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface AuthTokenResponse {
  access_token: string
  token_type: string
  username: string
}

export interface LearningPlanItem {
  concept: string
  difficulty: number
  mastery_probability: number
  is_mastered: boolean
  estimated_minutes: number
  reason: string
}

export interface LearningPlanResponse {
  session_id: string
  target_concept: string
  mastered_concepts: string[]
  total_minutes: number
  plan: LearningPlanItem[]
}

export interface LearningEvent {
  id: number
  session_id: string
  event_type: string
  concept?: string
  payload?: Record<string, any>
  created_at?: string
}

export interface SessionResponse {
  session_id: string
  profile: {
    knowledge_level: number
    cognitive_field: string
    cognitive_modality: string
    learning_pace: string
    goal_orientation: string
    error_patterns: string[]
    mastered_concepts: string[]
  }
  target_concept: string | null
  suggested_path: string[]
}

export interface EvidenceItem {
  evidence_type: string
  weight: number
  description: string
  created_at?: string
}

export interface ChatRequest {
  message: string
  message_type?: string
}

export interface AgentResponse {
  agent_name: string
  response_type: string
  content: any
  profile_update?: any
  debate_report?: any
}

export interface GraphData {
  nodes: Array<{
    id: string
    name: string
    module: string
    difficulty: number
  }>
  edges: Array<{
    source: string
    target: string
    strength: number
  }>
}

export interface GraphLayoutResponse {
  nodes: Array<{
    id: string
    name: string
    module: string
    difficulty: number
    x: number
    y: number
    color: string
  }>
  edges: GraphData['edges']
}

export interface PersonalPathResponse {
  session_id?: string
  target_concept?: string
  path_nodes?: Array<{
    id: string
    name: string
    mastery_probability?: number
    is_mastered?: boolean
    is_current?: boolean
    state?: string
  }>
  path_edges?: Array<{
    source: string
    target: string
    reason?: string
    prerequisites?: string[]
    pitfalls?: string[]
  }>
  mastered_concepts?: string[]
  path?: string[]
  error?: string
}

// 会话相关接口：创建、画像、统计、对话（含 SSE）
export const sessionApi = {
  create: (target_concept?: string) =>
    api.post<SessionResponse>('/sessions/', { target_concept }),

  getProfile: (sessionId: string) =>
    api.get(`/sessions/${sessionId}/profile`),

  updateProfile: (sessionId: string, profilePatch: Partial<SessionResponse['profile']>) =>
    api.patch<{ success: boolean; profile: SessionResponse['profile'] }>(
      `/sessions/${sessionId}/profile`,
      profilePatch
    ),

  getProfileEvidence: (sessionId: string) =>
    api.get<{ session_id: string; evidence: Record<string, EvidenceItem[]>; confidence: number }>(
      `/sessions/${sessionId}/profile/evidence`
    ),

  getAgentTrace: (sessionId: string, limit: number = 20) =>
    api.get<{ session_id: string; traces: any[] }>(
      `/sessions/${sessionId}/agent-trace?limit=${limit}`
    ),

  getStats: (sessionId: string) =>
    api.get(`/sessions/${sessionId}/stats`),

  getLearningPlan: (sessionId: string) =>
    api.get<LearningPlanResponse>(`/learning-plan/${sessionId}`),

  getEvents: (sessionId: string, limit: number = 8) =>
    api.get<{ events: LearningEvent[]; total: number }>(`/sessions/${sessionId}/events?limit=${limit}`),

  chat: (sessionId: string, data: ChatRequest) =>
    api.post<AgentResponse>(`/sessions/${sessionId}/chat`, data),

  chatStream: (sessionId: string, message: string, messageType: string = 'text') =>
    fetch(`/api/sessions/${sessionId}/chat-stream?message=${encodeURIComponent(message)}&message_type=${messageType}`),
}

export const authApi = {
  login: (username: string, password: string) => {
    const form = new URLSearchParams()
    form.set('username', username)
    form.set('password', password)
    return api.post<AuthTokenResponse>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  },

  register: (username: string, password: string) =>
    api.post<AuthTokenResponse>('/auth/register', { username, password }),

  logout: () => api.post('/auth/logout'),
}

// 知识图谱相关接口：全图、布局、个人路径、概念详情
export const graphApi = {
  getGraph: () => api.get<GraphData>('/graph/'),
  getLayout: () =>
    api.get<GraphLayoutResponse>('/graph/layout'),
  getPath: (fromConcepts: string[], toConcept: string) =>
    api.get<PersonalPathResponse>('/graph/path', {
      params: { from_concepts: fromConcepts.join(','), to_concept: toConcept },
    }),
  getPersonalPath: (sessionId: string, targetConcept?: string) =>
    api.get<PersonalPathResponse>('/graph/path', {
      params: { session_id: sessionId, target_concept: targetConcept },
    }),
  getConcept: (name: string) => api.get(`/graph/concept/${name}`),
}

export interface JudgeRequest {
  code: string
  expected_output: string
  session_id?: string
  concept?: string
}

export interface CodeVariable {
  name: string
  type: string
  value: string
  size?: number | null
}

export interface CodeExecutionResult {
  success: boolean
  stdout: string
  stderr: string
  violations: string[]
  variables?: CodeVariable[]
  execution_time?: number
}

export interface ResourceVersion {
  version_id: string
  resource_id: string
  concept: string
  version: number
  change_reason: string
  triggered_by: string
  content_snapshot?: any
  created_at: string
}

export interface ResourceEvolutionVersion {
  version?: number
  resource_id?: string
  created_at?: string
  triggered_by?: string
  change_reason?: string
  exercises_count?: number
  code_cases_count?: number
  diff?: {
    document_changed?: boolean
    exercises_diff?: number
    code_cases_diff?: number
  }
}

export interface ResourceEvolutionResponse {
  concept: string
  error_stats?: {
    total_submissions?: number
    passed?: number
    failed?: number
    error_rate?: number
  }
  versions: ResourceEvolutionVersion[]
}

export interface ResourceFeedbackStats {
  concept: string
  total_feedback: number
  confusion_count: number
  confusion_rate: number
  average_rating: number | null
  error_reports: string[]
}

export interface ResourceDetail {
  resource_id?: string
  task_id?: string
  session_id?: string
  concept: string
  version?: number
  document?: string
  mindmap?: string
  exercises?: Array<Record<string, any>>
  code_cases?: Array<Record<string, any>>
  audio_text?: string
  debate_report?: Record<string, any>
  status?: string
  created_at?: string
  updated_at?: string
}

export interface ThinkingStep {
  agent: string
  stage: string
  message: string
  timestamp?: string
}

export interface ResourceFeedbackRequest {
  session_id: string
  resource_id: string
  concept: string
  rating?: number
  error_report?: string
  confusion_marked?: boolean
}

// 学习资源相关接口：同步生成、流式生成、版本演进、思维路径、失败提交种子
export const resourceApi = {
  generate: (concept: string, profile?: any) =>
    api.post('/resources/generate', { concept, profile }),

  generateForSession: (sessionId: string, concept: string, profile?: any) =>
    api.post(`/resources/generate-for-session/${sessionId}`, { concept, profile }),

  generateStream: (sessionId: string, concept: string) =>
    fetch(`/api/resources/stream-generate?session_id=${sessionId}&concept=${encodeURIComponent(concept)}`),

  getVersions: (concept: string) =>
    api.get<{ concept: string; versions: ResourceVersion[] }>(`/resources/versions?concept=${encodeURIComponent(concept)}`),

  getEvolution: (concept: string) =>
    api.get<ResourceEvolutionResponse>(
      `/resources/evolution?concept=${encodeURIComponent(concept)}`
    ),

  getLatest: (concept: string) =>
    api.get<{ concept: string; has_resource: boolean; resource: ResourceDetail | null }>(
      `/resources/latest?concept=${encodeURIComponent(concept)}`
    ),

  getThinkingPath: (concept: string) =>
    api.get<{ concept: string; steps: ThinkingStep[] }>(`/resources/thinking-path?concept=${encodeURIComponent(concept)}`),

  getFeedbackStats: (concept: string) =>
    api.get<ResourceFeedbackStats>(`/resources/feedback/stats?concept=${encodeURIComponent(concept)}`),

  seedFailedSubmissions: (sessionId: string, concept: string, count: number = 5) =>
    api.post('/code/seed-failed-submissions', { session_id: sessionId, concept, count }),

  submitFeedback: (data: ResourceFeedbackRequest) =>
    api.post('/resources/feedback', data),
}

// 代码判题相关接口
export const codeApi = {
  execute: (code: string) => api.post<CodeExecutionResult>('/code/execute', { code }),
  judge: (data: JudgeRequest) => api.post('/code/judge', data),
  judgeExercise: (data: JudgeRequest) => api.post('/code/judge-exercise', data),
}

// 行为埋点接口
export const behaviorApi = {
  log: (sessionId: string, eventType: string, concept?: string, payload?: any) =>
    api.post(`/sessions/${sessionId}/behavior`, {
      event_type: eventType,
      session_id: sessionId,
      concept,
      payload: payload || {},
    }),
}

// 学习效果评估接口
export const evaluationApi = {
  getHeatmap: (sessionId: string) =>
    api.get(`/evaluation/heatmap?session_id=${sessionId}`),
  getBkt: (sessionId: string, concept?: string) =>
    api.get('/evaluation/bkt', {
      params: { session_id: sessionId, concept },
    }),
  analyze: (sessionId: string) =>
    api.post(`/evaluation/analyze?session_id=${sessionId}`),
}

export const assistantApi = {
  ask: (question: string) =>
    api.post<{ answer: string }>('/assistant/ask', { question }),
}

export const ttsApi = {
  synthesize: (text: string, speed?: number) =>
    api.post('/tts/synthesize', { text, speed: speed ?? 50 }, { responseType: 'blob' }),
  status: () =>
    api.get<{ tts_available: boolean }>('/tts/status'),
}

export default api
