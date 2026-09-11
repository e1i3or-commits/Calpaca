# SES onboarding invitation feedback

Protected kickoff and follow-up emails carry `X-SES-CONFIGURATION-SET` and
`X-SES-MESSAGE-TAGS` with `calpaca_delivery_id` and `calpaca_message_key` (SHA-256
of the saved RFC message ID). SES replaces message IDs; neither its generated
ID nor `commonHeaders.messageId` identifies our operation independently.

Configure these values through Infisical:

- `ONBOARDING_SES_CONFIGURATION_SET`
- `ONBOARDING_SES_TOPIC_ARN`
- `ONBOARDING_SES_ACCOUNT_ID` (sending account)
- `ONBOARDING_SES_WEBHOOK_SECRET` (dedicated adapter bearer credential)

The protected dispatcher requires all four plus SMTP, From and HTTPS public
URL configuration. Other mail flows retain their own existing behavior.
Migration `0061_ses_feedback_notifications` adds provider-message binding and
atomic whole-notification replay records. No provider resources are created by
this migration. The approved onboarding call lengths are enforced as 45 minutes.

`POST /api/webhooks/ses-onboarding` accepts an SNS `Notification` envelope with
`TopicArn`, `MessageId` and string `Message`. It is an authenticated SQS adapter
endpoint, **not** an internet SNS subscriber: it does not verify SNS signatures,
fetch signing certificates or confirm subscriptions. The n8n adapter must read
only the dedicated queue, whose policy restricts publishing to the configured
SNS topic. Configure SES event publishing through the explicit configuration
set; identity-level feedback lacks the required tags.

Publish Delivery, Bounce, Complaint, Reject and Rendering Failure events.
Source account, topic, configuration set, single-valued operation tags and the
exact original recipient set must match. Delivery/Bounce/Complaint affect only
the explicit event recipients. Reject/Rendering Failure fail every original
recipient with distinct receipt statuses. Nonterminal/unknown event types are
rejected, not treated as delivery; do not enable them on this event destination.

The SNS notification and all recipient changes commit together. Its normalized
payload digest detects changed replay contents. The first receipt binds the SES
message ID under the existing booking/host locks; another provider message
cannot overwrite it. Late delivery cannot erase a negative receipt. Provider
headers, diagnostic bodies and signatures are not retained. A 256 KB request
limit and bounded field sizes reject unexpectedly large input.

The adapter deletes SQS messages only after `recorded` or `duplicate`. API
errors/timeouts retain the message for retry; configure a dead-letter queue and
monitor queue age, both dead-letter paths (SNS subscription and SQS consumer),
failed executions and missing successful polls independently. Existing Calpaca
health exposes overdue delivery and assigned negative outcomes, including a
stopped dispatcher or follow-up scheduler. SMTP acceptance alone is insufficient.

Verification: full gate **846 tests / 2,931 assertions**, type checks, lint and
OpenAPI parity; web build passes. PostgreSQL tests cover atomic rollback after
the second recipient, concurrent replay, changed payloads, wrong recipients,
provider-ID conflicts and late bounces. No real email was sent. Source binding,
queue infrastructure, workflow activation and independent alerts remain pending.

Official contracts: [SES SMTP tags](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-send-email.html),
[SES event examples](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-examples.html),
[SNS to SQS](https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html).

## Independent queue-poller heartbeat

Also bind `ONBOARDING_SES_QUEUE_URL` in Calpaca. The protected dispatcher requires
this valid AWS queue URL. `POST /api/webhooks/ses-onboarding/poll` uses the same
adapter secret and accepts `{queueUrl, notificationId}`. The queue must match;
`notificationId` is null for an empty poll, otherwise the SNS message ID must
already have an atomic saved notification record. The adapter calls this only
after a verified empty read or successful delete, and Calpaca timestamps it.

Delivery health includes `workspaceId`, `feedbackLastPollAt` and `feedbackStale`
(three minutes). This external adapter flag is separate from `workerStale`,
which aggregates the Calpaca dispatcher/scheduler. The independent monitor
checks all three and verifies the intended workspace. No execution history or
email recipient data is needed to detect an idle but stopped feedback poller.

Updated verification: **847 tests / 2,949 assertions**, full gate and web build.
Queue mismatch, unrecorded notifications, stale heartbeat and recovery are
covered using local PostgreSQL and synthetic API calls.
