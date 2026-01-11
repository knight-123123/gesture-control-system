# 🤚 手势识别控制系统

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-green?logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/FastAPI-0.100+-blue?logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/MediaPipe-Latest-orange?logo=google" alt="MediaPipe">
  <img src="https://img.shields.io/badge/Python-3.9+-yellow?logo=python" alt="Python">
  <img src="https://img.shields.io/badge/License-MIT-red" alt="License">
</p>

<p align="center">
  基于深度学习的实时手势识别与控制系统，支持7种常用手势的精准识别，可映射为自定义控制指令。
</p>

---

## 📋 目录

- [项目简介](#-项目简介)
- [功能特性](#-功能特性)
- [系统架构](#-系统架构)
- [支持的手势](#-支持的手势)
- [技术栈](#-技术栈)
- [目录结构](#-目录结构)
- [环境要求](#-环境要求)
- [安装部署](#-安装部署)
  - [后端部署](#1-后端部署)
  - [前端部署](#2-前端部署)
- [使用指南](#-使用指南)
- [API 文档](#-api-文档)
- [配置说明](#-配置说明)
- [常见问题](#-常见问题)
- [开发指南](#-开发指南)
- [性能优化](#-性能优化)
- [更新日志](#-更新日志)
- [许可证](#-许可证)

---

## 📖 项目简介

手势识别控制系统是一个基于计算机视觉和深度学习技术的人机交互项目。系统通过摄像头实时捕捉手势图像，利用 MediaPipe Hands 进行手部关键点检测，结合自定义的规则引擎进行手势分类，最终将识别结果映射为控制指令。

### 应用场景

- 🏠 **智能家居控制** - 通过手势控制灯光、空调等设备
- 🤖 **机器人交互** - 手势指令控制机器人运动
- 🎮 **游戏控制** - 体感游戏交互
- 🖥️ **演示控制** - PPT翻页、视频播放控制
- ♿ **无障碍交互** - 为行动不便者提供替代输入方式

---

## ✨ 功能特性

### 核心功能

| 功能 | 描述 |
|------|------|
| 🎯 实时手势识别 | 支持7种手势的实时识别，延迟<50ms |
| 🔄 手势映射 | 可自定义手势到控制指令的映射关系 |
| 📊 数据分析 | 识别准确率、响应时间等多维度统计 |
| 📝 日志记录 | 完整的识别日志，支持CSV导出 |
| 🖼️ 图像预处理 | OpenCV图像增强与预处理 |
| ⚡ 防抖机制 | 智能防抖，避免误触发 |

### 技术特点

- ✅ **高精度识别** - 基于21个手部关键点的精确手势判断
- ✅ **实时性能** - 30+ FPS 实时处理能力
- ✅ **左右手支持** - 自动识别左右手并适配算法
- ✅ **多层平滑** - 投票机制 + 时间窗口平滑
- ✅ **可视化界面** - 现代化UI，实时状态展示
- ✅ **RESTful API** - 标准化接口，易于集成

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面层                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  视频显示    │  │  手势参考   │  │  日志面板    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        前端处理层                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ MediaPipe   │    │ 手势检测器   │    │ 平滑处理器   │      │
│  │   Hands     │──▶│ Detector    │──▶│  Smoother   │       │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        后端服务层                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  FastAPI    │  │  配置管理    │  │  数据分析   │          │
│  │   Server    │  │   Config    │  │  Analytics  │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                         │                                   │
│                         ▼                                   │
│                  ┌─────────────┐                            │
│                  │   SQLite    │                            │
│                  │  Database   │                            │
│                  └─────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🖐️ 支持的手势

| 手势 | 名称 | 示意 | 描述 | 默认映射指令 |
|------|------|------|------|--------------|
| 👍 | THUMBS_UP | 点赞 | 竖起大拇指，其他手指弯曲 | GOOD |
| 🤙 | SIX | 打电话 | 大拇指和小指伸开，其他弯曲 | SIX_GESTURE |
| 🖐️ | PALM | 手掌 | 五指全部张开 | OPEN_HAND |
| ✊ | FIST | 握拳 | 所有手指握紧 | CLOSED_HAND |
| 👉 | POINT | 指向 | 只有食指伸直 | POINT_FORWARD |
| ✌️ | V | 胜利 | 食指和中指伸直呈V字 | VICTORY |
| 👌 | OK | OK | 拇指和食指圈成圆形 | OK_SIGN |

### 手势识别要点

1. **THUMBS_UP** - 大拇指需明显向上，其他四指完全弯曲
2. **SIX** - 大拇指向侧边（非向上），小指伸直
3. **PALM** - 五指尽量分开，手掌正对摄像头
4. **FIST** - 握紧拳头，大拇指可以在外侧
5. **POINT** - 食指伸直指向前方，其他手指弯曲
6. **V** - 食指和中指分开呈V字，其他弯曲
7. **OK** - 拇指和食指尖端接触成圆，其他三指伸直

---

## 🛠️ 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue.js | 3.5+ | 前端框架 |
| Vite | 5.0+ | 构建工具 |
| MediaPipe Hands | Latest | 手部关键点检测 |
| Pinia | 2.0+ | 状态管理（可选） |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.9+ | 编程语言 |
| FastAPI | 0.100+ | Web框架 |
| SQLite | 3.x | 数据存储 |
| OpenCV | 4.x | 图像处理 |
| NumPy | 1.20+ | 数值计算 |

### 开发工具

| 工具 | 用途 |
|------|------|
| Anaconda | Python环境管理 |
| Git | 版本控制 |
| VS Code | 代码编辑器 |
| Postman | API测试 |

---

## 📁 目录结构

```
gesture-control-system/
├── backend/                          # 后端服务
│   ├── main.py                       # FastAPI主程序
│   ├── config.py                     # 配置管理
│   ├── upgrade_database.py           # 数据库升级脚本
│   ├── requirements.txt              # Python依赖
│   ├── gesture_logs.db               # SQLite数据库（运行时生成）
│   └── outputs/                      # 输出文件目录
│
├── frontend/                         # 前端应用
│   └── gestureControl/
│       ├── src/
│       │   ├── views/
│       │   │   └── HomeView.vue      # 主页面
│       │   ├── components/
│       │   │   ├── VideoStage.vue    # 视频组件
│       │   │   ├── ControlPanel.vue  # 控制面板
│       │   │   ├── MappingTable.vue  # 映射表格
│       │   │   ├── LogsPanel.vue     # 日志面板
│       │   │   └── OpenCvPanel.vue   # OpenCV面板
│       │   ├── composables/
│       │   │   ├── useGestureDetector.js   # 手势检测器
│       │   │   ├── useHandsCamera.js       # MediaPipe封装
│       │   │   ├── useGestureSmoother.js   # 平滑处理
│       │   │   ├── useBackendApi.js        # API调用
│       │   │   └── useFrameCapture.js      # 帧捕获
│       │   ├── router/
│       │   │   └── index.js          # 路由配置
│       │   ├── App.vue               # 根组件
│       │   └── main.js               # 入口文件
│       ├── public/                   # 静态资源
│       ├── .env                      # 环境变量
│       ├── .env.example              # 环境变量示例
│       ├── package.json              # 依赖配置
│       ├── vite.config.js            # Vite配置
│       └── index.html                # HTML入口
│
├── docs/                             # 文档目录
│   ├── API.md                        # API文档
│   ├── DEPLOYMENT.md                 # 部署文档
│   └── images/                       # 文档图片
│
├── .gitignore                        # Git忽略文件
├── README.md                         # 项目说明
└── LICENSE                           # 许可证
```

---

## 💻 环境要求

### 硬件要求

| 项目 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | Intel i5 / AMD R5 | Intel i7 / AMD R7 |
| 内存 | 8 GB | 16 GB |
| 摄像头 | 720p | 1080p |
| 显卡 | 集成显卡 | 独立显卡（GPU加速） |

### 软件要求

| 软件 | 版本要求 |
|------|----------|
| 操作系统 | Windows 10+, Ubuntu 20.04+, macOS 11+ |
| Python | 3.9 - 3.11 |
| Node.js | 18.0+ |
| npm/yarn | 最新版 |
| 浏览器 | Chrome 90+, Firefox 90+, Edge 90+ |

### 网络要求

- 首次运行需要网络连接下载 MediaPipe 模型（约 5MB）
- 后续可离线使用

---

## 🚀 安装部署

### 1. 后端部署

#### 1.1 克隆项目

```bash
# 克隆仓库
git clone https://github.com/your-username/gesture-control-system.git
cd gesture-control-system
```

#### 1.2 创建 Python 环境

**方式一：使用 Anaconda（推荐）**

```bash
# 创建虚拟环境
conda create -n gesture python=3.10 -y

# 激活环境
conda activate gesture

# 进入后端目录
cd backend
```

**方式二：使用 venv**

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv

# 激活环境
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate
```

#### 1.3 安装依赖

```bash
# 安装Python依赖
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 如果没有 requirements.txt，手动安装：
pip install fastapi uvicorn python-multipart aiofiles opencv-python numpy pydantic-settings
```

#### 1.4 配置环境变量（可选）

```bash
# 创建 .env 文件
touch .env

# 编辑配置（示例）
cat > .env << EOF
APP_TITLE=Gesture Control Backend
APP_VERSION=2.3.0
DEBUG=false
DB_PATH=gesture_logs.db
DEBOUNCE_SEC=0.5
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
EOF
```

#### 1.5 初始化数据库

```bash
# 运行数据库升级脚本（如果存在）
python upgrade_database.py
```

#### 1.6 启动后端服务

```bash
# 开发模式（自动重载）
uvicorn main:app --reload --host 0.0.0.0 --port 8001

# 生产模式
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4
```

**验证后端启动：**

- `http://127.0.0.1:8001/api/health`
- `http://127.0.0.1:8001/docs`

正常响应：
```json
{
  "status": "healthy",
  "version": "2.3.0",
  "uptime": 10.5,
  "db_status": "ok",
  "total_logs": 0,
  "fps_avg": 0
}
```

---

### 2. 前端部署

#### 2.1 安装 Node.js 依赖

```bash
# 进入前端目录
cd frontend/gestureControl

# 安装依赖（使用国内镜像加速）
npm install --registry=https://registry.npmmirror.com

# 或使用 yarn
yarn install
```

#### 2.2 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
cat > .env << EOF
# 后端API地址
VITE_BACKEND_URL=http://127.0.0.1:8001

# 是否启用调试模式
VITE_DEBUG=false
EOF
```

#### 2.3 启动前端服务

**开发模式：**

```bash
npm run dev

# 输出示例：
#   VITE v5.x.x  ready in xxx ms
#   ➜  Local:   http://localhost:5173/
#   ➜  Network: http://192.168.x.x:5173/
```

**生产构建：**

```bash
# 构建
npm run build

# 预览构建结果
npm run preview

# 部署 dist 目录到 Web 服务器
```

#### 2.4 访问应用

打开浏览器访问：`http://localhost:5173`

---

## 📖 使用指南

### 快速开始

1. **启动服务**
   - 先启动后端：`uvicorn main:app --reload --port 8001`
   - 再启动前端：`npm run dev`

2. **打开应用**
   - 浏览器访问 `http://localhost:5173`
   - 确认右上角显示"后端已连接"

3. **允许摄像头权限**
   - 浏览器会提示请求摄像头权限
   - 点击"允许"

4. **开始识别**
   - 点击"🚀 启动识别"按钮
   - 将手放到摄像头前
   - 观察识别结果

### 操作说明

| 操作 | 说明 |
|------|------|
| 启动识别 | 点击蓝色按钮启动手势识别 |
| OpenCV预处理 | 捕获当前帧并进行图像增强 |
| 导出CSV | 下载识别日志的CSV文件 |

> OpenCV 预处理输出默认保存在：`backend/outputs/`  
> 通常包含：原图（raw_*）、预处理图（proc_*）等文件，便于报告截图与对比展示。

### 最佳实践

1. **光线条件**
   - 确保光线充足均匀
   - 避免强烈逆光
   - 背景尽量简单

2. **手势姿势**
   - 手掌正对摄像头
   - 手指动作清晰
   - 保持手势稳定1-2秒

3. **距离控制**
   - 手与摄像头距离30-80cm为佳
   - 确保整个手掌在画面内

---

## 📚 API 文档

> **说明**：请以后端 Swagger 文档为准（`http://127.0.0.1:8001/docs`）。  
> 若某些分析接口未启用/未实现，可作为可选扩展模块（Roadmap），不影响核心功能运行。

### 基础端点

#### 健康检查

```http
GET /api/health
```

**响应示例：**
```json
{
  "status": "healthy",
  "version": "2.3.0",
  "uptime": 3600.5,
  "db_status": "ok",
  "total_logs": 1250,
  "fps_avg": 28.5
}
```

#### 获取配置

```http
GET /api/config
```

**响应示例：**
```json
{
  "debounce_sec": 0.5,
  "mapping": {
    "THUMBS_UP": "GOOD",
    "SIX": "SIX_GESTURE",
    "PALM": "OPEN_HAND",
    "FIST": "CLOSED_HAND",
    "POINT": "POINT_FORWARD",
    "V": "VICTORY",
    "OK": "OK_SIGN",
    "UNKNOWN": "NO_GESTURE"
  },
  "enabled": true
}
```

#### 更新配置

```http
POST /api/config
Content-Type: application/json

{
  "debounce_sec": 0.8,
  "mapping": {
    "THUMBS_UP": "CUSTOM_COMMAND"
  }
}
```

### 手势事件

#### 发送手势事件

```http
POST /api/gesture/event
Content-Type: application/json

{
  "gesture": "THUMBS_UP",
  "score": 0.95,
  "ts": 1704067200.123,
  "session_id": "user_001",
  "response_time": 25.5
}
```

**响应示例：**
```json
{
  "accepted": true,
  "command": "GOOD",
  "state": {
    "mode": "RUNNING",
    "last_gesture": "THUMBS_UP",
    "last_command": "GOOD",
    "updated_at": 1704067200.123,
    "uptime": 3600.5,
    "total_requests": 150
  }
}
```

### 日志接口

#### 获取日志

```http
GET /api/logs?limit=50
```

#### 导出CSV

```http
GET /api/logs/export.csv?limit=200
```

### 数据分析（可选模块）

#### 获取分析摘要

```http
GET /api/analytics/summary
```

**响应示例：**
```json
{
  "total_recognitions": 5000,
  "today_recognitions": 320,
  "week_recognitions": 2100,
  "overall_accuracy": 92.5,
  "avg_response_time": 28.3,
  "avg_confidence": 87.6,
  "unknown_rate": 5.2,
  "top_gestures": [
    {"gesture": "THUMBS_UP", "count": 1200},
    {"gesture": "PALM", "count": 980},
    {"gesture": "V", "count": 756}
  ],
  "timestamp": "2026-01-11T12:00:00"
}
```

#### 获取手势统计

```http
GET /api/analytics/gestures
```

#### 获取时间线数据

```http
GET /api/analytics/timeline?hours=24
```

#### 获取准确率分析

```http
GET /api/analytics/accuracy
```

#### 获取性能指标

```http
GET /api/analytics/performance
```

---

## ⚙️ 配置说明

### 后端配置 (config.py / .env)

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| APP_TITLE | Gesture Control Backend | 应用标题 |
| APP_VERSION | 2.3.0 | 应用版本 |
| DEBUG | false | 调试模式 |
| DB_PATH | gesture_logs.db | 数据库文件路径 |
| DEBOUNCE_SEC | 0.5 | 防抖时间（秒） |
| MAX_FPS | 30 | 最大帧率 |
| LOG_RETENTION_DAYS | 30 | 日志保留天数 |
| MAX_LOG_ENTRIES | 10000 | 最大日志条数 |
| CORS_ORIGINS | [...] | 允许的跨域来源 |

### 前端配置 (.env)

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| VITE_BACKEND_URL | http://127.0.0.1:8001 | 后端API地址 |
| VITE_DEBUG | false | 前端调试模式 |

### 手势检测参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| okThresh | 0.65 | OK手势阈值 |
| windowSize | 9 | 平滑窗口大小 |
| sendMinIntervalMs | 250 | 最小发送间隔（ms） |
| sendUnknown | false | 是否发送UNKNOWN |
| angleCosThresh | -0.75 | 角度余弦阈值 |
| thumbUpScoreThresh | 0.25 | 拇指向上分数阈值 |
| thumbSideScoreThresh | 0.22 | 拇指侧向分数阈值 |
| thumbOpenThresh | 0.80 | 拇指张开阈值 |
| thumbAbdDegThresh | 35 | 拇指外展角阈值（°），越小越严格；用于增强 SIX 与 THUMBS_UP 区分 |

---

## ❓ 常见问题

### Q1: 后端无法启动

**问题：** 运行 `uvicorn main:app` 报错

**解决方案：**
```bash
# 1. 确认已激活虚拟环境
conda activate gesture

# 2. 检查依赖是否安装
pip list | grep fastapi

# 3. 重新安装依赖
pip install -r requirements.txt --force-reinstall

# 4. 检查端口占用
netstat -an | grep 8001
```

### Q2: 前端无法连接后端

**问题：** 右上角显示"后端未连接"

**解决方案：**
```bash
# 1. 确认后端已启动
curl http://127.0.0.1:8001/api/health

# 2. 检查 .env 配置
cat frontend/gestureControl/.env

# 3. 检查CORS配置
# 后端 config.py 中确认 cors_origins 包含前端地址
```

### Q3: 摄像头无法打开

**问题：** 浏览器提示摄像头权限被拒绝

**解决方案：**
1. 检查浏览器地址栏左侧的摄像头图标，点击允许
2. 进入浏览器设置 → 隐私和安全 → 网站设置 → 摄像头
3. 确保没有其他程序占用摄像头

### Q4: 手势识别不准确

**问题：** 经常识别为UNKNOWN或识别错误

**解决方案：**
1. 改善光线条件，避免背光
2. 调整手与摄像头的距离（30-80cm）
3. 确保手势动作清晰、稳定
4. 检查控制台是否有调试信息

### Q5: MediaPipe 模型加载失败

**问题：** 控制台报错 MediaPipe 相关错误

**解决方案：**
```bash
# 1. 检查网络连接（首次需要下载模型）

# 2. 清除浏览器缓存
# Chrome: Ctrl+Shift+Del → 清除缓存

# 3. 尝试使用其他浏览器

# 4. 检查是否使用了 HTTPS
# MediaPipe 在某些情况下需要 HTTPS
```

### Q6: 日志无法导出

**问题：** 点击导出CSV无反应

**解决方案：**
```bash
# 1. 直接访问导出接口
curl -o logs.csv http://127.0.0.1:8001/api/logs/export.csv

# 2. 检查浏览器下载设置

# 3. 检查后端日志是否有错误
```

---

## 🔧 开发指南

### 添加新手势

1. **修改 useGestureDetector.js**

```javascript
// 在 detectGesture 函数中添加新手势判断
if (/* 新手势的判断条件 */) {
  if (DEBUG) console.log("✅ Detected: NEW_GESTURE");
  return "NEW_GESTURE";
}
```

2. **更新后端映射**

```python
# config.py
default_gesture_mapping: Dict[str, str] = {
    # ... 现有映射
    "NEW_GESTURE": "NEW_COMMAND",
}
```

3. **更新前端UI**

```javascript
// HomeView.vue
const gestureGuides = [
  // ... 现有手势
  { name: "NEW_GESTURE", emoji: "🆕", desc: "新手势", command: "NEW_COMMAND" },
];
```

### 自定义控制指令处理

在后端添加指令处理逻辑：

```python
# main.py
@app.post("/api/gesture/event")
async def post_gesture(ev: GestureEvent):
    command = runtime_config.mapping.get(ev.gesture, "NONE")
    
    # 添加自定义处理逻辑
    if command == "CUSTOM_COMMAND":
        # 执行特定操作
        await handle_custom_command()
    
    # ... 其余代码
```

### 调试模式

开启前端调试：

```javascript
// useGestureDetector.js
const DEBUG = true;  // 开启调试输出
```

开启后端调试：

```bash
# .env
DEBUG=true
```

---

## ⚡ 性能优化

### 前端优化

1. **减少不必要的渲染**
```javascript
// 使用 shallowRef 替代 ref
const logs = shallowRef([]);
```

2. **优化轮询间隔**
```javascript
// 将日志轮询从1秒改为3秒
startLogsPolling(3000);
```

3. **使用 Web Worker（可选）**
```javascript
// 将手势检测移到 Web Worker 中
```

### 后端优化

1. **启用 Gzip 压缩**
```python
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

2. **数据库索引优化**
```sql
CREATE INDEX idx_logs_time ON logs(time DESC);
CREATE INDEX idx_logs_gesture ON logs(gesture);
```

3. **使用连接池**
```python
from sqlalchemy import create_engine
engine = create_engine("sqlite:///gesture_logs.db", pool_size=5)
```

---

## 📝 更新日志

### v2.3.0 (2026-01-11)

- ✨ 新增数据分析API端点
- ✨ 新增手势参考卡片
- 🐛 修复THUMBS_UP和SIX混淆问题
- 🐛 修复PALM无法识别问题
- 💄 优化页面布局为三列设计
- 📝 完善README文档

### v2.2.0 (2026-01-09)

- ✨ 新增日志导出功能
- ✨ 新增性能指标面板
- 🐛 修复防抖机制问题
- 💄 UI全面改版

### v2.1.0 (2026-01-08)

- ✨ 新增OpenCV预处理功能
- ✨ 支持左右手识别
- 🐛 修复内存泄漏问题

### v2.0.0 (2026-01-07)

- 🎉 项目重构，前后端分离
- ✨ 使用Vue 3 + FastAPI
- ✨ 新增7种手势支持

### v1.9.0 (2026-01-06)

- ✨ 新增手势平滑：滑动窗口投票（windowSize 可调）
- ✨ 新增"最小发送间隔"策略，减少重复触发
- 🐛 修复日志重复显示/重复上报导致的"同一动作多条日志"问题
- 💄 增加右侧参数面板（OK 阈值、平滑窗口、发送间隔）便于现场调参

### v1.8.0 (2026-01-06)

- ✨ 引入 handedness（左右手）并适配规则判定
- 🐛 修复"摄像头正对用户导致左右手语义反转"的问题（用户视角 Left/Right 修正）
- 🐛 修复 THUMBS_UP 与 SIX 容易混淆：加入排他规则（pinkyUp 排除点赞）

### v1.7.0 (2026-01-05)

- ✨ SIX 手势增强：拇指角度法 + 方向法融合
- ✨ 小拇指伸直判定增强：角度法 + y 位置兜底 + wrist 距离兜底（抗斜角/遮挡）
- 🐛 修复 SIX 在部分角度下识别困难的问题（放宽 side/open 阈值与兜底逻辑）

### v1.6.0 (2026-01-02)

- ✨ 增加骨架绘制优化：关键点 + 连线同时显示，叠加于视频画面
- ✨ 增加 FPS 显示与运行状态提示
- 🐛 修复 canvas 仅显示点不显示连线的问题（HAND_CONNECTIONS 正确使用）

### v1.5.0 (2026-01-01)

- ✨ 新增基础手势集：PALM / FIST / POINT / V / OK / THUMBS_UP / SIX（7 类）
- ✨ OK 手势规则加入阈值（thumb_tip 与 index_tip 距离归一化）
- 🐛 修复 OK 偶发误判：引入"其他三指至少两指伸直"的辅助约束

### v1.4.0 (2025-12-31)

- ✨ 前后端首次联通：前端识别结果 POST 到 FastAPI
- ✨ 后端新增：/api/gesture/event、/api/mapping、/api/logs、/api/config
- ✨ 引入后端去抖（debounce_sec），降低误触发
- 🐛 修复 Windows 端 uvicorn 端口权限问题（更换端口/以管理员运行/排查占用）

### v1.3.0 (2025-12-30)

- ✨ FastAPI 后端最小可用：健康检查 /api/health
- ✨ 支持 SQLite 日志落库与查询（运行时生成 gesture_logs.db）
- ✨ 配置项初版：DB_PATH、DEBOUNCE_SEC、CORS_ORIGINS

### v1.2.0 (2025-12-29)

- ✨ Vue3 + Vite 前端工程初始化
- ✨ 摄像头调用与视频画面显示（getUserMedia）
- 🐛 修复首次启动权限/HTTPS/浏览器安全限制导致的摄像头不可用提示

### v1.1.0 (2025-12-28)

- ✨ 集成 MediaPipe Hands：实现手部关键点检测并在 Canvas 可视化
- ✨ 关键点检测稳定性调参：minDetectionConfidence / minTrackingConfidence

### v1.0.0 (2025-12-27)

- 🎯 项目立项与原型验证：确定 Web 端方案（Vue + MediaPipe）与后端方案（FastAPI）
- ✅ 完成基础页面原型（视频区域 + 状态栏）与技术选型
- ✅ 形成最小闭环：前端识别 → 后端接收 → 日志记录

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

<p align="center">
  如果这个项目对你有帮助，请给一个 ⭐ Star！
</p>