import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

let ai: GoogleGenAI | null = null;

function getGenAI() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required but not configured.");
    }
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON requests
  app.use(express.json());

  // API endpoint for High Quality Text-to-Speech proxying
  app.post("/api/tts", async (req, res) => {
    try {
      const { script, characters } = req.body;
      if (!script) {
        return res.status(400).json({ error: "Script text is required." });
      }

      const aiClient = getGenAI();

      const getGeminiVoice = (charName: string) => {
        const name = charName.trim();
        const map: Record<string, string> = {
          'Jarvis': 'Charon',
          'Leo': 'Puck',
          'Atlas': 'Fenrir',
          'Lyra': 'Kore',
          'Nova': 'Zephyr',
          'Maya': 'Kore',
          'SpeakerMale': 'Puck',
          'SpeakerFemale': 'Kore'
        };
        return map[name] || 'Kore';
      };

      let preparedScript = script;
      let speakerConfigs = [];

      // Filter non-empty character names
      const activeCharacters = (characters || []).filter((c: string) => c && c.trim() !== "");

      if (activeCharacters.length > 2) {
        // Partition characters into exactly 2 speakers (SpeakerMale / SpeakerFemale) to satisfy Gemini multi-speaker requirement
        activeCharacters.forEach((char: string) => {
          const lowerChar = char.toLowerCase().trim();
          const isMale = ['jarvis', 'leo', 'atlas'].includes(lowerChar);
          const replacement = isMale ? 'SpeakerMale' : 'SpeakerFemale';
          const regex = new RegExp(`^\\s*${char}\\s*:`, 'gmi');
          preparedScript = preparedScript.replace(regex, `${replacement}:`);
        });

        speakerConfigs = [
          {
            speaker: 'SpeakerMale',
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' }
            }
          },
          {
            speaker: 'SpeakerFemale',
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }
            }
          }
        ];
      } else {
        // 1 or 2 characters: map them directly (filling to exactly 2)
        const speaker1 = activeCharacters[0] || 'Narrator';
        const speaker2 = activeCharacters[1] || (speaker1 === 'Narrator' ? 'Listener' : 'Narrator');

        speakerConfigs = [
          {
            speaker: speaker1,
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: getGeminiVoice(speaker1) }
            }
          },
          {
            speaker: speaker2,
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: getGeminiVoice(speaker2) }
            }
          }
        ];
      }

      const prompt = `TTS the following story with different voices for each character. Ensure clear pauses between speakers.

STORY:
${preparedScript}`;

      const response = await aiClient.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: speakerConfigs
            }
          }
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(500).json({ error: "No audio data was received from Gemini TTS API." });
      }

      return res.json({ base64Audio });
    } catch (error: any) {
      console.error("Gemini TTS API error on server:", error);
      return res.status(500).json({ error: error.message || "Failed to generate high quality audio on server." });
    }
  });

  // Serve Vite files in development or compiled files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
