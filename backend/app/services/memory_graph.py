"""内存知识图谱实现

对应需求：
- 在无 Neo4j 的运行环境（开发/测试/单机部署）中提供知识图谱能力。
- 从 data/knowledge_graph.cypher 解析知识点、依赖关系与易错点，存入内存。

主要类/函数/接口：
- MemoryGraph：GraphStore 的内存实现。
  - _load_cypher / _parse_props / _split_props / _parse_value：
    简易 Cypher 解析器，仅支持本项目用到的 CREATE 节点与关系语句。
  - get_concept / get_all_concepts / get_prerequisites：知识点查询。
  - get_learning_path：基于 BFS 计算最短学习路径。
  - check_forbidden_concepts：检测内容中是否包含未学/超纲概念。
  - get_dependency_graph：返回邻接表，供上层算法使用。

TODO:
- [已完成] 从 Cypher 文件解析 Concept、Pitfall、PREREQUISITE_OF、HAS_PITFALL。
- [已完成] 知识点查询、前置依赖、后续知识与易错点组装。
- [已完成] 基于 A* 的最优学习路径与超纲概念检测（已接入 path_planner.astar_learning_path）。
- [待完成] 当前为简易 Cypher 解析器，仅支持本项目用到的语句。
- [待完成] 支持更复杂的 Cypher 语法（属性类型、关系属性、WHERE 等）。
- [待完成] 增加更多图算法：PageRank、相似度、图嵌入。
"""
import os
import re
from typing import Dict, List, Optional, Set

from app.services.graph_store import GraphStore
from app.services.path_planner import astar_learning_path


