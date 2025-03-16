"use client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Home() {
  const [input, setInput] = useState("");
  const [market, setMarket] = useState("1");
  const [language, setLanguage] = useState("english");
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState("");

  const onSubmit = async (query: string, market: string, language: string) => {
    try {
      const qs = new URLSearchParams({
        query,
        market,
        language,
      });

      const resp = await fetch(`/api/ticker?${qs}`);

      if (resp.status !== 200) {
        throw new Error("failed to search for ticker, please try again!");
      }
      const data = await resp.json();
      setOutput(data.answer[0].symbol);
    } catch (err) {
      console.error(err);
      toast.error("Failed when searching ticker, please try agin.")
      setOutput("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="px-12 py-14 grid place-items-center">
      <h1 className="text-3xl font-bold mb-8">Stock Ticker Identifier</h1>
      <div className="flex flex-col justify-center gap-y-4 w-max border-[1px] border-solid border-[#808080a8] rounded-md px-8 py-6">
        <label>Ask me:</label>
        <Input
          type="text"
          placeholder="type here..."
          autoFocus
          onChange={(e) => {
            setInput(e.target.value);
          }}
        />

        <div className="my-4 flex flex-col justify-center gap-y-3">
          <h2 className="font-bold">Preference</h2>
          <label>Geography/Market Selection</label>
          <Select
            onValueChange={(value) => {
              setMarket(value);
            }}
            defaultValue="us"
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">US</SelectItem>
              <SelectItem value="hk">Hong Kong</SelectItem>
              <SelectItem value="cn">China</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>

          <label>Language Selection</label>
          <Select
            onValueChange={(value) => {
              setLanguage(value);
            }}
            defaultValue="english"
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="english">English</SelectItem>
              <SelectItem value="simplified chinese">
                Simplified Chinese
              </SelectItem>
              <SelectItem value="traditional chinese">
                Traditional Chinese
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => {
            if (!input) {
              console.error("please enter your question");
            }
            setIsLoading(true);
            onSubmit(input, market, language);
          }}
          disabled={isLoading || !input}
        >
          {isLoading ? <Loader2 className="animate-spin" /> : "Send"}
        </Button>
      </div>

      {output && (
        <h3 className="text-lg mt-6">
          Ticker: <span className="font-bold">{output}</span>
        </h3>
      )}
    </div>
  );
}
