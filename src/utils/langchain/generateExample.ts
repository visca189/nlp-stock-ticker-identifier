import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { v4 as uuid } from "uuid";

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type Example = {
  input: string;
  toolCallOutputs: Record<string, unknown>[];
};

export function toolExampleToMessages(example: Example): BaseMessage[] {
  const openAIToolCalls: OpenAIToolCall[] = example.toolCallOutputs.map(
    (output) => {
      return {
        id: uuid(),
        type: "function",
        function: {
          // The name of the function right now corresponds
          // to the passed name.
          name: "stock-ticker-extraction",
          arguments: JSON.stringify(output),
        },
      };
    }
  );
  const messages: BaseMessage[] = [
    new HumanMessage(example.input),
    new AIMessage({
      content: "",
      additional_kwargs: { tool_calls: openAIToolCalls },
    }),
  ];
  const toolMessages = openAIToolCalls.map((toolCall) => {
    // Return the mocked successful result for a given tool call.
    return new ToolMessage({
      content: "You have correctly called this tool.",
      tool_call_id: toolCall.id,
    });
  });
  return messages.concat(toolMessages);
}