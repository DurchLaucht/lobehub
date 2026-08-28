import type { ModelParamsSchema, VideoModelParamsSchema } from 'model-bank';
import { ModelProvider } from 'model-bank';

import type { OpenAICompatibleFactoryOptions } from '../../core/openaiCompatibleFactory';
import { createOpenAICompatibleRuntime } from '../../core/openaiCompatibleFactory';
import { processMultiProviderModelList } from '../../utils/modelParse';
import { createOpenRouterImage } from './createImage';
import { createOpenRouterTranscription } from './createTranscription';
import { createOpenRouterVideo, pollOpenRouterVideoStatus } from './createVideo';
import type {
  OpenRouterImageModelCard,
  OpenRouterModelCard,
  OpenRouterReasoning,
  OpenRouterVideoModelCard,
} from './type';

const formatPrice = (price?: string) => {
  if (price === undefined || price === '-1') return undefined;
  return Number((Number(price) * 1e6).toPrecision(5));
};

const imageParameterNames = {
  aspect_ratio: 'aspectRatio',
  quality: 'quality',
  resolution: 'resolution',
  seed: 'seed',
  size: 'size',
} as const;

const createImageModelParameters = (model: OpenRouterImageModelCard): ModelParamsSchema => {
  const parameters: ModelParamsSchema = { prompt: { default: '' } };
  const inputModalities = model.architecture?.input_modalities || [];
  const supportedParameters = model.supported_parameters;

  if (inputModalities.includes('image')) {
    parameters.imageUrls = { default: [] };
  }

  if (!supportedParameters || Array.isArray(supportedParameters)) return parameters;

  for (const [parameterName, descriptor] of Object.entries(supportedParameters)) {
    const parameterKey = imageParameterNames[parameterName as keyof typeof imageParameterNames];
    if (!parameterKey) continue;

    if (descriptor.type === 'enum' && descriptor.values?.length) {
      const enumParameter = {
        default:
          parameterKey === 'aspectRatio' && descriptor.values.includes('auto')
            ? 'auto'
            : descriptor.values[0],
        enum: descriptor.values,
      };

      switch (parameterKey) {
        case 'aspectRatio': {
          parameters.aspectRatio = enumParameter;
          break;
        }
        case 'quality': {
          parameters.quality = enumParameter;
          break;
        }
        case 'resolution': {
          parameters.resolution = enumParameter;
          break;
        }
        case 'size': {
          parameters.size = enumParameter;
          break;
        }
      }
    } else if (parameterKey === 'seed' && descriptor.type === 'boolean') {
      parameters.seed = { default: null };
    }
  }

  return parameters;
};

const fetchOpenRouterImageModels = async (): Promise<OpenRouterImageModelCard[]> => {
  const response = await fetch('https://openrouter.ai/api/v1/images/models');
  if (!response.ok) return [];

  const data = (await response.json()) as { data?: OpenRouterImageModelCard[] };
  return (data.data || []).filter((model) =>
    model.architecture?.output_modalities?.includes('image'),
  );
};

const createVideoModelParameters = (
  model: OpenRouterVideoModelCard,
): VideoModelParamsSchema => {
  const parameters: VideoModelParamsSchema = {
    duration: { default: 5, min: 1, max: 60 },
    endImageUrl: { default: null, requiresImageUrl: true },
    generateAudio: { default: true },
    imageUrl: { default: null },
    imageUrls: { default: [] },
    prompt: { default: '' },
  };

  if (model.supported_aspect_ratios?.length) {
    parameters.aspectRatio = {
      default: model.supported_aspect_ratios[0],
      enum: model.supported_aspect_ratios,
    };
  }

  if (model.supported_resolutions?.length) {
    parameters.resolution = {
      default: model.supported_resolutions[0],
      enum: model.supported_resolutions,
    };
  }

  if (model.supported_sizes?.length) {
    parameters.size = {
      default: model.supported_sizes[0],
      enum: model.supported_sizes,
    };
  }

  return parameters;
};

