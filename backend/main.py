"""
手势识别控制系统后端服务
版本: 2.3.0
新增功能:
- 数据分析API端点
- 手势识别准确率统计
- 使用频率分析
- 响应时间分析
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import time
import sqlite3
import csv
import io
import os
import asyncio
from datetime import datetime, timedelta
import logging

import numpy as np
import cv2

from config import settings, runtime_config

# ==================== 日志配置 ====================
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== 数据模型 ====================
class GestureEvent(BaseModel):
    """手势事件模型"""
    gesture: str = Field(..., description="手势名称")
    score: float = Field(default=1.0, ge=0.0, le=1.0, description="置信度")
    ts: Optional[float] = Field(default=None, description="时间戳")
    session_id: Optional[str] = Field(default="default", description="会话ID")
    response_time: Optional[float] = Field(default=0.0, description="响应时间(ms)")


class ConfigUpdate(BaseModel):
    """配置更新模型"""
    debounce_sec: Optional[float] = Field(None, ge=0.1, le=2.0)
    mapping: Optional[Dict[str, str]] = None


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str
    version: str
    uptime: float
    db_status: str
    total_logs: int
    fps_avg: float


# ==================== 全局状态 ====================
class AppState:
    """应用状态管理"""
    
    def __init__(self):
        self.start_time = time.time()
        self.mode = "IDLE"
        self.last_gesture = "-"
        self.last_command = "-"
        self.updated_at = time.time()
        self.last_trigger = {"gesture": None, "t": 0.0}
        
        # 性能统计
        self.total_requests = 0
        self.fps_history = []
        self.error_count = 0
    
    def update_gesture(self, gesture: str, command: str):
        """更新手势状态"""
        self.last_gesture = gesture
        self.last_command = command
        self.updated_at = time.time()
        self.total_requests += 1
    
    def update_mode(self, command: str):
        """根据命令更新模式"""
        if command == "START":
            self.mode = "RUNNING"
        elif command == "STOP":
            self.mode = "STOPPED"
    
    def get_uptime(self) -> float:
        """获取运行时间"""
        return time.time() - self.start_time
    
    def get_avg_fps(self) -> float:
        """获取平均FPS"""
        if not self.fps_history:
            return 0.0
        return sum(self.fps_history) / len(self.fps_history)
    
    def add_fps(self, fps: float):
        """添加FPS记录"""
        self.fps_history.append(fps)
        if len(self.fps_history) > 100:
            self.fps_history.pop(0)
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "mode": self.mode,
            "last_gesture": self.last_gesture,
            "last_command": self.last_command,
            "updated_at": self.updated_at,
            "uptime": self.get_uptime(),
            "total_requests": self.total_requests,
        }


app_state = AppState()

# ==================== 数据库操作 ====================
def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """初始化数据库"""
    try:
        os.makedirs(settings.output_dir, exist_ok=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 创建表（包含所有字段）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time REAL NOT NULL,
                gesture TEXT NOT NULL,
                command TEXT NOT NULL,
                score REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                response_time REAL DEFAULT 0.0,
                session_id TEXT DEFAULT 'default',
                is_correct INTEGER DEFAULT 1
            )
        """)
        
        # 创建索引
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_gesture ON logs(gesture)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id)")
        
        conn.commit()
        conn.close()
        logger.info("数据库初始化成功")
    except Exception as e:
        logger.error(f"数据库初始化失败: {e}")
        raise


async def insert_log_async(
    t: float, 
    gesture: str, 
    command: str, 
    score: float,
    response_time: float = 0.0,
    session_id: str = "default",
    is_correct: int = 1
):
    """异步插入日志"""
    try:
        await asyncio.to_thread(
            _insert_log_sync, t, gesture, command, score, 
            response_time, session_id, is_correct
        )
    except Exception as e:
        logger.error(f"日志插入失败: {e}")
        app_state.error_count += 1


