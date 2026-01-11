"""
配置管理模块 - v2.3.0
支持环境变量和默认配置
新增：数据分析功能配置
"""
from pydantic_settings import BaseSettings 
from pydantic import Field
from typing import Dict, Optional
import os


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用基础配置
    app_title: str = Field(default="Gesture Control Backend", env="APP_TITLE")
    app_version: str = Field(default="2.3.0", env="APP_VERSION")  # ✅ 更新版本号
    debug: bool = Field(default=False, env="DEBUG")
    
    # 数据库配置
    db_path: str = Field(default="gesture_logs.db", env="DB_PATH")
    
    # 文件存储配置
    output_dir: str = Field(default="outputs", env="OUTPUT_DIR")
    max_file_size: int = Field(default=10 * 1024 * 1024, env="MAX_FILE_SIZE")
    
    # CORS配置
    cors_origins: list = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        env="CORS_ORIGINS"
    )
    
    # 手势识别配置
    debounce_sec: float = Field(default=0.5, env="DEBOUNCE_SEC")
    max_fps: int = Field(default=30, env="MAX_FPS")
    
    # 性能配置
    log_retention_days: int = Field(default=30, env="LOG_RETENTION_DAYS")
    max_log_entries: int = Field(default=10000, env="MAX_LOG_ENTRIES")
    
    # ✅ 新增：数据分析配置
    analytics_cache_seconds: int = Field(default=60, env="ANALYTICS_CACHE_SECONDS")
    default_accuracy_threshold: float = Field(default=0.85, env="ACCURACY_THRESHOLD")
    
    # 手势映射配置（精简版）
    default_gesture_mapping: Dict[str, str] = {
        "THUMBS_UP": "GOOD",
        "SIX": "SIX_GESTURE",
        "PALM": "OPEN_HAND",
        "FIST": "CLOSED_HAND",
        "POINT": "POINT_FORWARD",
        "V": "VICTORY",
        "OK": "OK_SIGN",
        "UNKNOWN": "NO_GESTURE",
    }
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# 创建全局配置实例
settings = Settings()


def get_settings() -> Settings:
    """获取配置实例"""
    return settings


# 运行时配置(可动态修改)
class RuntimeConfig:
    """运行时可修改的配置"""
    
    def __init__(self):
        self.debounce_sec: float = settings.debounce_sec
        self.mapping: Dict[str, str] = settings.default_gesture_mapping.copy()
        self.enabled: bool = True
    
    def update_debounce(self, value: float) -> None:
        """更新防抖时间"""
        if 0.1 <= value <= 2.0:
            self.debounce_sec = value
    
    def update_mapping(self, new_mapping: Dict[str, str]) -> None:
        """更新手势映射"""
        self.mapping.update(new_mapping)
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "debounce_sec": self.debounce_sec,
            "mapping": self.mapping,
            "enabled": self.enabled,
        }


# 创建全局运行时配置
runtime_config = RuntimeConfig()