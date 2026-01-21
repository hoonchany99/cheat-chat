import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-7b28fdc9/health", (c) => {
  return c.json({ status: "ok" });
});

// Whisper transcription endpoint
app.post("/make-server-7b28fdc9/transcribe", async (c) => {
  try {
    const formData = await c.req.formData();
    const audioFile = formData.get("audio") as File;
    
    if (!audioFile) {
      return c.json({ error: "No audio file provided" }, 400);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return c.json({ error: "OpenAI API key not configured" }, 500);
    }

    // Prepare form data for OpenAI API
    const openaiFormData = new FormData();
    openaiFormData.append("file", audioFile, "audio.webm");
    openaiFormData.append("model", "whisper-1");
    openaiFormData.append("language", "ko"); // Korean
    openaiFormData.append("response_format", "json");

    // Call OpenAI Whisper API
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: openaiFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return c.json({ error: "Transcription failed", details: errorText }, response.status);
    }

    const result = await response.json();
    return c.json({ text: result.text });
  } catch (error) {
    console.error("Transcription error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

Deno.serve(app.fetch);