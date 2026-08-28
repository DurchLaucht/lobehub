// @vitest-environment node
import * as imageUtils from '@lobechat/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LobeOpenRouterAI } from './index';

describe('OpenRouter image generation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the dedicated Image API and returns the declared media type', async () => {
    const imageUrlToBase64Mock = vi.spyOn(imageUtils, 'imageUrlToBase64').mockResolvedValue({
      base64: 'reference-image',
      mimeType: 'image/jpeg',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        data: [{ b64_json: 'encoded-image', media_type: 'image/webp' }],
        usage: {
          completion_tokens: 120,
          cost: 0.04,
          prompt_tokens: 12,
          total_tokens: 132,
        },
      }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const runtime = new LobeOpenRouterAI({ apiKey: 'test' });
    const result = await runtime.createImage({
      model: 'openai/gpt-image-2',
      params: {
        aspectRatio: '16:9',
        imageUrls: ['https://app.example.com/f/file-id'],
        prompt: 'A watercolor lighthouse',
        size: 'auto',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/images',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(sentBody).toEqual({
      aspect_ratio: '16:9',
      input_references: [
        {
          image_url: { url: 'data:image/jpeg;base64,reference-image' },
          type: 'image_url',
        },
      ],
      model: 'openai/gpt-image-2',
      n: 1,
      prompt: 'A watercolor lighthouse',
    });
    expect(imageUrlToBase64Mock).toHaveBeenCalledWith(
      'https://app.example.com/f/file-id?download=1',
    );
    expect(result.imageUrl).toBe('data:image/webp;base64,encoded-image');
    expect(result.modelUsage).toMatchObject({
      cost: 0.04,
      inputTextTokens: 12,
      outputImageTokens: 120,
      totalTokens: 132,
    });
  });
});
