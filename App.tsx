import React, { useState, useEffect, useRef } from 'react';
import { Mic, Settings, User, Navigation, Map as MapIcon, Calendar as CalendarIcon, Search, Send, ArrowRight, Loader2 } from 'lucide-react';
import { FlightCard } from './components/FlightCard';
import { PriceChart } from './components/PriceChart';
import { LiveService, runTextQuery } from './services/geminiService';
import { Flight, LiveStatus } from './types';

// Check for API Key
const API_KEY = process.env.API_KEY;

type View = 'search' | 'map' | 'calendar' | 'profile';

export default function App() {
  const [status, setStatus] = useState<LiveStatus>('disconnected');
  const [flights, setFlights] = useState<Flight[]>([]);
  const [searchSummary, setSearchSummary] = useState<string>("Ready to plan your trip.");
  const [showKeyModal, setShowKeyModal] = useState(!API_KEY);
  const [activeView, setActiveView] = useState<View>('search');
  
  // Text Input State
  const [inputText, setInputText] = useState('');
  const [isProcessingText, setIsProcessingText] = useState(false);
  
  // Audio Visualizer Logic
  const [audioLevel, setAudioLevel] = useState(0);
  
  const liveService = useRef<LiveService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (API_KEY) {
      liveService.current = new LiveService(API_KEY, {
        onStatusChange: setStatus,
        onAudioData: (buffer) => {
          const data = buffer.getChannelData(0);
          let sum = 0;
          for(let i=0; i<data.length; i+=100) sum += Math.abs(data[i]);
          setAudioLevel(Math.min(1, sum / (data.length / 100) * 5));
        },
        onFlightsFound: (foundFlights, summary) => {
          setFlights(foundFlights);
          setSearchSummary(summary);
          setActiveView('search'); // Force switch to search view
        },
        onTranscript: () => {}
      });
    }

    return () => {
      liveService.current?.disconnect();
    };
  }, []);

  const toggleVoice = () => {
    if (status === 'connected' || status === 'connecting') {
      liveService.current?.disconnect();
    } else {
      liveService.current?.connect();
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !API_KEY) return;

    const query = inputText;
    setInputText('');
    setIsProcessingText(true);
    setSearchSummary("Processing your request...");

    const result = await runTextQuery(API_KEY, query);
    
    if (result.type === 'flights') {
      setFlights(result.flights);
      setSearchSummary(result.summary);
      setActiveView('search');
    } else {
      setSearchSummary(result.text);
    }
    
    setIsProcessingText(false);
  };

  const VisualizerRing = ({ delay }: { delay: number }) => (
    <div 
      className={`absolute inset-0 rounded-full border border-blue-400 opacity-20 animate-ping`}
      style={{ animationDuration: '2s', animationDelay: `${delay}s`, display: status === 'connected' ? 'block' : 'none' }}
    />
  );

  if (showKeyModal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">AeroFlow Setup</h2>
          <p className="text-slate-600 mb-6">Environment variable API_KEY is missing. Please restart with a valid Gemini API Key.</p>
        </div>
      </div>
    );
  }

  // --- Views ---

  const SearchView = () => (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 pb-24">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2">
              {flights.length > 0 ? "Found Options" : "Where to next?"}
            </h2>
            <p className="text-blue-100 max-w-lg leading-relaxed">
              {searchSummary}
            </p>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-1/3 translate-y-1/3 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        </div>

        {flights.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Top Recommendations</h3>
              <span className="text-sm text-slate-500">{flights.length} results found</span>
            </div>
            {flights.map(flight => (
              <FlightCard key={flight.id} flight={flight} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Navigation size={40} className="text-slate-300" />
            </div>
            <p className="max-w-xs text-center">Tap the microphone or type below to start planning your next journey.</p>
          </div>
        )}
      </div>

      <div className="space-y-6">
          <PriceChart />
          
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Voice Commands</h3>
            <ul className="space-y-3">
                <li className="text-sm text-slate-600 flex gap-2 items-start cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setInputText("Show multi-city routes from NYC to Tokyo")}>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  "Show multi-city routes from NYC to Tokyo."
                </li>
                <li className="text-sm text-slate-600 flex gap-2 items-start cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setInputText("Add a stop in Paris for 2 nights")}>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  "Add a stop in Paris for 2 nights."
                </li>
                <li className="text-sm text-slate-600 flex gap-2 items-start cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setInputText("Filter for flights under $800")}>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  "Filter for flights under $800."
                </li>
            </ul>
          </div>
      </div>
    </div>
  );

  const MapView = () => (
    <div className="h-full w-full bg-slate-200 rounded-2xl overflow-hidden relative group">
      <img src="https://picsum.photos/1200/800?grayscale" className="w-full h-full object-cover" alt="World Map" />
      <div className="absolute inset-0 bg-slate-900/10 flex flex-col items-center justify-center">
        <div className="bg-white/90 backdrop-blur-md p-6 rounded-2xl shadow-xl max-w-sm text-center">
          <MapIcon size={48} className="mx-auto text-blue-500 mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">Interactive Map</h3>
          <p className="text-slate-600">Visualize your multi-stop route and explore layover cities.</p>
        </div>
      </div>
    </div>
  );

  const CalendarView = () => (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-2xl font-bold text-slate-800">Trip Calendar</h2>
           <button className="text-blue-600 font-medium">Sync with Google Calendar</button>
        </div>
        <div className="grid grid-cols-7 gap-4 text-center mb-4">
           {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
             <div key={d} className="font-semibold text-slate-500 text-sm">{d}</div>
           ))}
        </div>
        <div className="grid grid-cols-7 gap-4">
           {Array.from({length: 35}).map((_, i) => (
             <div key={i} className={`h-32 rounded-xl border border-slate-100 p-2 text-left hover:border-blue-200 transition-colors ${i === 15 || i === 18 ? 'bg-blue-50/50' : 'bg-white'}`}>
                <span className={`text-sm ${i === 15 || i === 18 ? 'font-bold text-blue-600' : 'text-slate-400'}`}>{i + 1}</span>
                {i === 15 && <div className="mt-2 text-xs bg-blue-100 text-blue-700 p-1.5 rounded font-medium">Flight to SIN</div>}
                {i === 18 && <div className="mt-2 text-xs bg-emerald-100 text-emerald-700 p-1.5 rounded font-medium">Arrival LHR</div>}
             </div>
           ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className="w-20 bg-white border-r border-slate-200 hidden md:flex flex-col items-center py-8 gap-8 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-200 mb-4">
          A
        </div>
        <nav className="flex flex-col gap-6 w-full items-center">
          <button 
            onClick={() => setActiveView('search')}
            className={`p-3 rounded-xl transition-all duration-200 ${activeView === 'search' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <Search size={24} />
          </button>
          <button 
            onClick={() => setActiveView('map')}
            className={`p-3 rounded-xl transition-all duration-200 ${activeView === 'map' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <MapIcon size={24} />
          </button>
          <button 
            onClick={() => setActiveView('calendar')}
            className={`p-3 rounded-xl transition-all duration-200 ${activeView === 'calendar' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <CalendarIcon size={24} />
          </button>
          <button 
            onClick={() => setActiveView('profile')}
            className={`p-3 rounded-xl transition-all duration-200 ${activeView === 'profile' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <User size={24} />
          </button>
        </nav>
        <div className="mt-auto">
          <button className="p-3 text-slate-400 hover:text-slate-600"><Settings size={24} /></button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <header className="h-20 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-20">
          <div>
             <h1 className="text-xl font-bold text-slate-800">
               {activeView === 'search' && 'Flight Analyst'}
               {activeView === 'map' && 'Global View'}
               {activeView === 'calendar' && 'Itinerary'}
               {activeView === 'profile' && 'Travel Profile'}
             </h1>
             <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                {status === 'connected' ? 'Listening...' : 'Ready'}
             </p>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-800">Jane Doe</div>
                <div className="text-xs text-slate-500">Premium Member</div>
             </div>
             <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden ring-2 ring-white shadow-sm">
                <img src="https://picsum.photos/100/100" alt="Avatar" />
             </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth">
           {activeView === 'search' && <SearchView />}
           {activeView === 'map' && <MapView />}
           {activeView === 'calendar' && <CalendarView />}
           {activeView === 'profile' && (
             <div className="flex items-center justify-center h-full text-slate-400">Profile Settings Placeholder</div>
           )}
        </div>

        {/* Unified Bottom Bar */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center items-end z-30 pointer-events-none px-4">
          <div className="bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl rounded-full p-2 flex items-center gap-2 pointer-events-auto max-w-2xl w-full transform transition-all hover:scale-[1.01] ring-1 ring-slate-200/50">
            
            {/* Text Input */}
            <form onSubmit={handleTextSubmit} className="flex-1 flex items-center pl-4">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask AeroFlow..."
                className="w-full bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 font-medium"
                disabled={isProcessingText}
              />
              {isProcessingText && <Loader2 className="animate-spin text-slate-400 mr-2" size={18} />}
            </form>

            {/* Mic Toggle */}
            <button 
              onClick={toggleVoice}
              className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                status === 'connected' 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-200' 
                  : inputText.length > 0
                    ? 'bg-slate-100 text-slate-400' // Dim mic if typing
                    : 'bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700'
              }`}
            >
              {status === 'connected' ? (
                <>
                   <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" />
                   <div className="flex gap-0.5 items-end h-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-1 bg-white rounded-full" style={{ height: `${Math.max(20, audioLevel * 100 * Math.random())}%` }} />
                      ))}
                   </div>
                </>
              ) : inputText.length > 0 ? (
                 <button onClick={handleTextSubmit} className="w-full h-full flex items-center justify-center bg-blue-600 rounded-full text-white hover:bg-blue-700 transition-colors">
                    <ArrowRight size={20} />
                 </button>
              ) : (
                <Mic size={20} />
              )}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}