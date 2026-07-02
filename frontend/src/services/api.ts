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

// 会话相关接口：创建、画像、统计、对话（含 SSE）
export const sessionApi = {
  create: (target_concept?: string) =>
    api.post<SessionResponse>('/sessions/', { target_concept }),

  getProfile: (sessionId: string) =>
    api.get(`/sessions/${sessionId}/profile`),

  getProfileEvidence: (sessionId: string) =>
    api.get<{ session_id: string; evidence: Record<string, EvidenceItem[]> }>(
      `/sessions/${sessionId}/profile/evidence`
    ),

  getStats: (sessionId: string) =>
    api.get(`/sessions/${sessionId}/stats`),

  chat: (sessionId: string, data: ChatRequest) =>
    api.post<AgentResponse>(`/sessions/${sessionId}/chat`, data),

  chatStream: (sessionId: string, message: string, messageType: string = 'text') =>
    fetch(`/api/sessions/${sessionId}/chat-stream?message=${encodeURIComponent(message)}&message_type=${messageType}`),
}

// 知识图谱相关接口：全图、学习路径、概念详情
export const graphApi = {
  getGraph: () => api.get<GraphData>('/graph/'),
  getPath: (fromConcepts: string[], toConcept: string) =>
    api.get('/graph/path', {
      params: { from_concepts: fromConcepts.join(','), to_concept: toConcept },
    }),
  getConcept: (name: string) => api.get(`/graph/concept/${name}`),
}

export interface JudgeRequest {
  code: string
  expected_output: string
  session_id?: string
  concept?: string
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

export interface ThinkingStep {
  agent: string
  stage: string
  message: string
  timestamp?: string
}

// 学习资源相关接口：同步生成、流式生成、版本演进、思维路径、失败提交种子
export const resourceApi = {
  generate: (concept: string, profile?: any) =>
    api.post('/resources/generate', null, { params: { concept, profile } }),

  generateStream: (sessionId: string, concept: string) =>
    fetch(`/api/resources/stream-generate?session_id=${sessionId}&concept=${encodeURIComponent(concept)}`),

  getVersions: (concept: string) =>
    api.get<{ concept: string; versions: ResourceVersion[] }>(`/resources/versions?concept=${encodeURIComponent(concept)}`),

  getThinkingPath: (concept: string) =>
    api.get<{ concept: string; steps: ThinkingStep[] }>(`/resources/thinking-path?concept=${encodeURIComponent(concept)}`),

  seedFailedSubmissions: (sessionId: string, concept: string, count: number = 5) =>
    api.post('/code/seed-failed-submissions', { session_id: sessionId, concept, count }),
}

// 代码判题相关接口
export const codeApi = {
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
  getBkt: (sessionId: string) =>
    api.get(`/evaluation/bkt?session_id=${sessionId}`),
  analyze: (sessionId: string) =>
    api.post(`/evaluation/analyze?session_id=${sessionId}`),
}

export default api
