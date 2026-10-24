---
name: experiment-map-internals
description: Use when the experiment map plugin or its CLI seems to behave wrongly or unexpectedly; when asked why the map, the details panel, map.yaml or the CLI does something, or whether the plugin can do something; when asked which version is installed or how to update it; or when the lab member wants to report a bug, request a feature or change the plugin itself.
---

# Experiment map: how the plugin works, and changing it

The `experiment-map` skill covers using the map: answering questions and editing notes. This skill covers the plugin underneath: how it behaves, which version is installed, and what to do when it's wrong or missing something.

## How it works

`design.md` beside this file is the plugin's design document for the version installed in this vault: what every property means, how inheritance, control links and roles, channel sources, the generated files, the CLI and the map view behave, and every problem message. Read the section for the topic, not the whole file. Its links point to the plugin's repository at this version.

## Source and release

The files in `.obsidian/plugins/experiment-map/` and `.claude/skills/experiment-map*/` are one release of the plugin, built from https://github.com/taw181/obsidian-experiment-map. Never edit them: the next install overwrites the change, and in a synced vault it spreads to everyone first. Changes to the plugin are made in its repository (see Changing the plugin).

## Version and updates

- Installed: `version` in `.obsidian/plugins/experiment-map/manifest.json`.
- Latest: https://github.com/taw181/obsidian-experiment-map/releases, or `gh release view --repo taw181/obsidian-experiment-map`.
- Update: re-run the install command from the plugin's README (https://github.com/taw181/obsidian-experiment-map#install) at the vault root. In a shared vault one person does it, and the vault's sync carries it to everyone. Each person restarts Obsidian to load it.

## Bug, or intended?

1. Find what `design.md` says should happen. If the behaviour matches it, explain the design; a change to it is a feature request.
2. If the installed version is older than the latest, check the newer releases' notes for a fix: updating may be the answer.
3. Reproduce with the CLI (`check`, `trace`, `find`). It uses the same core as the map view, so a CLI reproduction separates a core bug from a view bug.

## Reporting a bug or requesting a feature

Draft the issue first:

- a title that states the defect or the request;
- the installed plugin version (and, for anything in the map view, the Obsidian version: the vault doesn't record it, so ask the lab member);
- steps to reproduce, with the smallest frontmatter that shows it;
- what was expected, citing the `design.md` section, and what happened, with only the CLI lines that show it.

The repository is **public**. Replace the lab's names (components, channels, experiments, people) with generic placeholders, and leave out note contents: `trace --notes` excerpts, `backlinks` lines, lab book page names and paths, and any other text from the vault's notes. Include any of these only if the lab member agrees to post them. Show the lab member the draft, and file it only once they agree:

- if `gh auth status` succeeds: `gh issue create --repo taw181/obsidian-experiment-map --title "<title>" --body-file <draft file>`;
- otherwise give them a prefilled link to open and submit themselves:
  `node -e 'const [t, b] = process.argv.slice(1); console.log("https://github.com/taw181/obsidian-experiment-map/issues/new?title=" + encodeURIComponent(t) + "&body=" + encodeURIComponent(b))' "<title>" "$(cat <draft file>)"`.
  If the link is longer than 8000 characters, give a link with only the title, plus the body to paste.

## Changing the plugin

When the lab member wants to make the change themselves:

1. Clone the repository **outside** the vault (a clone inside a synced vault gets synced, and Obsidian indexes it).
2. Follow its `DEVELOPING.md`. The clone has its own Claude skill for developing the plugin, `.claude/skills/experiment-map-plugin/SKILL.md`, but this session won't load it: start a new Claude Code session in the clone, or read that file before changing anything.
3. Test in a scratch vault, never in the lab's synced vault: a half-finished build would reach everyone.
4. Push a branch to a fork and open a pull request (`gh pr create`).
