# Create PR

## Overview

Create a well-structured pull request with proper description, labels, and reviewers.

## Steps

1. **Prepare branch**
   - Ensure all changes are committed
   - Push branch to remote
   - Verify branch is up to date with main

2. **Write PR description**
   - Summarize changes clearly
   - Include context and motivation
   - List any breaking changes
   - Add screenshots if UI changes

3. **Set up PR**
   - Create PR with descriptive title
   - Add appropriate labels
   - Assign reviewers
   - Link related issues

## PR Template

```markdown
## Overview
This PR [addresses/fixes/implements] [brief summary].
Resolves [#issue-number]. (if applicable)

## Changes
- [Specific change 1]
- [Specific change 2]
- [Refactor or dependency update]

## Why
[Explain problem solved or benefit, e.g., "Reduces load time by 20% via caching."]

## Breaking Changes
- [ ] No breaking changes
- [ ] Breaking change: [describe impact and migration path]

## Testing
- [ ] Manual testing: (ex. "Login on mobile Safari.")
- [ ] Automated tests: (ex. "All tests pass, coverage >90%.")
- [ ] Screenshots/recordings: [if UI-related]

## Dependencies
- [ ] No new dependencies
- [ ] New dependencies: [list packages]
- [ ] Environment variables: [list new/changed vars]

## Additional Notes
[Risks, alternatives considered, deployment notes, or follow-up tasks.]
```
