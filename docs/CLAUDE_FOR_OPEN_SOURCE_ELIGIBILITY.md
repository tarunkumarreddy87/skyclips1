# Claude for Open Source — eligibility and evidence plan

**Repository:** https://github.com/tarunkumarreddy87/skyclips1  
**Assessment date:** 2026-11-08  
**Status:** Not yet demonstrably eligible under the published numerical pathways. This document is an evidence plan, not an eligibility claim or application.

## Decision

Skyclip is a substantial, actively developed application and rendering codebase, but the repository evidence currently available does not establish any of the program's stated numerical qualification thresholds. Technical complexity, being public on GitHub, and being the primary maintainer are not substitutes for ecosystem adoption.

Do not claim that Skyclip qualifies until the evidence below exists and can be independently checked.

## Eligibility evidence matrix

| Published pathway | Evidence required | Current repository evidence | Status |
|---|---|---|---|
| Maintainer/library author | 500+ dependent repositories, 100+ dependent packages, or 200,000+ combined monthly downloads | The core packages are marked `private: true`; no public package download or dependency evidence was found in this review | Not established |
| Core contributor to a recognized project | Accepted contribution history in a project named by the program or an equivalent recognized project | No qualifying contribution evidence was identified in the repository review | Not established |
| Active contributor | 100+ PRs merged into repositories the applicant does not own during the previous 12 months | No evidence for this threshold was found in the inspected GitHub activity | Not established |
| Community builder | One repository with 20+ unique external contributors whose PRs merged in the previous 12 months | PR #1 is a maintainer-owned draft; it does not establish external contributor activity | Not established |
| Critical infrastructure | OpenSSF criticality score of at least 0.4 | No verified score was found | Not established |
| Discretionary exception | Evidence that the project is an ecosystem dependency or quietly important infrastructure | No independent downstream usage/dependency evidence is currently documented | Possible only after external adoption is demonstrated |

This assessment is limited to the repository and GitHub activity inspected. The applicant may have qualifying contributions or ecosystem metrics elsewhere; add those only with verifiable public links or program-accepted evidence.

## What must change in the project

### 1. Turn internal workspace code into a real reusable library

The current `packages/video-engine`, `packages/shared-types`, and `packages/timeline-schema` manifests use private workspace packages. They are not yet presented as stable, independently installable public libraries.

Before publishing:
- Define a supported public API and remove internal-only exports.
- Replace workspace-only dependencies with versioned public packages or bundle the required runtime dependencies.
- Add a production build, declaration files, supported Node.js versions, package provenance and an npm publishing workflow.
- Add standalone consumer examples and integration tests that install the package from a registry rather than importing source from this monorepo.
- Document semver policy, deprecation policy, security reporting and compatibility guarantees.
- Verify all bundled fonts, assets and third-party code have compatible licences and notices.

Do not simply change `private: true` to `false`. That would not make the packages safe or usable for external consumers.

### 2. Build verifiable downstream usage

- Publish a first stable release only after the package works outside this repository.
- Create small, useful examples that solve specific problems (timeline evaluation, SVG motion graphics, caption layout, render manifests).
- Invite independent developers to test those examples and file issues.
- Track registry downloads and downstream dependents using public registry/GitHub evidence.
- Ask downstream projects to declare the package as a dependency; never create artificial dependent repositories or downloads.

### 3. Establish a real external contributor community

- Publish a clear roadmap with scoped beginner-friendly issues.
- Respond to issues and review external PRs consistently.
- Accept and merge contributions only after tests and review.
- Record contributor names and merged PRs accurately.
- Do not count the maintainer's own PRs or bot-generated PRs as external contributors.

### 4. Close the current engineering blockers

The existing open-source readiness branch identifies work that remains material to a public release:
- Regenerate and verify the stale API `uv.lock` from `apps/api/pyproject.toml`; do not hand-edit lockfile entries.
- Triage and upgrade vulnerable Node and Python dependencies, then run the complete test matrix.
- Add SSRF protections to manifest media staging: HTTPS policy, public-address validation, redirect revalidation, DNS pinning, byte/time limits and worker egress restrictions.
- Isolate browser-based HTML/JavaScript rendering from credentials and internal networks, with non-root execution and CPU, memory, PID and time limits.
- Complete third-party code, font, media and asset licensing review.
- Configure a monitored private vulnerability reporting contact and a monitored Code of Conduct enforcement contact.
- Resolve stale HANUMAN package scopes and naming consistently before publishing public packages.

### 5. Verify OpenSSF and programme evidence

- Run the official OpenSSF Scorecard/criticality tooling against the public default branch and save the public result.
- Review the program's current eligibility page immediately before applying.
- Prepare direct links to qualifying merged PRs, public packages, dependent projects, download statistics, or external contributors.
- Clearly distinguish metrics from the applicant's own project from contributions to projects the applicant does not own.

## Application rule

If no numerical pathway is met, use the discretionary exception only if there is genuine, independently verifiable ecosystem reliance. Explain what other developers depend on, link to those projects, and show the operational impact if Skyclip or its reusable engine disappeared. Do not frame an early-stage standalone application as critical infrastructure without evidence.

## Maintainer checklist

- [ ] Confirm the applicant's actual maintainer role and link representative authored commits.
- [ ] Confirm the licence authority and complete third-party attribution review.
- [ ] Make at least one library independently installable and test it in a clean external consumer project.
- [ ] Publish a versioned release and public API documentation.
- [ ] Obtain genuine external users and downstream dependents.
- [ ] Accept and merge genuine external contributions.
- [ ] Resolve security and CI blockers on the default branch.
- [ ] Verify the OpenSSF score and all programme metrics from primary sources.
- [ ] Reassess eligibility before submitting; do not state that a threshold is met without evidence.
