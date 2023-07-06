import { PocketAIPath } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import md5 from "spark-md5";
import { parseApiKey } from "../../auth";
import { user_cli } from "../../db";

const ALLOWD_PATH = new Set(Object.values(PocketAIPath));

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[PocketAI Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const subpath = params.path.join("/");

  if (!ALLOWD_PATH.has(subpath)) {
    console.log("[PocketAI Route] forbidden path ", subpath);
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

  const authToken = req.headers.get("Authorization") ?? "";

  // check if it is openai api key or user token
  const { accessCode, apiKey: token } = parseApiKey(authToken);

  const hashedCode = md5.hash(accessCode ?? "").trim();

  if (!(await user_cli.hasKey(hashedCode))) {
    return NextResponse.json(
      {},
      {
        status: 401,
      },
    );
  }

  try {
    const user_balance = await user_cli.getValue(hashedCode);
    const res = { balance: user_balance.balance ?? 0 };

    return NextResponse.json(res, {
      status: 200,
    });
  } catch (e) {
    console.error("[PocketAI] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "nodejs";
