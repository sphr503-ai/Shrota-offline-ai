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
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseScript, StoryNarrator, getAvailableVoices } from './services/ttsService';
import { ScriptLine, VoiceAssignment } from './types';

const DEFAULT_SCRIPT = `Narrator: Once upon a time, in a digital forest, lived a clever fox named Pixel.
Pixel: Hello there! I'm Pixel. I love exploring new code.
Narrator: Suddenly, a wise owl named Binary flew down from a branch.
Binary: Greetings, Pixel. Have you seen the latest algorithm?
Pixel: Not yet, Binary! Is it a fast one?
Narrator: The two friends spent the afternoon discussing the beauty of clean code.`;

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
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

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
          initialAssignments[char] = {
            name: char,
            voiceURI: voice.voiceURI,
            pitch: 1,
            rate: 1
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
          next[char] = {
            name: char,
            voiceURI: voice.voiceURI,
            pitch: 1,
            rate: 1
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
    
    if (isRecording) {
      stopRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `story-recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      handlePlay();
    } catch (err) {
      alert("Microphone access is required to record the story audio offline.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
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
            onClick={isRecording ? handleStop : startRecording}
            title={isRecording ? "Stop & Save" : "Download Audio (.webm)"}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all font-bold text-sm shadow-lg ${
              isRecording 
                ? 'bg-red-500 text-white animate-pulse shadow-red-200' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-5 h-5 fill-current" />
                <span>Recording...</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>Download Audio</span>
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
                    <span className="font-bold text-slate-700">{char}</span>
                    <div className="flex gap-2 text-[10px] font-mono text-slate-400">
                      <span>P: {assignments[char]?.pitch.toFixed(1)}</span>
                      <span>R: {assignments[char]?.rate.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <select
                    value={assignments[char]?.voiceURI || ''}
                    onChange={(e) => updateAssignment(char, 'voiceURI', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 mb-3"
                  >
                    {voices.map((v, index) => (
                      <option key={`${v.voiceURI}-${index}`} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Pitch</label>
                      <input 
                        type="range" min="0.5" max="2" step="0.1"
                        value={assignments[char]?.pitch || 1}
                        onChange={(e) => updateAssignment(char, 'pitch', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Rate</label>
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
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Recording & Export</h3>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm font-medium">Capture System Audio</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              To download the audio offline, use the <strong>Record</strong> button in the header. 
              It will play the story and record the sound via your device's audio input. 
              Once finished, a <code>.webm</code> file will be saved to your device.
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
