CREATE TABLE "linear_handoff_job" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"bug_report_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_linear_integration" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"linear_api_key_encrypted" text,
	"linear_api_key_last_four" text,
	"linear_team_id" text,
	"linear_team_name" text,
	"linear_team_key" text,
	"linear_project_id" text,
	"linear_project_name" text,
	"linear_label_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linear_label_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"launch_cloud_agent" boolean DEFAULT false NOT NULL,
	"cursor_api_key_encrypted" text,
	"cursor_api_key_last_four" text,
	"github_repo_url" text,
	"github_ref" text DEFAULT 'main' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bug_report" ADD COLUMN "linear_issue_id" text;--> statement-breakpoint
ALTER TABLE "bug_report" ADD COLUMN "linear_issue_identifier" text;--> statement-breakpoint
ALTER TABLE "bug_report" ADD COLUMN "linear_issue_url" text;--> statement-breakpoint
ALTER TABLE "bug_report" ADD COLUMN "cursor_agent_id" text;--> statement-breakpoint
ALTER TABLE "bug_report" ADD COLUMN "cursor_agent_url" text;--> statement-breakpoint
ALTER TABLE "linear_handoff_job" ADD CONSTRAINT "linear_handoff_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_handoff_job" ADD CONSTRAINT "linear_handoff_job_bug_report_id_bug_report_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_linear_integration" ADD CONSTRAINT "organization_linear_integration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_linear_integration" ADD CONSTRAINT "organization_linear_integration_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linear_handoff_job_report_kind_uidx" ON "linear_handoff_job" USING btree ("bug_report_id","kind");--> statement-breakpoint
CREATE INDEX "linear_handoff_job_organizationId_idx" ON "linear_handoff_job" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "linear_handoff_job_status_idx" ON "linear_handoff_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "linear_handoff_job_nextAttemptAt_idx" ON "linear_handoff_job" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_linear_integration_organizationId_uidx" ON "organization_linear_integration" USING btree ("organization_id");