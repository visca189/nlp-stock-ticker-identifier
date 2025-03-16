import { NextRequest } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { z } from "zod";
import {
  Example,
  toolExampleToMessages,
} from "@/utils/langchain/generateExample";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { createClient } from "@/utils/supabase/server";

const model = new ChatOpenAI({ model: "gpt-4o-mini" });

const stockSchema = z.object({
  ticker: z.optional(z.string()).describe("The ticker symbol of the stock"),
  name: z
    .optional(z.string())
    .describe("The name of the company the stock belongs to"),
  confidence: z
    .optional(z.string())
    .describe("The confidence level of the prediction"),
});

const stocksSchema = z.object({
  stocks: z
    .array(stockSchema)
    .describe("The list of stocks extracted from the user query"),
});
type Stocks = z.infer<typeof stocksSchema>;

export const StockDataSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number().nullable(),
  exchange: z.string().nullable(),
  exchangeShortName: z.string().nullable(),
  type: z.string(),
});
export type StockData = z.infer<typeof StockDataSchema>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const InputStateAnnotation = Annotation.Root({
  query: Annotation<string>,
  market: Annotation<string>,
  language: Annotation<string>,
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ValidateStateAnnotation = Annotation.Root({
  query: Annotation<string>,
  market: Annotation<string>,
  language: Annotation<string>,
  extracted: Annotation<Stocks>,
  answer: Annotation<StockData[] | []>,
});

const GradeStateAnnotation = Annotation.Root({
  query: Annotation<string>,
  market: Annotation<string>,
  language: Annotation<string>,
  extracted: Annotation<Stocks>,
  answer: Annotation<StockData[] | []>,
  score: Annotation<string>,
});

const graderSchema = z
  .object({
    score: z
      .enum(["pass", "fail"])
      .describe("Relevance score 'pass' or 'fail'"),
  })
  .describe(
    "Grade the relevance of the retrieved documents to the question. Either 'yes' or 'no'."
  );

const transformQuerySchema = z.object({
  query: z.string().describe("The user query"),
});

const extract = async (state: typeof InputStateAnnotation.State) => {
  const systemTemplate = `
  You are a financial expert assistant that helps users identify stock symbols from their queries.

  Your task is to identify company names and extract the appropriate stock symbols. Follow these rules carefully:

  1. TRANSLATION:
    - Translate the user query from non-English into English
    - If the query is already in English, no translation is needed

  2. COMPANY NAME EXTRACTION:
    - When parsing queries, identify which words represent the actual company name
    - IGNORE generic financial terms like "stock", "share", "price", "value", "company", "corporation", etc.
    - Example: For "Tesla stock price", the company name is just "Tesla"
    - Example: For "GeneDx stock", the company name is just "GeneDx"
    - Example: For "Meta Platforms Inc share value", the company name is "Meta Platforms"
    - For unfamiliar companies, extract the part that appears to be a proper name

  3. SYMBOL EXTRACTION:
    - If the user directly mentions a symbol (like "AAPL"), extract it
    - Otherwise, determine the symbol based on the company name you identified
    - If you're unsure about the exact symbol, return null for the symbol

  4. MARKET PREFERENCE:
    - US preference: Prioritize NYSE/NASDAQ symbols
    - HK preference: Prioritize Hong Kong exchange symbols
    - CN preference: Prioritize China A-shares symbols
    - Global preference: Choose the most liquid or relevant symbol

  Query: {query}
  User's Market Preference: {market}
  User's Language Preference: {language}
  Answer:
`;

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemTemplate],
    new MessagesPlaceholder("examples"),
    ["user", "{query}"],
  ]);

  const examples: Example[] = [
    {
      input: "random text",
      toolCallOutputs: [{ ticker: "No tickers found" }],
    },
    {
      input: "我想了解苹果公司的股票 AAPL 现在表现如何？",
      toolCallOutputs: [
        {
          ticker: "AAPL",
          name: "Apple Inc.",
          confidence: "High",
        },
      ],
    },
    {
      input: "Thoughts on HSBC",
      toolCallOutputs: [
        {
          ticker: "HSBC",
          name: "HSBC",
          confidence: "High",
        },
      ],
    },
    {
      input: "Microsft stock",
      toolCallOutputs: [
        {
          ticker: "MSFT",
          name: "Microsoft",
          confidence: "High",
        },
      ],
    },
    {
      input: "compare BABA and NVDA",
      toolCallOutputs: [
        {
          ticker: "BABA",
          name: "Alibaba",
          confidence: "High",
        },
        {
          ticker: "NVDA",
          name: "NVIDIA",
          confidence: "High",
        },
      ],
    },
    {
      input: "中国最大的电商公司股票值得投资吗？",
      toolCallOutputs: [
        {
          ticker: "BABA",
          name: "Alibaba",
          confidence: "Medium",
        },
      ],
    },
    {
      input: "茅台股票",
      toolCallOutputs: [
        {
          ticker: "",
          name: "Moutai stock",
          confidence: "Low",
        },
      ],
    },
    {
      input: "how is Canadian Utilities stock performing?",
      toolCallOutputs: [
        {
          ticker: "",
          name: "Canadian Utilities",
          confidence: "Low",
        },
      ],
    },
  ];

  const exampleMessages = [];
  for (const example of examples) {
    exampleMessages.push(...toolExampleToMessages(example));
  }

  const structured_llm = model.withStructuredOutput(stocksSchema, {
    name: "stock-ticker-extraction",
  });

  const promptValue = await promptTemplate.invoke({
    query: state.query,
    market: state.market,
    language: state.language,
    examples: exampleMessages,
  });

  const response = await structured_llm.invoke(promptValue);
  return { extracted: response };
};

