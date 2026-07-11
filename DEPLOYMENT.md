# 智学蜂巢 EduHive —— 部署文档

> 版本：v1.0  
> 最后更新：2026-07-05  
> 适用范围：决赛演示环境部署

---

## 一、环境要求

| 组件 | 最低版本 | 用途 |
|------|----------|------|
| **Python** | 3.11+ | 后端 FastAPI 服务 |
| **Node.js** | 18+ | 前端 Vite + React 构建/运行 |
| **npm** | 9+ | 前端依赖管理 |
| **Docker** | 24+（可选） | 容器化部署（含 Neo4j 图数据库） |
| **Docker Compose** | 2.0+（可选） | 一键启动全栈服务 |
| **操作系统** | Windows 10+ / macOS 12+ / Linux | — |

### 可选组件

| 组件 | 用途 |
|------|------|
| **Conda** | Python 环境隔离（推荐） |
| **Neo4j** | 生产级知识图谱存储（默认使用内存图 fallback） |

---

## 二、快速启动（5 分钟）

### 2.1 本地开发模式（推荐）

此模式无需 Docker，后端使用内存知识图谱，适合快速调试。

#### 第一步：克隆仓库

```bash
git clone git@github.com:PeiChen1215/RJB_demo.git
cd RJB_demo
```

#### 第二步：启动后端

```powershell
# Windows PowerShell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# 创建 .env 文件（如不存在）
echo LLM_PROVIDER=mock > .env
echo SECRET_KEY=eduhive-dev-key >> .env
echo CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 >> .env

# 启动后端
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **Mock 模式**：`LLM_PROVIDER=mock` 使所有 Agent 返回模拟数据，无需真实 DeepSeek API Key，可跑通完整 Demo 主链路。

验证：浏览器打开 <http://localhost:8000/health>，应返回 `{"status": "ok"}`。

#### 第三步：启动前端

```powershell
# 新开一个终端
cd frontend
npm install
npm run dev
```

验证：浏览器打开 <http://localhost:5173>，应看到智学蜂巢 Command Center 界面。

---

### 2.2 Docker 全栈模式

此模式启动 Neo4j + 后端 + 前端三个容器，适合完整部署验证。

#### 前置条件

- Docker Desktop **正在运行**（Windows/macOS 需确保守护进程已启动）
- 端口 7474、7687、8000、5173 未被占用

#### 启动

```bash
# 在项目根目录
docker compose up -d
```

#### 初始化 Neo4j 种子数据（首次启动后执行一次）

```bash
docker compose exec backend python seed_neo4j.py
```

#### 验证

```bash
# 健康检查
curl http://localhost:8000/health

# Neo4j 浏览器
# 打开 http://localhost:7474，用户名 neo4j，密码 eduhive123

# 前端
# 打开 http://localhost:5173
```

#### 停止

```bash
docker compose down
```

#### 清理数据

```bash
docker compose down -v  # 删除所有持久化数据卷
```

---

## 三、详细配置

### 3.1 后端环境变量（`backend/.env`）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `auto` | LLM 提供者：`deepseek` / `spark` / `mock` / `auto` |
| `DEEPSEEK_API_KEY` | — | DeepSeek API Key（`LLM_PROVIDER=deepseek` 时必填） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 使用的 DeepSeek 模型 |
| `SPARK_APP_ID` | — | 讯飞星火 App ID |
| `SPARK_API_KEY` | — | 讯飞星火 API Key |
| `SPARK_API_SECRET` | — | 讯飞星火 API Secret |
| `GRAPH_BACKEND` | `auto` | 图存储后端：`neo4j` / `memory` / `auto` |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j 连接地址 |
| `NEO4J_USER` | `neo4j` | Neo4j 用户名 |
| `NEO4J_PASSWORD` | `eduhive123` | Neo4j 密码 |
| `DATABASE_URL` | `sqlite:///./eduhive.db` | SQLite 数据库路径 |
| `SECRET_KEY` | `eduhive-secret-key-...` | JWT 签名密钥（生产环境请更换！） |
| `DEBUG` | `true` | 调试模式开关 |
| `CORS_ORIGINS` | `http://localhost:5173,...` | 允许的前端跨域来源（逗号分隔） |
| `RESOURCE_CACHE_TTL_HOURS` | `168` | 资源缓存有效期（小时） |

