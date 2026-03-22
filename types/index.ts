export interface User {
  id: string;
  username: string;
  email: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessage: string;
}

export interface SessionPageInfo {
  hasMore: boolean;
  nextBefore: string | null;
}

export interface ChatSessionDetail extends ChatSession {
  messages: Message[];
  pageInfo?: SessionPageInfo;
}

export interface SessionsListResponse {
  items: ChatSession[];
  hasMore: boolean;
  nextCursor: string | null;
}
