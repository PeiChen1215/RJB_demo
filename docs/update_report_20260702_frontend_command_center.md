# EduHive Frontend Command Center Update Report

**Date**: 2026-07-02  
**Branch**: `feature/frontend-command-center`  
**Owner**: Member C, frontend / product / demo experience  
**Scope**: Command-center frontend, graph interaction, learning resource entry, local environment support

---

## 1. Summary

This update rebuilds the frontend into a multi-page EduHive command center and strengthens the main demo flow:

`learning profile -> knowledge graph -> learning resources -> learning dialogue -> code sandbox -> mastery progress`

The focus is to make the project look and behave like a complete product instead of a static concept mockup. The new UI connects to existing backend graph, resource, evaluation, behavior, chat, and code APIs where available.

## 2. Frontend Features

### Multi-page Navigation

- Added page-level navigation for:
  - learning profile
  - knowledge graph
  - learning resources
  - learning dialogue
  - code sandbox
  - mastery progress
- Placed `学习资源` between `知识图谱` and `学习对话` according to the demo flow.
- Removed visible demo scaffolding from the product UI.

### Knowledge Graph Mini-map

- Redesigned the knowledge graph as a draggable game-style mini-map.
- Uses backend graph nodes and edges to compute the visible layout.
- Supports automatic focus on the learning target when entering the graph page.
- Clicking a node opens its detail card without re-centering the map.
- Blank click hides node detail and restores overview context.
- Golden path is driven by backend path planning data.
- All nodes on the planned path now show a golden animated ripple effect.
- The selected node remains the strongest visual focus.

### Learning Resource Page

- Added a `学习资源` navigation page and initial resource cockpit.
- Resource generation completion automatically navigates to the resource page.
- Displays:
  - current resource concept
  - resource generation status
  - resource module entry chips
  - Agent generation process
  - version evolution summary
- Separated resource target logic:
  - top-right button generates the current learning goal / planned path endpoint
  - node detail button generates the clicked graph node resource
  - resource page regeneration uses the current resource page concept

### UI and Interaction Polish

- Added generated visual assets under `frontend/public/assets`.
- Improved global visual theme with command-center background, logo mark, and learner avatar.
- Expanded the graph page so the map owns most of the screen, with a compact path-planning dock below it.
- Improved profile, Agent collaboration, style switcher, heatmap, code sandbox, and resource status interactions.

## 3. API Integration

Frontend now uses or prepares calls for:

- `/api/graph/`
- `/api/graph/path`
- `/api/graph/concept/{concept}`
- `/api/resources/stream-generate`
- `/api/resources/versions`
- `/api/resources/thinking-path`
- `/api/evaluation/heatmap`
- `/api/evaluation/analyze`
- `/api/code/execute`
- session chat stream and behavior logging APIs

## 4. Environment Support

- Added `environment.yml` for project conda environment creation.
- Added `scripts/run_backend.ps1` to start the backend using the local `.conda` Python runtime.
- Updated `.gitignore` to ignore the local `.conda/` environment directory.

## 5. Verification

Frontend production build passed:

```powershell
cd I:\project\rjb\RJB_demo\frontend
npm run build
```

Result:

```text
tsc && vite build completed successfully
```

## 6. Notes For Review

- This branch intentionally focuses on Member C frontend responsibilities from `三人分工(4).md`.
- Root-level original generated images are not required by the app and are not included in the staged frontend asset set.
- The learning resource page currently has a product-ready shell and backend-driven status/version hooks; full rendering of `document`, `mindmap`, `exercises`, `code_cases`, and `debate_report` can be expanded in the next frontend iteration.
