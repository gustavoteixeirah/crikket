CREATE TABLE "bug_report_transcript" (
	"id" text PRIMARY KEY NOT NULL,
	"bug_report_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"text" text,
	"language" text,
	"duration_seconds" double precision,
	"segments" jsonb,
	"model" text,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bug_report_transcription_job" (
	"id" text PRIMARY KEY NOT NULL,
	"bug_report_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_transcription_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"api_key_encrypted" text,
	"api_key_last_four" text,
	"model" text DEFAULT 'gpt-4o-mini-transcribe' NOT NULL,
	"language" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bug_report_transcript" ADD CONSTRAINT "bug_report_transcript_bug_report_id_bug_report_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_transcript" ADD CONSTRAINT "bug_report_transcript_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_transcription_job" ADD CONSTRAINT "bug_report_transcription_job_bug_report_id_bug_report_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_transcription_job" ADD CONSTRAINT "bug_report_transcription_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_transcription_settings" ADD CONSTRAINT "organization_transcription_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_transcription_settings" ADD CONSTRAINT "organization_transcription_settings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bug_report_transcript_bugReportId_uidx" ON "bug_report_transcript" USING btree ("bug_report_id");--> statement-breakpoint
CREATE INDEX "bug_report_transcript_organizationId_idx" ON "bug_report_transcript" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bug_report_transcript_status_idx" ON "bug_report_transcript" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bug_report_transcription_job_bugReportId_idx" ON "bug_report_transcription_job" USING btree ("bug_report_id");--> statement-breakpoint
CREATE INDEX "bug_report_transcription_job_status_idx" ON "bug_report_transcription_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bug_report_transcription_job_nextAttemptAt_idx" ON "bug_report_transcription_job" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_transcription_settings_organizationId_uidx" ON "organization_transcription_settings" USING btree ("organization_id");