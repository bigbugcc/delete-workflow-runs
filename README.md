# delete-workflow-runs

Delete old GitHub Actions workflow runs in a repository while keeping the newest runs for each workflow.

This action uses Node 24 and the GitHub REST API to:

* list workflow runs in a repository
* group runs by workflow
* keep the newest `keep_minimum_runs` runs in each workflow
* delete older completed runs

Queued, in-progress, and current workflow runs are skipped.

## Inputs

### `token`

Required. Default: `${{ github.token }}`

Token used to call the GitHub API.

For the current repository, `github.token` works when the workflow grants `actions: write`:

```yaml
permissions:
  actions: write
  contents: read
```

For another repository, use a PAT or GitHub App token that can delete workflow runs in the target repository.

### `repository`

Required. Default: `${{ github.repository }}`

Repository that contains the workflow runs. Format: `owner/repo`.

### `keep_minimum_runs`

Required. Default: `3`

Minimum number of newest runs to retain for each workflow.

## Examples

### Scheduled cleanup

```yaml
name: Delete old workflow runs

on:
  schedule:
    - cron: '0 0 1 * *'

permissions:
  actions: write
  contents: read

jobs:
  delete-runs:
    runs-on: ubuntu-latest
    steps:
      - name: Delete workflow runs
        uses: bigbugcc/delete-workflow-runs@main
        with:
          token: ${{ github.token }}
          repository: ${{ github.repository }}
          keep_minimum_runs: 3
```

### Manual cleanup

```yaml
name: Delete old workflow runs

on:
  workflow_dispatch:
    inputs:
      min:
        description: 'Minimum runs to keep per workflow'
        required: true
        default: '3'

permissions:
  actions: write
  contents: read

jobs:
  delete-runs:
    runs-on: ubuntu-latest
    steps:
      - name: Delete workflow runs
        uses: bigbugcc/delete-workflow-runs@main
        with:
          token: ${{ github.token }}
          repository: ${{ github.repository }}
          keep_minimum_runs: ${{ github.event.inputs.min }}
```

## Troubleshooting

### `Resource not accessible by integration`

The delete API requires write access to GitHub Actions. Add this to the calling workflow:

```yaml
permissions:
  actions: write
  contents: read
```

If `repository` points to a different repository, `github.token` from the caller repository is not enough. Use a PAT or GitHub App token with permission to delete workflow runs in the target repository.

## License

The scripts and documentation in this project are released under the [MIT License](./LICENSE).
