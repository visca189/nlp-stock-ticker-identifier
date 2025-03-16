import { z } from "zod";

export const CountryEnum = z.enum(["US", "HK", "CN", "GLOBAL"]);
export type Country = z.infer<typeof CountryEnum>;

// Define the Stock schema
export const StockSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number().nullable(),
  exchange: z.string().nullable(),
  exchangeShortName: z.string().nullable(),
  type: z.string(),
});
export type Stock = z.infer<typeof StockSchema>;

export const ExchangeMappingSchema = z.record(z.string(), z.array(StockSchema));
export type ExchangeMapping = z.infer<typeof ExchangeMappingSchema>;

export const CountryToExchangeMappingSchema = z.object({
  US: z.array(StockSchema),
  HK: z.array(StockSchema),
  CN: z.array(StockSchema),
  GLOBAL: z.array(StockSchema),
});
export type CountryToExchangeMapping = z.infer<typeof CountryToExchangeMappingSchema>;

export const ExchangeToCountryMapSchema = z.record(z.string(), CountryEnum);
export type ExchangeToCountryMap = z.infer<typeof ExchangeToCountryMapSchema>;

export const SearchResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  currency: z.string(),
  stockExchange: z.string().optional(),
  exchangeShortName: z.string().optional(),
});