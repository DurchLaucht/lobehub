import type { ASROptions, ASRPayload, ASRResponse } from '../../types/asr';
import { resolveMappedModelId } from '../../utils/modelIdMapping';

const getBaseURL = (baseURL?: string) =>
  (baseURL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

const formatToExtension: Record<string, string> = {
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/x-m4a': 'm4a',
};

const extensionByFormat: Record<string, string> = {
  aac: 'aac',
  flac: 'flac',
  m4a: 'm4a',
  mp3: 'mp3',
  mp4: 'm4a',
  ogg: 'ogg',
  wav: 'wav',
  webm: 'webm',
};

const guessFormat = (file: Blob, fileName?: string): string => {
  const nameExt = fileName?.split('.').pop()?.toLowerCase();
  if (nameExt && extensionByFormat[nameExt]) return extensionByFormat[nameExt];

  const mime = file.type?.split(';')[0]?.trim().toLowerCase();
  if (mime && formatToExtension[mime]) return formatToExtension[mime];

  if (nameExt) return nameExt;

  return 'wav';
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
};

export const createOpenRouterTranscription = async (
  payload: ASRPayload,
  options: ASROptions & { apiKey: string; baseURL?: string },
): Promise<ASRResponse> => {
  const { file, fileName, language, temperature } = payload;
  const requestModel = resolveMappedModelId(payload.model, options);
  const baseURL = getBaseURL(options.baseURL);

  const format = guessFormat(file, fileName);
  const arrayBuffer = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(arrayBuffer);

  const body: Record<string, unknown> = {
    input_audio: {
      data: base64Data,
      format,
    },
    model: requestModel,
  };

  if (language) body.language = language;
  if (temperature !== undefined) body.temperature = temperature;

  const response = await fetch(`${baseURL}/audio/transcriptions`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lobehub.com',
      'X-Title': 'LobeHub',
      ...(options.headers as Record<string, string> | undefined),
    },
    method: 'POST',
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter transcription API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    text?: string;
    usage?: {
      cost?: number;
      input_tokens?: number;
      output_tokens?: number;
      seconds?: number;
      total_tokens?: number;
    };
  };

  return {
    text: data.text ?? '',
    ...(data.usage
      ? {
          usage: {
            cost: data.usage.cost,
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
            seconds: data.usage.seconds,
            totalTokens: data.usage.total_tokens,
          },
        }
      : {}),
  };
};
