/**
 * Converts raw PCM (Int16) data to a high-quality WAV Blob.
 * Gemini TTS returns raw PCM data at 24000Hz.
 */
export function rawPcmToWav(pcmData: Uint8Array, sampleRate: number = 24000): Blob {
  const dataSize = pcmData.length;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  // 1. Write RIFF Header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true); // File size
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // 2. Write FMT Chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // PCM Format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // 3. Write DATA Chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // 4. Copy PCM Data
  const output = new Uint8Array(arrayBuffer, 44);
  output.set(pcmData);

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Handles the user-facing part of the process, ensuring it works on both mobile and desktop.
 */
export async function downloadOrShareAudio(blob: Blob, filename: string) {
  try {
    const file = new File([blob], filename, { type: blob.type });

    // 1. Try Web Share API first (Mobile friendly)
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Story Audio',
        text: 'Listen to my generated story!',
      });
      return;
    }
  } catch (err) {
    console.warn('Share failed, falling back to direct download', err);
  }

  // 2. Direct Download Fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  
  // Trigger click
  a.click();
  
  // Cleanup with delay to ensure browser starts download
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 1000);
}
