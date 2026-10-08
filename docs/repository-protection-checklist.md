# Repository protection checklist

Apply these settings in GitHub after the next push. They protect the repository itself; they are
not stored in Git and cannot be enforced by a source-file change alone.

## 1. Protect `main`

Open **Settings → Rules → Rulesets → New branch ruleset** and target `main`.

- Require a pull request before merging.
- Require one approval and dismiss stale approvals when new commits arrive.
- Require review from Code Owners.
- Require the `build` job from **Test and deploy to GitHub Pages** to pass.
- Block force pushes and branch deletion.
- Include administrators in the ruleset if this is a shared repository.

## 2. Restrict the deployment environment

Open **Settings → Environments → github-pages**.

- Under deployment branches, select **Selected branches and tags** and allow only `main`.
- Add a required reviewer if another maintainer is available. A sole owner cannot get meaningful
  separation-of-duties from self-approval.

## 3. Restrict Actions defaults

Open **Settings → Actions → General**.

- Set default `GITHUB_TOKEN` workflow permissions to **Read repository contents**.
- Keep **Allow GitHub Actions to create and approve pull requests** disabled.
- For fork pull requests, do not send write tokens or repository secrets to workflows.
- Enable Dependabot alerts and Dependabot security updates in **Settings → Code security and analysis**.

## 4. Keep the public site safe

- Do not commit `.env`, private keys, tokens, OAuth client secrets, webcam captures, or personal
  data. `npm run security:check` rejects common credential formats and sensitive filenames.
- Review every change under `.github/`, `SECURITY.md`, and `package-lock.json` before merging.
- Treat GitHub Pages as a public static host: everything in `public/` and the generated `dist/`
  can be downloaded by visitors.

## Verification

After configuring the rules, create a small pull request. Confirm `build` runs, a direct push to
`main` is rejected, and a pull request cannot deploy Pages before it is merged.
