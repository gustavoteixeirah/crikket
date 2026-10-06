import {
  getTranscriptionSettings,
  removeTranscriptionApiKeyProcedure,
  testTranscriptionKeyProcedure,
  upsertTranscriptionSettingsProcedure,
} from "@crikket/bug-reports/procedures/transcription"

export const transcriptionRouter = {
  get: getTranscriptionSettings,
  removeApiKey: removeTranscriptionApiKeyProcedure,
  testKey: testTranscriptionKeyProcedure,
  upsert: upsertTranscriptionSettingsProcedure,
}
