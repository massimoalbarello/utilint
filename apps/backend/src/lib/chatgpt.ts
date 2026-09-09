import OpenAI from 'openai';
import type { Stream } from 'openai/core/streaming';
import type {
  Response as ModelResponse,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import { z } from 'zod';
import { AppError, textModel } from '#models/gateway.ts';
import type { ChatGPTTokens, ProviderConnection, RelayInput } from '#models/provider.ts';
import { boundedJson } from './chatgpt-auth.ts';

const baseURL = 'https://chatgpt.com/backend-api/codex';
const catalogURL = `${baseURL}/models?client_version=0.153.4`;
type Message = {
  role: string;
  content?: string | { text: string }[] | null;
  tool_call_id?: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
};
const contentText = (content: Message['content']) =>
  typeof content === 'string' ? content : (content?.map((part) => part.text).join('\n') ?? '');

function subscriptionBody({ endpoint, body }: RelayInput): ResponseCreateParamsStreaming {
  const result: Record<string, unknown> = {
    model: body.model,
    store: false,
    stream: true,
    instructions: body.instructions ?? 'You are a helpful assistant.',
    input: typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input,
    tools: body.tools,
    tool_choice: body.tool_choice,
    parallel_tool_calls: body.parallel_tool_calls,
    reasoning: body.reasoning,
    text: body.text ?? { verbosity: 'low' },
  };
  if (endpoint === 'chat/completions') {
    const input: Record<string, unknown>[] = [];
    const instructions: string[] = [];
    for (const message of body.messages as Message[]) {
      if (message.role === 'system' || message.role === 'developer') {
        instructions.push(contentText(message.content));
      } else if (message.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: message.tool_call_id,
          output: contentText(message.content),
        });
      } else {
        const text = contentText(message.content);
        if (text) input.push({ role: message.role, content: text });
        for (const tool of message.tool_calls ?? []) {
          input.push({ type: 'function_call', call_id: tool.id, ...tool.function });
        }
      }
    }
    result.input = input;
    result.instructions = instructions.join('\n\n') || 'You are a helpful assistant.';
    const tools = body.tools as { type: string; function: Record<string, unknown> }[] | undefined;
    result.tools = tools?.map((tool) => ({ type: 'function', ...tool.function }));
    const choice = body.tool_choice as { function?: { name: string } } | string | undefined;
    result.tool_choice =
      typeof choice === 'object' ? { type: 'function', name: choice.function?.name } : choice;
    if (body.reasoning_effort) result.reasoning = { effort: body.reasoning_effort };
    const format = body.response_format as
      | { type: string; json_schema?: Record<string, unknown> }
      | undefined;
    if (format)
      result.text = {
        verbosity: 'low',
        format:
          format.type === 'json_schema' ? { type: 'json_schema', ...format.json_schema } : format,
      };
  }
  // Codex does not expose the Platform API's hard max_output_tokens control.
  // Treat an explicitly requested output length as a prompt target.
  const target = Number(body.max_output_tokens ?? body.max_completion_tokens);
  if (Number.isFinite(target) && target > 0)
    result.instructions = `${result.instructions}\n\nKeep the answer within ${target} output tokens when possible.`;
  return result as unknown as ResponseCreateParamsStreaming;
}

function chatUsage(response: ModelResponse) {
  return response.usage
    ? {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.total_tokens,
        prompt_tokens_details: response.usage.input_tokens_details,
        completion_tokens_details: response.usage.output_tokens_details,
      }
    : undefined;
}
function chatResult(response: ModelResponse) {
  const text = response.output
    .flatMap((item) =>
      item.type === 'message'
        ? item.content.map((part) => (part.type === 'output_text' ? part.text : ''))
        : [],
    )
    .join('');
  const tools = response.output.flatMap((item) =>
    item.type === 'function_call'
      ? [
          {
            id: item.call_id,
            type: 'function',
            function: { name: item.name, arguments: item.arguments },
          },
        ]
      : [],
  );
  return {
    id: response.id,
    object: 'chat.completion',
    created: response.created_at,
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text || null,
          ...(tools.length ? { tool_calls: tools } : {}),
        },
        finish_reason:
          response.status === 'incomplete' ? 'length' : tools.length ? 'tool_calls' : 'stop',
      },
    ],
    usage: chatUsage(response),
  };
}

async function* completeOutputs(events: AsyncIterable<ResponseStreamEvent>) {
  const output = new Map<number, ModelResponse['output'][number]>();
  for await (const event of events) {
    if (event.type === 'response.output_item.done') output.set(event.output_index, event.item);
    // Codex can omit output from its terminal snapshot. The SDK's accumulator also
    // replaces output on lifecycle events, so retain the completed items here.
    if (isFinal(event) && !event.response.output?.length && output.size) {
      yield {
        ...event,
        response: {
          ...event.response,
          output: [...output.entries()].sort(([a], [b]) => a - b).map(([, item]) => item),
        },
      };
    } else {
      yield event;
    }
  }
}

