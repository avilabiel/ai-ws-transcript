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

// Check if Krisp SDK is available
const isKrispAvailable =
  process.env.KRISP_API_KEY &&
  process.env.KRISP_API_KEY !== "your_krisp_api_key_here";

const wss = new WebSocketServer({ port: 3001 });

console.log("[✅] WebSocket server listening on ws://localhost:3001");
console.log(
  `[ℹ️] Krisp SDK is ${isKrispAvailable ? "available" : "not available"}`
);

// Store active audio streams
const activeStreams = new Map();

wss.on("connection", function connection(ws) {
  console.log("[🔌] Client connected");

  let audioBuffer = [];
  let streamId = null;

  ws.on("message", async function message(data) {
    try {
      const message = JSON.parse(data);

      if (message.type === "start_stream") {
        if (message.useKrisp && isKrispAvailable) {
          // Krisp mode
          try {
            const { KrispSDK } = await import("@krisp/sdk");
            const krisp = new KrispSDK({
              apiKey: process.env.KRISP_API_KEY,
            });

            streamId = await krisp.startAudioCapture({
              onAudioData: (audioData) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: "audio_data",
                      data: audioData,
                    })
                  );
                }
              },
              onError: (error) => {
                console.error("Krisp audio capture error:", error);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: "error",
                      message: error.message,
                    })
                  );
                }
              },
            });

            activeStreams.set(ws, streamId);
            ws.send(JSON.stringify({ type: "stream_started", streamId }));
          } catch (error) {
            console.error("Error initializing Krisp:", error);
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Failed to initialize Krisp SDK",
              })
            );
          }
        } else {
          // Microphone mode
          ws.send(JSON.stringify({ type: "stream_started" }));
        }
      } else if (message.type === "audio_data") {
        audioBuffer.push(Buffer.from(new Int16Array(message.data).buffer));
      } else if (message.type === "stop_stream") {
        if (streamId && isKrispAvailable) {
          try {
            const { KrispSDK } = await import("@krisp/sdk");
            const krisp = new KrispSDK({
              apiKey: process.env.KRISP_API_KEY,
            });
            await krisp.stopAudioCapture(streamId);
          } catch (error) {
            console.error("Error stopping Krisp stream:", error);
          }
          activeStreams.delete(ws);
          streamId = null;
        }
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

  ws.on("close", async () => {
    if (streamId && isKrispAvailable) {
      try {
        const { KrispSDK } = await import("@krisp/sdk");
        const krisp = new KrispSDK({
          apiKey: process.env.KRISP_API_KEY,
        });
        await krisp.stopAudioCapture(streamId);
      } catch (error) {
        console.error("Error stopping Krisp stream:", error);
      }
      activeStreams.delete(ws);
    }

    if (audioBuffer.length > 0) {
      console.log("[📤] Audio received. Sending to transcription API...");

      const audioPath = "./temp.webm";
      const combined = Buffer.concat(audioBuffer);
      fs.writeFileSync(audioPath, combined);

      try {
        const result = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioPath),
          model: "whisper-1",
        });

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "transcription",
                text: result.text || "[No transcription]",
              })
            );
          }
        });
      } catch (error) {
        console.error("Transcription error:", error);
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "error",
                message: "[Error during transcription]",
              })
            );
          }
        });
      }

      fs.unlinkSync(audioPath);
    }
  });
});
