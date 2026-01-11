"""
数据库升级脚本
添加数据分析所需的字段
执行方式: python upgrade_database.py
"""
import sqlite3
import os
from datetime import datetime

DB_PATH = "gesture_logs.db"

def upgrade_database():
    """升级数据库表结构"""
    
    print("=" * 60)
    print("数据库升级脚本")
    print("=" * 60)
    
    if not os.path.exists(DB_PATH):
        print(f"❌ 数据库文件不存在: {DB_PATH}")
        return False
    
    # 备份数据库
    backup_path = f"gesture_logs_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    try:
        import shutil
        shutil.copy2(DB_PATH, backup_path)
        print(f"✅ 数据库已备份到: {backup_path}")
    except Exception as e:
        print(f"⚠️  备份失败，但继续升级: {e}")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 检查表结构
    cursor.execute("PRAGMA table_info(logs)")
    columns = [col[1] for col in cursor.fetchall()]
    print(f"\n当前字段: {', '.join(columns)}")
    
    # 1. 添加 response_time 字段（响应时间，单位ms）
    if 'response_time' not in columns:
        print("\n[1/4] 添加 response_time 字段...")
        try:
            cursor.execute("ALTER TABLE logs ADD COLUMN response_time REAL DEFAULT 0.0")
            print("✅ response_time 字段添加成功")
        except Exception as e:
            print(f"⚠️  response_time 字段可能已存在: {e}")
    else:
        print("\n[1/4] ✓ response_time 字段已存在")
    
    # 2. 添加 session_id 字段（会话ID）
    if 'session_id' not in columns:
        print("\n[2/4] 添加 session_id 字段...")
        try:
            cursor.execute("ALTER TABLE logs ADD COLUMN session_id TEXT DEFAULT 'default'")
            print("✅ session_id 字段添加成功")
        except Exception as e:
            print(f"⚠️  session_id 字段可能已存在: {e}")
    else:
        print("\n[2/4] ✓ session_id 字段已存在")
    
    # 3. 添加 is_correct 字段（是否识别正确，用于准确率计算）
    if 'is_correct' not in columns:
        print("\n[3/4] 添加 is_correct 字段...")
        try:
            cursor.execute("ALTER TABLE logs ADD COLUMN is_correct INTEGER DEFAULT 1")
            print("✅ is_correct 字段添加成功")
        except Exception as e:
            print(f"⚠️  is_correct 字段可能已存在: {e}")
    else:
        print("\n[3/4] ✓ is_correct 字段已存在")
    
    # 4. 创建新索引以优化查询
    print("\n[4/4] 创建/更新索引...")
    try:
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_gesture 
            ON logs(gesture)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_session 
            ON logs(session_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_created_at 
            ON logs(created_at)
        """)
        print("✅ 索引创建/更新成功")
    except Exception as e:
        print(f"⚠️  索引创建警告: {e}")
    
    conn.commit()
    
    # 验证升级
    print("\n" + "=" * 60)
    print("验证升级结果")
    print("=" * 60)
    cursor.execute("PRAGMA table_info(logs)")
    columns_after = cursor.fetchall()
    
    print("\n升级后的表结构:")
    print(f"{'字段名':<20} {'类型':<15} {'非空':<8} {'默认值':<15}")
    print("-" * 60)
    for col in columns_after:
        col_name = col[1]
        col_type = col[2]
        not_null = "YES" if col[3] else "NO"
        default = str(col[4]) if col[4] else "NULL"
        print(f"{col_name:<20} {col_type:<15} {not_null:<8} {default:<15}")
    
    # 统计当前数据
    cursor.execute("SELECT COUNT(*) FROM logs")
    total_logs = cursor.fetchone()[0]
    
    print("\n" + "=" * 60)
    print(f"✅ 数据库升级完成！")
    print(f"   当前日志总数: {total_logs}")
    print(f"   备份文件: {backup_path}")
    print("=" * 60)
    
    conn.close()
    return True

if __name__ == "__main__":
    try:
        success = upgrade_database()
        if success:
            print("\n🎉 升级成功！可以启动后端服务了。")
        else:
            print("\n❌ 升级失败，请检查错误信息。")
    except Exception as e:
        print(f"\n❌ 升级过程出错: {e}")
        import traceback
        traceback.print_exc()