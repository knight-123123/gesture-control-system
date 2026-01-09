from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import time
import sqlite3
import csv
import io
import os

import numpy as np
import cv2

APP_TITLE = "Gesture Control Backend"
APP_VERSION = "2.1"

DB_PATH = "gesture_logs.db"
OUTPUT_DIR = "outputs"

app = FastAPI(title=APP_TITLE, version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GestureEvent(BaseModel):
    gesture: str
    score: float = 1.0
    ts: Optional[float] = None

class ConfigUpdate(BaseModel):
    debounce_sec: Optional[float] = None
    mapping: Optional[Dict[str, str]] = None

CONFIG: Dict[str, Any] = {
    "debounce_sec": 0.5,
    "mapping": {
        "PALM": "START",
        "FIST": "STOP",
        "OK": "CONFIRM",
        "POINT": "NEXT",
        "V": "PREV",
        "THUMBS_UP": "VOLUME_UP",
        "SIX": "VOLUME_DOWN",
        "UNKNOWN": "NONE",
    }
}

STATE = {
    "mode": "IDLE",
    "last_gesture": "-",
    "last_command": "-",
    "updated_at": time.time()
}

LAST_TRIGGER = {"gesture": None, "t": 0.0}

def db_init():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time REAL,
        gesture TEXT,
        command TEXT,
        score REAL
    )
    """)
    conn.commit()
    conn.close()

def db_insert_log(t: float, gesture: str, command: str, score: float):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO logs(time, gesture, command, score) VALUES (?, ?, ?, ?)",
        (t, gesture, command, score)
    )
    conn.commit()
    conn.close()

def db_get_logs(limit: int = 50) -> List[dict]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "SELECT time, gesture, command, score FROM logs ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = cur.fetchall()
    conn.close()
    return [{"time": r[0], "gesture": r[1], "command": r[2], "score": r[3]} for r in rows]

@app.on_event("startup")
def on_startup():
    db_init()

@app.get("/api/health")
def health():
    return {"ok": True, "time": time.time(), "version": APP_VERSION}

@app.get("/api/config")
def get_config():
    return CONFIG

@app.post("/api/config")
def update_config(cfg: ConfigUpdate):
    if cfg.debounce_sec is not None:
        CONFIG["debounce_sec"] = max(0.1, min(2.0, float(cfg.debounce_sec)))
    if cfg.mapping is not None:
        new_map = {str(k).upper(): str(v) for k, v in cfg.mapping.items()}
        CONFIG["mapping"].update(new_map)
    return {"ok": True, "config": CONFIG}

@app.get("/api/mapping")
def get_mapping():
    return CONFIG["mapping"]

@app.post("/api/gesture/event")
def post_gesture(ev: GestureEvent):
    now = time.time()
    g = (ev.gesture or "UNKNOWN").upper()

    mapping = CONFIG["mapping"]
    debounce_sec = float(CONFIG["debounce_sec"])
    cmd = mapping.get(g, "NONE")

    if LAST_TRIGGER["gesture"] == g and (now - LAST_TRIGGER["t"]) < debounce_sec:
        return {"accepted": False, "reason": "debounced", "command": cmd, "state": STATE}

    LAST_TRIGGER["gesture"] = g
    LAST_TRIGGER["t"] = now

    if cmd == "START":
        STATE["mode"] = "RUNNING"
    elif cmd == "STOP":
        STATE["mode"] = "STOPPED"

    STATE["last_gesture"] = g
    STATE["last_command"] = cmd
    STATE["updated_at"] = now

    db_insert_log(now, g, cmd, float(ev.score))
    return {"accepted": True, "command": cmd, "state": STATE}

@app.get("/api/status")
def get_status():
    return STATE

@app.get("/api/logs")
def get_logs(limit: int = 50):
    limit = max(1, min(500, limit))
    return db_get_logs(limit)

@app.get("/api/logs/export.csv")
def export_csv(limit: int = 200):
    limit = max(1, min(2000, limit))
    rows = db_get_logs(limit)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["time", "gesture", "command", "score"])
    for r in rows[::-1]:
        writer.writerow([r["time"], r["gesture"], r["command"], r["score"]])
    csv_bytes = output.getvalue().encode("utf-8-sig")
    return Response(content=csv_bytes, media_type="text/csv")

# ======================= OpenCV 预处理 / 留存接口 =======================
@app.post("/api/frame/preprocess")
async def preprocess_frame(file: UploadFile = File(...)):
    """
    接收一张图片（jpg/png），做 OpenCV 预处理，并保存原图和处理后图到 outputs/
    返回保存文件名与处理管线说明
    """
    try:
        raw = await file.read()
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return {"ok": False, "error": "cannot decode image"}

        ts = time.strftime("%Y%m%d_%H%M%S")
        ms = int((time.time() * 1000) % 1000)
        base = f"{ts}_{ms}"

        orig_path = os.path.join(OUTPUT_DIR, f"{base}_orig.jpg")
        proc_path = os.path.join(OUTPUT_DIR, f"{base}_proc.jpg")

        # 保存原图
        cv2.imwrite(orig_path, img)

        # ======== 预处理管线（你也可以按需调整） ========
        # 1) resize（保持轻量）
        h, w = img.shape[:2]
        target_w = 640
        scale = target_w / max(w, 1)
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

        # 2) BGR -> Gray
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        # 3) 降噪
        blur = cv2.GaussianBlur(gray, (5, 5), 0)

        # 4) 对比度增强（CLAHE）
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enh = clahe.apply(blur)

        # 5) 边缘（Canny）
        edges = cv2.Canny(enh, 60, 140)

        # 6) 叠成 3 通道（方便保存查看）
        proc = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

        cv2.imwrite(proc_path, proc)

        # 写入日志（sqlite）
        now = time.time()
        db_insert_log(now, "FRAME", "PREPROCESS", 1.0)

        return {
            "ok": True,
            "pipeline": "resize->gray->gaussian->clahe->canny->save",
            "original_file": orig_path.replace("\\", "/"),
            "processed_file": proc_path.replace("\\", "/"),
            "shape": [new_h, new_w],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
