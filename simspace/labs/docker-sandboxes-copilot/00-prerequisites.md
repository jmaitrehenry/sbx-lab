# Prerequisites

> **In the real lab, do this at home, before you start.** It installs tools and downloads the sandbox images, several hundred megabytes that take a long time on shared Wi-Fi. Here nothing is downloaded: run the commands to see what each one prints.

## Accounts and tools

For the real lab you need:

- A computer running macOS, Windows or Linux.
- A **Docker account**. Docker Sandboxes are free to use.
- A **GitHub account with access to GitHub Copilot**. The lab sends about **10 prompts** to the agent, which count against your Copilot usage allowance: in a test run, about 75 AI Credits in total. On **Copilot Free**, whose monthly allowance is small, check that you have enough left.
- **Git**, and the **GitHub CLI** (`gh`) signed in to your GitHub account.
- The **`sbx` CLI**, from the [install instructions](https://docs.docker.com/ai/sandboxes/install/).

Check that `gh` is signed in:

```bash id=host
gh auth status
```

## sbx setup

Every exercise depends on `sbx` running correctly on your computer.

1. Verify that `sbx` is installed:

    ```bash id=host
    sbx version
    ```

2. Sign in to Docker (skip this if you are already signed in):

    ```bash id=host
    sbx login
    ```

    The first time you use `sbx` you may be asked to choose a default network policy. Pick **Balanced** for now; the next module switches you to **Locked Down**.

3. Check that your installation is healthy:

    ```bash id=host
    sbx diagnose
    ```

    Each check is marked ✓ (passed), ✗ (failed) or ⊘ (skipped). The checks under **INSTALLATION**, **PLATFORM** and **CONNECTION** must pass. A ✗ on an optional item, such as **SSH client config**, does not affect this lab.

4. The lab assumes that your Docker account is **not** subject to organization AI Governance policies. Check the configured policies:

    ```bash id=host
    sbx policy ls
    ```

    Every policy should have `local` as its `SOURCE` (or `kit`, for a policy that applies to a single sandbox). If you see policies from any other source, your organization restricts what sandboxes can do and some exercises may not work: use a personal Docker account or ask your administrator.

5. Clone the lab repository and move into it:

    ```bash id=host
    git clone https://github.com/mathieu-benoit/sbx-lab
    ```

    ```bash id=host
    cd sbx-lab
    ```

    You commit the agents' work locally during the lab, but you never push it, so you don't need a fork.

6. From the root of the repository, download the two sandbox images the lab uses by creating, then removing, a sandbox of each kind:

    ```bash id=host
    sbx create --name warmup-shell shell .
    ```

    ```bash id=host
    sbx create --name warmup-copilot copilot .
    ```

    ```bash id=host
    sbx rm --force warmup-shell warmup-copilot
    ```

    The images stay on your computer, so the sandboxes you create during the lab start in seconds.

You're all set! Next: **Network policies**.
