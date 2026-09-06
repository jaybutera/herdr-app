// Shapes from DESIGN.md section 2. These are the contract between the UI and
// the two backends; nothing here is inferred from a live response.

export type ProjectStatus = 'active' | 'dormant' | 'dead';
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'abandoned';
export type AgentStatus = 'working' | 'idle' | 'blocked' | 'done' | 'unknown';

export interface TaskCounts {
  queued: number;
  running: number;
  done: number;
  failed: number;
  abandoned: number;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  status: TaskStatus;
  session_ref: string;
  result_summary: string;
  created_at: string;
  updated_at: string;
}

export interface SummaryProject {
  id: number;
  name: string;
  description?: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  running_tasks: Task[];
  open_tasks: Task[];
  task_counts: TaskCounts;
}

export interface Summary {
  generated_at: string;
  status: string;
  projects_shown: number;
  running_tasks: number;
  queued_tasks: number;
  projects: SummaryProject[];
}

export interface ProjectDetail {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  tasks: Task[];
}

export interface TaskEvent {
  id: number;
  task_id: number;
  note: string;
  created_at: string;
}

export interface TaskDetail extends Task {
  events: TaskEvent[];
}

export interface Pane {
  pane_id: string;
  workspace_id: string;
  label: string;
  cwd: string;
  agent_status: AgentStatus;
}

export interface PaneRead {
  pane_id: string;
  agent_status: AgentStatus;
  read_at: string;
  text: string;
}

export type ChatRole = 'user' | 'orchestrator' | 'event' | 'system';
export type ChatKind = 'text' | 'finished' | 'stalled' | 'ended' | 'error' | 'status';

export interface ChatMessage {
  id: number;
  role: ChatRole;
  kind: ChatKind;
  text: string;
  pane_id: string | null;
  ts: string;
}

export interface ChatState {
  busy: boolean;
  muted: boolean;
  agents: { pane_id: string; label: string; agent_status: AgentStatus; cwd: string }[];
}