### 3.2 图存储模式说明

| 模式 | 适用场景 | 需要 |
|------|----------|------|
| `memory` | 本地开发、快速调试 | 无额外依赖 |
| `neo4j` | 生产环境 | Docker Neo4j 或独立 Neo4j 服务 |
| `auto`（默认） | 自动检测 | 尝试连接 Neo4j，失败则回退 memory |

---

## 四、数据库备份与恢复

### 4.1 SQLite 备份

```bash
# 备份
python scripts/backup_db.py backup

# 备份到指定路径
python scripts/backup_db.py backup --output ./backups/eduhive_20260705.db

# 恢复
python scripts/backup_db.py restore --backup ./backups/eduhive_20260705.db
```

### 4.2 Neo4j 数据备份

```bash
# 需要 Neo4j 正在运行
python scripts/backup_neo4j.py
```

---

## 五、常见问题

### 5.1 端口被占用

**症状**：`uvicorn` 启动时报 `Address already in use`

**解决**：

```powershell
# Windows：找到占用 8000 端口的进程并终止
netstat -ano | findstr :8000
taskkill /PID <进程ID> /F
```

### 5.2 Docker 容器启动失败

**症状**：`docker compose up` 报连接错误

**解决**：
1. 确认 Docker Desktop 正在运行（系统托盘应有 Docker 图标）
2. 如果 Docker Desktop 崩溃，重启 Docker Desktop
3. 清理旧容器：`docker compose down -v && docker compose up -d`

### 5.3 前端构建失败

**症状**：`npm run build` 报 TypeScript 错误

**解决**：
1. 确认 Node.js 版本 ≥ 18：`node --version`
2. 清理并重装：`rm -rf node_modules && npm install`
3. 重新构建：`npm run build`

### 5.4 Mock 模式资源生成返回空

**症状**：`LLM_PROVIDER=mock` 时资源生成接口返回空或不完整

**解决**：Mock 模式返回预设数据，需要 `backend/app/services/database.py` 中有对应的种子数据。运行：

```bash
# 初始化种子数据
cd backend && python seed_neo4j.py
```

### 5.5 Neo4j 连接超时

**症状**：后端日志显示 `Unable to connect to Neo4j`

**解决**：
1. 确认 Neo4j 容器正在运行：`docker compose ps neo4j`
2. 等待 Neo4j 完全启动（约 10-30 秒）：`docker compose logs neo4j`
3. 如果不需要 Neo4j，设置环境变量：`GRAPH_BACKEND=memory`

---

## 六、生产环境检查清单

部署到决赛演示环境前，逐条确认：

- [ ] `SECRET_KEY` 已更换为强随机字符串（禁止使用默认值）
- [ ] `DEEPSEEK_API_KEY` 已配置且额度充足
- [ ] `DEBUG=false`
- [ ] `LLM_PROVIDER=deepseek`（或实际的 LLM 提供者）
- [ ] 数据库已备份
- [ ] 前端 `npm run build` 通过
- [ ] 后端 `pytest` 全量测试通过
- [ ] Demo 主链路（登录 → 画像 → 路径 → 资源 → 代码 → 辅导 → 报告）完整跑通
- [ ] 端口 8000 / 5173 对外可访问
- [ ] 防火墙规则允许目标端口

---

## 七、服务端口一览

| 服务 | 端口 | 访问地址 |
|------|------|----------|
| 后端 API | 8000 | <http://localhost:8000> |
| 后端 API 文档（Swagger） | 8000 | <http://localhost:8000/docs> |
| 前端开发服务器 | 5173 | <http://localhost:5173> |
| Neo4j HTTP | 7474 | <http://localhost:7474> |
| Neo4j Bolt | 7687 | `bolt://localhost:7687` |
