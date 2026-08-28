import createDebug from 'debug';

import type { CreateVideoOptions } from '../../core/openaiCompatibleFactory';
import type {
  CreateVideoPayload,
  CreateVideoResponse,
  PollVideoStatusResult,
} from '../../types/video';
import { resolveMappedModelId } from '../../utils/modelIdMapping';

const log = createDebug('lobe-video:openrouter');

interface OpenRouterVideoCreateResponse {
  id?: string;
  polling_url?: string;
  status?: string;
}

interface OpenRouterVideoStatusResponse {
  error?: string | { message?: string };
  status?: string;
  unsigned_urls?: string[];
}

const getBaseURL = (baseURL?: string) =>
  (baseURL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

const getErrorMessage = (error: OpenRouterVideoStatusResponse['error']) =>
  typeof error === 'string' ? error : error?.message || 'Video generation failed';

const createImageReference = (url: string) => ({
  image_url: { url },
  type: 'image_url',
});

export async function createOpenRouterVideo(
  payload: CreateVideoPayload,
  options: CreateVideoOptions,
): Promise<CreateVideoResponse> {
  const { model, params } = payload;
  const requestModel = resolveMappedModelId(model, options);
  const body: Record<string, unknown> = {
    model: requestModel,
    prompt: params.prompt,
  };

  if (params.size) {
    body.size = params.size;
  } else {
    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
    if (params.resolution) body.resolution = params.resolution;
  }

  if (params.duration !== undefined) body.duration = params.duration;
  if (params.generateAudio !== undefined) body.generate_audio = params.generateAudio;
  if (params.seed !== undefined && params.seed !== null) body.seed = params.seed;

  if (params.imageUrl) {
    body.frame_images = [
      {
        ...createImageReference(params.imageUrl),
        frame_type: 'first_frame',
      },
    ];
  }

  if (params.endImageUrl) {
    const frameImages = Array.isArray(body.frame_images) ? body.frame_images : [];
    frameImages.push({
      ...createImageReference(params.endImageUrl),
      frame_type: 'last_frame',
    });
    body.frame_images = frameImages;
  }

  if (params.imageUrls?.length) {
    body.input_references = params.imageUrls.map(createImageReference);
  }

  const baseURL = getBaseURL(options.baseURL);
  log('Creating OpenRouter video - model: %s, body: %O', requestModel, body);

  const response = await fetch(`${baseURL}/videos`, {
    body: JSON.stringify(body),
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
    const errorText = await response.text();
    throw new Error(`OpenRouter video API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OpenRouterVideoCreateResponse;
  if (!data.id) throw new Error('Invalid OpenRouter video response: missing id');

  // LobeHub already owns the polling lifecycle; OpenRouter webhooks are not
  // routed into the video task handlers, so callbackUrl is intentionally not sent.
  return { inferenceId: data.id };
}

export async function queryOpenRouterVideoStatus(
  inferenceId: string,
  options: { apiKey: string; baseURL?: string },
): Promise<OpenRouterVideoStatusResponse> {
  const baseURL = getBaseURL(options.baseURL);
  const response = await fetch(`${baseURL}/videos/${inferenceId}`, {
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter video status API error: ${response.status} ${errorText}`);
  }

  return (await response.json()) as OpenRouterVideoStatusResponse;
}

export async function pollOpenRouterVideoStatus(
  inferenceId: string,
  options: CreateVideoOptions,
): Promise<PollVideoStatusResult> {
  const response = await queryOpenRouterVideoStatus(inferenceId, options);

  if (response.status === 'completed') {
    const videoUrl = response.unsigned_urls?.[0];
    if (videoUrl) return { status: 'success', videoUrl };

    return {
      headers: { Authorization: `Bearer ${options.apiKey}` },
      status: 'success',
      videoUrl: `${getBaseURL(options.baseURL)}/videos/${inferenceId}/content?index=0`,
    };
  }

  if (['cancelled', 'expired', 'failed'].includes(response.status || '')) {
    return { error: getErrorMessage(response.error), status: 'failed' };
  }

  return { status: 'pending' };
}
