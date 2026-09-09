import { z } from 'zod';
import { AppError, textModel } from './gateway.ts';

const jsonRecord = z.record(z.string(), z.unknown());
const functionCall = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({ name: z.string(), arguments: z.string() }),
});
const message = z
  .object({
    role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
    content: z
      .union([
        z.string(),
        z.array(z.object({ type: z.literal('text'), text: z.string() })),
        z.null(),
      ])
      .optional(),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(functionCall).optional(),
  })
  .strict();
const shared = {
  model: z.string().min(1).max(100).refine(textModel, 'Use a supported text model.'),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
};
const chatSchema = z
  .object({
    ...shared,
    messages: z.array(message).min(1).max(128),
    max_completion_tokens: z.number().int().min(1).optional(),
    max_tokens: z.number().int().min(1).optional(),
    n: z.literal(1).optional(),
    tools: z
      .array(
        z.object({
          type: z.literal('function'),
          function: z.object({
            name: z.string(),
            description: z.string().optional(),
            parameters: jsonRecord.optional(),
            strict: z.boolean().nullable().optional(),
          }),
        }),
      )
      .max(64)
      .optional(),
    tool_choice: z
      .union([
        z.enum(['auto', 'none', 'required']),
        z.object({ type: z.literal('function'), function: z.object({ name: z.string() }) }),
      ])
      .optional(),
    parallel_tool_calls: z.boolean().optional(),
    response_format: jsonRecord.optional(),
    reasoning_effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
    stop: z
      .union([z.string(), z.array(z.string()).max(4)])
      .nullable()
      .optional(),
    seed: z.number().int().optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    stream_options: z.object({ include_usage: z.boolean() }).optional(),
    store: z.literal(false).optional(),
  })
  .strict();
const inputMessage = z
  .object({
    type: z.literal('message').optional(),
    role: z.enum(['system', 'developer', 'user', 'assistant']),
    content: z.union([
      z.string(),
      z.array(z.object({ type: z.literal('input_text'), text: z.string() })),
    ]),
  })
  .strict();
const responsesSchema = z
  .object({
    ...shared,
    input: z.union([
      z.string(),
      z
        .array(
          z.union([
            inputMessage,
            z.object({
              type: z.literal('function_call_output'),
              call_id: z.string(),
              output: z.string(),
            }),
            z.object({
              type: z.literal('function_call'),
              call_id: z.string(),
              name: z.string(),
              arguments: z.string(),
            }),
          ]),
        )
        .max(128),
    ]),
    instructions: z.string().optional(),
    max_output_tokens: z.number().int().min(1).optional(),
    tools: z
      .array(
        z.object({
          type: z.literal('function'),
          name: z.string(),
          description: z.string().optional(),
          parameters: jsonRecord,
          strict: z.boolean().nullable().optional(),
        }),
      )
      .max(64)
      .optional(),
    tool_choice: z
      .union([
        z.enum(['auto', 'none', 'required']),
        z.object({ type: z.literal('function'), name: z.string() }),
      ])
      .optional(),
    parallel_tool_calls: z.boolean().optional(),
    reasoning: z
      .object({
        effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
        summary: z.enum(['auto', 'concise', 'detailed']).optional(),
      })
      .optional(),
    text: jsonRecord.optional(),
    store: z.literal(false).optional(),
    background: z.literal(false).optional(),
  })
  .strict();
export function prepareRequest(endpoint: string, body: unknown): Record<string, unknown> {
  const parsed = (endpoint === 'responses' ? responsesSchema : chatSchema).safeParse(body);
  if (!parsed.success)
    throw new AppError(
      400,
      'invalid_request',
      'Invalid request. Check the supported fields and their values.',
    );
  const data: Record<string, unknown> = parsed.data;
  if (data.max_tokens !== undefined) data.max_completion_tokens = data.max_tokens;
  delete data.max_tokens;
  data.store = false;
  return data;
}
