# Commit

## Overview

Create a well-formatted git commit

## Format

``` bash
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

- feat: A new feature
- fix: A bug fix
- docs: Documentation only changes
- style: Code style changes (white-space, formatting, missing semi-colons, etc)
- refactor: A code change that neither fixes a bug nor adds a feature
- perf: A code change that improves performance
- test: Adding missing tests or correcting existing tests
- chore: Changes to the build process or auxiliary tools and libraries such as documentation generation
- Scope: An optional part that provides additional contextual information For example, fix(parser):

## Examples

### Simple commit message

```bash
feat(auth): add login feature
fix(auth): resolve login issue
feat(lang): add Polish language
docs: correct spelling of CHANGELOG
```

### Breaking change

```bash
feat!: send an email to the customer when a product is shipped
```

### Detailed commit with body and footers

```bash
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.

Reviewed-by: Z
Refs: #123
```
