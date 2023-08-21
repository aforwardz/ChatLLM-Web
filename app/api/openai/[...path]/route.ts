import { type OpenAIListModelResponse } from "@/app/client/platforms/openai";
import { getServerSideConfig } from "@/app/config/server";
import { OpenaiPath } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../auth";
import { requestOpenai, requestChatglm } from "../../common";

const ALLOWD_PATH = new Set(Object.values(OpenaiPath));

function getModels(remoteModelRes: OpenAIListModelResponse) {
  const config = getServerSideConfig();

  if (config.disableGPT4) {
    remoteModelRes.data = remoteModelRes.data.filter(
      (m) => !m.id.startsWith("gpt-4"),
    );
  }

  return remoteModelRes;
}

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[OpenAI Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const subpath = params.path.join("/");

  if (!ALLOWD_PATH.has(subpath)) {
    console.log("[OpenAI Route] forbidden path ", subpath);
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + subpath,
      },
      {
        status: 403,
      },
    );
  }

  const modelName = req.headers.get("ModelName") ?? "";

  const authResult = await auth(req);
  console.log("[Auth Res]", authResult);
  if (authResult.error && authResult.authType === "access") {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }
  if (
    authResult.error &&
    authResult.authType === "usage" &&
    modelName.startsWith("gpt")
  ) {
    return NextResponse.json(authResult, {
      status: 402,
    });
  }

  try {
    let res = null;
    // Model Dispatch
    if (modelName.startsWith("chatglm")) {
      res = await requestChatglm(req, authResult.hashCode ?? "");
    } else {
      res = await requestOpenai(req, authResult.hashCode ?? "");
    }

    if (res === null) {
      return NextResponse.json({ error: true, msg: "Chat empty response" });
    }

    console.log("[Req DONE!]\n\n");

    return res;

    //    const response = await requestOpenai(req);
    //
    //    // list models
    //    if (subpath === OpenaiPath.ListModelPath && response.status === 200) {
    //      const resJson = (await response.json()) as OpenAIListModelResponse;
    //      const availableModels = getModels(resJson);
    //      return NextResponse.json(availableModels, {
    //        status: response.status,
    //      });
    //    }
    //
    //    return response;
  } catch (e) {
    console.error("[OpenAI] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "nodejs";
