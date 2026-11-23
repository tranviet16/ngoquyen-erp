import { afterEach, describe, expect, it } from "vitest";
import { GuardError, requireCopyDatabaseUrl, requireLoopbackBaseUrl } from "@/scripts/dt-hd-tt-baseline/guards";
import { countPdfPages, readBuildId } from "@/scripts/dt-hd-tt-baseline/page-capture";

describe("baseline guards", () => {
  const savedDbUrl = process.env.DATABASE_URL;
  afterEach(() => {
    process.env.DATABASE_URL = savedDbUrl;
  });

  it("requires an explicit loopback base URL and refuses the unpinned 3001 copy", () => {
    expect(() => requireLoopbackBaseUrl(undefined)).toThrow(GuardError);
    expect(() => requireLoopbackBaseUrl("http://192.168.1.10:3002")).toThrow(/máy này/);
    expect(() => requireLoopbackBaseUrl("http://localhost:3001")).toThrow(/3001/);
    expect(requireLoopbackBaseUrl("http://127.0.0.1:3003/du-an")).toBe("http://127.0.0.1:3003");
  });

  it("reads only the copy database on loopback port 5433, without echoing the URL", () => {
    process.env.DATABASE_URL = "postgresql://u:secret@10.0.0.5:5433/db";
    expect(() => requireCopyDatabaseUrl()).toThrow(GuardError);
    process.env.DATABASE_URL = "postgresql://u:secret@127.0.0.1:5432/db";
    expect(() => requireCopyDatabaseUrl()).toThrow(/5433/);
    try {
      requireCopyDatabaseUrl();
    } catch (err) {
      expect(String(err)).not.toContain("secret");
    }
    process.env.DATABASE_URL = "postgresql://u:secret@127.0.0.1:5433/db";
    expect(requireCopyDatabaseUrl()).toContain("5433");
  });
});

describe("baseline page helpers", () => {
  it("finds the Next build id in the escaped flight payload and in plain JSON", () => {
    expect(readBuildId('<script>self.__next_f.push([1,"0:{\\"b\\":\\"abc_DEF-123\\",\\"p\\":\\"\\"}"])</script>')).toBe("abc_DEF-123");
    expect(readBuildId('{"b":"plain-id"}')).toBe("plain-id");
    expect(readBuildId("<html></html>")).toBeNull();
  });

  it("counts PDF page objects but not the page tree", () => {
    const pdf = Buffer.from("<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page /Parent 1 0 R >>", "latin1");
    expect(countPdfPages(pdf)).toBe(2);
  });
});
