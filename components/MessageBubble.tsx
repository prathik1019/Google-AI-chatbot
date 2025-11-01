// FIX: Corrected the React import to include useState and useEffect hooks.
import React, { useState, useEffect } from 'react';
import type { ChatMessage, Language } from '../types';
import { FileTextIcon, ShareIcon, CheckIcon, CopyIcon, DownloadIcon, SummarizeIcon } from './Icons';

interface MessageBubbleProps {
  message: ChatMessage;
  isTextToSpeechEnabled?: boolean;
  language?: Language;
  setIsBotSpeaking?: (isSpeaking: boolean) => void;
  onSummarize?: (text: string) => void;
  isLastMessage?: boolean;
}

const TypingIndicator: React.FC = () => (
  <div className="flex items-center space-x-1.5">
    <div className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce"></div>
  </div>
);

const VideoGeneratingIndicator: React.FC = () => (
  <div className="flex items-center space-x-2 text-gray-400">
    <div className="w-4 h-4 border-2 border-dashed rounded-full animate-spin border-gray-500"></div>
    <span>Generating video... this may take a few minutes.</span>
  </div>
);


const cleanTextForSpeech = (text: string) => {
  return text
    .replace(/\*\*/g, '')
    .replace(/\[.*?\]\(.*?\)/g, ' ')
    .replace(/━━━━━━━━━━━━━━━━━━/g, '. ')
    .replace(/🌴|🌅|🏖️|🕉️|📍|🚗|🎯|🕓|⚠️|🧭|🛏️|👍|👎|•/g, ' '); 
};

const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
  const processLine = (line: string) => {
    const combinedRegex = /\[(.*?)\]\((.*?)\)|\*\*(.*?)\*\*/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        elements.push(line.substring(lastIndex, match.index));
      }

      const [, linkText, linkUrl, boldText] = match;

      if (linkText !== undefined && linkUrl !== undefined) {
        elements.push(
          <a key={match.index} href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            {linkText}
          </a>
        );
      } else if (boldText !== undefined) {
        elements.push(<strong key={match.index}>{boldText}</strong>);
      }
      
      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      elements.push(line.substring(lastIndex));
    }
    
    return elements.map((part, index) => <React.Fragment key={index}>{part}</React.Fragment>);
  };

  return (
    <>
      {text.split('\n').map((line, index) => (
        <p key={index} className="min-h-[1.2em]">
          {processLine(line)}
        </p>
      ))}
    </>
  );
};


