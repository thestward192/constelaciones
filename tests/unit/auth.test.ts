import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedJob } from "@/server/auth";

const request = (authorization?: string) =>
  new Request("http://localhost/api/jobs/process", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("isAuthorizedJob", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the exact secret as a bearer token", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isAuthorizedJob(request("Bearer s3cret"))).toBe(true);
    expect(isAuthorizedJob(request("Bearer s3cre"))).toBe(false);
    expect(isAuthorizedJob(request("s3cret"))).toBe(false);
    expect(isAuthorizedJob(request())).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedJob(request("Bearer "))).toBe(false);
  });
});
