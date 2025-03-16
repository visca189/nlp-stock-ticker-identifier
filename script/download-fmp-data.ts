/* eslint-disable @typescript-eslint/no-unused-vars */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { symbol, z } from "zod";
import {
  Country,
  CountryEnum,
  CountryToExchangeMapping,
  CountryToExchangeMappingSchema,
  ExchangeMapping,
  ExchangeMappingSchema,
  ExchangeToCountryMap,
  ExchangeToCountryMapSchema,
  SearchResultSchema,
  Stock,
  StockSchema,
} from "./types";
import { createClient } from "@supabase/supabase-js";

const FMP_API_KEY = process.env.FMP_API_KEY;
const DATA_DIR = path.join(__dirname, "..", "data"); // local
const PUBLIC_DIR = path.join(__dirname, "..", "public", "data"); // production

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

async function getFullStockList() {
  const filePath = DATA_DIR + "/cache";
  if (fs.existsSync(path.join(filePath, `full-stocks-list.json`))) {
    return JSON.parse(
      fs.readFileSync(path.join(filePath, `full-stocks-list.json`), "utf-8")
    );
  } else {
    const resp = await fetch(
      `https://financialmodelingprep.com/api/v3/stock/list?apikey=${FMP_API_KEY}`
    );

    if (resp.status !== 200) {
      throw new Error(`FMP API returned status ${resp.status}`);
    }

    const rawStockList = await resp.json();

    const fullList = z.array(StockSchema).parse(rawStockList);

    fs.mkdirSync(filePath, { recursive: true });
    fs.writeFileSync(
      path.join(filePath, `full-stocks-list.json`),
      JSON.stringify(fullList, null, 2)
    );

    return fullList;
  }
}

async function getbyStockSymbol(symbol: string) {
  const filePath = DATA_DIR + "/cache/symbol";
  if (fs.existsSync(path.join(filePath, `${symbol}.json`))) {
    return JSON.parse(
      fs.readFileSync(path.join(filePath, `${symbol}.json`), "utf-8")
    );
  } else {
    const params = new URLSearchParams({
      query: symbol,
      apikey: FMP_API_KEY || "",
    });

    const resp = await fetch(
      `https://financialmodelingprep.com/stable/search-symbol?${params.toString()}`
    );

    if (resp.status !== 200) {
      throw new Error(`FMP API returned status ${resp.status}`);
    }

    const searchResults = await resp.json();
    const data = z.array(SearchResultSchema).parse(searchResults);

    fs.mkdirSync(filePath, { recursive: true });
    fs.writeFileSync(
      path.join(filePath, `${symbol}.json`),
      JSON.stringify(data, null, 2)
    );

    return data;
  }
}

async function main() {
  // get full stock list
  const fullList = await getFullStockList();

  // classifiy by exchange
  const rawMappingByExchange: ExchangeMapping = fullList.reduce(
    (acc: ExchangeMapping, list: Stock) => {
      const exchange = list.exchangeShortName;

      if (!exchange) {
        acc["UNKNOWN"] = [list];
      } else if (!acc[exchange]) {
        acc[exchange] = [list];
      } else {
        acc[exchange].push(list);
      }
      return acc;
    },
    {}
  );
  const mappingByExchange = ExchangeMappingSchema.parse(rawMappingByExchange);

  // classify exchange by country
  const CURRENCY_TO_COUNTRY: Record<string, Country> = {
    USD: CountryEnum.enum.US,
    HKD: CountryEnum.enum.HK,
    CNY: CountryEnum.enum.CN,
  };
  const exchangeToCountryMap: ExchangeToCountryMap = {
    HKSE: CountryEnum.enum.HK,
    NYSE: CountryEnum.enum.US,
    NASDAQ: CountryEnum.enum.US,
  };

  const unclassified = Object.keys(mappingByExchange).filter(
    (exchange) => !exchangeToCountryMap?.[exchange]
  );

  const updatePromises = unclassified.map(async (exchange) => {
    try {
      const data = await getbyStockSymbol(
        mappingByExchange[exchange][0].symbol
      );

      if (data.length > 0) {
        const currency = data[0].currency;
        const country = CURRENCY_TO_COUNTRY?.[currency];

        if (country) {
          exchangeToCountryMap[exchange] = country;
        } else {
          exchangeToCountryMap[exchange] = CountryEnum.enum.GLOBAL;
        }
      } else {
        console.warn(`No search results found for exchange ${exchange}`);
      }
    } catch (error) {
      console.error(`Error processing exchange ${exchange}:`, error);
    }
  });
  await Promise.all(updatePromises);

  // const validatedExchangeToCountryMap =
  //   ExchangeToCountryMapSchema.parse(exchangeToCountryMap);

  // // classifiy stock list by country
  // const mappingByCountry: Partial<CountryToExchangeMapping> = {
  //   US: [],
  //   HK: [],
  //   CN: [],
  //   GLOBAL: [],
  // };

  // // Populate the mapping
  // for (const [exchange, country] of Object.entries(
  //   validatedExchangeToCountryMap
  // )) {
  //   const stocks = mappingByExchange[exchange] || [];
  //   mappingByCountry[country]?.push(...stocks);
  // }

  // // Add unknown exchanges to global
  // mappingByCountry.GLOBAL?.push(...mappingByExchange.UNKNOWN);

  // // Validate the final mapping
  // const validatedMappingByCountry =
  //   CountryToExchangeMappingSchema.parse(mappingByCountry);

  // // write each country's stock list to file
  // for (const [country, stocks] of Object.entries(validatedMappingByCountry)) {
  //   fs.writeFileSync(
  //     path.join(DATA_DIR, `${country.toLowerCase()}-stocks.json`),
  //     JSON.stringify(stocks, null, 2)
  //   );
  // }

  const fullListWithCountry = fullList.map((stock: Stock) => ({
    ...stock,
    country:
      exchangeToCountryMap?.[stock?.exchangeShortName || ""] ||
      CountryEnum.enum.GLOBAL,
  }));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_KEY || ""
  );
  const { error } = await supabase.from("stock-list").insert(
    fullListWithCountry.map((stock: Stock & { country: Country }) => {
      return {
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        exchange: stock.exchange,
        exchange_short_name: stock.exchangeShortName,
        type: stock.type,
        country: stock.country,
      };
    })
  );

  if (error) {
    console.error("Error inserting data:", error.message);
  }
}

main();
