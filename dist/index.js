async function run() {
  const core = require("@actions/core");
  try {
    // Fetch all the inputs
    const token = core.getInput('token');
    const repository = core.getInput('repository');
    //const retain_days = core.getInput('retain_days');
    
    //每个不同的workflow保留的最小运行数
    const keep_minimum_runs = core.getInput('keep_minimum_runs');
    
    // Split the input 'repository' (format {owner}/{repo}) to be {owner} and {repo}
    const splitRepository = repository.split('/');
    if (splitRepository.length !== 2 || !splitRepository[0] || !splitRepository[1]) {
      throw new Error(`Invalid repository '${repository}'. Expected format {owner}/{repo}.`);
    }
    const repo_owner = splitRepository[0];
    const repo_name = splitRepository[1];
    
    var page_number = 1;
    var del_runs = new Array();
    const { Octokit } = require("@octokit/rest");
    const octokit = new Octokit({ auth: token });

    while (true) {
      // Execute the API "List workflow runs for a repository", see 'https://octokit.github.io/rest.js/v18#actions-list-workflow-runs-for-repo'     
      const response = await octokit.actions.listWorkflowRunsForRepo({
        owner: repo_owner,
        repo: repo_name,
        per_page: 100,
        page: page_number
      });
      
      const lenght = response.data.workflow_runs.length;
      
      if (lenght < 1) {
        break;
      }
      else {
        var workflows = response.data.workflow_runs;
        //根据workflow_id分组
        const groupedWorkflows = workflows.reduce((groups, workflow) => {
          const workflowId = workflow.workflow_id;
          if (!groups[workflowId]) {
            groups[workflowId] = [];
          }
          groups[workflowId].push(workflow);
          return groups;
        }, {});

        //根据时间降序排序
        for (const key in groupedWorkflows) {
          groupedWorkflows[key].sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at);
          });
        }

        //根据分组后的数据保留最新的keep_minimum_runs个workflow，其它的删除
        for (const key in groupedWorkflows) {
          const group = groupedWorkflows[key];
          if (group.length > keep_minimum_runs) {
            const deleteGroup = group.slice(keep_minimum_runs);
            deleteGroup.forEach(item => {
              del_runs.push(item.id);
            });
          }
        }
      }
      
      if (lenght < 100) {
        break;
      }
      page_number++;
    }

    if (del_runs.length < 1) {
      console.log(`No workflow runs need to be deleted.`);
    }
    else {
      del_runs.forEach(async (run_id) => {
        // Execute the API "Delete a workflow run", see 'https://octokit.github.io/rest.js/v18#actions-delete-workflow-run'
        await octokit.actions.deleteWorkflowRun({
          owner: repo_owner,
          repo: repo_name,
          run_id: run_id
        });

        console.log(`🚀 Delete workflow run ${run_id}`);
      });

      console.log(`✅ ${del_runs.length} workflow runs are deleted.`);
    }
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run();
