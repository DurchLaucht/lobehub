import type { ModelUsage } from '@lobechat/types';
import { imageUrlToBase64 } from '@lobechat/utils';
import type { RuntimeImageGenParams } from 'model-bank';

import type { CreateImageOptions } from '../../core/openaiCompatibleFactory';
import type { CreateImagePayload, CreateImageResponse } from '../../types/image';
import { resolveMappedModelId } from '../../utils/modelIdMapping';
import { parseDataUri } from '../../utils/uriParser';

interface OpenRouterImageResponseData {
  b64_json?: string;
  media_type?: string;
  url?: string;
}

interface OpenRouterImageUsage {
  completion_tokens?: number;
  cost?: number;
  prompt_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterImageResponse {
  data?: OpenRouterImageResponseData[];
  usage?: OpenRouterImageUsage;
}

const hasValue = (value: unknown) =>
  value !== undefined && value !== null && value !== '' && value !== 'auto';

const getReferenceImageUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.pathname.startsWith('/f/')) {
      parsedUrl.searchParams.set('download', '1');
      return parsedUrl.toString();
    }
  } catch {
    // Let imageUrlToBase64 report the original URL error.
  }

  return url;
};

const resolveReferenceImage = async (url: string) => {
  if (parseDataUri(url).type === 'base64') return url;

  const { base64, mimeType } = await imageUrlToBase64(getReferenceImageUrl(url));

  if (!mimeType.startsWith('image/')) {
    throw new Error(`OpenRouter reference image URL returned unsupported MIME type: ${mimeType}`);
  }

  return `data:${mimeType};base64,${base64}`;
};

const buildInputReferences = async (params: RuntimeImageGenParams) => {
  const imageUrls = [
    ...(params.imageUrls ?? []),
    ...(params.imageUrl ? [params.imageUrl] : []),
  ].filter((url): url is string => typeof url === 'string' && url.length > 0);

  if (imageUrls.length === 0) return undefined;

  return Promise.all(
    imageUrls.map(async (url) => ({
      image_url: { url: await resolveReferenceImage(url) },
      type: 'image_url',
    })),
  );
};

const buildRequestBody = async (payload: CreateImagePayload, requestModel: string) => {
  const { params } = payload;
  const body: Record<string, unknown> = {
    model: requestModel,
    n: 1,
    prompt: params.prompt,
  };

  const parameterMap = {
    aspectRatio: 'aspect_ratio',
    quality: 'quality',
    resolution: 'resolution',
    seed: 'seed',
    size: 'size',
  } as const;

  for (const [sourceKey, targetKey] of Object.entries(parameterMap)) {
    const value = params[sourceKey as keyof RuntimeImageGenParams];
    if (hasValue(value)) body[targetKey] = value;
  }

  const inputReferences = await buildInputReferences(params);
  if (inputReferences) body.input_references = inputReferences;

  return body;
};

const parseUsage = (usage?: OpenRouterImageUsage): ModelUsage | undefined => {
  if (!usage) return undefined;

  return {
    inputTextTokens: usage.prompt_tokens,
    outputImageTokens: usage.completion_tokens,
    totalInputTokens: usage.prompt_tokens,
    totalOutputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    ...(typeof usage.cost === 'number' ? { cost: usage.cost } : {}),
  };
};

const parseErrorMessage = async (response: Response) => {
  const responseText = await response.text();

  try {
    const parsed = JSON.parse(responseText) as { error?: { message?: string } };
    return parsed.error?.message || responseText;
  } catch {
    return responseText;
  }
};

export const createOpenRouterImage = async (
  payload: CreateImagePayload,
  options: CreateImageOptions,
): Promise<CreateImageResponse> => {
  const requestModel = resolveMappedModelId(payload.model, options).replace(/:image$/, '');
  const baseURL = (options.baseURL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const response = await fetch(`${baseURL}/images`, {
    body: JSON.stringify(await buildRequestBody(payload, requestModel)),
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lobehub.com',
      'X-Title': 'LobeHub',
    },
    method: 'POST',
    signal: options.signal,
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(
      `OpenRouter image API request failed with status ${response.status}: ${message}`,
    );
  }

  const result = (await response.json()) as OpenRouterImageResponse;
  const image = result.data?.[0];

  if (!image) throw new Error('OpenRouter image API returned no image');

  if (image.b64_json) {
    return {
      imageUrl: `data:${image.media_type || 'image/png'};base64,${image.b64_json}`,
      modelUsage: parseUsage(result.usage),
    };
  }

  if (image.url) {
    return {
      imageUrl: image.url,
      modelUsage: parseUsage(result.usage),
    };
  }

  throw new Error('OpenRouter image API returned an image without data');
};
