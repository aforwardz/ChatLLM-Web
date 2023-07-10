import { NextRequest, NextResponse } from "next/server";
import { OpenaiPath, CostWay } from "@/app/constant";
import { user_cli } from "./db";
import { get_encoding, encoding_for_model } from "tiktoken";
const { Tiktoken } = require("tiktoken/lite");
const cl100k_base = require("tiktoken/encoders/cl100k_base.json");

export const OPENAI_URL = "api.openai.com";
const DEFAULT_PROTOCOL = "https";
const PROTOCOL = process.env.PROTOCOL ?? DEFAULT_PROTOCOL;
const BASE_URL = process.env.BASE_URL ?? OPENAI_URL;
const DISABLE_GPT4 = !!process.env.DISABLE_GPT4;

const ALLOWD_COST = new Set(Object.values(CostWay));

const DEFAULT_COST_WAY = "balance";
const COST_WAY = !ALLOWD_COST.has(process.env.COST_WAY ?? "")
  ? DEFAULT_COST_WAY
  : process.env.COST_WAY;

const encoder = new Tiktoken(
  cl100k_base.bpe_ranks,
  cl100k_base.special_tokens,
  cl100k_base.pat_str,
);

async function costBalance(
  res: Response,
  hashCode: string,
  model: string,
  extraTokens: number,
) {
  // cost count
  if (COST_WAY === CostWay.UseCount) {
    user_cli.useModelCount(hashCode, model);
    return;
  }

  // cost tokens
  let completionTokens = 0;
  const reader = res.body?.getReader();
  if (!reader) {
    console.error("Error: fail to read data from response");
    return;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const textDecoder = new TextDecoder("utf-8");
    const chunk = textDecoder.decode(value);

    let deltaText = "";
    for (const line of chunk.split("\n")) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine === "data: [DONE]") {
        continue;
      }

      const json = trimmedLine.replace("data: ", "");
      const obj = JSON.parse(json);
      const content = obj.choices ? obj.choices[0].delta.content : "";
      deltaText = deltaText.concat(content);
    }

    completionTokens += encoder.encode(deltaText).length;
    console.log("[OpenAI] completion tokens: ", completionTokens);
    encoder.free;
  }

  if (COST_WAY === CostWay.UseBalance) {
    const totalTokens = completionTokens + extraTokens;
    user_cli.useModelBalance(hashCode, model, totalTokens);
  }
}

export async function requestOpenai(req: NextRequest, hashCode: string) {
  const controller = new AbortController();
  const authValue = req.headers.get("Authorization") ?? "";
  const openaiPath = `${req.nextUrl.pathname}${req.nextUrl.search}`.replaceAll(
    "/api/openai/",
    "",
  );

  let baseUrl = OPENAI_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `${PROTOCOL}://${baseUrl}`;
  }

  console.log("[Proxy] ", openaiPath);
  console.log("[Base Url]", baseUrl);

  if (process.env.OPENAI_ORG_ID) {
    console.log("[Org ID]", process.env.OPENAI_ORG_ID);
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10 * 60 * 1000);

  const fetchUrl = `${baseUrl}/${openaiPath}`;
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      Authorization: authValue,
      ...(process.env.OPENAI_ORG_ID && {
        "OpenAI-Organization": process.env.OPENAI_ORG_ID,
      }),
    },
    cache: "no-store",
    method: req.method,
    body: req.body,
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  const modelName = req.headers.get("ModelName") ?? "";
  let promptTokens = 0;

  if (COST_WAY === CostWay.UseBalance && req.body) {
    const clonedBody = await req.text();
    const jsonBody = JSON.parse(clonedBody);

    if (jsonBody?.messages.length > 0 && jsonBody?.messages.length <= 6) {
      const lastMessage = jsonBody.messages[jsonBody.messages.length - 1];
      if (lastMessage.role === "user") {
        promptTokens += encoder.encode(lastMessage.content).length;
        // encoder.free()
      }
    }
  }
  console.log("[OpenAI] prompt tokens: ", promptTokens);

  // #1815 try to refuse gpt4 request
  if (DISABLE_GPT4 && req.body) {
    try {
      const clonedBody = await req.text();
      fetchOptions.body = clonedBody;

      const jsonBody = JSON.parse(clonedBody);

      if ((jsonBody?.model ?? "").includes("gpt-4")) {
        return NextResponse.json(
          {
            error: true,
            message: "you are not allowed to use gpt-4 model",
          },
          {
            status: 403,
          },
        );
      }
    } catch (e) {
      console.error("[OpenAI] gpt4 filter", e);
    }
  }

  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");

    // to disbale ngnix buffering
    newHeaders.set("X-Accel-Buffering", "no");

    if (openaiPath === OpenaiPath.ChatPath && res.ok) {
      costBalance(res.clone(), hashCode, modelName, promptTokens);
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
