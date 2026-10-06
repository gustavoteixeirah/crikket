CREATE TABLE "organization_webhook_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"secret_last_four" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"destination_url" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"http_status" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_webhook_endpoint" ADD CONSTRAINT "organization_webhook_endpoint_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_webhook_endpoint" ADD CONSTRAINT "organization_webhook_endpoint_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_organization_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."organization_webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_webhook_endpoint_organizationId_uidx" ON "organization_webhook_endpoint" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_idempotency_uidx" ON "webhook_delivery" USING btree ("endpoint_id","event_type","source_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_organizationId_idx" ON "webhook_delivery" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_status_idx" ON "webhook_delivery" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_delivery_nextAttemptAt_idx" ON "webhook_delivery" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_endpointId_createdAt_idx" ON "webhook_delivery" USING btree ("endpoint_id","created_at");