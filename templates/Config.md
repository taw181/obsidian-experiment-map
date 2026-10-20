---
components_folder: Experiment map/Components
models_folder: Experiment map/Models
channels_folder: Experiment map/Channels
output_folder: Experiment map
experiments: []
channel_sources: []
types:
  laser: {category: optical, source: true, color: "#e0902a"}
  amplifier: {category: optical, color: "#d0b030"}
  aom: {category: optical, color: "#4a80c0"}
  eom: {category: optical, color: "#6a6fc0"}
  shutter: {category: optical, color: "#c06a6a"}
  fibre: {category: optical, color: "#5a9a5a", link: true, template: fibre}
  lock: {category: optical, color: "#9a8a5a"}
  destination: {category: optical, color: "#8a8a8a", shape: round, subtitle: false}
  beam_splitter: {category: optical, color: "#7aa0b0"}
  optics: {category: optical, color: "#a09a80"}
  meter: {category: optical, color: "#6f9f8f"}
  slm: {category: optical, color: "#b07aa0"}
  rf_source: {category: electronics, source: true, color: "#9070c0"}
  controller: {category: electronics, source: true, color: "#708090"}
wavelength_colors: {}
default_wavelength_color: "#999999"
rf_color: "#b48ce6"
control_color: "#9aa4b1"
background:
grid: 20
templates:
  fibre: [output_location, fibre_type, input_lens, output_lens, input_power_mW, output_power_mW]
  fibre-coupled: [input_fibre, output_fibre, input_lens, output_lens, input_power_mW, output_power_mW]
unit_properties: [input_power_mW, output_power_mW]
filter_tags: []
---

# Experiment map settings

Settings for the experiment map plugin. Edit this page in **source mode**: the
nested settings below don't show properly in the Properties panel.

- `experiments`: the names components may use in `experiment`, e.g.
  `[main, test]`. Leave it empty to allow any name. Experiments named under
  `channel_sources` are always allowed.
- `channel_sources`: optional scripts that list your control channels (DAQ
  lines, analogue outputs), one per experiment, each with the name of the
  channel page it generates. Without any, link controllers directly:
  `control_from: ["[[DAQ board]]"]` or `["[[DAQ board#line 3]]"]`. See
  "Channel sources" in the plugin's README.
- `types`: the allowed component types. `category` is `optical` or
  `electronics`; `source: true` means the component needs no inputs (lasers,
  RF sources, controllers); `color` is its box colour; `shape: round` draws an
  oval instead of a box; `subtitle: false` leaves the type and model line off
  its boxes, showing just the name.
- `link: true` on a type: its components are drawn as a connection with two
  ends instead of a box (fibres). `location` is the input end and
  `output_location` the output end; each end can be dragged on its own.
- `template: <name>` on a type: that template is filled in whenever a component
  of that type is created.
- `templates`: named lists of properties. "New component" can add one (and
  always adds the type's own) as blank properties to fill in. Properties the
  chosen model already sets are left out.
- `unit_properties`: properties that belong to one unit, not to its model
  (e.g. nominal powers). "Make model from this component" leaves them on the
  component.
- `wavelength_colors`: beam colour by wavelength in nm (as written in
  `wavelength_nm`), e.g. `{"780": "#c0102e", "1064": "#8e7cc3"}`. Unlisted
  wavelengths use `default_wavelength_color`.
- `background`: optional image drawn behind the map, e.g.
  `{image: lab-floorplan.png, scale: 1, x: 0, y: 0}` (image in `Experiment map/_resources/`).
- `grid`: spacing of the grid that dragged boxes snap to, in map units (a box
  is 150 × 46). `0` turns snapping off.
- `filter_tags`: values a component's `filter_tag` may take, e.g. `[locking]`.
  Each gets a chip in the map's toolbar that hides the components with that tag.