class MemoryGraph(GraphStore):
    """内存图存储"""

    def __init__(self, cypher_path: Optional[str] = None):
        self.concepts: Dict[str, dict] = {}
        self.pitfalls: Dict[str, dict] = {}
        self.prerequisite_edges: List[dict] = []  # [{source, target, strength}]
        self.has_pitfall_edges: List[dict] = []  # [{concept, pitfall_id}]

        if cypher_path is None:
            # __file__ = backend/app/services/memory_graph.py
            # 项目根目录 = backend 的上一级，需要 4 层 dirname
            base_dir = os.path.dirname(
                os.path.dirname(
                    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                )
            )
            cypher_path = os.path.join(base_dir, "data", "knowledge_graph.cypher")

        self._load_cypher(cypher_path)

    @staticmethod
    def _split_cypher_statements(content: str) -> list:
        """按顶层分号分割 Cypher 语句，忽略字符串/括号内部的分号"""
        statements = []
        current = []
        in_string = False
        string_char = None
        depth = 0
        for ch in content:
            if in_string:
                current.append(ch)
                if ch == string_char:
                    in_string = False
            else:
                if ch in ('"', "'"):
                    in_string = True
                    string_char = ch
                    current.append(ch)
                elif ch in "([":
                    depth += 1
                    current.append(ch)
                elif ch in ")]":
                    depth -= 1
                    current.append(ch)
                elif ch == ";" and depth == 0:
                    stmt = "".join(current).strip()
                    if stmt:
                        statements.append(stmt)
                    current = []
                else:
                    current.append(ch)
        if current:
            stmt = "".join(current).strip()
            if stmt:
                statements.append(stmt)
        return statements

    def _load_cypher(self, path: str):
        """简易 Cypher 解析器：只解析本项目中用到的语句"""
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        statements = self._split_cypher_statements(content)

        for stmt in statements:
            # 解析 CREATE (:Concept { ... })
            if "CREATE (:Concept" in stmt:
                match = re.search(r"CREATE \(:Concept\s*\{(.*)\}\s*\)", stmt, re.DOTALL)
                if match:
                    props_text = match.group(1)
                    props = self._parse_props(props_text)
                    name = props.get("name")
                    if name:
                        self.concepts[name] = props

            # 解析 CREATE (:Pitfall { ... })
            elif "CREATE (:Pitfall" in stmt:
                match = re.search(r"CREATE \(:Pitfall\s*\{(.*)\}\s*\)", stmt, re.DOTALL)
                if match:
                    props_text = match.group(1)
                    props = self._parse_props(props_text)
                    pid = props.get("id")
                    if pid:
                        self.pitfalls[pid] = props

            # 解析 MATCH ... CREATE (a)-[:PREREQUISITE_OF {strength: x}]->(b)
            elif "PREREQUISITE_OF" in stmt and "CREATE" in stmt:
                src_match = re.search(r"\(a:Concept\s*\{name:\s*['\"]([^'\"]+)['\"]\}", stmt)
                tgt_match = re.search(r"\(b:Concept\s*\{name:\s*['\"]([^'\"]+)['\"]\}", stmt)
                strength_match = re.search(r"\{strength:\s*([\d.]+)\}", stmt)
                if src_match and tgt_match:
                    self.prerequisite_edges.append({
                        "source": src_match.group(1),
                        "target": tgt_match.group(1),
                        "strength": float(strength_match.group(1)) if strength_match else 0.5,
                    })

            # 解析 MATCH ... CREATE (c)-[:HAS_PITFALL]->(p)
            elif "HAS_PITFALL" in stmt and "CREATE" in stmt:
                c_match = re.search(r"\(c:Concept\s*\{name:\s*['\"]([^'\"]+)['\"]\}", stmt)
                p_match = re.search(r"\(p:Pitfall\s*\{id:\s*['\"]([^'\"]+)['\"]\}", stmt)
                if c_match and p_match:
                    self.has_pitfall_edges.append({
                        "concept": c_match.group(1),
                        "pitfall_id": p_match.group(1),
                    })

    def _parse_props(self, text: str) -> dict:
        """解析 Cypher 属性对象 {key: value, ...}

        支持 string、number、list of string。
        """
        props = {}
        tokens = self._split_props(text)
        for token in tokens:
            if ":" not in token:
                continue
            key, value = token.split(":", 1)
            key = key.strip().strip('"').strip("'")
            value = value.strip()
            props[key] = self._parse_value(value)
        return props

    def _split_props(self, text: str) -> List[str]:
        """按顶层逗号分割属性"""
        result = []
        current = []
        depth = 0
        in_string = False
        string_char = None
        for ch in text:
            if in_string:
                current.append(ch)
                if ch == string_char:
                    in_string = False
            else:
                if ch in ('"', "'"):
                    in_string = True
                    string_char = ch
                    current.append(ch)
                elif ch == "[":
                    depth += 1
                    current.append(ch)
                elif ch == "]":
                    depth -= 1
                    current.append(ch)
                elif ch == "," and depth == 0:
                    result.append("".join(current).strip())
                    current = []
                else:
                    current.append(ch)
        if current:
            result.append("".join(current).strip())
        return result

    def _parse_value(self, value: str):
        """解析单个属性值"""
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            return value[1:-1]
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if not inner:
                return []
            items = self._split_props(inner)
            return [self._parse_value(item) for item in items]
        try:
            if "." in value:
                return float(value)
            return int(value)
        except ValueError:
            return value

    def init_schema(self) -> None:
        pass

    def close(self) -> None:
        pass

    def get_concept(self, name: str) -> Optional[dict]:
        concept = self.concepts.get(name)
        if not concept:
            return None
        result = dict(concept)
        result["prerequisites"] = self.get_prerequisites(name)
        result["next_concepts"] = self._get_next_concepts(name)
        result["pitfalls"] = self._get_pitfalls(name)
        return result

    def get_all_concepts(self) -> List[dict]:
        return [
            {
                "name": name,
                "module": c.get("module", "未分类"),
                "difficulty": c.get("difficulty", 3),
                "description": c.get("description", ""),
                "next_concepts": self._get_next_concepts(name),
            }
            for name, c in self.concepts.items()
        ]

    def get_prerequisites(self, name: str) -> List[str]:
        return [e["source"] for e in self.prerequisite_edges if e["target"] == name]

    def _get_next_concepts(self, name: str) -> List[str]:
        return [e["target"] for e in self.prerequisite_edges if e["source"] == name]

    def _get_pitfalls(self, name: str) -> List[dict]:
        pids = [e["pitfall_id"] for e in self.has_pitfall_edges if e["concept"] == name]
        return [dict(self.pitfalls[pid]) for pid in pids if pid in self.pitfalls]

    def get_dependency_edges(self) -> List[dict]:
        """返回内存图中的所有 PREREQUISITE_OF 边，附带 strength"""
        return [
            {
                "source": e["source"],
                "target": e["target"],
                "strength": e.get("strength", 0.8),
            }
            for e in self.prerequisite_edges
        ]

    def get_learning_path(self, from_concepts: List[str], to_concept: str) -> List[str]:
        """基于 A* 算法计算最优学习路径"""
        edges = self.get_dependency_edges()
        difficulties = {name: c.get("difficulty", 3) for name, c in self.concepts.items()}
        return astar_learning_path(edges, difficulties, from_concepts, to_concept)

    def _bfs(self, start: str, goal: str) -> Optional[List[str]]:
        """从 start 沿 PREREQUISITE_OF 正向搜索到 goal"""
        from collections import deque

        queue = deque([[start]])
        visited = {start}
        while queue:
            path = queue.popleft()
            current = path[-1]
            if current == goal:
                return path
            for e in self.prerequisite_edges:
                if e["source"] == current and e["target"] not in visited:
                    visited.add(e["target"])
                    queue.append(path + [e["target"]])
        return None

    def _reverse_path(self, goal: str) -> Optional[List[str]]:
        """从 goal 逆向依赖链返回完整学习序列"""
        from collections import deque

        queue = deque([[goal]])
        visited = {goal}
        while queue:
            path = queue.popleft()
            current = path[-1]
            pres = [e["source"] for e in self.prerequisite_edges if e["target"] == current]
            if not pres:
                return list(reversed(path))
            for pre in pres:
                if pre not in visited:
                    visited.add(pre)
                    queue.append(path + [pre])
        return None

    # 基础通用概念白名单，教学中顺带提及不应视为超纲
    _BASIC_WHITELIST = {
        "变量", "赋值", "数据类型", "字符串", "数字", "整数", "浮点数",
        "布尔值", "列表", "元组", "字典", "集合", "条件语句",
        "循环", "for", "while", "函数", "参数", "返回值", "模块",
        "导入", "异常", "错误", "输入输出", "注释",
    }

    def check_forbidden_concepts(self, content: str, target_concept: str) -> List[str]:
        """检查内容中是否包含超纲概念

        策略：只允许提及当前知识点及其前置知识；
        如果内容中出现了当前知识点的后续知识（即学生还没学过的），则视为超纲。
        基础通用概念（如列表、字符串）会被过滤，避免误报。
        """
        allowed = set(self.get_prerequisites(target_concept))
        allowed.add(target_concept)
        # 后续知识：学生尚未学习，教学中应尽量避免深入讲解
        future_concepts = set(self._get_next_concepts(target_concept))

        forbidden = []
        for name in future_concepts:
            if name in self._BASIC_WHITELIST:
                continue
            if name in content:
                forbidden.append(name)
        return forbidden

    def get_dependency_graph(self) -> Dict[str, Set[str]]:
        """返回邻接表：concept -> set(前置知识)"""
        graph: Dict[str, Set[str]] = {name: set() for name in self.concepts}
        for e in self.prerequisite_edges:
            graph[e["target"]].add(e["source"])
        return graph
