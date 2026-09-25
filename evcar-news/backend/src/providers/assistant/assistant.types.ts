import { AppException } from '../../common/errors/app.exception';
import type { ProviderStatus, StatusReporter } from '../provider-status';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantRequest {
  /** Instructions + the retrieved database excerpts the answer must be based on. */
  system: string;
  messages: AssistantMessage[];
  maxTokens?: number;
}

export interface AssistantCompletion {
  text: string;
  model: string;
  stopReason: string | null;
}

/**
 * Optional LLM behind the assistant module (contract §4.6). The assistant
 * module retrieves verified DB content and asks the model to answer only
 * from it with citations; news, search and comparisons never depend on it.
 * When unconfigured, complete() answers 503 and the `assistant` feature flag
 * is forced off in /app-config.
 */
export interface AssistantProvider extends StatusReporter {
  readonly name: string;
  readonly configured: boolean;
  complete(request: AssistantRequest): Promise<AssistantCompletion>;
}

/** Default: no LLM configured (ASSISTANT_PROVIDER=none). */
export class NoneAssistantProvider implements AssistantProvider {
  readonly name = 'none';
  readonly configured = false;

  status(): ProviderStatus {
    return {
      type: 'assistant',
      name: 'none',
      configured: false,
      reason: 'ASSISTANT_PROVIDER=none: the optional assistant is disabled.',
    };
  }

  complete(): Promise<AssistantCompletion> {
    return Promise.reject(AppException.integrationNotConfigured('assistant'));
  }
}

/**
 * ASSISTANT_PROVIDER is set to a provider whose adapter is not implemented
 * in this build (see docs/decisions/backend-platform.md). Reported honestly
 * as not configured; complete() answers 501 NOT_IMPLEMENTED.
 */
export class UnimplementedAssistantProvider implements AssistantProvider {
  readonly configured = false;

  constructor(
    readonly name: string,
    private readonly reason: string,
  ) {}

  status(): ProviderStatus {
    return { type: 'assistant', name: this.name, configured: false, reason: this.reason };
  }

  complete(): Promise<AssistantCompletion> {
    return Promise.reject(AppException.notImplemented(`assistant.${this.name}`));
  }
}
