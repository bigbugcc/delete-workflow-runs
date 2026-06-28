import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";

function parseRepository(repository) {
  const splitRepository = repository.split("/");

  if (splitRepository.length !== 2 || !splitRepository[0] || !splitRepository[1]) {
    throw new Error(`Invalid repository '${repository}'. Expected format {owner}/{repo}.`);
  }

  return {
    owner: splitRepository[0],
    repo: splitRepository[1]
  };
}

function parseKeepMinimumRuns(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error(`Invalid keep_minimum_runs '${value}'. Expected a non-negative integer.`);
  }

  return parsedValue;
}

function groupRunsByWorkflow(workflowRuns) {
  return workflowRuns.reduce((groups, workflowRun) => {
    const workflowId = workflowRun.workflow_id;

    if (!groups.has(workflowId)) {
      groups.set(workflowId, []);
    }

    groups.get(workflowId).push(workflowRun);
    return groups;
  }, new Map());
}

function getRunsToDelete(workflowRuns, keepMinimumRuns) {
  const currentRunId = Number(process.env.GITHUB_RUN_ID || 0);
  const groupedWorkflowRuns = groupRunsByWorkflow(workflowRuns);
  const runsToDelete = [];
  let skippedActiveRuns = 0;
  let skippedCurrentRun = 0;

  for (const workflowGroup of groupedWorkflowRuns.values()) {
    workflowGroup.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    for (const workflowRun of workflowGroup.slice(keepMinimumRuns)) {
      if (workflowRun.id === currentRunId) {
        skippedCurrentRun += 1;
        continue;
      }

      if (workflowRun.status !== "completed") {
        skippedActiveRuns += 1;
        continue;
      }

      runsToDelete.push(workflowRun);
    }
  }

  return {
    runsToDelete,
    skippedActiveRuns,
    skippedCurrentRun
  };
}

function formatDeleteError(error) {
  const status = error.status ? `${error.status} ` : "";
  const message = `${status}${error.message || error}`;

  if (error.status === 403) {
    return `${message}. Make sure the workflow grants 'actions: write' to GITHUB_TOKEN, or use a token that can delete workflow runs in the target repository.`;
  }

  return message;
}

async function run() {
  try {
    const token = core.getInput("token", { required: true });
    const repository = core.getInput("repository", { required: true });
    const keepMinimumRuns = parseKeepMinimumRuns(core.getInput("keep_minimum_runs", { required: true }));
    const { owner, repo } = parseRepository(repository);
    const octokit = new Octokit({ auth: token });

    core.info(`Listing workflow runs for ${repository}.`);
    const workflowRuns = await octokit.paginate(octokit.actions.listWorkflowRunsForRepo, {
      owner,
      repo,
      per_page: 100
    });

    const {
      runsToDelete,
      skippedActiveRuns,
      skippedCurrentRun
    } = getRunsToDelete(workflowRuns, keepMinimumRuns);

    if (skippedCurrentRun > 0) {
      core.info(`Skipped ${skippedCurrentRun} current workflow run(s).`);
    }

    if (skippedActiveRuns > 0) {
      core.info(`Skipped ${skippedActiveRuns} queued or in-progress workflow run(s).`);
    }

    if (runsToDelete.length < 1) {
      core.info("No workflow runs need to be deleted.");
      return;
    }

    let deletedRuns = 0;
    const failedDeletes = [];

    for (const workflowRun of runsToDelete) {
      try {
        await octokit.actions.deleteWorkflowRun({
          owner,
          repo,
          run_id: workflowRun.id
        });

        deletedRuns += 1;
        core.info(`Deleted workflow run ${workflowRun.id}.`);
      }
      catch (error) {
        failedDeletes.push({
          id: workflowRun.id,
          error
        });
        core.warning(`Failed to delete workflow run ${workflowRun.id}: ${formatDeleteError(error)}`);
      }
    }

    core.info(`${deletedRuns} workflow run(s) deleted.`);

    if (failedDeletes.length > 0) {
      const failedRunIds = failedDeletes.map((failure) => failure.id).join(", ");
      core.setFailed(`Failed to delete ${failedDeletes.length} workflow run(s): ${failedRunIds}`);
    }
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run();
