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
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Postmark error: HTTP ${res.status} ${txt}`);
  }
}
