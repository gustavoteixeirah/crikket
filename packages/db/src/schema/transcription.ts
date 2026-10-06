import { relations } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
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

export type BugReportTranscriptSegment = {
  end: number
  start: number
  text: string
}

export const organizationTranscriptionSettings = pgTable(
  "organization_transcription_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    apiKeyLastFour: text("api_key_last_four"),
    model: text("model").default("gpt-4o-mini-transcribe").notNull(),
    language: text("language"),
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
    uniqueIndex("organization_transcription_settings_organizationId_uidx").on(
      table.organizationId
    ),
  ]
)

export const bugReportTranscript = pgTable(
  "bug_report_transcript",
  {
    id: text("id").primaryKey(),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status").default("pending").notNull(),
    text: text("text"),
    language: text("language"),
    durationSeconds: doublePrecision("duration_seconds"),
    segments: jsonb("segments").$type<BugReportTranscriptSegment[]>(),
    model: text("model"),
    error: text("error"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("bug_report_transcript_bugReportId_uidx").on(table.bugReportId),
    index("bug_report_transcript_organizationId_idx").on(table.organizationId),
    index("bug_report_transcript_status_idx").on(table.status),
  ]
)

export const bugReportTranscriptionJob = pgTable(
  "bug_report_transcription_job",
  {
    id: text("id").primaryKey(),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("bug_report_transcription_job_bugReportId_idx").on(table.bugReportId),
    index("bug_report_transcription_job_status_idx").on(table.status),
    index("bug_report_transcription_job_nextAttemptAt_idx").on(
      table.nextAttemptAt
    ),
  ]
)

export const organizationTranscriptionSettingsRelations = relations(
  organizationTranscriptionSettings,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationTranscriptionSettings.organizationId],
      references: [organization.id],
    }),
    creator: one(user, {
      fields: [organizationTranscriptionSettings.createdBy],
      references: [user.id],
    }),
  })
)

export const bugReportTranscriptRelations = relations(
  bugReportTranscript,
  ({ one }) => ({
    bugReport: one(bugReport, {
      fields: [bugReportTranscript.bugReportId],
      references: [bugReport.id],
    }),
    organization: one(organization, {
      fields: [bugReportTranscript.organizationId],
      references: [organization.id],
    }),
  })
)

export const bugReportTranscriptionJobRelations = relations(
  bugReportTranscriptionJob,
  ({ one }) => ({
    bugReport: one(bugReport, {
      fields: [bugReportTranscriptionJob.bugReportId],
      references: [bugReport.id],
    }),
    organization: one(organization, {
      fields: [bugReportTranscriptionJob.organizationId],
      references: [organization.id],
    }),
  })
)
