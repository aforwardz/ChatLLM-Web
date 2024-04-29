import { createClient, RedisClientType } from "redis";
const client = createClient({ url: "redis://127.0.0.1:6379/1" });

client.on("error", (err) => console.log("Redis Client Error", err));

client.connect();

export class UserCli {
  public client: RedisClientType;
  private G3PRICE: number;
  private G4PRICE: number;
  private GLMPRICE: number;
  private lastPriceGet: number;

  constructor() {
    this.client = createClient({ url: "redis://127.0.0.1:6379/1" });
    this.client.on("error", (err) => console.log("Redis Client Error", err));

    this.client.connect();

    this.G3PRICE = 0;
    this.G4PRICE = 0;
    this.GLMPRICE = 0;
    this.lastPriceGet = 0;

    this.getPrice();
  }

  async getPrice() {
    const g3price = (await this.client.get("G3PRICE")) ?? 0;
    const g4price = (await this.client.get("G4PRICE")) ?? 0;
    const glmprice = (await this.client.get("GLMPRICE")) ?? 0;
    this.G3PRICE = typeof g3price === "string" ? parseFloat(g3price) : g3price;
    this.G4PRICE = typeof g4price === "string" ? parseFloat(g4price) : g4price;
    this.GLMPRICE =
      typeof glmprice === "string" ? parseFloat(glmprice) : glmprice;
    this.lastPriceGet = Date.now();
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

  async useModelCount(hashCode: string, modelName: string) {
    if (await this.hasKey(hashCode)) {
      let codeInfo = await this.getValue(hashCode);
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

  async useModelBalance(
    hashCode: string,
    modelName: string,
    charCount: number,
  ) {
    const ONE_HOUR = 60 * 60 * 1000;

    if (await this.hasKey(hashCode)) {
      const overTwoHours = Date.now() - this.lastPriceGet > 2 * ONE_HOUR;
      if (overTwoHours) {
        await this.getPrice();
      }
      let codeInfo = await this.getValue(hashCode);
      if (modelName.includes("gpt-3")) {
        codeInfo.balance -= this.G3PRICE * charCount;
      }
      if (modelName.includes("gpt-4")) {
        codeInfo.balance -= this.G4PRICE * charCount;
      }
      if (modelName.startsWith("chatglm")) {
        codeInfo.balance -= this.GLMPRICE * charCount;
      }

      console.log("[Redis New Val]", codeInfo);
      this.client.set(hashCode, JSON.stringify(codeInfo));
    }
  }
}

export const user_cli = new UserCli();
