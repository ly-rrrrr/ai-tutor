/**
 * Text-to-Speech helper using the OpenAI speech API.
 * 
 * Returns audio as a Buffer that can be uploaded to S3 for playback.
 */
import { ENV } from "./env";
import { buildAiGatewayUrl, getAiGatewayHeaders } from "./aiGateway";

export type TTSOptions = {
  text: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  speed?: number; // 0.25 to 4.0, default 1.0
  model?: string;
  response_format?: "mp3" | "opus" | "aac" | "flac" | "wav";
};

export type TTSResult = {
  audioBuffer: Buffer;
  contentType: string;
};

export type TTSError = {
  error: string;
  code: "SERVICE_ERROR" | "INVALID_INPUT" | "TTS_FAILED";
  details?: string;
};

/**
 * Convert text to speech using the internal TTS service
 */
export async function textToSpeech(
  options: TTSOptions
): Promise<TTSResult | TTSError> {
  try {
    if (!ENV.aiBaseUrl || !ENV.aiApiKey) {
      return {
        error: "TTS service is not configured",
        code: "SERVICE_ERROR",
        details: "AI_BASE_URL and AI_API_KEY must be configured",
      };
    }

    if (!options.text || options.text.trim().length === 0) {
      return {
        error: "Text is required for TTS",
        code: "INVALID_INPUT",
        details: "The text field cannot be empty",
      };
    }

    // Limit text length to prevent abuse (4096 chars max for OpenAI TTS)
    const text = options.text.slice(0, 4096);

    const format = options.response_format || "mp3";
    const voiceMap: Record<NonNullable<TTSOptions["voice"]>, string> = {
      alloy: "alloy",
      echo: "echo",
      fable: "alloy",
      onyx: "echo",
      nova: "shimmer",
      shimmer: "shimmer",
    };
    const selectedVoice = voiceMap[options.voice || "nova"] || "shimmer";

    const response = await fetch(buildAiGatewayUrl("/audio/speech"), {
      method: "POST",
      headers: getAiGatewayHeaders({
        "content-type": "application/json",
      }),
      body: JSON.stringify({
        model: options.model || ENV.aiTtsModel,
        input: text,
        voice: selectedVoice,
        speed: options.speed || 1.0,
        response_format: format,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "TTS service request failed",
        code: "TTS_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const contentTypeMap: Record<string, string> = {
      mp3: "audio/mpeg",
      opus: "audio/opus",
      aac: "audio/aac",
      flac: "audio/flac",
      wav: "audio/wav",
    };

    return {
      audioBuffer,
      contentType: contentTypeMap[format] || "audio/mpeg",
    };
  } catch (error) {
    return {
      error: "Text-to-speech conversion failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
