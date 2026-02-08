# Twitter Post Fix Needed

**Date:** 2026-02-08
**Status:** Cannot edit — X does not allow post edits after publication

## Broken Post

**URL:** https://x.com/PulseOnBase/status/2020316583047172377
**Account:** @PulseOnBase

## What's Wrong

The tweet contains an install command that is **missing the `@agent-pulse/sdk` package name**. The install command shown in the post is incomplete — it doesn't specify which package to install.

## Corrected Text

The corrected install command that should appear is:

```bash
npm install @agent-pulse/sdk
```

## Recommended Action

Since X does not allow post edits:

1. **Post a reply** to the original tweet with the correct command:
   > 📌 Correction: The install command should be:
   > `npm install @agent-pulse/sdk`
   >
   > Full docs: https://agent-pulse-nine.vercel.app/docs

2. **Pin the correction** or quote-tweet with the fix for visibility.

3. **Verify future posts** always include the full package name before publishing.

## Correct References

- npm: https://www.npmjs.com/package/@agent-pulse/sdk
- README quick start: `npm install @agent-pulse/sdk`
- Website "Get Started" card: `npm install @agent-pulse/sdk`
