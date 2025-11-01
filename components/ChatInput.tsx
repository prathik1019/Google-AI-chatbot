
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { PlusIcon, MicIcon, ImageIcon, FileTextIcon, VideoIcon, SendIcon, WaveformIcon } from './Icons';
import type { UploadedFile } from '../types';

interface ChatInputProps {
  onSendMessage: (payload: { text: string; files: UploadedFile[] }) => void;
  onGenerateVideo: (file: UploadedFile, prompt: string, aspectRatio: '16:9' | '9:16') => void;
  isLoading: boolean;
  languageCode: string;
  isBotSpeaking: boolean;
  addSystemMessage: (text: string) => void;
}

// FIX: Define and export a handle type for the component's imperative methods.
export interface ChatInputHandle {
  focus: () => void;
}

const fileToData = (file: File): Promise<{ data: string; previewUrl?: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve({ data: result.split(',')[1], previewUrl: result });
        };
    } else if (file.type === 'text/plain') {
        reader.readAsText(file);
        reader.onload = () => resolve({ data: reader.result as string });
    } else {
        reject(new Error('Unsupported file type'));
    }
    reader.onerror = error => reject(error);
  });
};

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

// FIX: Update forwardRef to use the new ChatInputHandle type instead of HTMLInputElement.
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(({ onSendMessage, onGenerateVideo, isLoading, languageCode, isBotSpeaking, addSystemMessage }, ref) => {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<UploadedFile[]>([]);
  const recognitionRef = useRef<any>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localInputRef = useRef<HTMLInputElement>(null);

  // FIX: Expose the focus method through useImperativeHandle without casting to `any`.
  useImperativeHandle(ref, () => ({
    focus: () => {
      localInputRef.current?.focus();
    },
  }));
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setIsMenuOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  useEffect(() => {
    if (!isSpeechRecognitionSupported) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageCode;

    recognition.onstart = () => {
        setIsListening(true);
        setInputValue('');
    };

    recognition.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
             addSystemMessage("Microphone access denied. Please allow mic permission in your browser or device settings.");
        } else if (event.error === 'no-speech') {
             addSystemMessage("No speech was detected. Please tap the mic again to speak.");
        } else if (event.error === 'audio-capture') {
            addSystemMessage("Microphone error. Another app might be using it. Please check and try again.");
        } else if (event.error !== 'aborted') {
             addSystemMessage("A microphone error occurred. Please check your connection and try again.");
        }
    }

    recognition.onresult = (event: any) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
      }, 3000);

      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('');
      
      setInputValue(transcript);
    };
    
    recognitionRef.current = recognition;

    return () => {
        if (recognitionRef.current) {
            recognitionRef.current.abort();
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
        }
    }
  }, [languageCode, addSystemMessage]);
  
  const handleManualSendMessage = () => {
    if ((inputValue.trim() || stagedFiles.length > 0) && !isLoading) {
      onSendMessage({ text: inputValue, files: stagedFiles });
      setInputValue('');
      setStagedFiles([]);
    }
  };

  const handleMicClick = () => {
    if (!isSpeechRecognitionSupported) {
        addSystemMessage("Voice input is not supported by your browser.");
        return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (isBotSpeaking) window.speechSynthesis.cancel();
      setStagedFiles([]);
      recognitionRef.current?.start();
    }
  };
  
    const handleGenerateVideoClick = () => {
        if (stagedFiles.length !== 1 || !stagedFiles[0].mimeType.startsWith('image/')) {
            addSystemMessage("Please upload exactly one image to generate a video.");
            return;
        }
        const prompt = window.prompt("Enter a prompt for the video:", "A cinematic shot of this scene.");
        if (prompt) {
            const aspectRatio = window.confirm("Generate in landscape (16:9)? Cancel for portrait (9:16).") ? '16:9' : '9:16';
            onGenerateVideo(stagedFiles[0], prompt, aspectRatio);
            setStagedFiles([]);
            setInputValue('');
            setIsMenuOpen(false);
        }
    };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isListening) {
          recognitionRef.current?.stop();
        } else {
          handleManualSendMessage();
        }
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) continue;
        try {
            const { data, previewUrl } = await fileToData(file);
            setStagedFiles(prev => [...prev, {
                name: file.name,
                mimeType: file.type,
                data,
                previewUrl
            }]);
        } catch (error) {
            console.error("Error reading file:", error);
            addSystemMessage("Could not read file. Please try again.");
        }
    }
    event.target.value = '';
  };

  const removeStagedFile = (fileName: string) => {
    setStagedFiles(prev => prev.filter(f => f.name !== fileName));
  };


  return (
    <div className="relative">
        {isMenuOpen && (
            <div ref={menuRef} className="absolute bottom-full mb-3 w-48 bg-[#2a2a2a] text-white rounded-xl shadow-lg animate-fade-in-up overflow-hidden border border-gray-700/50">
                <button onClick={() => imageInputRef.current?.click()} className="flex items-center w-full px-4 py-3 text-left hover:bg-[#333] transition-colors">
                    <ImageIcon className="mr-3" /> Upload Image
                </button>
                <button onClick={() => textInputRef.current?.click()} className="flex items-center w-full px-4 py-3 text-left hover:bg-[#333] transition-colors">
                    <FileTextIcon className="mr-3" /> Upload text file
                </button>
                <button 
                    onClick={handleGenerateVideoClick} 
                    className={`flex items-center w-full px-4 py-3 text-left transition-colors ${stagedFiles.length === 1 && stagedFiles[0].mimeType.startsWith('image/') ? 'hover:bg-[#333]' : 'text-gray-500 cursor-not-allowed'}`}
                    disabled={stagedFiles.length !== 1 || !stagedFiles[0].mimeType.startsWith('image/')}>
                    <VideoIcon className="mr-3" /> Generate Video
                </button>
            </div>
        )}
        <input type="file" ref={imageInputRef} onChange={handleFileChange} accept="image/*" className="hidden" multiple/>
        <input type="file" ref={textInputRef} onChange={handleFileChange} accept=".txt,text/plain" className="hidden" multiple/>
        
        {stagedFiles.length > 0 && (
            <div className="p-3 bg-[#252525] rounded-t-2xl border-t border-l border-r border-gray-700/50 animate-slide-in-up">
                <div className="flex flex-wrap gap-3">
                    {stagedFiles.map(file => (
                        <div key={file.name} className="relative group w-16 text-center">
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-[#333] flex items-center justify-center">
                                {file.previewUrl ? 
                                    <img src={file.previewUrl} alt={file.name} className="w-full h-full object-cover" />
                                    : 
                                    <FileTextIcon className="w-8 h-8 text-gray-400"/>
                                }
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button onClick={() => removeStagedFile(file.name)} className="text-white text-3xl font-bold leading-none" aria-label={`Remove ${file.name}`}>
                                        &times;
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 truncate mt-1.5">{file.name}</p>
                        </div>
                    ))}
                </div>
            </div>
        )}

      <div className={`flex items-center bg-[#1E1F20] shadow-2xl px-3 py-2 gap-2 transition-all duration-300 border border-gray-700/50 ${stagedFiles.length > 0 ? 'rounded-b-2xl' : 'rounded-full'} focus-within:ring-2 focus-within:ring-blue-600 focus-within:border-transparent`}>
        <div className="relative group flex justify-center">
          <button 
            onClick={() => setIsMenuOpen(prev => !prev)}
            className="p-3 text-gray-400 hover:text-white transition-colors flex-shrink-0 rounded-full hover:bg-white/10"
            aria-label="Add files"
          >
            <PlusIcon />
          </button>
          <div 
            className="absolute bottom-full mb-2 whitespace-nowrap bg-black text-white text-sm font-semibold px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            role="tooltip"
          >
            Add Files
          </div>
        </div>
        
        <input
          ref={localInputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (isBotSpeaking) window.speechSynthesis.cancel(); }}
          placeholder="Ask about Gokarna..."
          className="w-full h-full bg-transparent border-none focus:ring-0 text-gray-200 placeholder-gray-500 px-2 text-lg outline-none"
          disabled={isLoading}
        />
        <div className="flex items-center gap-2">
            {isListening ? (
                <div className="flex items-center gap-2">
                    <div className="relative flex items-center justify-center p-3">
                        <WaveformIcon isAnimating={true} />
                        <div className="absolute inset-0 rounded-full animate-mic-pulse" style={{ background: 'rgba(220, 38, 38, 0.4)' }}></div>
                    </div>
                    <button 
                        onClick={handleMicClick}
                        className="px-4 py-2 bg-red-600 text-white rounded-full font-semibold transition-colors hover:bg-red-700"
                        aria-label="Stop listening"
                    >
                        Stop
                    </button>
                </div>
            ) : (
                <>
                    {(inputValue.trim() || stagedFiles.length > 0) ? (
                        <button
                            onClick={handleManualSendMessage}
                            disabled={isLoading}
                            className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-600 transition-all duration-300"
                            aria-label="Send message"
                        >
                            <SendIcon />
                        </button>
                    ) : (
                        <div className="relative group flex justify-center">
                            <button 
                                onClick={handleMicClick}
                                disabled={isLoading}
                                className={`p-3 rounded-full text-gray-400 hover:text-white hover:bg-white/10 disabled:text-gray-600 disabled:cursor-not-allowed transition-all`}
                                aria-label="Use voice mode"
                            >
                                <MicIcon />
                            </button>
                            <div 
                                className="absolute bottom-full mb-2 whitespace-nowrap bg-black text-white text-sm font-semibold px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                                role="tooltip"
                            >
                                Use voice mode
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
      </div>
      <style>{`
        @keyframes slide-in-up {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-in-up {
            animation: slide-in-up 0.3s ease-out forwards;
        }
        @keyframes fade-in-up {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
            animation: fade-in-up 0.2s ease-out forwards;
        }
        @keyframes mic-pulse-effect {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .animate-mic-pulse {
          animation: mic-pulse-effect 1.5s infinite ease-out;
        }
      `}</style>
    </div>
  );
});
