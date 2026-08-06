# iOS Release smoke triage

Use this reference only when `ios-release-smoke` is cancelled, times out, or
runs unusually long without a compiler or test failure.

## Classify before changing app code

1. Read the job conclusion and final emitted step.
2. Inspect the uploaded `prebuild-and-pods.log` and `xcodebuild.log` tail.
3. Confirm the PR matches the workflow's narrow `app_ios` runtime/native path
   filter. Test-, docs-, and lint-only changes should remain on Linux gates.
4. Treat cancellation or timeout without a compiler/test error as infrastructure
   evidence, not proof of a product regression.

## Local parity

Run on macOS with streamed Turbo output:

```bash
pnpm turbo run test:ios:release-smoke \
  --filter=@zapengine/app \
  --log-order=stream
```

## Workflow constraints

- Keep the build-step timeout shorter than the job timeout so failure tails and
  artifacts still have time to upload.
- Stream native progress instead of hiding a long `xcodebuild` invocation.
- Do not weaken the Release build, skip the cold launch, or treat cancellation
  as green to reduce runtime.
