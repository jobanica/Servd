import { describe, it, expect } from "vitest";
import { applyMergeTags, escapeHtml, renderEmail } from "@/lib/email/render";

const UNSUB = "https://www.servdph.com/unsubscribe/abc123";

describe("applyMergeTags", () => {
  it("fills the known tags", () => {
    expect(applyMergeTags("Hi {{name}}, we have {{email}}", { name: "Brew Mate", email: "a@b.co" }))
      .toBe("Hi Brew Mate, we have a@b.co");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(applyMergeTags("Hi {{ name }}", { name: "Brew Mate", email: "" })).toBe("Hi Brew Mate");
  });

  // A visible {{oops}} in the founder's test send is a bug they can SEE and fix.
  // Silently blanking it would ship a sentence with a hole in it to the list.
  it("leaves an unknown tag visible rather than blanking it", () => {
    expect(applyMergeTags("Hi {{oops}}", { name: "X", email: "" })).toBe("Hi {{oops}}");
  });

  it("replaces every occurrence", () => {
    expect(applyMergeTags("{{name}} & {{name}}", { name: "A", email: "" })).toBe("A & A");
  });
});

describe("escapeHtml", () => {
  it("neutralises markup from the body", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

describe("renderEmail", () => {
  const body = "Hi {{name}},\n\nYour page is ready.";

  it("merges tags into both the text and HTML bodies", () => {
    const { text, html } = renderEmail(body, { name: "Brew Mate", email: "a@b.co" }, UNSUB);
    expect(text).toContain("Hi Brew Mate,");
    expect(html).toContain("Hi Brew Mate,");
    expect(html).not.toContain("{{name}}");
  });

  // The footer is appended by the renderer, never left to whoever writes the
  // campaign — an email without a working unsubscribe isn't legal to send.
  it("always appends the unsubscribe link to both bodies", () => {
    const { text, html } = renderEmail("No footer written here.", { name: "X", email: "" }, UNSUB);
    expect(text).toContain(UNSUB);
    expect(html).toContain(UNSUB);
  });

  it("splits blank-line-separated paragraphs into <p> blocks", () => {
    const { html } = renderEmail("One.\n\nTwo.", { name: "X", email: "" }, UNSUB);
    expect(html.match(/<p /g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps single newlines as line breaks", () => {
    const { html } = renderEmail("Line one\nLine two", { name: "X", email: "" }, UNSUB);
    expect(html).toContain("<br>");
  });

  // The merged value goes through escaping too — a restaurant called
  // "Tom & Jerry's <Cafe>" must not break the markup.
  it("escapes a merged restaurant name in the HTML body", () => {
    const { html } = renderEmail("Hi {{name}}", { name: "Tom & <Cafe>", email: "" }, UNSUB);
    expect(html).toContain("Tom &amp; &lt;Cafe&gt;");
    expect(html).not.toContain("<Cafe>");
  });
});
