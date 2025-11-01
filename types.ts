// Use a type-only import for React types to avoid runtime side effects.
import type React from 'react';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export interface UploadedFile {
  name: string;
  mimeType: string;
  data: string; // For images: base64 string. For text files: raw text content.
  previewUrl?: string; // For image previews
}

export interface Suggestion {
    text: string;
    icon: React.FC<{className?: string}>;
    prompt?: string;
}

export interface ChatMessage {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  suggestions?: Suggestion[];
  images?: string[];
  sources?: { uri: string; title: string }[];
  isLoading?: boolean;
  files?: UploadedFile[];
  isWelcome?: boolean;
  isSystem?: boolean;
  videoState?: 'generating' | 'done' | 'failed';
  videoUrl?: string;
}

export type ChatStage = 'chat' | 'live-chat';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  languageCode: string;
}

export interface GeneratedImage {
  src: string;
  sessionId: string;
  messageId: number;
}
