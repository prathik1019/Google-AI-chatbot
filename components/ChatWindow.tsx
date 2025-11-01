
import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Language, UploadedFile, Suggestion } from '../types';
import { MessageBubble } from './MessageBubble';
import { ChatInput, type ChatInputHandle } from './ChatInput';
import { SuggestionChip } from './SuggestionChip';
import { SpeakerOnIcon, SpeakerOffIcon, MenuIcon, ChevronDownIcon } from './Icons';

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (payload: { text: string; files: UploadedFile[]; prompt?: string }) => void;
  onGenerateVideo: (file: UploadedFile, prompt: string, aspectRatio: '16:9' | '9:16') => void;
  onSummarize: (text: string) => void;
  isLoading: boolean;
  language: Language;
  isTextToSpeechEnabled: boolean;
  onToggleTextToSpeech: () => void;
  isBotSpeaking: boolean;
  setIsBotSpeaking: (isSpeaking: boolean) => void;
  addSystemMessage: (text: string) => void;
  onToggleHistoryPanel: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ messages, onSendMessage, onGenerateVideo, onSummarize, isLoading, language, isTextToSpeechEnabled, onToggleTextToSpeech, isBotSpeaking, setIsBotSpeaking, addSystemMessage, onToggleHistoryPanel }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // FIX: Use the imported ChatInputHandle type for the ref.
  const chatInputRef = useRef<ChatInputHandle>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const shouldAutoScroll = useRef(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const handleSendMessageWithFocus = (payload: { text: string; files: UploadedFile[]; prompt?: string }) => {
      onSendMessage(payload);
      chatInputRef.current?.focus();
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 200;
      shouldAutoScroll.current = isAtBottom;
      setIsScrolledUp(!isAtBottom);
    }
  };

  useEffect(() => {
    if (shouldAutoScroll.current) {
        setTimeout(scrollToBottom, 100);
    }
  }, [messages]);

  const isInitialState = messages.filter(m => !m.isSystem).length <= 1;
  const initialSuggestions = messages.length > 0 && messages[0].isWelcome ? messages[0].suggestions : [];
  const lastSystemMessage = [...messages].reverse().find(m => m.isSystem);
  const lastBotMessageWithSuggestions = [...messages].reverse().find(m => m.sender === 'bot' && !m.isLoading && !m.isSystem && m.suggestions && m.suggestions.length > 0);

  return (
    <div className="flex flex-col flex-1 w-full max-w-4xl mx-auto overflow-hidden">
      <header className="px-4 py-3 z-10 flex items-center justify-between flex-shrink-0 border-b border-gray-800/50">
        <div className="flex items-center gap-2">
            <div className="relative group flex justify-center">
              <button
                onClick={onToggleHistoryPanel}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-300"
                aria-label="Toggle history panel"
              >
                <MenuIcon />
              </button>
              <div 
                className="absolute top-full mt-2 whitespace-nowrap bg-black text-white text-sm font-semibold px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                role="tooltip"
              >
                History
              </div>
            </div>
        </div>
        <h1 className="text-xl font-semibold text-gray-200">Gokarna Guide</h1>
        <div className="flex items-center gap-2">
            <div className="relative group flex justify-center">
              <button
                onClick={onToggleTextToSpeech}
                className={`p-2 rounded-lg transition-all duration-300 ${isTextToSpeechEnabled ? 'text-white bg-blue-600' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                aria-label={isTextToSpeechEnabled ? 'Mute bot voice' : 'Unmute bot voice'}
              >
                {isTextToSpeechEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
              </button>
               <div 
                className="absolute top-full mt-2 whitespace-nowrap bg-black text-white text-sm font-semibold px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                role="tooltip"
              >
                {isTextToSpeechEnabled ? 'Mute Bot Voice' : 'Unmute Bot Voice'}
              </div>
            </div>
        </div>
      </header>

      {isInitialState ? (
          <div className="flex-1 flex flex-col justify-center items-center p-6 overflow-y-auto">
              <div className="text-center mb-8">
                <h1 className="text-4xl sm:text-5xl font-bold text-gray-300">
                    <span className="text-5xl sm:text-6xl">🌴</span> Your Gokarna Companion <span className="text-5xl sm:text-6xl">🌅</span>
                </h1>
                <p className="text-gray-400 mt-3 max-w-lg mx-auto">Ask me anything about local sights, food, hotels, or get a real-time daily briefing.</p>
              </div>
              <div className="w-full max-w-2xl mx-auto mb-6">
                 <ChatInput 
                    ref={chatInputRef}
                    onSendMessage={handleSendMessageWithFocus} 
                    onGenerateVideo={onGenerateVideo}
                    isLoading={isLoading} 
                    languageCode={language.code} 
                    isBotSpeaking={isBotSpeaking}
                    addSystemMessage={addSystemMessage}
                  />
              </div>
              <div className="flex flex-wrap gap-3 justify-center max-w-3xl">
                {initialSuggestions && initialSuggestions.map((suggestion, index) => (
                    <SuggestionChip key={index} suggestion={suggestion} onClick={() => handleSendMessageWithFocus({text: suggestion.text, files: [], prompt: suggestion.prompt})} />
                ))}
              </div>
              <div className="h-10 mt-4 text-center text-sm text-gray-400 flex items-center justify-center">
                {lastSystemMessage && (
                    <p className="animate-fade-in">{lastSystemMessage.text}</p>
                )}
            </div>
          </div>
      ) : (
        <main ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-6">
            <div className="space-y-8">
              {messages.map((msg, index) => (
                <MessageBubble 
                  key={msg.id} 
                  message={msg} 
                  isTextToSpeechEnabled={isTextToSpeechEnabled} 
                  language={language}
                  setIsBotSpeaking={setIsBotSpeaking}
                  onSummarize={onSummarize}
                  isLastMessage={index === messages.length - 1}
                />
              ))}
            </div>
            <div ref={messagesEndRef} />
        </main>
      )}

      {isScrolledUp && (
          <button
              onClick={scrollToBottom}
              className="absolute bottom-28 right-8 z-20 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all animate-fade-in"
              aria-label="Scroll to bottom"
          >
              <ChevronDownIcon />
          </button>
      )}

      {!isInitialState && (
          <footer className="w-full p-4 bg-[#131314] flex-shrink-0">
            <div className="max-w-2xl mx-auto">
              {lastBotMessageWithSuggestions && (
                <div className="flex flex-wrap gap-3 justify-center max-w-2xl mb-3">
                  {lastBotMessageWithSuggestions.suggestions!.map((suggestion, index) => (
                      <SuggestionChip key={index} suggestion={suggestion} onClick={() => handleSendMessageWithFocus({text: suggestion.text, files: [], prompt: suggestion.prompt})} />
                  ))}
                </div>
              )}
              <ChatInput 
                ref={chatInputRef}
                onSendMessage={handleSendMessageWithFocus}
                onGenerateVideo={onGenerateVideo}
                isLoading={isLoading} 
                languageCode={language.code} 
                isBotSpeaking={isBotSpeaking}
                addSystemMessage={addSystemMessage}
              />
            </div>
          </footer>
      )}
    </div>
  );
};
