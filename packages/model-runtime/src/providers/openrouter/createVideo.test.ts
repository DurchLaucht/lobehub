// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenRouterVideo, pollOpenRouterVideoStatus } from './createVideo';

const baseURL = 'https://openrouter.ai/api/v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenRouter video generation', () => {
  it('submits OpenRouter video parameters using the asynchronous endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ id: 'video-job-123', status: 'pending' }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createOpenRouterVideo(
      {
        model: 'google/veo-3.1',
        params: {
          aspectRatio: '16:9',
          duration: 5,
          endImageUrl: 'https://example.com/end.png',
          generateAudio: true,
          imageUrl: 'https://example.com/start.png',
          imageUrls: ['https://example.com/style.png'],
          prompt: 'A slow cinematic camera movement through a forest',
          resolution: '1080p',
          seed: 42,
        },
      },
      { apiKey: 'test-key', baseURL, provider: 'openrouter' },
    );

    expect(result).toEqual({ inferenceId: 'video-job-123' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseURL}/videos`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        method: 'POST',
      }),
    );

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      aspect_ratio: '16:9',
      duration: 5,
      generate_audio: true,
      model: 'google/veo-3.1',
      prompt: 'A slow cinematic camera movement through a forest',
      resolution: '1080p',
      seed: 42,
    });
    expect(request.frame_images).toEqual([
      {
        frame_type: 'first_frame',
        image_url: { url: 'https://example.com/start.png' },
        type: 'image_url',
      },
      {
        frame_type: 'last_frame',
        image_url: { url: 'https://example.com/end.png' },
        type: 'image_url',
      },
    ]);
    expect(request.input_references).toEqual([
      {
        image_url: { url: 'https://example.com/style.png' },
        type: 'image_url',
      },
    ]);
  });

  it('returns the unsigned video URL when the asynchronous job completes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          status: 'completed',
          unsigned_urls: ['https://cdn.example.com/video.mp4'],
        }),
        ok: true,
      }),
    );

    await expect(
      pollOpenRouterVideoStatus('video-job-123', {
        apiKey: 'test-key',
        baseURL,
        provider: 'openrouter',
      }),
    ).resolves.toEqual({
      status: 'success',
      videoUrl: 'https://cdn.example.com/video.mp4',
    });
  });

  it('keeps polling while OpenRouter is processing the job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ status: 'in_progress' }),
        ok: true,
      }),
    );

    await expect(
      pollOpenRouterVideoStatus('video-job-123', {
        apiKey: 'test-key',
        baseURL,
        provider: 'openrouter',
      }),
    ).resolves.toEqual({ status: 'pending' });
  });
});
