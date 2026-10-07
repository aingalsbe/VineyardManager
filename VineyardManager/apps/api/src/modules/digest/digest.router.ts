import { Router, type Request } from "express";
import { z } from "zod";
import { getAuthUser, requireOperate } from "../auth/auth.middleware.js";
import { sendTestDigest } from "./digest.send.js";
import { buildDigestData } from "./digest.service.js";
import { render } from "./digest.template.js";

export const vineyardDigestRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();
const sendTestBody = z.object({
  to: z.string().trim().email().optional(),
});
const previewQuery = z.object({
  format: z.enum(["html", "text", "json"]).optional().default("html"),
});

/**
 * Preview the weekly digest. Manager+ (viewers 403). Sends nothing.
 * format=html (default) → text/html; text → text/plain;
 * json → { data: { subject, digest: DigestData } } (for template work).
 */
vineyardDigestRouter.get(
  "/preview",
  requireOperate,
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const { format } = previewQuery.parse(req.query);
    const data = await buildDigestData(vineyardId);
    const rendered = render(data);
    if (format === "json") {
      res.json({ data: { subject: rendered.subject, digest: data } });
      return;
    }
    res.setHeader("X-Digest-Subject", encodeURIComponent(rendered.subject));
    if (format === "text") {
      res.type("text/plain; charset=utf-8").send(rendered.text);
      return;
    }
    res.type("text/html; charset=utf-8").send(rendered.html);
  },
);

/**
 * Send ONE test digest. Manager+ (viewers 403). Body { to? } (defaults to the
 * caller's email). 400 RECIPIENT_LOCAL (*.local), 400 RECIPIENT_NOT_ALLOWED
 * (not on DIGEST_TEST_RECIPIENTS), 502 MAIL_SEND_FAILED. Logged as kind=test.
 */
vineyardDigestRouter.post(
  "/send-test",
  requireOperate,
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const body = sendTestBody.parse(req.body ?? {});
    const result = await sendTestDigest({
      vineyardId,
      caller: getAuthUser(req),
      to: body.to,
    });
    res.json({ data: result });
  },
);
