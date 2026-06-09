// Postmark transactional email client.
//
// Templates are managed in the Postmark dashboard; we just send TemplateAlias
// + TemplateModel. Tonight, create two templates with aliases set via
// wrangler vars (POSTMARK_MAGIC_LINK_TEMPLATE, POSTMARK_WELCOME_TEMPLATE).

const PM_BASE = "https://api.postmarkapp.com";

export interface SendTemplateParams {
  from: string;
  to: string;
  templateAlias: string;
  templateModel: Record<string, unknown>;
  messageStream?: string;
  /** Postmark accepts an InlineCss option for templates; default true. */
  inlineCss?: boolean;
}

export async function sendTemplate(
  params: SendTemplateParams,
  serverToken: string,
): Promise<void> {
  const body = {
    From: params.from,
    To: params.to,
    TemplateAlias: params.templateAlias,
    TemplateModel: params.templateModel,
    MessageStream: params.messageStream ?? "outbound",
    InlineCss: params.inlineCss !== false,
  };
  const res = await fetch(`${PM_BASE}/email/withTemplate`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverToken,
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text().catch(() => "");
  console.log("[postmark]", res.status, "from=" + params.from, "to=" + params.to,
              "tpl=" + params.templateAlias, "body=" + txt.slice(0, 300));
  if (!res.ok) {
    throw new Error(`Postmark error: HTTP ${res.status} ${txt}`);
  }
  // Postmark can return 200 with a non-zero ErrorCode in the JSON body
  // (e.g. inactive recipient, sender not approved). Surface those too.
  try {
    const j = JSON.parse(txt);
    if (j && typeof j.ErrorCode === "number" && j.ErrorCode !== 0) {
      throw new Error(`Postmark API error ${j.ErrorCode}: ${j.Message ?? "unknown"}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Postmark API error")) throw e;
    // Not JSON or no ErrorCode — fall through.
  }
}