export function createChatGPTProvider(fetcher: typeof fetch = fetch) {
  return (tokens: ChatGPTTokens): ProviderConnection => {
    const headers = {
      authorization: `Bearer ${tokens.access}`,
      'chatgpt-account-id': tokens.accountId,
      originator: 'utilint',
      'user-agent': 'utilint',
    };
    const client = new OpenAI({
      apiKey: tokens.access,
      organization: null,
      project: null,
      logLevel: 'off',
      baseURL,
      defaultHeaders: headers,
      maxRetries: 0,
      fetch: (input, init) => fetcher(input, { ...init, redirect: 'error' }),
    });
    return {
      async models() {
        const response = await fetcher(catalogURL, {
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new AppError(
            response.status === 401 || response.status === 403 ? 403 : 502,
            'chatgpt_models_unavailable',
            'ChatGPT could not load your subscription models. Reconnect ChatGPT if this persists.',
          );
        }
        const data = z
          .object({
            models: z.array(
              z.object({
                slug: z.string(),
                visibility: z.string().optional(),
              }),
            ),
          })
          .parse(await boundedJson(response));
        return data.models
          .filter(
            (model) => textModel(model.slug) && (!model.visibility || model.visibility === 'list'),
          )
          .map((model) => ({ id: model.slug, object: 'model', created: 0, owned_by: 'openai' }));
      },
      async relay(input) {
        let events: Stream<ResponseStreamEvent>;
        try {
          events = await client.responses.create(subscriptionBody(input), { signal: input.signal });
        } catch (error) {
          if (error instanceof OpenAI.APIError) {
            return Response.json(
              {},
              { status: error.status && error.status >= 400 ? error.status : 502 },
            );
          }
          throw error;
        }
        if (!input.body.stream) {
          let final: ModelResponse | undefined;
          for await (const event of completeOutputs(events)) {
            if (event.type === 'response.failed' || event.type === 'error')
              throw new Error('Subscription response failed.');
            if (event.type === 'response.completed' || event.type === 'response.incomplete')
              final = event.response;
          }
          if (!final) throw new Error('Subscription response was interrupted.');
          return Response.json(input.endpoint === 'responses' ? final : chatResult(final));
        }
        const encoder = new TextEncoder();
        let cancelled = false;
        const toolIndexes = new Map<number, number>();
        let id = '';
        let created = Math.floor(Date.now() / 1000);
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (data: unknown, name?: string) => {
              if (!cancelled)
                controller.enqueue(
                  encoder.encode(
                    `${name ? `event: ${name}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`,
                  ),
                );
            };
            const chunk = (delta: unknown, finish: string | null = null) => ({
              id,
              object: 'chat.completion.chunk',
              created,
              model: input.body.model,
              choices: [{ index: 0, delta, finish_reason: finish }],
            });
            let final = false;
            try {
              for await (const event of completeOutputs(events)) {
                if (event.type === 'response.failed' || event.type === 'error')
                  throw new Error('Subscription response failed.');
                if (input.endpoint === 'responses') {
                  send(event, event.type);
                } else {
                  if (event.type === 'response.created') {
                    id = event.response.id;
                    created = event.response.created_at;
                    send(chunk({ role: 'assistant', content: '' }));
                  }
                  if (event.type === 'response.output_text.delta')
                    send(chunk({ content: event.delta }));
                  if (
                    event.type === 'response.output_item.added' &&
                    event.item.type === 'function_call'
                  ) {
                    const index = toolIndexes.size;
                    toolIndexes.set(event.output_index, index);
                    send(
                      chunk({
                        tool_calls: [
                          {
                            index,
                            id: event.item.call_id,
                            type: 'function',
                            function: { name: event.item.name, arguments: '' },
                          },
                        ],
                      }),
                    );
                  }
                  if (event.type === 'response.function_call_arguments.delta')
                    send(
                      chunk({
                        tool_calls: [
                          {
                            index: toolIndexes.get(event.output_index) ?? 0,
                            function: { arguments: event.delta },
                          },
                        ],
                      }),
                    );
                }
                if (isFinal(event)) {
                  final = true;
                  if (input.endpoint !== 'responses') {
                    send(chunk({}, chatResult(event.response).choices[0]?.finish_reason ?? 'stop'));
                    send({ ...chunk({}), choices: [], usage: chatUsage(event.response) });
                    send('[DONE]');
                  }
                }
              }
              if (!final) throw new Error('Subscription stream was interrupted.');
              if (!cancelled) controller.close();
            } catch {
              if (!cancelled) controller.error(new Error('Subscription stream was interrupted.'));
            }
          },
          cancel() {
            cancelled = true;
            events.controller.abort();
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
      },
    };
  };
}
function isFinal(
  event: ResponseStreamEvent,
): event is Extract<ResponseStreamEvent, { type: 'response.completed' | 'response.incomplete' }> {
  return event.type === 'response.completed' || event.type === 'response.incomplete';
}