def _insert_log_sync(
    t: float, 
    gesture: str, 
    command: str, 
    score: float,
    response_time: float,
    session_id: str,
    is_correct: int
):
    """同步插入日志"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO logs(time, gesture, command, score, response_time, session_id, is_correct) 
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (t, gesture, command, score, response_time, session_id, is_correct)
    )
    conn.commit()
    conn.close()


async def get_logs_async(limit: int = 50) -> List[dict]:
    """异步获取日志"""
    try:
        return await asyncio.to_thread(_get_logs_sync, limit)
    except Exception as e:
        logger.error(f"日志查询失败: {e}")
        return []


def _get_logs_sync(limit: int) -> List[dict]:
    """同步获取日志"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM logs ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


async def cleanup_old_logs():
    """清理过期日志"""
    try:
        cutoff_time = time.time() - (settings.log_retention_days * 86400)
        await asyncio.to_thread(_cleanup_logs_sync, cutoff_time)
        logger.info("日志清理完成")
    except Exception as e:
        logger.error(f"日志清理失败: {e}")


def _cleanup_logs_sync(cutoff_time: float):
    """同步清理日志"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM logs WHERE time < ?", (cutoff_time,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    logger.info(f"清理了 {deleted} 条过期日志")


def get_log_count() -> int:
    """获取日志总数"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM logs")
        count = cursor.fetchone()[0]
        conn.close()
        return count
    except:
        return 0


# ==================== 应用生命周期 ====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info(f"启动 {settings.app_title} v{settings.app_version}")
    init_database()
    asyncio.create_task(periodic_cleanup())
    yield
    logger.info("应用正在关闭...")


async def periodic_cleanup():
    """定期清理任务"""
    while True:
        await asyncio.sleep(3600)
        await cleanup_old_logs()


# ==================== FastAPI 应用 ====================
app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== 异常处理 ====================
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """全局异常处理"""
    logger.error(f"未处理的异常: {exc}", exc_info=True)
    app_state.error_count += 1
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": "Internal server error"}
    )


# ==================== 基础API端点 ====================
@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """健康检查"""
    try:
        log_count = get_log_count()
        db_status = "ok"
    except:
        log_count = 0
        db_status = "error"
    
    return HealthResponse(
        status="healthy" if db_status == "ok" else "degraded",
        version=settings.app_version,
        uptime=app_state.get_uptime(),
        db_status=db_status,
        total_logs=log_count,
        fps_avg=app_state.get_avg_fps()
    )


@app.get("/api/config")
async def get_config():
    """获取当前配置"""
    return runtime_config.to_dict()


@app.post("/api/config")
async def update_config(cfg: ConfigUpdate):
    """更新配置"""
    if cfg.debounce_sec is not None:
        runtime_config.update_debounce(cfg.debounce_sec)
    
    if cfg.mapping is not None:
        new_mapping = {str(k).upper(): str(v) for k, v in cfg.mapping.items()}
        runtime_config.update_mapping(new_mapping)
    
    logger.info(f"配置已更新")
    return {"ok": True, "config": runtime_config.to_dict()}


@app.get("/api/mapping")
async def get_mapping():
    """获取手势映射"""
    return runtime_config.mapping


@app.post("/api/gesture/event")
async def post_gesture(ev: GestureEvent, background_tasks: BackgroundTasks):
    """接收手势事件"""
    try:
        now = time.time()
        gesture = (ev.gesture or "UNKNOWN").upper()
        command = runtime_config.mapping.get(gesture, "NONE")
        debounce_sec = runtime_config.debounce_sec
        
        # 防抖检查
        last_trigger = app_state.last_trigger
        if last_trigger["gesture"] == gesture and (now - last_trigger["t"]) < debounce_sec:
            return {
                "accepted": False,
                "reason": "debounced",
                "command": command,
                "state": app_state.to_dict()
            }
        
        app_state.last_trigger = {"gesture": gesture, "t": now}
        app_state.update_mode(command)
        app_state.update_gesture(gesture, command)
        
        # 异步写入日志（包含响应时间和会话ID）
        background_tasks.add_task(
            insert_log_async, 
            now, 
            gesture, 
            command, 
            float(ev.score),
            float(ev.response_time or 0.0),
            str(ev.session_id or "default"),
            1  # is_correct 默认为1
        )
        
        return {
            "accepted": True,
            "command": command,
            "state": app_state.to_dict()
        }
    
    except Exception as e:
        logger.error(f"处理手势事件失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/status")
