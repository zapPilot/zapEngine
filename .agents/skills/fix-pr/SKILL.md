---
name: fix-pr
argument-hint: '<pr-url>'
---

請用這個 PR 的 head branch 對應的 local tracking branch 建立 worktree，並在其中修正該 PR 的實作，不用管 CI failures, 把 PR description 當成 spec, 看看實作是否真的能解決問題，其他 format, lint failures 不用管，但是需要修正設計不良的 test cases.