export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isTextToSpeechEnabled, language, setIsBotSpeaking, onSummarize, isLastMessage }) => {
  const { text, sender, isLoading, videoState, videoUrl } = message;
  const isUser = sender === 'user';
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    }
  }, []);
  
  useEffect(() => {
    if (isTextToSpeechEnabled && sender === 'bot' && !isLoading && text && voices.length > 0 && setIsBotSpeaking) {
      window.speechSynthesis.cancel();
      
      const textToSpeak = cleanTextForSpeech(text);
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      
      let voiceToUse = voices.find(v => v.lang === language?.code);
      if (!voiceToUse) voiceToUse = voices.find(v => v.lang.startsWith(language?.code.split('-')[0] || 'en'));
      if (!voiceToUse) voiceToUse = voices.find(v => v.lang.startsWith('en'));

      if (voiceToUse) utterance.voice = voiceToUse;
      
      utterance.rate = 1;
      utterance.pitch = 1;
      
      utterance.onstart = () => setIsBotSpeaking(true);
      utterance.onend = () => setIsBotSpeaking(false);
      utterance.onerror = () => setIsBotSpeaking(false);
      
      window.speechSynthesis.speak(utterance);
    }
  }, [isTextToSpeechEnabled, sender, isLoading, text, language, voices, setIsBotSpeaking]);

  const handleShare = async () => {
    const cleanText = text.replace(/\*\*/g, '');
    if (navigator.share) {
        try {
            await navigator.share({ title: 'Gokarna Guide Tip', text: cleanText });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    } else {
       console.error("Web Share API not supported in this browser.");
       // Optionally, inform the user with a system message.
    }
  };

  const handleCopy = () => {
    const cleanText = text.replace(/\*\*/g, '');
    if (!navigator.clipboard) {
        console.error("Clipboard API not supported in this browser.");
        return;
    }
    navigator.clipboard.writeText(cleanText).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    }, (err) => console.error('Failed to copy text: ', err));
  };
  
  const handleDownload = (src: string, index: number) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `gokarna-guide-image-${message.id}-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const userBubbleClasses = 'bg-[#252525] text-gray-200 self-end px-6 py-4 rounded-[20px] shadow-md border border-white/5 transition-all duration-300 ease-in-out hover:bg-[#333] hover:shadow-lg';
  const botBubbleClasses = '';

  const bubbleClass = isUser ? userBubbleClasses : botBubbleClasses;
  const alignmentClass = isUser ? 'items-end' : (message.isWelcome ? 'items-center text-center' : 'items-start');
  
  if (message.isWelcome) return null;

  if (message.isSystem) {
    return (
        <div className="flex justify-center my-2 animate-message-appear">
            <div className="px-3 py-1 bg-gray-800 text-gray-400 text-xs rounded-full shadow">
                {message.text}
            </div>
        </div>
    );
  }

  return (
    <div className={`flex flex-col w-full ${alignmentClass} animate-message-appear`}>
        {message.files && message.files.length > 0 && (
             <div className="mb-2 grid grid-cols-3 sm:grid-cols-4 gap-2 max-w-xl self-end">
                {message.files.map((file, index) => (
                    <div key={index} className="rounded-xl border border-gray-700 p-1 bg-[#252525]/50">
                        {file.previewUrl ? 
                            <img src={file.previewUrl} alt={file.name} className="rounded-lg object-cover aspect-square" />
                            : 
                            <div className="flex flex-col items-center justify-center aspect-square text-gray-400">
                                <FileTextIcon/>
                                <span className="text-xs text-center truncate w-full px-1">{file.name}</span>
                            </div>
                        }
                    </div>
                ))}
            </div>
        )}
        
        {videoState === 'generating' && <VideoGeneratingIndicator />}
        
        {videoState === 'done' && videoUrl && (
             <video src={videoUrl} controls className="mt-3 rounded-xl max-w-xl w-full" />
        )}

        {(text || (isLoading && videoState !== 'generating')) && (
            <div className={`max-w-xl transition-opacity duration-500 text-base md:text-lg leading-relaxed ${bubbleClass}`}>
                {isLoading && !text ? <TypingIndicator /> : <MarkdownRenderer text={text} />}
            </div>
        )}

        {!isUser && !isLoading && text && (
            <div className="flex items-center gap-2 mt-3 max-w-xl">
                 <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors duration-200 bg-[#252525] hover:bg-[#333] px-2 py-1 rounded-md border border-gray-700/50"
                    aria-label="Share message"
                >
                    <ShareIcon className="h-4 w-4" />
                    <span>Share</span>
                </button>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors duration-200 bg-[#252525] hover:bg-[#333] px-2 py-1 rounded-md border border-gray-700/50"
                    aria-label="Copy message text"
                >
                    {isCopied ? (
                        <><CheckIcon className="h-4 w-4 text-green-500" /><span>Copied!</span></>
                    ) : (
                        <><CopyIcon className="h-4 w-4" /><span>Copy</span></>
                    )}
                </button>
                {onSummarize && text.length > 500 && (
                     <button
                        onClick={() => onSummarize(text)}
                        className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors duration-200 bg-[#252525] hover:bg-[#333] px-2 py-1 rounded-md border border-gray-700/50"
                        aria-label="Summarize text"
                    >
                        <SummarizeIcon className="h-4 w-4" />
                        <span>Summarize</span>
                    </button>
                )}
            </div>
        )}
        
        {!isLoading && message.images && message.images.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl">
                {message.images.map((src, index) => (
                    <div key={index} className="relative group">
                        <a href={src} target="_blank" rel="noopener noreferrer">
                            <img src={src} alt={`Gokarna image ${index + 1}`} className="rounded-xl object-cover aspect-square hover:opacity-80 transition-opacity" />
                        </a>
                        <button 
                            onClick={() => handleDownload(src, index)}
                            className="absolute bottom-2 right-2 p-2 bg-black/60 text-white rounded-full invisible group-hover:visible hover:bg-black/80 transition-all duration-300"
                            aria-label="Download image"
                        >
                            <DownloadIcon className="h-5 w-5" />
                        </button>
                    </div>
                ))}
            </div>
        )}
        
        {!isLoading && message.sources && message.sources.length > 0 && (
            <div className="mt-3 max-w-xl text-xs text-gray-500">
                <h4 className="font-semibold mb-1 text-gray-400">Sources:</h4>
                <ul className="list-disc list-inside space-y-1">
                    {message.sources.map((source, index) => (
                        <li key={index} className="truncate">
                           <a href={source.uri} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-400">
                                {source.title || new URL(source.uri).hostname}
                           </a>
                        </li>
                    ))}
                </ul>
            </div>
        )}
        
        {!isUser && !isLoading && !message.isSystem && !isLastMessage && (
            <hr className="w-full max-w-xl border-t-2 border-gray-800 mt-8" />
        )}
    </div>
  );
};

const style = document.createElement('style');
style.innerHTML = `
@keyframes message-appear {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.animate-message-appear {
  animation: message-appear 0.4s ease-out forwards;
}
`;
document.head.appendChild(style);