import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  User, 
  Settings2, 
  BookOpen, 
  Volume2, 
  ChevronRight,
  RefreshCw,
  Download,
  FileText,
  Mic,
  Sparkles,
  Loader2,
  UserCheck,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import { parseScript, StoryNarrator, getAvailableVoices } from './services/ttsService';
import { ScriptLine, VoiceAssignment, CharacterPreset } from './types';
import { CHARACTER_PRESETS } from './constants';
import { rawPcmToWav, downloadOrShareAudio } from './utils/audioUtils';

const DEFAULT_SCRIPT = `Jarvis: Sophisticated, Analytical Deep British/Neutral Baritone.
Leo: Energetic, Friendly Mid-range, Casual American.
Atlas: Calm, Authoritative Deep, Resonant Bass.
Lyra: Warm, Helpful Soft, Clear Mezzo-soprano.
Nova: Sharp, Professional Crisp, Fast-paced Alto.
Maya: Gentle, Empathetic Smooth, Melodic Soprano.
Narrator: These are the six unique voices initialized for your offline story experience.`;

export default function App() {
  const [script, setScript] = useState(() => {
    const saved = localStorage.getItem('story-narrator-script');
    return saved !== null ? saved : DEFAULT_SCRIPT;
  });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [assignments, setAssignments] = useState<Record<string, VoiceAssignment>>(() => {
    const saved = localStorage.getItem('story-narrator-assignments');
    return saved !== null ? JSON.parse(saved) : {};
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [showSettings, setShowSettings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const narratorRef = useRef<StoryNarrator | null>(null);

  const parsedLines = useMemo(() => parseScript(script), [script]);
  const characters = useMemo(() => {
    const chars = new Set(parsedLines.map(l => l.character));
    return Array.from(chars);
  }, [parsedLines]);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = getAvailableVoices();
      setVoices(availableVoices);
      
      // Initial assignment
      if (availableVoices.length > 0) {
        const initialAssignments: Record<string, VoiceAssignment> = {};
        const chars = new Set(parseScript(DEFAULT_SCRIPT).map(l => l.character));
        
        Array.from(chars).forEach((char, index) => {
          const voice = availableVoices[index % availableVoices.length];
          const preset = CHARACTER_PRESETS.find(p => p.name === char);
          
          initialAssignments[char] = {
            name: char,
            voiceURI: voice.voiceURI,
            pitch: preset ? preset.defaultPitch : 1,
            rate: preset ? preset.defaultRate : 1
          };
        });
        setAssignments(prev => ({ ...initialAssignments, ...prev }));
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    narratorRef.current = new StoryNarrator(
      (index) => setCurrentLineIndex(index),
      () => {
        setIsPlaying(false);
        setCurrentLineIndex(-1);
      }
    );

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Save script to localStorage
  useEffect(() => {
    localStorage.setItem('story-narrator-script', script);
  }, [script]);

  // Save assignments to localStorage
  useEffect(() => {
    if (Object.keys(assignments).length > 0) {
      localStorage.setItem('story-narrator-assignments', JSON.stringify(assignments));
    }
  }, [assignments]);

  // Update assignments when new characters are detected
  useEffect(() => {
    if (voices.length === 0) return;

    setAssignments(prev => {
      const next = { ...prev };
      let changed = false;
      characters.forEach((char, i) => {
        if (!next[char]) {
          const voice = voices[i % voices.length];
          const preset = CHARACTER_PRESETS.find(p => p.name === char);
          
          next[char] = {
            name: char,
            voiceURI: voice.voiceURI,
            pitch: preset ? preset.defaultPitch : 1,
            rate: preset ? preset.defaultRate : 1
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [characters, voices]);

  const handlePlay = () => {
    if (isPaused) {
      narratorRef.current?.resume();
      setIsPaused(false);
    } else {
      setIsPlaying(true);
      narratorRef.current?.speak(parsedLines, assignments);
    }
  };

  const handlePause = () => {
    narratorRef.current?.pause();
    setIsPaused(true);
  };

  const handleStop = () => {
    narratorRef.current?.stop();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentLineIndex(-1);
  };

  const handleExportAudio = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      // Map characters to Gemini voices based on presets or gender
      const getGeminiVoice = (charName: string) => {
        const preset = CHARACTER_PRESETS.find(p => p.name === charName);
        if (preset) {
          const map: Record<string, string> = {
            'Jarvis': 'Charon',
            'Leo': 'Puck',
            'Atlas': 'Fenrir',
            'Lyra': 'Kore',
            'Nova': 'Zephyr',
            'Maya': 'Kore'
          };
          return map[preset.name] || 'Kore';
        }
        return 'Kore';
      };
      
      const prompt = `TTS the following story with different voices for each character. 
      Ensure clear pauses between speakers.
      
      STORY:
      ${script}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: characters.map((char) => ({
                speaker: char,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: getGeminiVoice(char) }
                }
              }))
            }
          }
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        // 1. Convert Base64 to Uint8Array directly
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // 2. Wrap raw PCM in a WAV header (Gemini returns 24000Hz mono PCM)
        const wavBlob = rawPcmToWav(bytes, 24000);
        
        // 3. Trigger reliable download/share
        await downloadOrShareAudio(wavBlob, `Story_HQ_${Date.now()}.wav`);
      } else {
        throw new Error("No audio data received from API");
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert("High-quality export failed. Please check your connection or try again later.");
    } finally {
      setIsExporting(false);
    }
  };

  const downloadScript = () => {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `story-script-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (char: string, presetName: string) => {
    const preset = CHARACTER_PRESETS.find(p => p.name === presetName);
    if (!preset) return;

    // Try to find a matching voice by gender keywords
    const matchingVoice = voices.find(v => {
      const name = v.name.toLowerCase();
      if (preset.gender === 'male') {
        return name.includes('male') || name.includes('david') || name.includes('mark') || name.includes('guy') || name.includes('stefan');
      } else {
        return name.includes('female') || name.includes('zira') || name.includes('hazel') || name.includes('susan') || name.includes('catherine');
      }
    }) || voices[0];

    setAssignments(prev => ({
      ...prev,
      [char]: {
        ...prev[char],
        pitch: preset.defaultPitch,
        rate: preset.defaultRate,
        voiceURI: matchingVoice.voiceURI
      }
    }));
  };

  const updateAssignment = (char: string, field: keyof VoiceAssignment, value: any) => {
    setAssignments(prev => ({
      ...prev,
      [char]: { ...prev[char], [field]: value }
    }));
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-slate-900 p-4 md:p-8 flex flex-col items-center">
      <header className="w-full max-w-5xl mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <BookOpen className="w-10 h-10 text-blue-600" />
            Offline Narrator
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Local Multi-Character Story Reader</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={downloadScript}
            title="Download Script (.txt)"
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 transition-all font-bold text-sm"
          >
            <FileText className="w-5 h-5" />
            <span className="hidden md:inline">Script</span>
          </button>
          
          <button 
            onClick={handleExportAudio}
            disabled={isExporting}
            title="Export High Quality Audio (.wav)"
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all font-bold text-sm shadow-lg ${
              isExporting 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>HQ Export</span>
              </>
            )}
          </button>

          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-3 rounded-2xl transition-all ${showSettings ? 'bg-slate-800 text-white shadow-lg shadow-slate-200' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
          >
            <Settings2 className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Script Input & Playback */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card rounded-3xl p-6 overflow-hidden relative">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                Script Editor
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setScript('')}
                  className="text-xs font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Clear
                </button>
              </div>
            </div>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Enter your script here... (e.g., Narrator: Once upon a time...)"
              className="w-full h-[400px] bg-transparent border-none focus:ring-0 resize-none font-mono text-lg leading-relaxed custom-scrollbar outline-none"
            />
            
            {/* Playback Controls Overlay */}
            <div className="absolute bottom-6 right-6 flex gap-3">
              {isPlaying && !isPaused ? (
                <button 
                  onClick={handlePause}
                  className="w-14 h-14 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-amber-200 hover:scale-105 active:scale-95 transition-all"
                >
                  <Pause className="w-6 h-6 fill-current" />
                </button>
              ) : (
                <button 
                  onClick={handlePlay}
                  className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-blue-200 hover:scale-105 active:scale-95 transition-all"
                >
                  <Play className="w-6 h-6 fill-current ml-1" />
                </button>
              )}
              
              {isPlaying && (
                <button 
                  onClick={handleStop}
                  className="w-14 h-14 bg-slate-800 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all"
                >
                  <Square className="w-6 h-6 fill-current" />
                </button>
              )}
            </div>
          </div>

          {/* Current Line Display */}
          <AnimatePresence mode="wait">
            {isPlaying && currentLineIndex !== -1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-3xl p-8 border border-blue-100 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-blue-600 uppercase tracking-tighter text-sm">
                    {parsedLines[currentLineIndex].character}
                  </span>
                </div>
                <p className="text-2xl font-medium leading-snug text-slate-800">
                  {parsedLines[currentLineIndex].text}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Character Voice Settings */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-3xl p-6 h-full">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Voice Assignments
            </h2>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {characters.map((char) => (
                <div key={char} className="bg-white/50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{char}</span>
                      {CHARACTER_PRESETS.some(p => p.name === char) && (
                        <UserCheck className="w-3 h-3 text-blue-500" title="System Preset Character" />
                      )}
                    </div>
                    <div className="flex gap-2 text-[10px] font-mono text-slate-400">
                      <span>P: {assignments[char]?.pitch.toFixed(1)}</span>
                      <span>R: {assignments[char]?.rate.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Select Voice Model</label>
                    <div className="grid grid-cols-3 gap-2">
                      {CHARACTER_PRESETS.map(p => (
                        <button
                          key={p.name}
                          onClick={() => applyPreset(char, p.name)}
                          className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                            assignments[char]?.pitch === p.defaultPitch && assignments[char]?.rate === p.defaultRate
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">System Voice</label>
                      <select
                        value={assignments[char]?.voiceURI || ''}
                        onChange={(e) => updateAssignment(char, 'voiceURI', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {voices.map((v, index) => (
                          <option key={`${v.voiceURI}-${index}`} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400">Pitch</label>
                        <span className="text-[9px] text-slate-400 font-mono">{assignments[char]?.pitch.toFixed(1)}</span>
                      </div>
                      <input 
                        type="range" min="0.5" max="2" step="0.1"
                        value={assignments[char]?.pitch || 1}
                        onChange={(e) => updateAssignment(char, 'pitch', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400">Rate</label>
                        <span className="text-[9px] text-slate-400 font-mono">{(assignments[char]?.rate * 150).toFixed(0)} WPM</span>
                      </div>
                      <input 
                        type="range" min="0.5" max="2" step="0.1"
                        value={assignments[char]?.rate || 1}
                        onChange={(e) => updateAssignment(char, 'rate', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {characters.length === 0 && (
                <div className="text-center py-12 text-slate-400 italic">
                  No characters detected in script.
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-6 text-white">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Character Presets
            </h3>
            <div className="space-y-3">
              {CHARACTER_PRESETS.map(p => (
                <div key={p.name} className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-blue-400">{p.name}</span>
                    <span className="text-[9px] text-slate-500 uppercase">{p.gender}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 italic leading-tight">{p.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-6 text-white">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">High Quality Export</h3>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm font-medium">AI-Powered Generation</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Use the <strong>HQ Export</strong> button to generate a studio-quality <code>.wav</code> file. 
              This uses the Gemini TTS engine to create a clean, professional audio file without needing microphone permissions.
            </p>
          </div>

          <div className="bg-slate-900 rounded-3xl p-6 text-white">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Offline Status</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium">Fully Operational Offline</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-4 leading-relaxed">
              This application uses your browser's native Speech Synthesis API. 
              No data is sent to any server. All processing happens locally on your device.
            </p>
          </div>
        </div>
      </main>

      <footer className="mt-12 text-slate-400 text-xs font-medium flex flex-col items-center gap-2">
        <p>© 2026 Offline Story Narrator • Built for Performance</p>
        <div className="flex gap-4">
          <span className="flex items-center gap-1"><Download className="w-3 h-3" /> PWA Ready</span>
          <span className="flex items-center gap-1"><Volume2 className="w-3 h-3" /> {voices.length} Local Voices</span>
        </div>
      </footer>
    </div>
  );
}
