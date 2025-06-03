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

// Function to analyze technical correctness
async function analyzeTechnicalCorrectness(text) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "You are a technical expert. Analyze if the following statement is technically correct. Consider programming, computer science, and technical concepts. Respond with only 'CORRECT' or 'INCORRECT' followed by a brief explanation.",
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    const result = response.choices[0].message.content;
    const isCorrect = result.startsWith("CORRECT");
    const explanation = result.split("\n")[1] || "";

    return {
      isCorrect,
      explanation,
    };
  } catch (error) {
    console.error("Error analyzing technical correctness:", error);
    return {
      isCorrect: null,
      explanation: "Error analyzing technical correctness",
    };
  }
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

  try {
    // Write the file
    fs.writeFileSync(audioPath, wavFile);

    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
    });
    console.log("[📝] Transcription result:", result);

    if (result.text && result.text.trim()) {
      // Analyze technical correctness
      const analysis = await analyzeTechnicalCorrectness(result.text);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "transcription",
            text: result.text || "[No transcription]",
            technicalAnalysis: analysis,
          })
        );
      }
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
    // Safely delete the temporary file
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch (cleanupError) {
      console.error("[⚠️] Error cleaning up temporary file:", cleanupError);
    }
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
