# Hand checks

Checks that need Obsidian, Windows or the published release, which the CLI
can't cover. Do them for each release that changes the plugin's UI, the setup
command or the install scripts. Each starts with "Reload app without saving"
in the test vault.

## Plugin in Obsidian (desktop)

- [ ] **Empty vault.** In a new, empty vault with the plugin installed and
  enabled, open the map. It shows "This vault has no experiment map yet." with
  a **Set up** button, and no "sync failed" notice.
- [ ] **Set up.** Press **Set up**. A notice lists `Experiment map/`,
  `Experiment map/Config.md`, `Components/`, `Models/` and
  `Experiment map/README.md`, and the map opens empty. Run "Experiment map: Set
  up this vault" again: it says the vault is already set up and changes nothing.
- [ ] **First components.** With **+**, add a laser, then (with the laser
  selected) an AOM, then a destination. Each box appears in its location's
  group, linked to the previous one, with no ⚠.
- [ ] **Controller without a channel.** Add a controller and give the AOM
  `control_from: ["[[<controller>]]"]`, then `["[[<controller>#line 3]]"]`. The
  wire is drawn both times, with no ⚠; the panel shows `› line 3`.
- [ ] **Channel source.** Set up `examples/csv-channels.js` as the README
  describes, then press **Sync**. The channel page appears. A
  `[[Main channels#<name>]]` link draws its wire from the controller with the
  matching `address`. In the panel the channel name opens its heading on the
  channel page.
- [ ] **Bare channel-page link.** `control_from: ["[[Main channels]]"]` gives no
  ⚠, and the panel's control row links to the channel page.
- [ ] **Broken channel source.** Rename the script and press **Sync**. A notice
  names it, the map still draws, the channel page is unchanged, and
  `Sync report.md` has one problem naming the script.
- [ ] **Existing map.** In a copy of a real lab map, after migrating its
  `Config.md`: the map looks as before, and clicking boxes, fibres and ports
  highlights the same chains.

## Install scripts

- [ ] **Windows PowerShell 5.1.** On a Windows machine, with a vault that has a
  space in its path:
  - right-click `install.ps1` in the vault folder → Run with PowerShell;
  - answer the Claude question;
  - the window stays open at the end;
  - the plugin appears under Community plugins;
  - re-running updates it without asking the Claude question again (if
    installed).

  Also run `powershell -ExecutionPolicy Bypass -File install.ps1 -Vault "<path>"`
  from another folder.
- [ ] **Release URL.** After a release is published: `curl -fsSL
  https://github.com/taw181/obsidian-experiment-map/releases/latest/download/install.sh | sh -s -- "<fresh vault>" --claude`
  installs that version.

## README

- [ ] `docs/screenshot.png` is a screenshot of a small example map (no lab
  names in it).
