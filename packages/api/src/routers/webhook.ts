import {
  disableWebhookSettings,
  getWebhookSettings,
  revealWebhookSecret,
  rotateWebhookSecret,
  sendWebhookTestEvent,
  upsertWebhookSettings,
} from "@crikket/bug-reports/procedures/webhooks"

export const webhookRouter = {
  disable: disableWebhookSettings,
  get: getWebhookSettings,
  revealSecret: revealWebhookSecret,
  rotateSecret: rotateWebhookSecret,
  sendTestEvent: sendWebhookTestEvent,
  upsert: upsertWebhookSettings,
}
