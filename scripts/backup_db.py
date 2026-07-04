"""SQLite 数据库备份与恢复脚本

用法：
    python scripts/backup_db.py backup [--db PATH] [--output PATH]
    python scripts/backup_db.py restore [--db PATH] [--backup PATH]

默认操作当前工作目录下的 eduhive.db（与 backend/.env 中 DATABASE_URL 一致）。
"""
import argparse
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path


def _resolve_db_path(db_path: str | None) -> Path:
    if db_path:
        return Path(db_path).resolve()
    # 优先从环境变量读取，否则使用当前目录的 eduhive.db
    env_url = os.environ.get("DATABASE_URL", "")
    if env_url.startswith("sqlite:///"):
        # sqlite:///./eduhive.db -> ./eduhive.db
        relative = env_url.replace("sqlite:///", "")
        return Path(relative).resolve()
    return Path("eduhive.db").resolve()


def _default_backup_name(db_path: Path) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{db_path.stem}_backup_{timestamp}{db_path.suffix}"


def backup(db_path: Path, output: Path | None) -> Path:
    if not db_path.exists():
        raise FileNotFoundError(f"数据库文件不存在: {db_path}")
    if output is None:
        output = db_path.parent / _default_backup_name(db_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(db_path, output)
    return output


def restore(db_path: Path, backup_path: Path) -> Path:
    if not backup_path.exists():
        raise FileNotFoundError(f"备份文件不存在: {backup_path}")
    # 如果目标数据库存在，先创建一个临时保护备份
    if db_path.exists():
        protect = db_path.parent / f"{db_path.stem}_pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}{db_path.suffix}"
        shutil.copy2(db_path, protect)
        print(f"已创建恢复前保护备份: {protect}")
    shutil.copy2(backup_path, db_path)
    return db_path


def main() -> int:
    parser = argparse.ArgumentParser(description="EduHive SQLite 数据库备份/恢复")
    sub = parser.add_subparsers(dest="command", required=True)

    backup_parser = sub.add_parser("backup", help="备份数据库")
    backup_parser.add_argument("--db", help="数据库文件路径")
    backup_parser.add_argument("--output", help="备份文件输出路径")

    restore_parser = sub.add_parser("restore", help="恢复数据库")
    restore_parser.add_argument("--db", help="数据库文件路径")
    restore_parser.add_argument("--backup", required=True, help="备份文件路径")

    args = parser.parse_args()
    db_path = _resolve_db_path(args.db)

    if args.command == "backup":
        output = Path(args.output) if args.output else None
        result = backup(db_path, output)
        print(f"备份成功: {db_path} -> {result}")
        return 0

    if args.command == "restore":
        backup_path = Path(args.backup).resolve()
        result = restore(db_path, backup_path)
        print(f"恢复成功: {backup_path} -> {result}")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
