import { OpenaiPath, CostWay } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../auth";
import { requestOpenai } from "../../common";
import { user_cli } from "../../db";

const ALLOWD_PATH = new Set(Object.values(OpenaiPath));
const ALLOWD_COST = new Set(Object.values(CostWay));

const DEFAULT_COST_WAY = "balance";
const COST_WAY = !ALLOWD_COST.has(process.env.COST_WAY ?? "")
  ? DEFAULT_COST_WAY
  : process.env.COST_WAY;

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
  if (authResult.error && authResult.authType === "usage") {
    return NextResponse.json(authResult, {
      status: 402,
    });
  }

  try {
    const res = await requestOpenai(req);

    if (res.status === 200) {
      const clonedRes = res.clone();
      const jsonBody = await clonedRes.json();
      console.log("[clone Json]", jsonBody);
      // const jsonBody = JSON.parse(clonedBody);

      if (
        subpath === OpenaiPath.ChatPath &&
        (jsonBody?.choices ?? []).length > 0 &&
        jsonBody.choices[0].finish_reason === "stop"
      ) {
        if (COST_WAY === CostWay.UseBalance) {
          const tokenUsage = jsonBody.usage;
          user_cli.useModelBalance(
            authResult.hashCode ?? "",
            modelName,
            tokenUsage.total_tokens,
          );
        }

        if (COST_WAY === CostWay.UseCount) {
          user_cli.useModelCount(authResult.hashCode ?? "", modelName);
        }
      }
    }

    return res;
  } catch (e) {
    console.error("[OpenAI] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "nodejs";
