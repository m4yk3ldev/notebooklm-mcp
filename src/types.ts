export interface AuthTokens {
  cookies: Record<string, string>;
  csrf_token: string;
  session_id: string;
  bl?: string;
  extracted_at: number;
}

export interface Notebook {
  id: string;
  title: string;
  emoji: string | null;
  sources: SourceSummary[];
  is_shared: boolean;
  ownership: "mine" | "shared";
  created_at: string | null;
  modified_at: string | null;
}

export interface SourceSummary {
  id: string;
  title: string;
  type: string;
}

export interface SourceDetail extends SourceSummary {
  content: string | null;
  summary: string | null;
  keywords: string[];
}

export interface ResearchResult {
  task_id: string;
  status: "in_progress" | "completed" | "imported";
  query: string;
  sources: ResearchSource[];
  summary: string | null;
}

export interface ResearchSource {
  url: string | null;
  title: string;
  description: string | null;
  type: string;
}

export interface StudioArtifact {
  id: string;
  type: string;
  status: "pending" | "generating" | "completed" | "failed";
  download_url: string | null;
}

export interface QueryResponse {
  answer: string;
  conversation_id: string | null;
  sources_used: string[];
}

export interface ToolResult {
  status: "success" | "error" | "pending_confirmation";
  [key: string]: unknown;
}
