import { getPublicProposal } from "../db/proposal-repo";
import { isMailerConfigured, sendInviteMail } from "../notifications/mailer";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendProposalEmail(publicId: string): Promise<void> {
  if (!isMailerConfigured()) return;
  const proposal = await getPublicProposal(publicId);
  if (!proposal || proposal.status !== "awaiting_client") return;
  const base = process.env.PUBLIC_URL?.replace(/\/$/, "");
  if (!base) return;
  const link = `${base}/proposal/${encodeURIComponent(proposal.publicId)}`;
  const subject = `${proposal.workspaceName}: ${proposal.title}`;
  const text = [
    `Hi ${proposal.recipientName},`,
    "",
    proposal.message || proposal.purpose || `Review scheduling options for ${proposal.conversationTitle}.`,
    "",
    `Review and choose a time: ${link}`,
    "",
    `This proposal expires ${proposal.expiresAt.toISOString()}.`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#24201d;max-width:620px;margin:auto">
      <p>Hi ${escapeHtml(proposal.recipientName)},</p>
      <h1 style="font-size:22px">${escapeHtml(proposal.title)}</h1>
      <p>${escapeHtml(proposal.message || proposal.purpose || `Review scheduling options for ${proposal.conversationTitle}.`)}</p>
      <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#176b49;color:#fff;text-decoration:none;border-radius:8px">Review proposed times</a></p>
      <p style="font-size:13px;color:#6b625b">This proposal expires ${escapeHtml(proposal.expiresAt.toISOString())}.</p>
    </div>
  `;
  await sendInviteMail({
    to: proposal.recipientEmail,
    subject,
    text,
    html,
  });
}
