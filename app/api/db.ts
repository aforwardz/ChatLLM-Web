import { createClient } from "redis";
const client = createClient({ url: "redis://127.0.0.1:6379/1" });

client.on("error", (err) => console.log("Redis Client Error", err));

client.connect();

export class RedisCli {
  public client: null;

  constructor() {
    this.client = createClient({ url: "redis://127.0.0.1:6379/1" });
    this.client.on("error", (err) => console.log("Redis Client Error", err));

    this.client.connect();
  }

  async hasKey(hashCode: string) {
    const val = await this.client.get(hashCode);
    return val !== null;
  }

  async getValue(hashCode: string) {
    const val = await this.client.get(hashCode);
    if (val === null) {
      return {};
    } else {
      const codeInfo = JSON.parse(val);
      return codeInfo;
    }
  }

  async useModel(hashCode: string, modelName: string) {
    if (await this.hasKey(hashCode)) {
      const codeInfo = await this.getValue(hashCode);
      if (modelName.includes("gpt-3")) {
        codeInfo.gpt3remains--;
      }
      if (modelName.includes("gpt-4")) {
        codeInfo.set("gpt4remains", codeInfo.gpt4remains--);
      }

      console.log("[Redis New Val]", codeInfo);
      this.client.set(hashCode, JSON.stringify(codeInfo));
    }
  }
}

export const redis_cli = new RedisCli();
