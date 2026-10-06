import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { organization, user } from "./auth"
import { bugReport } from "./bug-report"

export const organizationLinearIntegration = pgTable(
  "organization_linear_integration",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    linearApiKeyEncrypted: text("linear_api_key_encrypted"),
    linearApiKeyLastFour: text("linear_api_key_last_four"),
    linearTeamId: text("linear_team_id"),
    linearTeamName: text("linear_team_name"),
    linearTeamKey: text("linear_team_key"),
    linearProjectId: text("linear_project_id"),
    linearProjectName: text("linear_project_name"),
    linearLabelIds: jsonb("linear_label_ids")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    linearLabelNames: jsonb("linear_label_names")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    launchCloudAgent: boolean("launch_cloud_agent").default(false).notNull(),
    cursorApiKeyEncrypted: text("cursor_api_key_encrypted"),
    cursorApiKeyLastFour: text("cursor_api_key_last_four"),
    githubRepoUrl: text("github_repo_url"),
    githubRef: text("github_ref").default("main").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("organization_linear_integration_organizationId_uidx").on(
      table.organizationId
    ),
  ]
)

export const linearHandoffJob = pgTable(
  "linear_handoff_job",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastError: text("last_error"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("linear_handoff_job_report_kind_uidx").on(
      table.bugReportId,
      table.kind
    ),
    index("linear_handoff_job_organizationId_idx").on(table.organizationId),
    index("linear_handoff_job_status_idx").on(table.status),
    index("linear_handoff_job_nextAttemptAt_idx").on(table.nextAttemptAt),
  ]
)

export const organizationLinearIntegrationRelations = relations(
  organizationLinearIntegration,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationLinearIntegration.organizationId],
      references: [organization.id],
    }),
    creator: one(user, {
      fields: [organizationLinearIntegration.createdBy],
      references: [user.id],
    }),
  })
)

export const linearHandoffJobRelations = relations(
  linearHandoffJob,
  ({ one }) => ({
    organization: one(organization, {
      fields: [linearHandoffJob.organizationId],
      references: [organization.id],
    }),
    bugReport: one(bugReport, {
      fields: [linearHandoffJob.bugReportId],
      references: [bugReport.id],
    }),
  })
)
