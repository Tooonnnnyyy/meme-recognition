# Security policy

## Scope

Gesture Meme Studio is a static browser application. Camera frames are processed locally by
MediaPipe and are not sent to a project backend. The GitHub Pages workflow publishes only the
versioned files in this repository.

## Reporting a vulnerability

Please use GitHub's private **Report a vulnerability** option when it is available for this
repository. Do not post credentials, access tokens, camera captures, or other private data in a
public issue. If private reporting is unavailable, open a minimal issue containing only a safe
description and ask the maintainer for a private contact channel.

## Release controls

- Changes to `main` should go through a pull request with required CI checks.
- The Pages deployment workflow is intended to deploy only `main`.
- Keep the `github-pages` environment restricted to the `main` branch.
- Keep GitHub Actions permissions at the smallest scope needed by each job.
- Keep `.github/` and `SECURITY.md` covered by `CODEOWNERS` review.
