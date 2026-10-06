import { reportNonFatalError } from "@crikket/shared/lib/errors"

export async function withIngestIsolation(
  context: string,
  work: () => unknown | Promise<unknown>
): Promise<void> {
  try {
    await work()
  } catch (error) {
    reportNonFatalError(context, error)
  }
}
