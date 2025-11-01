

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// FIX: Replaced non-exported type GenerateContentCandidate with Candidate.
import { Chat, GenerateContentResponse, Part, Candidate, Modality, Content } from '@google/genai';
import { ChatWindow } from './components/ChatWindow';
import { HistoryPanel } from './components/HistoryPanel';
import { LiveChatView } from './components/LiveChatView';
import { startChat, sendMessage, editImage, generateVideo, generateImage, summarizeText } from './services/geminiService';
import { WELCOME_MESSAGES, LANGUAGES, SUSTAINABILITY_TIPS, TRIP_PLAN_PROMPT, ART_STYLES, TODAYS_BRIEFING_PROMPT } from './constants';
import { BeachIcon, HotelIcon, FoodIcon, TempleIcon, TripPlanIcon, PaletteIcon, SunCloudIcon } from './components/Icons';
import type { ChatMessage, Language, ChatStage, UploadedFile, Suggestion, ChatSession, GeneratedImage } from './types';
import type { ArtStyle } from './constants';

// Helper to convert app messages to Gemini's history format
const messageToGeminiContent = (message: ChatMessage): Content | null => {
    if (message.isSystem || message.isWelcome || (!message.text.trim() && !message.files?.length)) return null;

    const parts: Part[] = [];
    if (message.text) {
        parts.push({ text: message.text });
    }
    if (message.files) {
        message.files.forEach(file => {
            parts.push({ inlineData: { data: file.data, mimeType: file.mimeType } });
        });
    }

    return {
        role: message.sender === 'user' ? 'user' : 'model',
        parts: parts,
    };
};


