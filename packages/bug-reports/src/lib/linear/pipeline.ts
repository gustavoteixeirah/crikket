import {
  createLinearComment,
  createLinearIssue,
  LinearApiError,
} from "./client"
import { LINEAR_DEFAULT_GITHUB_REF } from "./constants"
import { CursorApiError, createCursorCloudAgent } from "./cursor-client"
import {
  type BuiltHandoff,
  buildCursorAgentComment,
  buildLinearIssueDescription,
  type LinearHandoffLinks,
  type LinearHandoffRepo,
} from "./handoff"

export type PipelineIssue = {
  id: string
  identifier: string
  url: string
}

export type PipelineAgent = {
  id: string
  url: string
}

export type PipelineIntegration = {
  cursorApiKey: string | null
  githubRef: string
  githubRepoUrl: string | null
  launchCloudAgent: boolean
  linearApiKey: string | null
  linearLabelIds: string[]
  linearProjectId: string | null
  linearTeamId: string | null
}

export async function executeCreateLinearIssue(input: {
  existingIssue: PipelineIssue | null
  fetchImpl?: typeof fetch
  integration: PipelineIntegration
  links: LinearHandoffLinks
  markdown: string
  reportId: string
  reportTitle: string
}): Promise<{
  built: BuiltHandoff
  created: boolean
  issue: PipelineIssue
  shouldLaunchAgent: boolean
}> {
  if (input.existingIssue) {
    const built = buildLinearIssueDescription({
      contextMarkdown: input.markdown,
      launchCloudAgent: input.integration.launchCloudAgent,
      links: input.links,
      repo: toRepo(input.integration),
      reportId: input.reportId,
      reportTitle: input.reportTitle,
    })
    return {
      built,
      created: false,
      issue: input.existingIssue,
      shouldLaunchAgent: input.integration.launchCloudAgent,
    }
  }

  if (!(input.integration.linearApiKey && input.integration.linearTeamId)) {
    throw new LinearApiError({
      message: "Linear integration is missing an API key or team.",
      retryable: false,
    })
  }

  const built = buildLinearIssueDescription({
    contextMarkdown: input.markdown,
    launchCloudAgent: input.integration.launchCloudAgent,
    links: input.links,
    repo: toRepo(input.integration),
    reportId: input.reportId,
    reportTitle: input.reportTitle,
  })

  const issue = await createLinearIssue({
    apiKey: input.integration.linearApiKey,
    description: built.description,
    fetchImpl: input.fetchImpl,
    labelIds: input.integration.linearLabelIds,
    projectId: input.integration.linearProjectId,
    teamId: input.integration.linearTeamId,
    title: built.title,
  })

  return {
    built,
    created: true,
    issue,
    shouldLaunchAgent: input.integration.launchCloudAgent,
  }
}

export async function executeLaunchCursorAgent(input: {
  existingAgent: PipelineAgent | null
  existingIssue: PipelineIssue | null
  fetchImpl?: typeof fetch
  integration: PipelineIntegration
  links: LinearHandoffLinks
  markdown: string
  reportId: string
  reportTitle: string
}): Promise<{
  agent: PipelineAgent
  created: boolean
  commented: boolean
}> {
  if (input.existingAgent) {
    return {
      agent: input.existingAgent,
      commented: false,
      created: false,
    }
  }

  if (!(input.integration.cursorApiKey && input.integration.githubRepoUrl)) {
    throw new CursorApiError({
      message: "Cursor integration is missing an API key or GitHub repository.",
      retryable: false,
    })
  }

  const built = buildLinearIssueDescription({
    contextMarkdown: input.markdown,
    launchCloudAgent: true,
    links: input.links,
    repo: toRepo(input.integration),
    reportId: input.reportId,
    reportTitle: input.reportTitle,
  })

  const agent = await createCursorCloudAgent({
    apiKey: input.integration.cursorApiKey,
    fetchImpl: input.fetchImpl,
    name: built.title.slice(0, 100),
    prompt: built.agentPrompt,
    repoUrl: input.integration.githubRepoUrl,
    startingRef: input.integration.githubRef || LINEAR_DEFAULT_GITHUB_REF,
  })

  let commented = false
  if (input.existingIssue && input.integration.linearApiKey) {
    await createLinearComment({
      apiKey: input.integration.linearApiKey,
      body: buildCursorAgentComment({
        agentUrl: agent.url,
        reportUrl: input.links.reportUrl,
      }),
      fetchImpl: input.fetchImpl,
      issueId: input.existingIssue.id,
    })
    commented = true
  }

  return {
    agent,
    commented,
    created: true,
  }
}

function toRepo(integration: PipelineIntegration): LinearHandoffRepo | null {
  if (!integration.githubRepoUrl) {
    return null
  }

  return {
    githubRef: integration.githubRef || LINEAR_DEFAULT_GITHUB_REF,
    githubRepoUrl: integration.githubRepoUrl,
  }
}
