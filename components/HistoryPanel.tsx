import React, { useState, useRef, useEffect } from 'react';
import type { ChatSession, GeneratedImage } from '../types';
import { NewChatIcon, TrashIcon, HistoryIcon, PencilIcon, LibraryIcon, DownloadIcon } from './Icons';

interface HistoryPanelProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onClearAllSessions: () => void;
  isOpen: boolean;
  onToggle: () => void;
  allGeneratedImages: GeneratedImage[];
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ sessions, activeSessionId, onSelectSession, onNewChat, onDeleteSession, onRenameSession, onClearAllSessions, isOpen, onToggle, allGeneratedImages }) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'library'>('history');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSessionId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingSessionId]);

  const handleStartEditing = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setNewTitle(session.title);
  };

  const handleFinishEditing = () => {
    if (editingSessionId && newTitle.trim()) {
      onRenameSession(editingSessionId, newTitle);
    }
    setEditingSessionId(null);
    setNewTitle('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleFinishEditing();
    } else if (event.key === 'Escape') {
      setEditingSessionId(null);
      setNewTitle('');
    }
  };

  const handleConfirmClear = () => {
    onClearAllSessions();
    setIsConfirmingClear(false);
  };

  const handleDownload = (image: GeneratedImage, index: number) => {
    const link = document.createElement('a');
    link.href = image.src;
    link.download = `gokarna-guide-image-${image.sessionId}-${image.messageId}-${index}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const TabButton: React.FC<{isActive: boolean, onClick: () => void, children: React.ReactNode, 'aria-label': string}> = ({ isActive, onClick, children, 'aria-label': ariaLabel }) => (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-md transition-colors ${
        isActive ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );

  return (
    <>
      <aside className={`fixed top-0 left-0 flex flex-col bg-[#1E1F20] border-r border-gray-700/50 transition-transform duration-300 ease-in-out z-30 h-full ${isOpen ? 'translate-x-0' : '-translate-x-full'} w-80 md:w-96 flex-shrink-0`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <h2 className="text-xl font-semibold text-gray-200">Gokarna Guide</h2>
          <div className="relative group flex justify-center">
             <button
                onClick={onNewChat}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-300"
                aria-label="Start new chat"
              >
                <NewChatIcon className="h-6 w-6"/>
              </button>
              <div 
                className="absolute top-full mt-2 whitespace-nowrap bg-black text-white text-sm font-semibold px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                role="tooltip"
              >
                New Chat
              </div>
          </div>
        </div>

        <div className="p-2 border-b border-gray-700/50">
            <div className="flex bg-[#2a2a2a] rounded-md p-1 space-x-1">
                <TabButton isActive={activeTab === 'history'} onClick={() => setActiveTab('history')} aria-label="View chat history">
                    <HistoryIcon className="w-5 h-5"/> History
                </TabButton>
                <TabButton isActive={activeTab === 'library'} onClick={() => setActiveTab('library')} aria-label="View image library">
                    <LibraryIcon className="w-5 h-5"/> Library
                </TabButton>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {activeTab === 'history' && (
            sessions.length > 0 ? (
              <ul className="space-y-1">
                {sessions.map((session, index) => (
                  <li 
                    key={session.id}
                    className="animate-history-item"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                     {editingSessionId === session.id ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onBlur={handleFinishEditing}
                        onKeyDown={handleKeyDown}
                        className="w-full text-left px-4 py-3 rounded-lg bg-white/20 text-white outline-none ring-2 ring-blue-500"
                      />
                    ) : (
                      <button
                          onClick={() => onSelectSession(session.id)}
                          className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between group transition-colors duration-200 ${
                          activeSessionId === session.id
                              ? 'bg-white/10 text-white animate-subtle-glow'
                              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                          }`}
                      >
                          <span className="truncate flex-1 pr-2">{session.title}</span>
                          <div className={`flex items-center transition-opacity space-x-0.5 ${activeSessionId === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              {/* FIX: Replaced Tooltip component with inline implementation using named groups to prevent hover conflicts */}
                              <div className="relative group/rename flex justify-center">
                                  <button
                                      onClick={(e) => { e.stopPropagation(); handleStartEditing(session); }}
                                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10"
                                      aria-label={`Rename chat: ${session.title}`}
                                  >
                                      <PencilIcon />
                                  </button>
                                  <div 
                                      className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black text-white text-xs font-semibold px-2 py-1 rounded-md shadow-lg opacity-0 group-hover/rename:opacity-100 transition-opacity duration-300 pointer-events-none"
                                      role="tooltip"
                                  >
                                      Rename
                                  </div>
                              </div>
                              <div className="relative group/delete flex justify-center">
                                  <button
                                      onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                                      className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                                      aria-label={`Delete chat: ${session.title}`}
                                  >
                                      <TrashIcon />
                                  </button>
                                  <div 
                                      className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black text-white text-xs font-semibold px-2 py-1 rounded-md shadow-lg opacity-0 group-hover/delete:opacity-100 transition-opacity duration-300 pointer-events-none"
                                      role="tooltip"
                                  >
                                      Delete
                                  </div>
                              </div>
                          </div>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center text-gray-500 p-4 mt-4">
                No past conversations.
              </div>
            )
          )}

          {activeTab === 'library' && (
            allGeneratedImages.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                    {allGeneratedImages.map((image, index) => (
                         <div key={`${image.sessionId}-${image.messageId}-${index}`} className="relative group aspect-square bg-[#2a2a2a] rounded-md overflow-hidden">
                            <button onClick={() => onSelectSession(image.sessionId)} className="w-full h-full">
                                <img src={image.src} alt="Generated art" className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"/>
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDownload(image, index); }}
                                className="absolute bottom-1.5 right-1.5 p-2 bg-black/60 text-white rounded-full invisible group-hover:visible hover:bg-black/80 transition-all duration-300"
                                aria-label="Download image"
                            >
                                <DownloadIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center text-gray-500 p-4 mt-4">
                    No images generated yet.
                </div>
            )
          )}
        </div>

        {activeTab === 'history' && sessions.length > 0 && (
          <div className="p-4 border-t border-gray-700/50">
            <button
              onClick={() => setIsConfirmingClear(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              Clear all chats
            </button>
          </div>
        )}
      </aside>

      {isConfirmingClear && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-fade-in">
          <div className="bg-[#1E1F20] rounded-xl shadow-2xl p-6 m-4 max-w-sm w-full border border-gray-700/50">
            <h3 className="text-lg font-bold text-white">Clear all conversations?</h3>
            <p className="text-gray-400 mt-2 text-sm">This cannot be undone. All your chat history will be permanently deleted.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsConfirmingClear(false)}
                className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {isOpen && <div onClick={onToggle} className="fixed inset-0 bg-black/50 z-20 md:hidden"></div>}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        @keyframes subtle-glow {
          0%, 100% { box-shadow: 0 0 3px rgba(255, 255, 255, 0.1); }
          50% { box-shadow: 0 0 10px rgba(255, 255, 255, 0.25), 0 0 1px rgba(255, 255, 255, 0.1); }
        }
        .animate-subtle-glow {
          animation: subtle-glow 3s infinite ease-in-out;
        }
        @keyframes history-item-appear {
            from { opacity: 0; transform: translateX(-20px); }
            to { opacity: 1; transform: translateX(0); }
        }
        .animate-history-item {
            animation: history-item-appear 0.4s ease-out forwards;
            opacity: 0; 
        }
      `}</style>
    </>
  );
};