const validate = async (state: typeof ValidateStateAnnotation.State) => {
  const supabase = await createClient();

  const validated = await Promise.all(
    state.extracted.stocks.map(async (stock) => {
      console.log("stock", stock);

      const { data, error } = await supabase
        .from("stock-list")
        .select()
        .eq("symbol", stock.ticker);

      if (error) {
        throw new Error(error.message);
      }

      console.log("data", data);

      if (data.length > 0) {
        return data[0];
      }

      const { data: likeTicker, error: likeTickerError } = await supabase
        .from("stock-list")
        .select()
        .ilike("symbol", `%${stock.ticker}%`);

      if (error) {
        throw new Error(likeTickerError?.message);
      }

      const { data: searchData, error: searchError } = await supabase
        .from("stock-list")
        .select()
        .textSearch("name", stock.name || ``, {
          type: "websearch",
          config: "english",
        });

      if (searchError) {
        throw new Error(searchError.message);
      }

      if (searchData.length > 0 || (likeTicker && likeTicker.length > 0)) {
        const combinedResults = [
          ...(searchData || []),
          ...(likeTicker || []).filter(
            (like) =>
              !(searchData || []).some((search) => search.id === like.id)
          ),
        ];

        const matchCountry = combinedResults
          .filter((stock) => stock.country === state.market)
          .sort((a, b) => b.price - a.price);
        if (matchCountry.length > 0) {
          return matchCountry[0];
        } else {
          return combinedResults[0];
        }
      }
    })
  );

  console.log(validated);

  return { answer: validated.filter(Boolean) };
};

async function grade(state: typeof GradeStateAnnotation.State) {
  const prompt = ChatPromptTemplate.fromTemplate(
    `You are a grader assessing relevance of a extracted stocks to a user question.
  Here is the validated stocks: {answer}

  Here is the user query: {query}, the market preference: {market}
  
  If the array of stocks has stock related to the user query and the stock exchange is in the user's preferred market location, grade it as pass.
  Give a binary score 'pass' or 'fail' score to indicate whether the document is relevant to the question.`
  );

  const structured_llm = model.withStructuredOutput(graderSchema, {
    name: "stock-ticker-grader",
  });

  const promptValue = await prompt.invoke({
    query: state.query,
    market: state.market,
    answer: state.answer,
  });

  const response = await structured_llm.invoke(promptValue);
  console.log("response.score", response.score);

  return { score: response.score };
}

async function transformQuery(state: typeof GradeStateAnnotation.State) {
  console.log("state", state);

  const prompt = ChatPromptTemplate.fromTemplate(`
      Your task is to rewrite a user's stock query to explicitly emphasize their preferred exchange location.

      CONTEXT:
      The original query was processed but failed validation because the stocks found were not listed on the user's preferred exchange(s).
      We need to reformulate the query to be more specific about the exchange requirements.

      INPUT:
      - Original query: {query}
      - User's preferred market location: {market}
      - Extracted stock: {answer}

      OUTPUT:
      - Please use English for the rewritten query.
      - Please state clearly the company name and the stock symbol you are looking for in English.
      - If the user's query is already in English, no translation is needed.
    `);

  const structured_llm = model.withStructuredOutput(transformQuerySchema, {
    name: "tramform-query",
  });

  const promptValue = await prompt.invoke({
    query: state.query,
    market: state.market,
    answer: state.answer,
  });

  const response = await structured_llm.invoke(promptValue);
  console.log("response", response);

  return { query: response.query };
}

function decidePath(state: typeof GradeStateAnnotation.State) {
  console.log("state.score", state.score);

  return state.score === "pass" ? "__end__" : "transformQuery";
}

async function createGraph() {
  // Compile application and test
  const graph = new StateGraph(GradeStateAnnotation)
    .addNode("extract", extract)
    .addNode("validate", validate)
    .addNode("grade", grade)
    .addNode("transformQuery", transformQuery)
    .addEdge("__start__", "extract")
    .addEdge("extract", "validate")
    .addEdge("validate", "grade")
    .addConditionalEdges("grade", decidePath)
    .addEdge("transformQuery", "extract")
    .compile();

  return graph;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const market = searchParams.get("market");
  const language = searchParams.get("language");

  if (!query || !market || !language) {
    return new Response("Missing query, market, or language", {
      status: 400,
    });
  }

  const graph = await createGraph();
  const result = await graph.invoke({
    query: query,
    market: market,
    language: language,
  });

  return new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json",
    },
  });
}
