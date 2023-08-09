import { NextRequest } from "next/server";
import { getServerSideConfig } from "../config/server";
import md5 from "spark-md5";
import { ACCESS_CODE_PREFIX } from "../constant";

import { user_cli } from "./db";

function getIP(req: NextRequest) {
  let ip = req.ip ?? req.headers.get("x-real-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (!ip && forwardedFor) {
    ip = forwardedFor.split(",").at(0) ?? "";
  }

  return ip;
}

export function parseApiKey(bearToken: string) {
  const token = bearToken.trim().replaceAll("Bearer ", "").trim();
  const isOpenAiKey = !token.startsWith(ACCESS_CODE_PREFIX);

  return {
    accessCode: isOpenAiKey ? "" : token.slice(ACCESS_CODE_PREFIX.length),
    apiKey: isOpenAiKey ? token : "",
  };
}

export async function auth(req: NextRequest) {
  const authToken = req.headers.get("Authorization") ?? "";
  const modelName = req.headers.get("ModelName") ?? "";

  // check if it is openai api key or user token
  const { accessCode, apiKey: token } = parseApiKey(authToken);

  const hashedCode = md5.hash(accessCode ?? "").trim();

  // console.log("[Auth] allowed hashed codes: ", [...serverConfig.codes]);
  console.log("[Auth] req model:", modelName);
  console.log("[Auth] got access code:", accessCode);
  console.log("[Auth] hashed access code:", hashedCode);
  console.log("[User IP] ", getIP(req));
  console.log("[Time] ", new Date().toLocaleString());

  try {
    const hasCodeVal = await user_cli.hasKey(hashedCode);
    if (!hasCodeVal) {
      return {
        error: true,
        authType: "access",
        msg: "wrong access code: " + accessCode,
      };
    }
    const codeInfo = await user_cli.getValue(hashedCode);
    console.log("code info: ", codeInfo);

    if (codeInfo.isExpired) {
      return {
        error: true,
        authType: "usage",
        msg: "access code has expired",
      };
    }

    if (codeInfo.balance <= 0) {
      return {
        error: true,
        authType: "usage",
        msg: "No more balance",
      };
    }

    if (modelName.includes("gpt-3") && codeInfo.gpt3remains <= 0) {
      return {
        error: true,
        authType: "usage",
        msg: "GPT3.5 has reached the limit",
      };
    }

    if (modelName.includes("gpt-4") && codeInfo.gpt4remains <= 0) {
      return {
        error: true,
        authType: "usage",
        msg: "GPT4 has reached the limit",
      };
    }
  } catch (e) {
    console.error("Redis Get Code Error: ", e);
    return {
      error: true,
      authType: "access",
      msg: "Get Code Error",
    };
  }

  const serverConfig = getServerSideConfig();

  // if user does not provide an api key, inject system api key
  if (!token) {
    const apiKey = serverConfig.apiKey;
    if (apiKey) {
      console.log("[Auth] use system api key");
      req.headers.set("Authorization", `Bearer ${apiKey}`);
    } else {
      console.log("[Auth] admin did not provide an api key");
    }
  } else {
    console.log("[Auth] use user api key");
  }

  return {
    error: false,
    hashCode: hashedCode,
  };
}
