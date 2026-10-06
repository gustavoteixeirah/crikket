CREATE TABLE "organization_api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"label" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scope" text DEFAULT 'read' NOT NULL,
	"created_by" text,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_api_key" ADD CONSTRAINT "organization_api_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_api_key" ADD CONSTRAINT "organization_api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_api_key_key_hash_uidx" ON "organization_api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "organization_api_key_organizationId_idx" ON "organization_api_key" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_api_key_revokedAt_idx" ON "organization_api_key" USING btree ("revoked_at");