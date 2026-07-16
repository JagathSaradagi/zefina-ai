export type Sender = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  sender: Sender;
  content: string; // The raw markdown content
  timestamp: number;
  subThreads: SubThread[];
  referenceText?: string;
  referenceMsgId?: string;
  referenceId?: string; // Links to the unique SubThread ID in the parent
}

export interface SubThread {
  id: string;
  anchorOffset: number;
  highlightStart: number;
  highlightedText: string;
  messages: ChatMessage[];
}

export interface ChatSession {
  id: string;
  title: string;
  lastTimestamp: number;
  messagesJson?: string;
}
