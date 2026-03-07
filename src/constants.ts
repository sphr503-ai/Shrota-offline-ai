import { CharacterPreset } from './types';

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    name: "Jarvis",
    gender: "male",
    defaultPitch: 0.8,
    defaultRate: 1.0, // Browser rate 1.0 is ~150-160 WPM
    description: "Sophisticated, Analytical Deep British/Neutral Baritone"
  },
  {
    name: "Leo",
    gender: "male",
    defaultPitch: 1.1,
    defaultRate: 1.2, // ~175 WPM
    description: "Energetic, Friendly Mid-range, Casual American"
  },
  {
    name: "Atlas",
    gender: "male",
    defaultPitch: 0.5,
    defaultRate: 0.8, // ~130 WPM
    description: "Calm, Authoritative Deep, Resonant Bass"
  },
  {
    name: "Lyra",
    gender: "female",
    defaultPitch: 1.0,
    defaultRate: 1.1, // ~160 WPM
    description: "Warm, Helpful Soft, Clear Mezzo-soprano"
  },
  {
    name: "Nova",
    gender: "female",
    defaultPitch: 1.2,
    defaultRate: 1.3, // ~185 WPM
    description: "Sharp, Professional Crisp, Fast-paced Alto"
  },
  {
    name: "Maya",
    gender: "female",
    defaultPitch: 0.9,
    defaultRate: 0.9, // ~145 WPM
    description: "Gentle, Empathetic Smooth, Melodic Soprano"
  }
];
