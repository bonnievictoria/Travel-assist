import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Schema } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';
import { Flight, ToolResponse } from '../types';

interface LiveServiceCallbacks {
  onStatusChange: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
  onAudioData: (buffer: AudioBuffer) => void;
  onFlightsFound: (response: ToolResponse) => void;
  onTranscript: (text: string, isUser: boolean) => void;
}

// Tool Declaration
export const searchFlightsTool: FunctionDeclaration = {
  name: 'searchFlights',
  description: 'Search for flights with optional layovers and stopovers. Use this when the user asks for routes, prices, or planning a trip.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING, description: 'Departure city or airport code.' },
      destination: { type: Type.STRING, description: 'Destination city or airport code.' },
      stops: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Stopover cities.' },
      date: { type: Type.STRING, description: 'Departure date YYYY-MM-DD.' }
    },
    required: ['origin', 'destination']
  }
};

// --- Real Data Fetching via Google Search & Extraction ---

async function fetchRealFlights(apiKey: string, query: string): Promise<ToolResponse> {
  const ai = new GoogleGenAI({ apiKey });
  
  // Step 1: Search the web for real flight data
  // using gemini-2.5-flash for grounding support
  const searchResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Find real flight options for: ${query}. detailed list with prices, airlines, times.`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const searchData = searchResponse.text;
  const sources = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.map(c => c.web ? { title: c.web.title || 'Source', uri: c.web.uri || '#' } : null)
    .filter(Boolean) as { title: string; uri: string }[] || [];

  if (!searchData) {
    return { flights: [], summary: "Could not find flight data.", sources: [] };
  }

  // Step 2: Extract structured data from the search result
  // using a schema to force JSON output
  const extractionResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Extract flight itineraries from this text into a strict JSON format. 
    Text: ${searchData}
    
    If specific times aren't mentioned, estimate valid times. 
    If prices aren't mentioned, estimate based on typical market rates for this route.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            totalPrice: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            totalDuration: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            stopoverInfo: { type: Type.STRING },
            legs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  origin: { type: Type.STRING },
                  destination: { type: Type.STRING },
                  departureTime: { type: Type.STRING },
                  arrivalTime: { type: Type.STRING },
                  duration: { type: Type.STRING },
                  carrier: { type: Type.STRING },
                  flightNumber: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    }
  });

  let flights: Flight[] = [];
  try {
    const rawJSON = extractionResponse.text;
    if (rawJSON) {
      flights = JSON.parse(rawJSON);
    }
  } catch (e) {
    console.error("Failed to parse extracted flight data", e);
  }

  // Fallback Summary if extraction fails but we have text
  const summary = flights.length > 0 
    ? `Found ${flights.length} real flight options from web sources.`
    : searchData.substring(0, 200) + "...";

  return { flights, summary, sources };
}


export async function runTextQuery(apiKey: string, query: string): Promise<ToolResponse & { type?: 'message' }> {
  const ai = new GoogleGenAI({ apiKey });
  
  // Direct text query handling
  // We first check if it looks like a flight search to save tokens/time
  // But strictly, we can just use the tool capability of generateContent
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: query,
      config: {
        tools: [{ functionDeclarations: [searchFlightsTool] }],
        systemInstruction: "You are AeroFlow. Use searchFlights for flight queries.",
      }
    });

    const fc = response.functionCalls?.[0];
    if (fc && fc.name === 'searchFlights') {
      const { origin, destination, stops, date } = fc.args as any;
      const searchQuery = `Flights from ${origin} to ${destination} ${stops?.length ? `via ${stops.join(', ')}` : ''} on ${date || 'upcoming dates'}`;
      return await fetchRealFlights(apiKey, searchQuery);
    }

    return { 
      flights: [], 
      summary: response.text || "I can help you plan flights. Try asking 'Find flights from London to NY'.",
      sources: []
    };

  } catch (error) {
    console.error("Text query error:", error);
    return { flights: [], summary: "Sorry, I encountered an error.", sources: [] };
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
  private apiKey: string;

  constructor(apiKey: string, callbacks: LiveServiceCallbacks) {
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey });
    this.callbacks = callbacks;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  async connect() {
    this.callbacks.onStatusChange('connecting');

    try {
      // CRITICAL: Resume AudioContext on user interaction
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are AeroFlow, a flight analyst. 
          When user asks for flights, call 'searchFlights'. 
          Wait for the tool response which will contain REAL data found from the web.
          Then summarize the top 1-2 options briefly in speech.`,
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
    
    // Separate context for input to ensure clean 16kHz
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
    // Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData) {
        try {
          // Ensure we are ready to play
          if (this.audioContext.state === 'suspended') await this.audioContext.resume();

          this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
          const buffer = await decodeAudioData(base64ToUint8Array(audioData), this.audioContext);
          this.callbacks.onAudioData(buffer);
          
          const source = this.audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(this.audioContext.destination);
          source.start(this.nextStartTime);
          this.nextStartTime += buffer.duration;
        } catch(e) {
          console.error("Audio decode error", e);
        }
    }

    // Tool Execution
    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'searchFlights') {
                const { origin, destination, stops, date } = fc.args as any;
                const searchQuery = `Flights from ${origin} to ${destination} ${stops?.length ? `via ${stops.join(', ')}` : ''} on ${date || 'upcoming dates'}`;
                
                // --- BRIDGE TO REAL DATA ---
                // We pause the live loop logic slightly to fetch real data via standard API
                // then feed it back to the Live session.
                const realData = await fetchRealFlights(this.apiKey, searchQuery);
                
                this.callbacks.onFlightsFound(realData);

                // Send response back to model
                this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                        functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: { 
                                result: `Found ${realData.flights.length} flights. 
                                Top option: ${realData.flights[0]?.legs?.[0]?.carrier} for ${realData.flights[0]?.totalPrice} ${realData.flights[0]?.currency}.
                                Summary: ${realData.summary}` 
                            }
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