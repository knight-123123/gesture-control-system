"""
手势识别控制系统后端服务
版本: 2.2.0
优化内容:
- 异步数据库操作
- 性能指标统计
- 完善错误处理
- 配置分离
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
        if len(self.fps_history) > 100:  # 只保留最近100条
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
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time REAL NOT NULL,
                gesture TEXT NOT NULL,
                command TEXT NOT NULL,
                score REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 创建索引加速查询
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_time 
            ON logs(time DESC)
        """)
        
        conn.commit()
        conn.close()
        logger.info("数据库初始化成功")
    except Exception as e:
        logger.error(f"数据库初始化失败: {e}")
        raise


async def insert_log_async(t: float, gesture: str, command: str, score: float):
    """异步插入日志"""
    try:
        await asyncio.to_thread(_insert_log_sync, t, gesture, command, score)
    except Exception as e:
        logger.error(f"日志插入失败: {e}")
        app_state.error_count += 1


def _insert_log_sync(t: float, gesture: str, command: str, score: float):
    """同步插入日志(在线程中执行)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO logs(time, gesture, command, score) VALUES (?, ?, ?, ?)",
        (t, gesture, command, score)
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
    """同步获取日志(在线程中执行)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT time, gesture, command, score FROM logs ORDER BY id DESC LIMIT ?",
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
    # 启动时
    logger.info(f"启动 {settings.app_title} v{settings.app_version}")
    init_database()
    
    # 启动后台任务：定期清理日志
    asyncio.create_task(periodic_cleanup())
    
    yield
    
    # 关闭时
    logger.info("应用正在关闭...")


async def periodic_cleanup():
    """定期清理任务"""
    while True:
        await asyncio.sleep(3600)  # 每小时执行一次
        await cleanup_old_logs()


# ==================== FastAPI 应用 ====================
app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    lifespan=lifespan
)

# CORS配置
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


# ==================== API 端点 ====================
@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """健康检查(详细版)"""
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
    
    logger.info(f"配置已更新: debounce={runtime_config.debounce_sec}")
    return {"ok": True, "config": runtime_config.to_dict()}


@app.get("/api/mapping")
async def get_mapping():
    """获取手势映射"""
    return runtime_config.mapping


@app.post("/api/gesture/event")
async def post_gesture(ev: GestureEvent, background_tasks: BackgroundTasks):
    """
    接收手势事件
    优化:
    - 异步日志写入
    - 防抖逻辑优化
    - 错误处理
    """
    try:
        now = time.time()
        gesture = (ev.gesture or "UNKNOWN").upper()
        
        # 获取映射命令
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
        
        # 更新触发状态
        app_state.last_trigger = {"gesture": gesture, "t": now}
        
        # 更新模式
        app_state.update_mode(command)
        app_state.update_gesture(gesture, command)
        
        # 异步写入日志
        background_tasks.add_task(
            insert_log_async, now, gesture, command, float(ev.score)
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
    """
    获取日志记录
    优化: 异步查询
    """
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
    writer.writerow(["time", "gesture", "command", "score"])
    
    for log in reversed(logs):  # 时间正序
        writer.writerow([log["time"], log["gesture"], log["command"], log["score"]])
    
    csv_bytes = output.getvalue().encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gesture_logs.csv"}
    )


@app.post("/api/frame/preprocess")
async def preprocess_frame(file: UploadFile = File(...)):
    """
    图像预处理端点
    优化:
    - 文件大小验证
    - 错误处理
    - 异步处理
    """
    try:
        # 读取文件
        contents = await file.read()
        
        # 文件大小检查
        if len(contents) > settings.max_file_size:
            raise HTTPException(
                status_code=413,
                detail=f"文件过大,最大允许 {settings.max_file_size/(1024*1024):.1f}MB"
            )
        
        # 解码图像
        arr = np.frombuffer(contents, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="无法解码图像")
        
        # 生成文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ms = int((time.time() * 1000) % 1000)
        base_name = f"{timestamp}_{ms}"
        
        orig_path = os.path.join(settings.output_dir, f"{base_name}_orig.jpg")
        proc_path = os.path.join(settings.output_dir, f"{base_name}_proc.jpg")
        
        # 保存原图
        cv2.imwrite(orig_path, img)
        
        # 预处理流程
        h, w = img.shape[:2]
        
        # 1. Resize
        target_w = 640
        scale = target_w / max(w, 1)
        new_size = (int(w * scale), int(h * scale))
        resized = cv2.resize(img, new_size, interpolation=cv2.INTER_AREA)
        
        # 2. 转灰度
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        
        # 3. 高斯模糊降噪
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # 4. CLAHE对比度增强
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(blurred)
        
        # 5. Canny边缘检测
        edges = cv2.Canny(enhanced, 60, 140)
        
        # 6. 转回3通道保存
        processed = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
        cv2.imwrite(proc_path, processed)
        
        # 记录日志
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