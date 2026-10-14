import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "./auth";

// Wraps a route handler: turns errors into plain-language JSON replies.
export function handle<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, fields: err.fields }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
    }
  };
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "The request could not be read.");
  }
  return parse(schema, body);
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".");
      if (key && !fields[key]) fields[key] = issue.message;
    }
    throw new HttpError(400, "Please check the highlighted fields.", fields);
  }
  return result.data;
}

export function ok(data: unknown = { ok: true }, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
