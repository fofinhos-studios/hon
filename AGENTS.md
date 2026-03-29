# Agent Instructions

## Your job

Implement `PLAN.md` task-by-task, in order. Do not skip tasks or reorder them.

## How to work

1. Read `PLAN.md` to find the next incomplete task.
2. Implement that task exactly as described — follow the file paths, code, and commands literally.
3. **Implementation first.** Write the code. Run checks and tests at the end, not in between.
4. After completing a task, stage the files listed in that task's commit step and commit with the exact message shown (conventional commit format).
5. Mark the task as done in `PLAN.md` by prepending `[x]` to its heading line — e.g.:
   `### [x] Task 3: Book search endpoint`
6. Move to the next task.

## Commit format

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — new feature or component
- `test:` — tests only
- `docs:` — documentation
- `chore:` — tooling, config, cleanup
- `fix:` — bug fix

Commit only the files relevant to the completed task. Do not batch multiple tasks into one commit.

## What not to do

- Do not start a task until the previous one is committed.
- Do not modify files outside the scope of the current task.
- Do not run the full test suite between every step — run it at the end (Task 16).
- Do not ask for confirmation before starting each task — just work through them.
- Do not deviate from the plan's code samples. If something is unclear, follow the plan literally.