const App: React.FC = () => {
  const [stage, setStage] = useState<ChatStage>('chat');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState<boolean>(false);
  const [isTextToSpeechEnabled, setIsTextToSpeechEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('gokarna-tts-enabled');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [isBotSpeaking, setIsBotSpeaking] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; } | null>(null);
  const [pendingImagePrompt, setPendingImagePrompt] = useState<string | null>(null);
  
  const chatSessionRef = useRef<Chat | null>(null);
  const userMessageCount = useRef(0);
  
  const initialSuggestions = useMemo(() => {
    const suggestions: { [key: string]: Suggestion[] } = {
        'en-US': [{ text: "Today's Briefing", icon: SunCloudIcon, prompt: TODAYS_BRIEFING_PROMPT['en-US'] }, { text: 'Explore Beaches', icon: BeachIcon }, { text: 'Find Hotels', icon: HotelIcon }, { text: 'Local Food', icon: FoodIcon }, { text: 'Temple Visits', icon: TempleIcon }, { text: 'Trip Plan', icon: TripPlanIcon }],
        'hi-IN': [{ text: 'आज की ब्रीफिंग', icon: SunCloudIcon, prompt: TODAYS_BRIEFING_PROMPT['hi-IN'] }, { text: 'समुद्र तट', icon: BeachIcon }, { text: 'होटल खोजें', icon: HotelIcon }, { text: 'स्थानीय भोजन', icon: FoodIcon }, { text: 'मंदिर दर्शन', icon: TempleIcon }, { text: 'यात्रा योजना', icon: TripPlanIcon }],
        'kn-IN': [{ text: 'ಇಂದಿನ ಬ್ರೀಫಿಂಗ್', icon: SunCloudIcon, prompt: TODAYS_BRIEFING_PROMPT['kn-IN'] }, { text: 'ಕಡಲತೀರಗಳು', icon: BeachIcon }, { text: 'ಹೋಟೆಲ್‌ಗಳು', icon: HotelIcon }, { text: 'ಸ್ಥಳೀಯ ಆಹಾರ', icon: FoodIcon }, { text: 'ದೇವಾಲಯ ಭೇಟಿಗಳು', icon: TempleIcon }, { text: 'ಪ್ರವಾಸ ಯೋಜನೆ', icon: TripPlanIcon }],
        'ta-IN': [{ text: 'இன்றைய அறிக்கை', icon: SunCloudIcon, prompt: TODAYS_BRIEFING_PROMPT['ta-IN'] }, { text: 'கடற்கரைகள்', icon: BeachIcon }, { text: 'ஹோட்டல்கள்', icon: HotelIcon }, { text: 'உள்ளூர் உணவு', icon: FoodIcon }, { text: 'கோவில் வருகைகள்', icon: TempleIcon }, { text: 'பயணத் திட்டம்', icon: TripPlanIcon }],
        'te-IN': [{ text: 'నేటి బ్రీఫింగ్', icon: SunCloudIcon, prompt: TODAYS_BRIEFING_PROMPT['te-IN'] }, { text: 'బీచ్‌లు', icon: BeachIcon }, { text: 'ಹోటళ్ళు', icon: HotelIcon }, { text: 'ಸ್ಥానిక ఆహారం', icon: FoodIcon }, { text: 'ఆలయ సందర్శనలు', icon: TempleIcon }, { text: 'ట్రిప్ ప్లాన్', icon: TripPlanIcon }],
        'ml-IN': [{ text: 'ഇന്നത്തെ ബ്രീഫിംഗ്', icon: SunCloudIcon, prompt: TODAYS_BRIEFING_PROMPT['ml-IN'] }, { text: 'ബീച്ചുകൾ', icon: BeachIcon }, { text: 'ഹോട്ടലുകൾ', icon: HotelIcon }, { text: 'പ്രാദേശിക ഭക്ഷണം', icon: FoodIcon }, { text: 'ക്ഷേത്ര സന്ദർശനം', icon: TempleIcon }, { text: 'യാത്രാ പദ്ധതി', icon: TripPlanIcon }],
    };
    return suggestions;
  }, []);

  const getWelcomeMessage = useCallback((languageCode: string) => ({
    id: Date.now(),
    text: ``,
    sender: 'bot' as const,
    suggestions: initialSuggestions[languageCode] || initialSuggestions['en-US'],
    isWelcome: true,
  }), [initialSuggestions]);

  // Load sessions from localStorage on initial mount, or create a default session
  useEffect(() => {
    try {
      const savedSessionsRaw = localStorage.getItem('gokarna-all-chats');
      if (savedSessionsRaw) {
        const savedSessions = JSON.parse(savedSessionsRaw);
        if (Array.isArray(savedSessions) && savedSessions.length > 0) {
          setSessions(savedSessions);
          const lastActiveId = localStorage.getItem('gokarna-active-chat-id');
          const activeSession = savedSessions.find(s => s.id === lastActiveId) || savedSessions[0];
          setActiveSessionId(activeSession.id);
          setStage('chat');
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load sessions from localStorage", e);
      localStorage.removeItem('gokarna-all-chats');
    }
    // No sessions found, create a default one in English
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [getWelcomeMessage('en-US')],
      languageCode: 'en-US',
    };
    setSessions([newSession]);
    setActiveSessionId(newSession.id);
  }, [getWelcomeMessage]);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('gokarna-all-chats', JSON.stringify(sessions));
    }
    if (activeSessionId) {
      localStorage.setItem('gokarna-active-chat-id', activeSessionId);
    }
  }, [sessions, activeSessionId]);
  
  useEffect(() => {
    localStorage.setItem('gokarna-tts-enabled', JSON.stringify(isTextToSpeechEnabled));
    // FIX: Immediately stop any ongoing speech when TTS is disabled.
    if (!isTextToSpeechEnabled) {
      window.speechSynthesis.cancel();
      setIsBotSpeaking(false);
    }
  }, [isTextToSpeechEnabled]);
  
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);
  const activeLanguage = useMemo(() => LANGUAGES.find(l => l.code === activeSession?.languageCode) || LANGUAGES[0], [activeSession]);

  const allGeneratedImages: GeneratedImage[] = useMemo(() => {
    return sessions.flatMap(session =>
      session.messages
        .filter(msg => msg.sender === 'bot' && msg.images && msg.images.length > 0)
        .flatMap(msg =>
          (msg.images ?? []).map(imageSrc => ({
            src: imageSrc,
            sessionId: session.id,
            messageId: msg.id,
          }))
        )
    ).reverse(); // Show newest first
  }, [sessions]);


  const updateSessionMessages = useCallback((sessionId: string, newMessages: ChatMessage[] | ((prevMessages: ChatMessage[]) => ChatMessage[])) => {
    setSessions(prevSessions =>
      prevSessions.map(session => {
        if (session.id === sessionId) {
          const updatedMessages = typeof newMessages === 'function' ? newMessages(session.messages) : newMessages;
          return { ...session, messages: updatedMessages };
        }
        return session;
      })
    );
  }, []);
  
  const addSystemMessage = useCallback((text: string) => {
    if (!activeSessionId) return;
    const systemMessage: ChatMessage = { id: Date.now(), text, sender: 'bot', isSystem: true };
    updateSessionMessages(activeSessionId, prev => [...prev, systemMessage]);
  }, [activeSessionId, updateSessionMessages]);
  
  // Initialize or re-initialize chat session when active session changes (e.g., new chat, or language change)
  useEffect(() => {
    if (activeSession) {
      const geminiHistory = activeSession.messages
        .map(messageToGeminiContent)
        .filter((c): c is Content => c !== null);

      chatSessionRef.current = startChat(activeSession.languageCode, geminiHistory);
      userMessageCount.current = activeSession.messages.filter(m => m.sender === 'user').length % 5;
    }
  }, [activeSession]);

  useEffect(() => {
    if (stage === 'chat') {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
          () => addSystemMessage("⚠️ Could not access your location. Nearby search will be less accurate.")
        );
      } else {
        addSystemMessage("⚠️ Geolocation is not supported by your browser.");
      }
    }
  }, [stage, addSystemMessage]);
  
  const handleNewChat = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsBotSpeaking(false);
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [getWelcomeMessage(activeLanguage.code)],
      languageCode: activeLanguage.code,
    };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSession.id);
    setIsHistoryPanelOpen(false);
  }, [activeLanguage, getWelcomeMessage]);
  
  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setIsHistoryPanelOpen(false);
  };
  
  const handleDeleteSession = (sessionId: string) => {
    setSessions(prev => {
      const remainingSessions = prev.filter(s => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        if (remainingSessions.length > 0) {
          setActiveSessionId(remainingSessions[0].id);
        } else {
          // If all chats are deleted, create a new default one
          const newSession: ChatSession = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [getWelcomeMessage('en-US')],
            languageCode: 'en-US',
          };
          setActiveSessionId(newSession.id);
          return [newSession];
        }
      }
      return remainingSessions;
    });
  };

  const handleRenameSession = (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setSessions(prev =>
      prev.map(s => (s.id === sessionId ? { ...s, title: newTitle.trim() } : s))
    );
  };

  const handleClearAllSessions = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsBotSpeaking(false);
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [getWelcomeMessage('en-US')],
      languageCode: 'en-US',
    };
    setSessions([newSession]);
    setActiveSessionId(newSession.id);
    setIsHistoryPanelOpen(false);
  }, [getWelcomeMessage]);

  const handleImageGeneration = useCallback(async (prompt: string, style: ArtStyle) => {
    if (!activeSessionId) return;
    const finalPrompt = `A ${style.toLowerCase()} of: ${prompt}`;
    const botMessageId = Date.now() + 1;
    const botMessagePlaceholder: ChatMessage = { id: botMessageId, text: '', sender: 'bot', isLoading: true };
    const userStyleMessage: ChatMessage = { id: Date.now(), text: style, sender: 'user'};
    updateSessionMessages(activeSessionId, prev => [...prev, userStyleMessage, botMessagePlaceholder]);

    try {
        const response = await generateImage(finalPrompt);
        if (response.promptFeedback?.blockReason) throw new Error(`Request was blocked due to: ${response.promptFeedback.blockReason.toLowerCase().replace(/_/g, ' ')}.`);
        
        const firstCandidate = response.candidates?.[0];
        const imagePart = firstCandidate?.content?.parts.find(p => p.inlineData);

        if (imagePart?.inlineData) {
            const generatedImage = imagePart.inlineData;
            const finalBotMessage: ChatMessage = { id: botMessageId, text: "Here is the image I generated for you:", sender: 'bot', images: [`data:${generatedImage.mimeType};base64,${generatedImage.data}`], isLoading: false };
            updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? finalBotMessage : msg));
        } else {
            const explanation = response.text;
            if (explanation && explanation.trim()) {
                const finalBotMessage: ChatMessage = { id: botMessageId, text: explanation, sender: 'bot', isLoading: false };
                updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? finalBotMessage : msg));
            } else {
                throw new Error("No image was returned from the API.");
            }
        }
    } catch (error) {
        console.error('Error generating image:', error);
        let userMessage = "Sorry, I couldn't generate the image. Please try a different prompt.";
        if (error instanceof Error) {
            if (error.message.includes('safety')) userMessage = "I'm unable to create an image for that request as it appears to violate safety guidelines. Could you please try a different idea?";
            else if (error.message.includes('No image was returned')) userMessage = "It seems I had trouble creating an image for that prompt. Could you please try a different one?";
            else if (error.message.includes('blocked due to')) userMessage = "I'm unable to create an image for that request because it was blocked. Please try rephrasing your prompt.";
        }
        updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? { ...msg, text: userMessage, isLoading: false } : msg));
    }
  }, [activeSessionId, updateSessionMessages]);

  const handleImageEdit = useCallback(async (text: string, file: UploadedFile) => {
      if (!activeSessionId) return;
      const userMessage: ChatMessage = { id: Date.now(), text: `(Edit Prompt: ${text})`, sender: 'user', files: [file] };
      const botMessageId = Date.now() + 1;
      const botMessagePlaceholder: ChatMessage = { id: botMessageId, text: '', sender: 'bot', isLoading: true };
      updateSessionMessages(activeSessionId, prev => {
          if (prev.length === 1 && prev[0].isWelcome) return [userMessage, botMessagePlaceholder];
          return [...prev, userMessage, botMessagePlaceholder];
      });

      try {
          const response = await editImage(file, text);
          if (response.promptFeedback?.blockReason) throw new Error(`Request was blocked due to: ${response.promptFeedback.blockReason.toLowerCase().replace(/_/g, ' ')}.`);
          
          const firstCandidate = response.candidates?.[0];
          const imagePart = firstCandidate?.content?.parts.find(p => p.inlineData);
          
          if (imagePart?.inlineData) {
              const editedImage = imagePart.inlineData;
              const finalBotMessage: ChatMessage = { id: botMessageId, text: "Here's the edited image:", sender: 'bot', images: [`data:${editedImage.mimeType};base64,${editedImage.data}`], isLoading: false };
              updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? finalBotMessage : msg));
          } else {
              const explanation = response.text;
              if (explanation && explanation.trim()) {
                  const finalBotMessage: ChatMessage = { id: botMessageId, text: explanation, sender: 'bot', isLoading: false };
                  updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? finalBotMessage : msg));
              } else {
                  throw new Error("No image was returned from the API.");
              }
          }
      } catch (error) {
          console.error('Error editing image:', error);
          let userMessage = "Sorry, I couldn't edit the image. Please try a different prompt or image.";
          if (error instanceof Error) {
            if (error.message.includes('safety')) userMessage = "I'm unable to edit the image with that request as it appears to violate safety guidelines. Could you please try a different edit?";
            else if (error.message.includes('No image was returned')) userMessage = "It seems I had trouble editing the image with that prompt. Could you please try a more descriptive or different edit?";
            else if (error.message.includes('blocked due to')) userMessage = "I'm unable to edit the image with that request because it was blocked. Please try rephrasing your prompt.";
          }
          updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? { ...msg, text: userMessage, isLoading: false } : msg));
      }
  }, [activeSessionId, updateSessionMessages]);

  const handleSendMessage = useCallback(async (payload: { text: string; files: UploadedFile[], prompt?: string }) => {
    window.speechSynthesis.cancel();
    setIsBotSpeaking(false);
    
    const { text, files, prompt } = payload;
    if (!text.trim() && files.length === 0 || !activeSessionId) return;

    const currentSession = sessions.find(s => s.id === activeSessionId);
    if (!currentSession) return;

    // Handle language change request
    const languagesForRegex = LANGUAGES.map(l => l.name.toLowerCase()).join('|');
    const langChangeRegex = new RegExp(`\\b(?:in|speak|talk in|use|change to|switch to|respond in)\\s+(${languagesForRegex})\\b`, 'i');
    const match = text.trim().match(langChangeRegex);

    if (match) {
        const requestedLangName = match[1].toLowerCase();
        const targetLanguage = LANGUAGES.find(l => l.name.toLowerCase() === requestedLangName);

        if (targetLanguage && targetLanguage.code !== currentSession.languageCode) {
            const userMessage: ChatMessage = { id: Date.now(), text, sender: 'user' };
            updateSessionMessages(activeSessionId, prev => [...prev.filter(m => !m.isWelcome), userMessage]);

            setSessions(prevSessions =>
              prevSessions.map(session =>
                session.id === activeSessionId ? { ...session, languageCode: targetLanguage.code } : session
              )
            );

            const confirmationMessage: ChatMessage = {
                id: Date.now() + 1,
                sender: 'bot',
                text: `Certainly! I will now respond in ${targetLanguage.name}.`,
            };
            updateSessionMessages(activeSessionId, prev => [...prev, confirmationMessage]);
            return;
        }
    }

    // Handle image generation style selection
    if (pendingImagePrompt && ART_STYLES.includes(text as ArtStyle)) {
      handleImageGeneration(pendingImagePrompt, text as ArtStyle);
      setPendingImagePrompt(null);
      return;
    }
    if (pendingImagePrompt) setPendingImagePrompt(null);

    // Handle image editing
    if (files.length === 1 && files[0].mimeType.startsWith('image/') && text.trim()) {
      handleImageEdit(text, files[0]);
      return;
    }

    // Handle image generation request
    const imageGenRegex = /\b(generate|create|draw|make|imagine|show me|give me|produce|render|paint|picture|photo|drawing|painting|illustration|artwork|sketch|portrait)\b/i;
    const imageGenBlockRegex = /\b(what|how|why|explain|describe)\b.{0,50}\b(to|do you|is it possible to)\s*(generate|create|draw|make|edit)/i;
    if (imageGenRegex.test(text.trim()) && !imageGenBlockRegex.test(text.trim()) && files.length === 0) {
        setPendingImagePrompt(text);
        const userMessage: ChatMessage = { id: Date.now(), text, sender: 'user' };
        const artStyleSuggestions: Suggestion[] = ART_STYLES.map(style => ({ text: style, icon: PaletteIcon }));
        const botMessage: ChatMessage = { id: Date.now() + 1, sender: 'bot', text: 'Sounds creative! Which art style would you like?', suggestions: artStyleSuggestions };
        updateSessionMessages(activeSessionId, prev => [...prev.filter(m => !m.isWelcome), userMessage, botMessage]);
        return;
    }

    // Handle Trip Plan suggestion
    const tripPlanVariants = LANGUAGES.map(lang => initialSuggestions[lang.code][5].text.toLowerCase());
    if (tripPlanVariants.includes(text.toLowerCase().trim()) && files.length === 0) {
        const userMessage: ChatMessage = { id: Date.now(), text, sender: 'user' };
        const botResponse: ChatMessage = { id: Date.now() + 1, sender: 'bot', text: TRIP_PLAN_PROMPT[currentSession.languageCode] || TRIP_PLAN_PROMPT['en-US'] };
        updateSessionMessages(activeSessionId, prev => {
          if (prev.length === 1 && prev[0].isWelcome) return [userMessage, botResponse];
          return [...prev, userMessage, botResponse];
        });
        return;
    }

    // Standard message sending
    const userMessage: ChatMessage = { id: Date.now(), text, sender: 'user', files };
    userMessageCount.current += 1;

    const botMessageId = Date.now() + 1;
    const botMessagePlaceholder: ChatMessage = { id: botMessageId, text: '', sender: 'bot', isLoading: true };

    const isFirstUserMessage = currentSession.messages.filter(m => m.sender === 'user').length === 0;
    if (isFirstUserMessage) {
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, title: text.substring(0, 40) } : s));
    }

    updateSessionMessages(activeSessionId, prev => {
      if (prev.length === 1 && prev[0].isWelcome) return [userMessage, botMessagePlaceholder];
      return [...prev, userMessage, botMessagePlaceholder];
    });

    try {
        if (!chatSessionRef.current) throw new Error("Chat session not initialized");
        
        let promptText = prompt || text;
        if (userLocation) promptText = `My current location is latitude: ${userLocation.latitude}, longitude: ${userLocation.longitude}. Please use this for any location-based queries.\n\nMy request: "${promptText}"`;

        const imageParts: Part[] = files.filter(f => f.mimeType.startsWith('image/')).map(f => ({ inlineData: { data: f.data, mimeType: f.mimeType } }));
        files.filter(f => f.mimeType === 'text/plain').forEach(f => {
          promptText = `Context from file "${f.name}":\n${f.data}\n\nMy question: ${promptText}`;
        });
        
        const stream = await sendMessage(chatSessionRef.current, [promptText, ...imageParts]);
        let fullResponse = '', sources: {uri: string, title: string}[] = [];

        for await (const chunk of stream) {
            fullResponse += chunk.text;
            // FIX: Removed unnecessary type assertion for chunk.candidates.
            const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata?.groundingChunks && Array.isArray(groundingMetadata.groundingChunks)) {
                const webChunks = groundingMetadata.groundingChunks
                  .flatMap(c => {
                      if (c.web) {
                          return [c.web];
                      }
                      if (c.maps?.placeAnswerSources && Array.isArray(c.maps.placeAnswerSources)) {
                          return c.maps.placeAnswerSources.map(p => ({ uri: p.uri, title: p.displayName }));
                      }
                      return [];
                  })
                  .filter((c): c is { uri: string; title: string } => !!c && !!c.uri);
                sources.push(...webChunks);
            }
            updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? { ...msg, text: fullResponse, isLoading: true } : msg));
        }
        
        const cleanedText = fullResponse.replace(/!\[.*?\]\(.*?\)/g, '').trim();
        const uniqueSources = Array.from(new Map(sources.map(s => [s.uri, s])).values());
        
        const finalBotMessage: ChatMessage = { id: botMessageId, text: cleanedText, sender: 'bot', sources: uniqueSources, isLoading: false };
        updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? finalBotMessage : msg));

        if (userMessageCount.current >= 5) {
            userMessageCount.current = 0;
            const tip = SUSTAINABILITY_TIPS[currentSession.languageCode] || SUSTAINABILITY_TIPS['en-US'];
            setTimeout(() => {
                addSystemMessage(tip);
            }, 500);
        }

    } catch (error) {
        console.error('Error sending message:', error);
        updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? { ...msg, text: "Sorry, I encountered an error. Please try again.", isLoading: false } : msg));
    }
  }, [activeSessionId, sessions, pendingImagePrompt, userLocation, handleImageEdit, handleImageGeneration, initialSuggestions, updateSessionMessages, addSystemMessage]);
  
  const handleVideoGeneration = useCallback(async (file: UploadedFile, prompt: string, aspectRatio: '16:9' | '9:16') => {
    if (!activeSessionId) return;
    const userMessage: ChatMessage = { id: Date.now(), text: `(Video Prompt: ${prompt})`, sender: 'user', files: [file] };
    const botMessageId = Date.now() + 1;
    const botMessagePlaceholder: ChatMessage = { id: botMessageId, text: '', sender: 'bot', isLoading: true, videoState: 'generating' };
    updateSessionMessages(activeSessionId, prev => {
      if (prev.length === 1 && prev[0].isWelcome) return [userMessage, botMessagePlaceholder];
      return [...prev, userMessage, botMessagePlaceholder];
    });

    try {
        const videoUri = await generateVideo(file, prompt, aspectRatio);
        const finalBotMessage: ChatMessage = { id: botMessageId, text: 'Here is the generated video:', sender: 'bot', isLoading: false, videoState: 'done', videoUrl: videoUri };
        updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? finalBotMessage : msg));
    } catch (error) {
        console.error('Error generating video:', error);
        const errorMessage = (error instanceof Error) ? error.message : "An unknown error occurred.";
        updateSessionMessages(activeSessionId, prev => prev.map(msg => msg.id === botMessageId ? { ...msg, text: `Sorry, I couldn't generate the video. Error: ${errorMessage}`, isLoading: false, videoState: 'failed' } : msg));
    }
  }, [activeSessionId, updateSessionMessages]);

  const handleSummarize = useCallback(async (textToSummarize: string) => {
    if (!activeSessionId) return;
    const tempId = Date.now();
    addSystemMessage("Summarizing...");

    try {
        const summary = await summarizeText(textToSummarize);
        const summaryMessage: ChatMessage = {
            id: Date.now(),
            sender: 'bot',
            text: `📝 **Summary**\n\n${summary}`,
        };
        updateSessionMessages(activeSessionId, prev => 
            prev.filter(m => !(m.isSystem && m.text === "Summarizing..."))
                .concat(summaryMessage)
        );
    } catch (error) {
        console.error("Summarization error:", error);
        updateSessionMessages(activeSessionId, prev => 
            prev.filter(m => !(m.isSystem && m.text === "Summarizing..."))
        );
        addSystemMessage("Sorry, I couldn't summarize that. Please try again.");
    }
  }, [activeSessionId, addSystemMessage, updateSessionMessages]);

  const renderContent = () => {
    switch (stage) {
      case 'live-chat':
        return <LiveChatView onGoBack={() => setStage('chat')} />;
      case 'chat':
      default:
        return activeSession ? (
          <ChatWindow
            messages={activeSession.messages}
            onSendMessage={handleSendMessage}
            onGenerateVideo={handleVideoGeneration}
            onSummarize={handleSummarize}
            isLoading={isLoading}
            language={activeLanguage}
            isTextToSpeechEnabled={isTextToSpeechEnabled}
            onToggleTextToSpeech={() => setIsTextToSpeechEnabled(prev => !prev)}
            isBotSpeaking={isBotSpeaking}
            setIsBotSpeaking={setIsBotSpeaking}
            addSystemMessage={addSystemMessage}
            onToggleHistoryPanel={() => setIsHistoryPanelOpen(prev => !prev)}
          />
        ) : null;
    }
  };

  return (
    <div className="bg-[#131314] text-gray-200 h-screen w-full font-sans flex overflow-hidden relative">
      <HistoryPanel
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onClearAllSessions={handleClearAllSessions}
        isOpen={isHistoryPanelOpen}
        onToggle={() => setIsHistoryPanelOpen(prev => !prev)}
        allGeneratedImages={allGeneratedImages}
      />
      <main className={`flex-1 flex flex-col transition-all duration-300 ${isHistoryPanelOpen ? 'md:ml-96' : ''}`}>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;