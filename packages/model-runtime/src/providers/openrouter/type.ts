interface ModelPricing {
  completion: string;
  image?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  internal_reasoning?: string;
  prompt: string;
  request?: string;
  web_search?: string;
}

interface TopProvider {
  context_length: number;
  is_moderated: boolean;
  max_completion_tokens: number | null;
}

interface Architecture {
  input_modalities: string[];
  instruct_type: string | null;
  modality: string;
  output_modalities: string[];
  tokenizer: string;
}

export interface OpenRouterModelCard {
  architecture: Architecture;
  canonical_slug: string;
  context_length: number;
  created: number;
  default_parameters?: any | null;
  description?: string;
  hugging_face_id?: string;
  id: string;
  name: string;
  per_request_limits?: any | null;
  pricing: ModelPricing;
  supported_parameters: string[];
  top_provider: TopProvider;
}

export interface OpenRouterImageParameterDescriptor {
  max?: number;
  min?: number;
  type: 'boolean' | 'enum' | 'range';
  values?: string[];
}

export interface OpenRouterImageModelCard {
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
  };
  created?: number;
  description?: string;
  id: string;
  name?: string;
  pricing?: ModelPricing;
  pricing_skus?: Record<string, string>;
  supported_parameters?: Record<string, OpenRouterImageParameterDescriptor>;
}

export interface OpenRouterVideoModelCard {
  allowed_passthrough_parameters?: string[];
  canonical_slug?: string;
  created?: number;
  description?: string;
  id: string;
  name?: string;
  pricing?: ModelPricing;
  pricing_skus?: Record<string, string>;
  supported_aspect_ratios?: string[];
  supported_resolutions?: string[];
  supported_sizes?: string[];
}

export interface OpenRouterTranscriptionUsage {
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  seconds?: number;
  total_tokens?: number;
}

export interface OpenRouterTranscriptionResponse {
  text: string;
  usage?: OpenRouterTranscriptionUsage;
}

export interface OpenRouterReasoning {
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  enabled?: boolean;
  exclude?: boolean;
  max_tokens?: number;
}
