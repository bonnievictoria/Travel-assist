import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';
import { mockSearchFlights } from './flightService';
import { Flight } from '../types';

interface LiveServiceCallbacks {
  onStatusChange: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
  onAudioData: (buffer: AudioBuffer) => void;
  onFlightsFound: (flights: Flight[], summary: string) => void;
  onTranscript: (text: string, isUser: boolean) => void;
}

// Tool Declaration
export const searchFlightsTool: FunctionDeclaration = {
  name: 'searchFlights',
  description: 'Search for flights with optional layovers and stopovers. Use this when the user asks for routes, prices, or planning a trip.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING, description: 'Three-letter IATA code or city name of departure (e.g., LHR, London).' },
      destination: { type: Type.STRING, description: 'Three-letter IATA code or city name of destination.' },
      stops: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: 'List of cities or codes for stopovers/layovers.' 
      },
      date: { type: Type.STRING, description: 'Departure date in YYYY-MM-DD format.' }
    },
    required: ['origin', 'destination']
  }
};

export type TextQueryResult = 
  | { type: 'flights'; flights: Flight[]; summary: string }
  | { type: 'message'; text: string };

export async function runTextQuery(apiKey: string, query: string): Promise<TextQueryResult> {
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview',
      contents: query,
      config: {
        tools: [{ functionDeclarations: [searchFlightsTool] }],
        systemInstruction: "You are AeroFlow. If the user asks for flights, use the searchFlights tool. If the request is ambiguous, ask for clarification briefly.",
      }
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      const fc = response.functionCalls[0];
      if (fc.name === 'searchFlights') {
        const { origin, destination, stops, date } = fc.args as any;
        const flights = mockSearchFlights(origin, destination, stops, date);
        return { 
          type: 'flights', 
          flights, 
          summary: `Found ${flights.length} options from ${origin} to ${destination}${stops?.length ? ` via ${stops.join(', ')}` : ''}.` 
        };
      }
    }

    return { type: 'message', text: response.text || "I didn't quite get that. Could you try rephrasing?" };
  } catch (error) {
    console.error("Text query error:", error);
    return { type: 'message', text: "Sorry, I encountered an error processing your request." };
  }
}

export class LiveService {
  private ai: GoogleGenAI;
  private audioContext: AudioContext;
  private callbacks: LiveServiceCallbacks;
  private sessionPromise: Promise<any> | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime = 0;
  private currentStream: MediaStream | null = null;

  constructor(apiKey: string, callbacks: LiveServiceCallbacks) {
    this.ai = new GoogleGenAI({ apiKey });
    this.callbacks = callbacks;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  async connect() {
    this.callbacks.onStatusChange('connecting');

    try {
      this.currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are AeroFlow, an advanced flight planning AI assistant. 
          Your goal is to help users plan complex multi-stop journeys via voice. 
          You are sleek, professional, and concise. 
          When a user gives a command like "Find flights from London to Jakarta with a 2-day stop in Singapore", use the 'searchFlights' tool.
          Confirm actions clearly (e.g., "Searching routes via Singapore..."). 
          Ask clarifying questions if airports or durations are ambiguous, but prioritize showing results quickly.
          Keep spoken responses short (under 2 sentences) as the user can see the visual results.`,
          tools: [{ functionDeclarations: [searchFlightsTool] }],
        },
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onclose: () => this.callbacks.onStatusChange('disconnected'),
          onerror: (err) => {
            console.error(err);
            this.callbacks.onStatusChange('error');
          }
        }
      });

    } catch (error) {
      console.error('Connection failed:', error);
      this.callbacks.onStatusChange('error');
    }
  }

  private handleOpen() {
    this.callbacks.onStatusChange('connected');
    
    if (!this.currentStream) return;
    
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const source = inputCtx.createMediaStreamSource(this.currentStream);
    const processor = inputCtx.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createPcmBlob(inputData);
      
      if (this.sessionPromise) {
        this.sessionPromise.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      }
    };

    source.connect(processor);
    processor.connect(inputCtx.destination);
    
    this.inputSource = source;
    this.processor = processor;
  }

  private async handleMessage(message: LiveServerMessage) {
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData) {
        this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
        const buffer = await decodeAudioData(base64ToUint8Array(audioData), this.audioContext);
        this.callbacks.onAudioData(buffer);
        
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
    }

    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'searchFlights') {
                const { origin, destination, stops, date } = fc.args as any;
                const mockFlights = mockSearchFlights(
                    origin as string, 
                    destination as string, 
                    stops as string[] || [], 
                    date as string || new Date().toISOString()
                );

                this.callbacks.onFlightsFound(mockFlights, `Found ${mockFlights.length} options from ${origin} to ${destination}.`);

                this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                        functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: { result: `Found ${mockFlights.length} flights. Displaying them to user now.` }
                        }
                    });
                });
            }
        }
    }
  }

  async disconnect() {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
    if (this.inputSource) this.inputSource.disconnect();
    if (this.processor) this.processor.disconnect();
    
    this.callbacks.onStatusChange('disconnected');
    this.sessionPromise = null;
  }
}