import { describe, it, expect } from "vitest";
import { extractMentions } from "@/lib/task/mention-parser";

// NOTE: the parser matches `@<email-address>` tokens (e.g. "@jane@corp.com"),
// not bare `@handle` words — these tests assert the real implementation.
describe("extractMentions", () => {
  it("returns an empty array for empty / mention-free text", () => {
    expect(extractMentions("")).toEqual([]);
    expect(extractMentions("không có ai được nhắc ở đây")).toEqual([]);
  });

  it("extracts a single email mention at the start of the body", () => {
    expect(extractMentions("@jane@corp.com xem giúp")).toEqual(["jane@corp.com"]);
  });

  it("extracts multiple distinct mentions", () => {
    expect(extractMentions("@a@x.com và @b@y.com cùng xử lý")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("de-duplicates and lower-cases repeated mentions", () => {
    expect(extractMentions("@Dup@X.COM rồi @dup@x.com")).toEqual(["dup@x.com"]);
  });

  it("does not treat a plain email (no leading @) as a mention", () => {
    expect(extractMentions("liên hệ jane@corp.com nhé")).toEqual([]);
  });

  it("matches a mention after a bracket / quote delimiter", () => {
    expect(extractMentions("(@kevin@team.io)")).toEqual(["kevin@team.io"]);
  });
});
