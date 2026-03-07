export interface CharacterPreset {
  name: string;
  gender: 'male' | 'female';
  defaultPitch: number;
  defaultRate: number;
  description: string;
}

export interface VoiceAssignment {
  name: string;
  voiceURI: string;
  pitch: number;
  rate: number;
}

export interface ScriptLine {
  character: string;
  text: string;
}

export interface AppState {
  script: string;
  assignments: Record<string, VoiceAssignment>;
  isPlaying: boolean;
  currentLineIndex: number;
}