const fetchOpenRouterVideoModels = async (): Promise<OpenRouterVideoModelCard[]> => {
  const response = await fetch('https://openrouter.ai/api/v1/videos/models');
  if (!response.ok) return [];

  const data = (await response.json()) as { data?: OpenRouterVideoModelCard[] };
  return (data.data || []).filter(
    (model) =>
      Boolean(model.supported_resolutions?.length) ||
      Boolean(model.supported_aspect_ratios?.length) ||
      Boolean(model.supported_sizes?.length),
  );
};

export const params = {
  baseURL: 'https://openrouter.ai/api/v1',
  chatCompletion: {
    handlePayload: (payload) => {
      const {
        reasoning_effort,
        thinking,
        reasoning: _reasoning,
        thinkingLevel,
        imageAspectRatio,
        imageResolution,
        model,
        ...rest
      } = payload;

      let reasoning: OpenRouterReasoning | undefined;

      if (
        thinking?.type ||
        thinking?.budget_tokens !== undefined ||
        reasoning_effort ||
        thinkingLevel
      ) {
        if (thinking?.type === 'disabled') {
          reasoning = { enabled: false };
        } else if (thinking?.budget_tokens !== undefined) {
          reasoning = {
            max_tokens: thinking?.budget_tokens,
          };
        } else if (reasoning_effort) {
          reasoning = { effort: reasoning_effort };
        } else if (thinkingLevel) {
          reasoning = { effort: thinkingLevel };
        }
      }

      // Add modalities and image_config for image generation models
      const isImageModel = model.includes('-image') || model.includes('flux');
      const modalities =
        (payload as any).modalities ?? (isImageModel ? ['image', 'text'] : undefined);

      // Map imageResolution to image_size: '512' → '0.5K', others pass through.
      // OpenRouter's image_size field expects '0.5K' for 512px output; the rest
      // ('1K'/'2K'/'4K') are passed through verbatim.
      const imageSizeValue = imageResolution
        ? imageResolution === '512'
          ? '0.5K'
          : imageResolution
        : undefined;

      // 'auto' means use model default — omit the parameter
      const aspectRatioValue =
        imageAspectRatio && imageAspectRatio !== 'auto' ? imageAspectRatio : undefined;

      const image_config =
        (payload as any).image_config ??
        (isImageModel && (aspectRatioValue || imageSizeValue)
          ? {
              ...(aspectRatioValue && { aspect_ratio: aspectRatioValue }),
              ...(imageSizeValue && { image_size: imageSizeValue }),
            }
          : undefined);

      return {
        ...rest,
        ...(image_config && { image_config }),
        ...(modalities && { modalities }),
        model: payload.enabledSearch ? `${payload.model}:online` : payload.model,
        ...(reasoning && { reasoning }),
        stream: payload.stream ?? true,
      } as any;
    },
  },
  constructorOptions: {
    defaultHeaders: {
      'HTTP-Referer': 'https://lobehub.com',
      'X-Title': 'LobeHub',
    },
  },
  createImage: createOpenRouterImage,
  createVideo: createOpenRouterVideo,
  handlePollVideoStatus: pollOpenRouterVideoStatus,
  transcribe: createOpenRouterTranscription as any,
  debug: {
    chatCompletion: () => process.env.DEBUG_OPENROUTER_CHAT_COMPLETION === '1',
  },
  models: async () => {
    const [response, imageModels, videoModels] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/models'),
      fetchOpenRouterImageModels().catch((error) => {
        console.error('OpenRouter image model discovery failed', error);
        return [];
      }),
      fetchOpenRouterVideoModels().catch((error) => {
        console.error('OpenRouter video model discovery failed', error);
        return [];
      }),
    ]);
    if (!response.ok) {
      throw new Error(`OpenRouter models API request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { data: OpenRouterModelCard[] };
    const modelList = data.data;
    const specialModelIds = new Set([
      ...imageModels.map((model) => model.id),
      ...videoModels.map((model) => model.id),
    ]);

    // Process the model info fetched from the frontend and convert to standard format
    const formattedModels = modelList
      .filter((model) => !specialModelIds.has(model.id))
      .map((model) => {
        const { top_provider, architecture, pricing, supported_parameters } = model;

        const inputModalities = architecture.input_modalities || [];

        // Process the name, by default strip the colon and everything before it
        let displayName = model.name;
        const colonIndex = displayName.indexOf(':');
        if (colonIndex !== -1) {
          const prefix = displayName.slice(0, Math.max(0, colonIndex)).trim();
          const suffix = displayName.slice(Math.max(0, colonIndex + 1)).trim();

          const isDeepSeekPrefix = prefix.toLowerCase() === 'deepseek';
          const suffixHasDeepSeek = suffix.toLowerCase().includes('deepseek');

          if (isDeepSeekPrefix && !suffixHasDeepSeek) {
            displayName = model.name;
          } else {
            displayName = suffix;
          }
        }

        const inputPrice = formatPrice(pricing.prompt);
        const outputPrice = formatPrice(pricing.completion);
        const cachedInputPrice = formatPrice(pricing.input_cache_read);
        const writeCacheInputPrice = formatPrice(pricing.input_cache_write);

        const isFree = inputPrice === 0 && outputPrice === 0 && !displayName.endsWith('(free)');
        if (isFree) {
          displayName += ' (free)';
        }

        const hasReasoning = supported_parameters.includes('reasoning');

        return {
          contextWindowTokens: top_provider.context_length || model.context_length,
          description: model.description,
          displayName,
          functionCall: supported_parameters.includes('tools'),
          id: model.id,
          maxOutput:
            typeof top_provider.max_completion_tokens === 'number'
              ? top_provider.max_completion_tokens
              : typeof model.context_length === 'number'
                ? model.context_length
                : undefined,
          pricing: {
            cachedInput: cachedInputPrice,
            input: inputPrice,
            output: outputPrice,
            writeCacheInput: writeCacheInputPrice,
          },
          reasoning: hasReasoning,
          releasedAt: new Date(model.created * 1000).toISOString().split('T')[0],
          vision: inputModalities.includes('image'),
          // Merge all applicable extendParams for settings
          ...(() => {
            const extendParams: string[] = [];
            if (model.description && model.description.includes('`reasoning` `enabled`')) {
              extendParams.push('enableReasoning');
            }
            if (
              hasReasoning &&
              (model.id.includes('gpt-5.2') ||
                model.id.includes('gpt-5.4') ||
                model.id.includes('gpt-5.5'))
            ) {
              extendParams.push('gpt5_2ReasoningEffort', 'textVerbosity');
            } else if (hasReasoning && model.id.includes('gpt-5.1')) {
              extendParams.push('gpt5_1ReasoningEffort', 'textVerbosity');
            } else if (hasReasoning && model.id.includes('gpt-5')) {
              extendParams.push('gpt5ReasoningEffort', 'textVerbosity');
            } else if (hasReasoning && model.id.includes('openai')) {
              extendParams.push('reasoningEffort', 'textVerbosity');
            }
            if (hasReasoning && model.id.includes('claude')) {
              extendParams.push('enableReasoning', 'reasoningBudgetToken');
            }
            if (model.id.includes('claude') && writeCacheInputPrice && writeCacheInputPrice !== 0) {
              extendParams.push('disableContextCaching');
            }
            if (hasReasoning && model.id.includes('gemini-2.5')) {
              extendParams.push('reasoningBudgetToken');
            }
            if (hasReasoning && model.id.includes('gemini-3-pro')) {
              extendParams.push('thinkingLevel2');
            }
            if (hasReasoning && model.id.includes('gemini-3-flash')) {
              extendParams.push('thinkingLevel');
            }
            return extendParams.length > 0 ? { settings: { extendParams } } : {};
          })(),
        };
      });

    const formattedImageModels = imageModels.map((model) => ({
      description: model.description,
      displayName: model.name || model.id,
      id: model.id,
      imageOutput: true,
      parameters: createImageModelParameters(model),
      type: 'image' as const,
      vision: model.architecture.input_modalities.includes('image'),
    }));

    const formattedVideoModels = videoModels.map((model) => ({
      description: model.description,
      displayName: model.name || model.id,
      id: model.id,
      parameters: createVideoModelParameters(model),
      type: 'video' as const,
      video: true,
    }));

    return await processMultiProviderModelList(
      [...formattedModels, ...formattedImageModels, ...formattedVideoModels],
      'openrouter',
    );
  },
  provider: ModelProvider.OpenRouter,
} satisfies OpenAICompatibleFactoryOptions;

export const LobeOpenRouterAI = createOpenAICompatibleRuntime(params);
