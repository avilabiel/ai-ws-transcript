import dotenv from "dotenv";

dotenv.config();

import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import OpenAI from "openai";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Start the HTTP server
app.listen(port, () => {
  console.log(`[✅] HTTP server listening on http://localhost:${port}`);
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const wss = new WebSocketServer({ port: 3001 });

console.log("[✅] WebSocket server listening on ws://localhost:3001");

// Function to create WAV header
function createWavHeader(dataLength) {
  const buffer = Buffer.alloc(44);

  // RIFF identifier
  buffer.write("RIFF", 0);
  // file length minus RIFF identifier length and file description length
  buffer.writeUInt32LE(36 + dataLength, 4);
  // RIFF type
  buffer.write("WAVE", 8);
  // format chunk identifier
  buffer.write("fmt ", 12);
  // format chunk length
  buffer.writeUInt32LE(16, 16);
  // sample format (raw)
  buffer.writeUInt16LE(1, 20);
  // channel count
  buffer.writeUInt16LE(1, 22);
  // sample rate
  buffer.writeUInt32LE(16000, 24);
  // byte rate (sample rate * block align)
  buffer.writeUInt32LE(16000 * 2, 28);
  // block align (channel count * bytes per sample)
  buffer.writeUInt16LE(2, 32);
  // bits per sample
  buffer.writeUInt16LE(16, 34);
  // data chunk identifier
  buffer.write("data", 36);
  // data chunk length
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

// Function to transcribe audio
async function transcribeAudio(audioBuffer, ws) {
  if (audioBuffer.length === 0) return;

  const combined = Buffer.concat(audioBuffer);
  // Only transcribe if we have at least 1 second of audio (16000 samples)
  if (combined.length < 32000) return; // 16000 samples * 2 bytes per sample

  const wavHeader = createWavHeader(combined.length);
  const wavFile = Buffer.concat([wavHeader, combined]);

  const audioPath = "./temp.wav";
  fs.writeFileSync(audioPath, wavFile);

  try {
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
    });
    console.log("[📝] Transcription result:", result);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "transcription",
          text: result.text || "[No transcription]",
        })
      );
    }
  } catch (error) {
    console.error("[❌] Transcription error:", error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: error.message,
        })
      );
    }
  } finally {
    fs.unlinkSync(audioPath);
  }
}

wss.on("connection", function connection(ws) {
  console.log("[🔌] Client connected");

  let audioBuffer = [];
  let transcriptionInterval = null;

  ws.on("message", async function message(data) {
    try {
      const message = JSON.parse(data);

      if (message.type === "start_stream") {
        ws.send(JSON.stringify({ type: "stream_started" }));

        // Start periodic transcription
        transcriptionInterval = setInterval(() => {
          transcribeAudio(audioBuffer, ws);
          audioBuffer = []; // Clear buffer after transcription
        }, 3000); // Transcribe every 3 seconds
      } else if (message.type === "audio_data") {
        // Convert the audio data to Int16Array
        const audioData = new Int16Array(message.data);
        audioBuffer.push(Buffer.from(audioData.buffer));
      } else if (message.type === "stop_stream") {
        if (transcriptionInterval) {
          clearInterval(transcriptionInterval);
          transcriptionInterval = null;
        }
        // Final transcription
        await transcribeAudio(audioBuffer, ws);
        audioBuffer = [];
      }
    } catch (error) {
      console.error("Error processing message:", error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: error.message,
          })
        );
      }
    }
  });

  ws.on("close", () => {
    if (transcriptionInterval) {
      clearInterval(transcriptionInterval);
      transcriptionInterval = null;
    }
    // Final transcription on close
    transcribeAudio(audioBuffer, ws);
    audioBuffer = [];
  });
});
