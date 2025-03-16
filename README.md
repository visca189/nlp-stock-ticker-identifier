# NLP Stock Ticker Identifier

## Project Overview

This web application extracts stock tickers from natural language queries, matching them with the Financial Modeling Prep (FMP) format. The application supports multiple languages and considers user-selected geographic preferences to determine the most relevant ticker when a company is listed on multiple exchanges.

## Features

- **Natural Language Processing**: Extracts stock tickers from user queries in various formats (direct ticker mentions or company names)
- **Multi-language Support**: Handles queries in English, Simplified Chinese, and Traditional Chinese
- **Geographic Customization**: Prioritizes tickers based on user-selected geographic preferences
- **Intelligent Ticker Resolution**: Uses LLM processing to handle dual-listed stocks and identify the correct exchange based on context
- **Typo Handling**: Leverages LLM capabilities to understand user intent despite typographical errors

## Live Demo

[Visit the live application](https://nlp-stock-ticker-identifier.vercel.app/)

## Technologies Used

- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **APIs**: Financial Modeling Prep API
- **Database**: Supabase
- **LLM**: OpenAI's GPT-4o-mini
- **LLM Monitoring**: LangSmith
- **Deployment**: Vercel

## Setup Instructions

### Prerequisites

- Node.js (v14 or later)
- Yarn package manager
- Financial Modeling Prep API key (sign up at [FMP](https://site.financialmodelingprep.com/developer/docs/))
- Supabase account and project
- OpenAI API key for GPT-4o-mini
- LangSmith account (for monitoring)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/nlp-stock-ticker-identifier.git
   cd nlp-stock-ticker-identifier
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Create a `.env.local` file in the root directory and add your keys:
   ```
   NEXT_PUBLIC_FMP_API_URL=https://financialmodelingprep.com/api/v3/stock/list
   
   FMP_API_KEY=your_fmp_api_key
   OPENAI_API_KEY=your_openai_api_key
   LANGSMITH_TRACING="true"
   LANGSMITH_ENDPOINT=your_langsmith_endpoint
   LANGSMITH_PROJECT=your_langsmith_project
   LANGSMITH_API_KEY=your_langsmith_api_key
   
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the development server:
   ```bash
   yarn dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

## Implementation Details

### Data Flow

1. User enters a query (sentence or word) in the input box
2. The query is sent to the backend via GET request to `/api/ticker`
3. The LLM processes the query:
   - Extracts potential ticker symbols and company names
   - Validates the extraction against FMP data in the Supabase database
   - Checks if the retrieved data is relevant to the user's query based on location preferences
   - If needed, it retries the extraction with refined parameters
4. Results are returned to the frontend
5. Frontend displays the matched ticker(s) to the user

### Geographic Preferences Logic

- **US**: Prioritizes NYSE and NASDAQ listings
- **HK**: Prioritizes Hong Kong Stock Exchange listings
- **China**: Prioritizes Shanghai and Shenzhen Stock Exchange listings
- **Global**: Returns the first matching ticker

### Database Setup

- Stock list data is pre-downloaded to a Supabase database for faster access
- The data is sourced from:
  - `https://financialmodelingprep.com/api/v3/stock/list` for the complete list of stocks
  - `https://financialmodelingprep.com/stable/search-symbol` for determining the country/exchange of each stock
- For detailed implementation, please refer to the `download-fmp-data` script in the repository

## Known Limitations

- The application's accuracy depends on the quality of the FMP database
- Very obscure or newly listed stocks might not be accurately identified
- Complex queries with multiple context clues may yield varying results
- LLM rate limiting may cause request failures during periods of high traffic or when making multiple rapid requests
- Response times can vary based on LLM availability and processing load
- The system has limited error recovery mechanisms for failed LLM requests

## API Usage

- **Financial Modeling Prep API**: Used to initially populate the Supabase database with stock information
- **OpenAI API (GPT-4o-mini)**: Used to process user queries, translate between languages, extract ticker symbols and company names, and validate results
- **LangSmith**: Used for monitoring and evaluating LLM performance

## Assumptions

- The stock data stored in Supabase accurately reflects current market listings and is regularly updated
- User geographic preferences provide crucial context for selecting the most appropriate ticker for dual-listed companies
- The language processing capabilities of GPT-4o-mini are sufficient to handle variations in how users express their stock queries
- For ambiguous matches where multiple valid tickers could apply, the system will return the first result retrieved from the database, maintaining the original order from the FMP list

## License

[MIT License](LICENSE)