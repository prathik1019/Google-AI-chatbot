

import React, { useState, useEffect, useRef } from 'react';
// FIX: Removed LiveSession as it is not an exported member of the library.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { BackIcon, MicIcon, WaveformIcon } from './Icons';

interface LiveChatViewProps {
  onGoBack: () => void;
}

// --- Audio Helper Functions ---
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

export const LiveChatView: React.FC<LiveChatViewProps> = ({ onGoBack }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error' | 'closed'>('idle');
  const [transcription, setTranscription] = useState<{ user: string, bot: string, isFinal: boolean }[]>([]);
  
  // FIX: Inferred session type from the `ai.live.connect` method since LiveSession is not exported.
  const sessionRef = useRef<Awaited<ReturnType<typeof ai.live.connect>> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextStartTimeRef = useRef(0);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  useEffect(() => {
    // Initialize output audio context
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const outputAudioContext = outputAudioContextRef.current;

    const connect = async () => {
      setStatus('connecting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              setStatus('connected');
              const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
              inputAudioContextRef.current = inputAudioContext;
              const source = inputAudioContext.createMediaStreamSource(stream);
              const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
              scriptProcessorRef.current = scriptProcessor;

              scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const int16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  int16[i] = inputData[i] * 32768;
                }
                const pcmBlob: Blob = {
                  data: encode(new Uint8Array(int16.buffer)),
                  mimeType: 'audio/pcm;rate=16000',
                };
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContext.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
                if (message.serverContent?.inputTranscription) {
                    currentInputTranscription.current = message.serverContent.inputTranscription.text;
                    setTranscription(prev => {
                        const newTranscription = [...prev];
                        const last = newTranscription[newTranscription.length - 1];
                        if (last && !last.isFinal) {
                            last.user = currentInputTranscription.current;
                        } else {
                            newTranscription.push({ user: currentInputTranscription.current, bot: '', isFinal: false });
                        }
                        return newTranscription;
                    });
                }
                if (message.serverContent?.outputTranscription) {
                    currentOutputTranscription.current += message.serverContent.outputTranscription.text;
                    setTranscription(prev => {
                        const newTranscription = [...prev];
                        const last = newTranscription[newTranscription.length - 1];
                        if (last) last.bot = currentOutputTranscription.current;
                        return newTranscription;
                    });
                }
                if (message.serverContent?.turnComplete) {
                    setTranscription(prev => {
                        const newTranscription = [...prev];
                        const last = newTranscription[newTranscription.length - 1];
                        if (last) last.isFinal = true;
                        return newTranscription;
                    });
                    currentInputTranscription.current = '';
                    currentOutputTranscription.current = '';
                }

                // --- Handle Audio Output ---
                const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                if (base64EncodedAudioString) {
                    nextStartTimeRef.current = Math.max(
                        nextStartTimeRef.current,
                        outputAudioContext.currentTime,
                    );
                    const audioBuffer = await decodeAudioData(
                        decode(base64EncodedAudioString),
                        outputAudioContext,
                        24000,
                        1,
                    );
                    const source = outputAudioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputAudioContext.destination);
                    source.addEventListener('ended', () => {
                        sourcesRef.current.delete(source);
                    });

                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
                    sourcesRef.current.add(source);
                }

                const interrupted = message.serverContent?.interrupted;
                if (interrupted) {
                    for (const source of sourcesRef.current.values()) {
                        source.stop();
                        sourcesRef.current.delete(source);
                    }
                    nextStartTimeRef.current = 0;
                }
            },
            onerror: (e: ErrorEvent) => {
              console.error('Live session error:', e);
              setStatus('error');
            },
            onclose: () => {
              setStatus('closed');
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: "You are a helpful travel assistant for Gokarna. Keep your answers concise and friendly.",
          },
        });
        sessionRef.current = await sessionPromise;
      } catch (err) {
        console.error('Failed to get media devices or connect:', err);
        setStatus('error');
      }
    };

    connect();

    return () => {
      sessionRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      scriptProcessorRef.current?.disconnect();
      inputAudioContextRef.current?.close();
      outputAudioContextRef.current?.close();
      sourcesRef.current.forEach(source => source.stop());
    };
  }, []);

  const getStatusIndicator = () => {
    switch (status) {
      case 'connecting': return <p className="text-yellow-400">Connecting...</p>;
      case 'connected': return <p className="text-green-400">Connected</p>;
      case 'error': return <p className="text-red-400">Connection Error</p>;
      case 'closed': return <p className="text-gray-400">Connection Closed</p>;
      default: return <p className="text-gray-500">Idle</p>;
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#131314] text-gray-200">
      <header className="absolute top-0 left-0 right-0 p-4 z-10 flex items-center justify-between">
        <button
          onClick={onGoBack}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
        >
          <BackIcon />
        </button>
        <h1 className="text-xl font-bold">Live Conversation</h1>
        <div className="w-10"></div>
      </header>
      
      <main className="flex-1 overflow-y-auto p-6 pt-24 text-2xl font-medium leading-relaxed">
        {transcription.map((turn, index) => (
            <div key={index} className="mb-6 animate-fade-in">
                <p><span className="font-bold text-gray-400">You: </span>{turn.user}</p>
                {turn.bot && <p className="mt-2"><span className="font-bold text-blue-400">Bot: </span>{turn.bot}</p>}
            </div>
        ))}
      </main>

      <footer className="p-6 border-t border-gray-800 flex flex-col items-center justify-center">
        <div className="mb-4">
            {status === 'connected' ? <WaveformIcon isAnimating={true}/> : <MicIcon className="w-8 h-8 text-gray-500"/>}
        </div>
        {getStatusIndicator()}
      </footer>
    </div>
  );
};