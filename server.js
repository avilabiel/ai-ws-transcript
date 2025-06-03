import dotenv from "dotenv";

dotenv.config();

import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const wss = new WebSocketServer({ port: 3001 });

console.log("[✅] WebSocket server listening on ws://localhost:3001");

wss.on("connection", function connection(ws) {
  console.log("[🔌] Client connected");

  let audioBuffer = [];

  ws.on("message", function message(data) {
    audioBuffer.push(Buffer.from(data));
  });

  ws.on("close", async () => {
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
          client.send(result.text || "[No transcription]");
        }
      });
    } catch (error) {
      console.error("Transcription error:", error);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send("[Error during transcription]");
        }
      });
    }

    fs.unlinkSync(audioPath);
  });
});
