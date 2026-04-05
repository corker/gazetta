---
name: deploy
description: Deploy application to target environment
disable-model-invocation: true
allowed-tools: Bash Read
argument-hint: [environment]
---

Deploy to the specified environment ($ARGUMENTS or default to staging):

1. Run tests first (`/run-tests`)
2. Build: `npm run build`
3. <!-- Add deployment commands here -->
4. Report deployment status