async def get_status():
    """获取系统状态"""
    return app_state.to_dict()


@app.get("/api/logs")
async def get_logs(limit: int = 50):
    """获取日志记录"""
    limit = max(1, min(500, limit))
    logs = await get_logs_async(limit)
    return logs


@app.get("/api/logs/export.csv")
async def export_csv(limit: int = 200):
    """导出CSV格式日志"""
    limit = max(1, min(2000, limit))
    logs = await get_logs_async(limit)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["time", "gesture", "command", "score", "response_time", "session_id"])
    
    for log in reversed(logs):
        writer.writerow([
            log.get("time", 0),
            log.get("gesture", ""),
            log.get("command", ""),
            log.get("score", 0),
            log.get("response_time", 0),
            log.get("session_id", "default")
        ])
    
    csv_bytes = output.getvalue().encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gesture_logs.csv"}
    )


# ==================== ✅ 新增：数据分析API端点 ====================

@app.get("/api/analytics/summary")
async def get_analytics_summary():
    """
    获取数据分析摘要
    返回：总体统计数据
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. 总识别次数
        cursor.execute("SELECT COUNT(*) FROM logs")
        total_count = cursor.fetchone()[0]
        
        # 2. 总体准确率
        cursor.execute("SELECT AVG(is_correct) FROM logs")
        accuracy_result = cursor.fetchone()[0]
        overall_accuracy = float(accuracy_result) if accuracy_result else 0.0
        
        # 3. 平均响应时间
        cursor.execute("SELECT AVG(response_time) FROM logs WHERE response_time > 0")
        avg_response_result = cursor.fetchone()[0]
        avg_response_time = float(avg_response_result) if avg_response_result else 0.0
        
        # 4. 平均置信度
        cursor.execute("SELECT AVG(score) FROM logs")
        avg_score_result = cursor.fetchone()[0]
        avg_confidence = float(avg_score_result) if avg_score_result else 0.0
        
        # 5. 今日统计
        today_start = time.time() - 86400
        cursor.execute("SELECT COUNT(*) FROM logs WHERE time > ?", (today_start,))
        today_count = cursor.fetchone()[0]
        
        # 6. 本周统计
        week_start = time.time() - (86400 * 7)
        cursor.execute("SELECT COUNT(*) FROM logs WHERE time > ?", (week_start,))
        week_count = cursor.fetchone()[0]
        
        # 7. 最常用的手势（TOP 3）
        cursor.execute("""
            SELECT gesture, COUNT(*) as count 
            FROM logs 
            WHERE gesture != 'UNKNOWN'
            GROUP BY gesture 
            ORDER BY count DESC 
            LIMIT 3
        """)
        top_gestures = [{"gesture": row[0], "count": row[1]} for row in cursor.fetchall()]
        
        # 8. UNKNOWN手势比例
        cursor.execute("SELECT COUNT(*) FROM logs WHERE gesture = 'UNKNOWN'")
        unknown_count = cursor.fetchone()[0]
        unknown_rate = (unknown_count / total_count * 100) if total_count > 0 else 0.0
        
        conn.close()
        
        return {
            "total_recognitions": total_count,
            "today_recognitions": today_count,
            "week_recognitions": week_count,
            "overall_accuracy": round(overall_accuracy * 100, 2),
            "avg_response_time": round(avg_response_time, 2),
            "avg_confidence": round(avg_confidence * 100, 2),
            "unknown_rate": round(unknown_rate, 2),
            "top_gestures": top_gestures,
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        logger.error(f"获取分析摘要失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/gestures")
async def get_gesture_analytics():
    """
    获取每个手势的详细统计
    返回：每个手势的识别次数、准确率、平均响应时间
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 获取每个手势的统计数据
        cursor.execute("""
            SELECT 
                gesture,
                COUNT(*) as total_count,
                AVG(is_correct) as accuracy,
                AVG(score) as avg_confidence,
                AVG(response_time) as avg_response_time,
                MIN(response_time) as min_response_time,
                MAX(response_time) as max_response_time
            FROM logs
            GROUP BY gesture
            ORDER BY total_count DESC
        """)
        
        results = []
        total_all = 0
        
        for row in cursor.fetchall():
            gesture_data = {
                "gesture": row[0],
                "count": row[1],
                "accuracy": round(float(row[2]) * 100, 2) if row[2] else 0.0,
                "avg_confidence": round(float(row[3]) * 100, 2) if row[3] else 0.0,
                "avg_response_time": round(float(row[4]), 2) if row[4] else 0.0,
                "min_response_time": round(float(row[5]), 2) if row[5] else 0.0,
                "max_response_time": round(float(row[6]), 2) if row[6] else 0.0,
            }
            results.append(gesture_data)
            total_all += row[1]
        
        # 计算每个手势的使用频率百分比
        for item in results:
            item["percentage"] = round((item["count"] / total_all * 100), 2) if total_all > 0 else 0.0
        
        conn.close()
        
        return {
            "gestures": results,
            "total_count": total_all,
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        logger.error(f"获取手势分析失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/timeline")
async def get_timeline_analytics(hours: int = 24):
    """
    获取时间线数据
    参数：hours - 统计最近几小时的数据（默认24小时）
    返回：按小时统计的识别次数
    """
    try:
        hours = max(1, min(168, hours))  # 限制在1-168小时（7天）
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 计算时间范围
        end_time = time.time()
        start_time = end_time - (hours * 3600)
        
        # 按小时分组统计
        cursor.execute("""
            SELECT 
                CAST((time - ?) / 3600 AS INTEGER) as hour_bucket,
                COUNT(*) as count,
                AVG(score) as avg_confidence,
                AVG(response_time) as avg_response_time
            FROM logs
            WHERE time >= ? AND time <= ?
            GROUP BY hour_bucket
            ORDER BY hour_bucket
        """, (start_time, start_time, end_time))
        
        results = []
        for row in cursor.fetchall():
            hour_offset = row[0]
            timestamp = start_time + (hour_offset * 3600)
            results.append({
                "timestamp": int(timestamp),
                "datetime": datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:00"),
                "count": row[1],
                "avg_confidence": round(float(row[2]) * 100, 2) if row[2] else 0.0,
                "avg_response_time": round(float(row[3]), 2) if row[3] else 0.0
            })
        
        conn.close()
        
        return {
            "timeline": results,
            "hours": hours,
            "start_time": int(start_time),
            "end_time": int(end_time)
        }
    
    except Exception as e:
        logger.error(f"获取时间线分析失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/accuracy")
async def get_accuracy_analytics():
    """
    获取准确率分析
    返回：每个手势的准确率、错误类型分析
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. 每个手势的准确率
        cursor.execute("""
            SELECT 
                gesture,
                COUNT(*) as total,
                SUM(is_correct) as correct,
                AVG(score) as avg_confidence
            FROM logs
            WHERE gesture != 'UNKNOWN'
            GROUP BY gesture
        """)
        
        gesture_accuracy = []
        for row in cursor.fetchall():
            total = row[1]
            correct = row[2]
            accuracy = (correct / total * 100) if total > 0 else 0.0
            
            gesture_accuracy.append({
                "gesture": row[0],
                "total": total,
                "correct": correct,
                "incorrect": total - correct,
                "accuracy": round(accuracy, 2),
                "avg_confidence": round(float(row[3]) * 100, 2) if row[3] else 0.0
            })
        
        # 2. 置信度分布（分组统计）
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN score >= 0.9 THEN '90-100%'
                    WHEN score >= 0.8 THEN '80-90%'
                    WHEN score >= 0.7 THEN '70-80%'
                    WHEN score >= 0.6 THEN '60-70%'
                    ELSE '<60%'
                END as confidence_range,
                COUNT(*) as count
            FROM logs
            GROUP BY confidence_range
            ORDER BY confidence_range DESC
        """)
        
        confidence_distribution = [
            {"range": row[0], "count": row[1]} 
            for row in cursor.fetchall()
        ]
        
        # 3. 响应时间分布
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN response_time < 50 THEN '<50ms'
                    WHEN response_time < 100 THEN '50-100ms'
                    WHEN response_time < 200 THEN '100-200ms'
                    WHEN response_time < 500 THEN '200-500ms'
                    ELSE '>500ms'
                END as response_range,
                COUNT(*) as count
            FROM logs
            WHERE response_time > 0
            GROUP BY response_range
        """)
        
        response_distribution = [
            {"range": row[0], "count": row[1]} 
            for row in cursor.fetchall()
        ]
        
        conn.close()
        
        return {
            "gesture_accuracy": gesture_accuracy,
            "confidence_distribution": confidence_distribution,
            "response_distribution": response_distribution,
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        logger.error(f"获取准确率分析失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/performance")
async def get_performance_metrics():
    """
    获取性能指标
    返回：响应时间统计、FPS统计、系统负载
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 响应时间统计
        cursor.execute("""
            SELECT 
                AVG(response_time) as avg_time,
                MIN(response_time) as min_time,
                MAX(response_time) as max_time,
                COUNT(*) as sample_count
            FROM logs
            WHERE response_time > 0
        """)
        row = cursor.fetchone()
        
        response_stats = {
            "avg_response_time": round(float(row[0]), 2) if row[0] else 0.0,
            "min_response_time": round(float(row[1]), 2) if row[1] else 0.0,
            "max_response_time": round(float(row[2]), 2) if row[2] else 0.0,
            "sample_count": row[3]
        }
        
        # 最近1小时的响应时间趋势
        one_hour_ago = time.time() - 3600
        cursor.execute("""
            SELECT AVG(response_time), COUNT(*)
            FROM logs
            WHERE time > ? AND response_time > 0
        """, (one_hour_ago,))
        row = cursor.fetchone()
        
        recent_stats = {
            "recent_avg_response_time": round(float(row[0]), 2) if row[0] else 0.0,
            "recent_sample_count": row[1]
        }
        
        conn.close()
        
        return {
            "response_time": response_stats,
            "recent_performance": recent_stats,
            "system_uptime": round(app_state.get_uptime(), 2),
            "total_requests": app_state.total_requests,
            "error_count": app_state.error_count,
            "avg_fps": round(app_state.get_avg_fps(), 2),
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        logger.error(f"获取性能指标失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== OpenCV预处理端点 ====================
@app.post("/api/frame/preprocess")
async def preprocess_frame(file: UploadFile = File(...)):
    """图像预处理端点"""
    try:
        contents = await file.read()
        
        if len(contents) > settings.max_file_size:
            raise HTTPException(
                status_code=413,
                detail=f"文件过大"
            )
        
        arr = np.frombuffer(contents, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="无法解码图像")
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ms = int((time.time() * 1000) % 1000)
        base_name = f"{timestamp}_{ms}"
        
        orig_path = os.path.join(settings.output_dir, f"{base_name}_orig.jpg")
        proc_path = os.path.join(settings.output_dir, f"{base_name}_proc.jpg")
        
        cv2.imwrite(orig_path, img)
        
        h, w = img.shape[:2]
        target_w = 640
        scale = target_w / max(w, 1)
        new_size = (int(w * scale), int(h * scale))
        resized = cv2.resize(img, new_size, interpolation=cv2.INTER_AREA)
        
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(blurred)
        edges = cv2.Canny(enhanced, 60, 140)
        processed = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
        cv2.imwrite(proc_path, processed)
        
        await insert_log_async(time.time(), "FRAME", "PREPROCESS", 1.0)
        
        return {
            "ok": True,
            "pipeline": "resize → gray → gaussian → clahe → canny",
            "original_file": orig_path.replace("\\", "/"),
            "processed_file": proc_path.replace("\\", "/"),
            "original_size": [h, w],
            "processed_size": [new_size[1], new_size[0]],
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"图像预处理失败: {e}")
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")


@app.get("/api/stats")
async def get_statistics():
    """获取统计信息"""
    return {
        "total_requests": app_state.total_requests,
        "error_count": app_state.error_count,
        "uptime_seconds": app_state.get_uptime(),
        "avg_fps": app_state.get_avg_fps(),
        "total_logs": get_log_count(),
    }


# ==================== 启动配置 ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=settings.debug,
        log_level="info"
    )