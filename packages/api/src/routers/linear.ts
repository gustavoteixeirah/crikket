import {
  createLinearIssueForReport,
  getLinearSettings,
  launchCursorAgentForReport,
  listLinearCatalogSettings,
  testCursorSettingsKey,
  testLinearSettingsKey,
  upsertLinearSettings,
} from "@crikket/bug-reports/procedures/linear"

export const linearRouter = {
  catalog: listLinearCatalogSettings,
  createIssue: createLinearIssueForReport,
  get: getLinearSettings,
  launchAgent: launchCursorAgentForReport,
  testCursorKey: testCursorSettingsKey,
  testLinearKey: testLinearSettingsKey,
  upsert: upsertLinearSettings,
}
