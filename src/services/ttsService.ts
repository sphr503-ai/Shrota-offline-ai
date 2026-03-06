import { ScriptLine } from "../types";

export const parseScript = (text: string): ScriptLine[] => {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  return lines.map(line => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      return {
        character: match[1].trim(),
        text: match[2].trim()
      };
    }
    return {
      character: 'Narrator',
      text: line.trim()
    };
  });
};

export const getAvailableVoices = (): SpeechSynthesisVoice[] => {
  return window.speechSynthesis.getVoices();
};

export class StoryNarrator {
  private synth: SpeechSynthesis;
  private onLineStart?: (index: number) => void;
  private onEnd?: () => void;
  private isPaused: boolean = false;

  constructor(onLineStart?: (index: number) => void, onEnd?: () => void) {
    this.synth = window.speechSynthesis;
    this.onLineStart = onLineStart;
    this.onEnd = onEnd;
  }

  speak(lines: ScriptLine[], assignments: Record<string, any>, startIndex: number = 0) {
    this.synth.cancel();
    this.isPaused = false;
    this.speakLine(lines, assignments, startIndex);
  }

  private speakLine(lines: ScriptLine[], assignments: Record<string, any>, index: number) {
    if (index >= lines.length) {
      this.onEnd?.();
      return;
    }

    const line = lines[index];
    const assignment = assignments[line.character] || assignments['Narrator'];
    
    const utterance = new SpeechSynthesisUtterance(line.text);
    
    const voices = this.synth.getVoices();
    const voice = voices.find(v => v.voiceURI === assignment?.voiceURI);
    
    if (voice) utterance.voice = voice;
    utterance.pitch = assignment?.pitch ?? 1;
    utterance.rate = assignment?.rate ?? 1;

    utterance.onstart = () => {
      this.onLineStart?.(index);
    };

    utterance.onend = () => {
      if (!this.isPaused) {
        this.speakLine(lines, assignments, index + 1);
      }
    };

    this.synth.speak(utterance);
  }

  pause() {
    this.isPaused = true;
    this.synth.pause();
  }

  resume() {
    this.isPaused = false;
    this.synth.resume();
  }

  stop() {
    this.isPaused = false;
    this.synth.cancel();
  }
}
