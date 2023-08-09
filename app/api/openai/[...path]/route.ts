import { OpenaiPath } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../auth";
import { requestOpenai, requestChatglm } from "../../common";

const ALLOWD_PATH = new Set(Object.values(OpenaiPath));

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
  } catch (e) {
    console.error("[OpenAI] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "nodejs";
