

import { GoogleGenAI, Chat, Part, Modality, GenerateContentResponse, Content } from '@google/genai';
import { SYSTEM_PROMPT } from '../constants';
import type { UploadedFile } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export function startChat(languageCode: string, history: Content[] = []): Chat {
  return ai.chats.create({
    model: 'gemini-2.5-pro',
    config: {
      systemInstruction: `${SYSTEM_PROMPT}\n The user's preferred language is ${languageCode}. Please respond primarily in this language unless the user switches.`,
      tools: [{ googleSearch: {} }, { googleMaps: {} }],
    },
    history: history,
  });
}

export async function sendMessage(chat: Chat, message: (string | Part)[]) {
    return await chat.sendMessageStream({ message });
}

export async function editImage(file: UploadedFile, prompt: string): Promise<GenerateContentResponse> {
    const imagePart: Part = {
        inlineData: {
            data: file.data,
            mimeType: file.mimeType,
        }
    };
    const textPart: Part = { text: prompt };

    // For multi-part requests, 'contents' must be a Content object with a 'parts' array.
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    return response;
}

export async function generateImage(prompt: string): Promise<GenerateContentResponse> {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    return response;
}

export async function generateVideo(file: UploadedFile, prompt: string, aspectRatio: '16:9' | '9:16'): Promise<string> {
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        image: {
            imageBytes: file.data,
            mimeType: file.mimeType,
        },
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: aspectRatio,
        }
    });

    while (!operation.done) {
        // Poll every 10 seconds
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("Video generation completed but no download link was found.");
    }
    
    // Append API key for direct access
    const finalUrl = `${downloadLink}&key=${API_KEY}`;
    return finalUrl;
}

export async function summarizeText(text: string): Promise<string> {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Summarize the following text concisely:\n\n${text}`,
    });
    return response.text;
}