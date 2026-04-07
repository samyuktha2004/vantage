## File Catalog

Purpose: a short reference of transient, fixture, and environment files present in the repository so you can quickly find and remove unused items.

Notes:

- If a file is tracked by git, remove it with `git rm <path>` before committing the change.
- Use `git grep -n "<unique token>"` or `git grep -n "<filename>"` to locate references.

Top-level JSON fixtures and config

- **package.json**: project manifest and scripts. See [package.json](package.json)
- **package-lock.json**: npm lockfile — keeps dependency versions consistent. See [package-lock.json](package-lock.json)
- **tsconfig.json**: TypeScript compiler settings. See [tsconfig.json](tsconfig.json)
- **components.json**: UI/component metadata used by the app. See [components.json](components.json)
- **create_event.json**: sample request/fixture for event creation (fixture). See [create_event.json](create_event.json)
- **signup.json**: sample request/fixture for signup flows. See [signup.json](signup.json)

Transient/dev/runtime state

- **.local/**: Editor/agent local state (e.g., Replit runtime caches). This directory is environment-specific and safe to remove from the repo if present. It should be added to `.gitignore` to prevent accidental commits.

Fixtures (examples & deleted items)

- **travel_resp.json**: HTTP response fixture for a created travel/booking resource (headers + JSON body). If present and unused, safe to remove; if tracked, use `git rm travel_resp.json` first. (This file was removed from the repo recently.)

How to decide if a file is safe to remove

1. Search for references to the file or unique tokens inside it:
   - `git grep -n "travel_resp.json" || true`
   - `git grep -n "MOCKPNR\|TESTTRACE" || true`

2. If the file is tracked by git, untrack then delete:
   - `git rm --cached path/to/file` (or `git rm path/to/file` to remove and stage)
   - `git commit -m "Remove unused file"`

3. If the file is local runtime state, delete the directory (`rm -rf .local`) and add to `.gitignore`:
   - Add `.local/` to `.gitignore`

Useful commands

- Find files that mention a token: `git grep -n "PATTERN"`
- Find all JSON files at repo root: `ls -1 *.json`
- Show whether a file is tracked: `git ls-files --error-unmatch path/to/file && echo tracked || echo untracked`

How to extend this catalog

- Add more files and a one-line purpose for each entry as you discover fixtures or temporary runtime files.
- Consider moving fixtures into a `fixtures/` directory so they are easy to find and selectively committed.

If you'd like, I can:

- expand this file by scanning the repo for other fixture-like files and adding them, or
- add a `fixtures/` directory and move discovered fixtures there (I will not commit changes without your approval).

Scan results (2026-03-02)

The repository was scanned for fixture-like files (JSON, CSV, Postman collections, and other samples). The following items had no code references found via `git grep` and are candidates for manual review/removal. 

- **components.json** — tracked in git; no in-repo references found. Verify whether the app build or runtime expects this file before removing.
- **Staging.postman_collection.json** — untracked; no references found. Keep locally if you use the Postman collection; safe to ignore or remove.
- **HotelAPI Client.postman_collection 6.json** — untracked (listed in `.gitignore`); kept in Downloads folder. Not referenced in repo; safe to remove from the repo workspace if you don't need it.

Files I did NOT mark for removal (explanation):

- **package.json**, **package-lock.json**, **tsconfig.json** — these are referenced or are core config files; do not remove.

How I determined candidates

- Ran `git grep` for filenames and tokens and checked whether each file is tracked by `git ls-files`.
- If you want, I can now move flagged files into a `fixtures/` directory locally (no commit) or restore any previously deleted files into the working tree without committing.
