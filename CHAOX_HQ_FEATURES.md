# CHAOX HQ - Frontend Features Documentation

## Overview
CHAOX HQ is a comprehensive command and control interface for managing tactical operations with real-time entity tracking, AI-powered insights, task management, and advanced analytics.

## ✨ Core Features Implemented

### 1. 🧠 AI Reasoning Panel
**Location:** Accessible via the vertical app bar (Brain icon)

**Features:**
- Real-time AI-generated situational summaries
- Confidence scoring for each insight
- Source entity tracking
- Type-based categorization (Info, Warning, Insight)
- Color-coded badges for quick identification

**Mock Data:** Currently displays 3 sample AI summaries demonstrating different insight types.

### 2. 🎯 Task Control Panel
**Location:** Accessible via the vertical app bar (Target icon)

**Features:**
- Create new mission tasks
- Monitor task progress in real-time
- View assigned entities per task
- Task status tracking (Pending, In Progress, Completed, Failed)
- Progress bars for active tasks
- Estimated completion times
- Task pause and details functionality

**Mock Data:** Includes 3 sample tasks with different statuses and assigned entities.

### 3. 📊 Analytics Dashboard
**Location:** Accessible via the vertical app bar (BarChart icon)

**Features:**
- Key metrics grid:
  - Active Entities count
  - Mission Success Rate
  - Average Response Time
  - System Uptime
- Regional coverage visualization with progress bars
- System health monitoring
- Trend indicators with percentage changes
- Live status badges

**Mock Data:** Real-time metrics showing current system performance.

### 4. ⏯️ Timeline Playback
**Location:** Bottom bar (always visible when enabled)

**Features:**
- Playback controls (Play/Pause, Skip Forward/Backward)
- Timeline slider for scrubbing through historical data
- Speed control (0.5x to 10x)
- Time display (current/total)
- Replay timestamp showing actual date/time
- 1-hour timeline duration

**State:** Can be toggled via `showTimeline` state in Index.tsx

### 5. 🌍 Enhanced 3D Globe Interface
**Features:**
- 2D map visualization
- Real-time entity tracking
- Entity type-specific icons (UAV, UGV, Vehicle)
- Status-based color coding
- Camera follow mode
- Click to select entities

**Connection:** Integrates with mock data (useMockEntities) or live WebSocket stream (useCHAOXStream)

### 6. 🔐 Mock Authentication UI
**Location:** TopBar user dropdown

**Features:**
- User profile display
- Role badge (Operator)
- Demo user credentials shown
- Sign-out functionality
- Profile and security settings menu

**Demo Credentials:**
- Email: operator@CHAOX.mil
- Role: Operator
- Mode: Demo Mode Active

### 7. 📱 Enhanced TopBar
**Features:**
- Live status indicator with pulse animation
- Demo mode badge
- Real-time clock (GMT)
- Notification counter
- Alert indicators
- Connection status (WiFi icon)
- User dropdown menu with role information
- Settings access

### 8. 📋 Entity Management
**Features:**
- Entity list panel showing all tracked assets
- Entity detail panel with comprehensive information
- Entity selection and tracking
- Type filtering (UAV, UGV, Vehicle, etc.)
- Status indicators

## 🎨 Design System

### Color Palette
- **Primary:** HSL(38, 92%, 50%) - Orange/Amber
- **Live Indicator:** HSL(142, 76%, 45%) - Green
- **Blue Highlight:** HSL(250, 85%, 60%)
- **Green Highlight:** HSL(150, 75%, 45%)
- **Orange Highlight:** HSL(38, 92%, 50%)
- **Red Highlight:** HSL(0, 84%, 60%)

### Animations
- Smooth transitions (150ms-350ms)
- Pulse animation for live indicators
- Hover effects on interactive elements

## 🗺️ Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│                        TopBar                            │
│  [Logo] [LIVE] [Demo] ... [Notifications] [User Menu]   │
├─────┬──────────────────┬──────────────────────┬─────────┤
│     │                  │                      │         │
│ V   │   Left Panel     │   3D Globe Canvas    │ Entity  │
│ e   │                  │                      │ Detail  │
│ r   │  - AI Reasoning  │   [Map View]     │ Panel   │
│ t   │  - Task Control  │                      │         │
│ i   │  - Analytics     │                      │ Right   │
│ c   │  - Entity List   │                      │ Toolbar │
│ a   │  - Other Panels  │                      │         │
│ l   │                  │                      │         │
│     │                  ├──────────────────────┤         │
│ A   │                  │  Timeline Playback   │         │
│ p   │                  │  [◄ ▶ █ ═══╤═══]    │         │
│ p   │                  │                      │         │
│     │                  │                      │         │
│ B   │                  │  Video Feed (opt)    │         │
│ a   │                  │                      │         │
│ r   │                  │                      │         │
└─────┴──────────────────┴──────────────────────┴─────────┘
```

## 🔌 Data Integration

### Mock Data (Current)
- **Entities:** 7 mock entities (UAVs, UGVs, Vehicles) with random movement
- **Tasks:** 3 sample tasks with different statuses
- **AI Summaries:** 3 AI-generated insights
- **Analytics:** Real-time calculated metrics

### WebSocket Integration (Ready)
The application is ready to connect to live data via:
- `/ws/entities` - Entity state updates
- `/ws/tasks` - Task progress updates
- `/api/v1/ai/summarize` - AI summaries endpoint

Configure in `.env`:
```
VITE_CHAOX_WS_ENTITIES=ws://your-backend:8080/ws/entities
VITE_CHAOX_API_BASE=http://your-backend:8080/api/v1
```

## 🚀 Usage

### Accessing Features

1. **AI Reasoning:** Click the Brain icon in the vertical app bar
2. **Task Control:** Click the Target icon in the vertical app bar
3. **Analytics:** Click the BarChart icon in the vertical app bar
4. **Timeline:** Visible at the bottom by default
5. **Entity Details:** Click any entity on the 3D globe

### Creating Tasks
1. Open Task Control panel
2. Click "+ New Task" button
3. Enter task description
4. Assign entities (comma-separated)
5. Click "Create"

### Playback Control
1. Use Play/Pause button to control playback
2. Drag timeline slider to scrub through time
3. Use Skip buttons to jump 1 minute forward/backward
4. Adjust speed using dropdown (0.5x - 10x)

## 🎯 Future Enhancements (Backend Required)

When connected to CHAOX C2 backend:
- Real-time AI summaries from LLM
- Actual task execution and monitoring
- Historical data playback from database
- Live video feeds integration
- Advanced analytics with TimescaleDB
- Multi-user collaboration
- Mission recording and replay
- Advanced route planning

## 🛠️ Technical Stack

- **React 18** with TypeScript
- **MapLibre GL** for 2D map visualization
- **TailwindCSS** for styling
- **Shadcn UI** component library
- **Lucide React** icons
- **React Router** for navigation
- **Vite** for build tooling

## 📝 Notes

- All features currently use mock data for demonstration
- Authentication is UI-only (no actual auth flow)
- Timeline playback simulates historical data
- AI summaries are pre-generated examples
- All colors use HSL format from design system
- Animations use CSS custom properties for consistency
