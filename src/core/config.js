import { asList } from './wikilink.js';

// Defaults are generic; everything lab-specific comes from Experiment map/Config.md.

export const STATUSES = ['active', 'spare', 'broken', 'retired'];

export const DEFAULT_CONFIG = {
  components_folder: 'Experiment map/Components',
  models_folder: 'Experiment map/Models',
  channels_folder: 'Experiment map/Channels',
  output_folder: 'Experiment map',
  channel_sources: [],
  experiments: [],
  types: {
    laser: { category: 'optical', source: true, color: '#e0902a' },
    amplifier: { category: 'optical', color: '#d0b030' },
    aom: { category: 'optical', color: '#4a80c0' },
    eom: { category: 'optical', color: '#6a6fc0' },
    shutter: { category: 'optical', color: '#c06a6a' },
    fibre: { category: 'optical', color: '#3a9ad9', link: true },
    lock: { category: 'optical', color: '#9a8a5a' },
    destination: { category: 'optical', color: '#8a8a8a', shape: 'round', subtitle: false },
    rf_source: { category: 'electronics', source: true, color: '#9070c0' },
    controller: { category: 'electronics', source: true, color: '#708090' },
  },
  wavelength_colors: {},
  default_wavelength_color: '#999999',
  rf_color: '#b48ce6',
  control_color: '#9aa4b1',
  background: null,
  grid: 20,
  templates: {},
  unit_properties: [],
  filter_tags: [],
};

const FOLDERS = ['components_folder', 'models_folder', 'channels_folder', 'output_folder'];

export function resolveConfig(frontmatter) {
  const cfg = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const v = frontmatter?.[key];
    if (v !== undefined && v !== null && v !== '') cfg[key] = v;
  }
  for (const key of FOLDERS) cfg[key] = String(cfg[key]).replace(/\/+$/, '');
  cfg.channel_sources = (Array.isArray(cfg.channel_sources) ? cfg.channel_sources : [])
    .filter(s => s && typeof s === 'object')
    .map(s => ({ ...s, experiment: String(s.experiment ?? ''), channel_page: String(s.channel_page ?? `${s.experiment} channels`) }));
  cfg.experiments = asList(cfg.experiments).map(String);
  // Config.md from before channel sources: say so instead of silently reading no channels.
  if (frontmatter?.hardware !== undefined && frontmatter?.channel_sources === undefined) cfg.legacyHardware = true;
  cfg.filter_tags = asList(cfg.filter_tags).map(String);
  return cfg;
}

export function wavelengthColor(config, nm) {
  if (nm === undefined || nm === null) return config.default_wavelength_color;
  return config.wavelength_colors[String(nm)] ?? config.default_wavelength_color;
}

// Types drawn on the map as a connection with two ends (fibres).
export const isLinkType = (config, type) => Boolean(type && config.types[type]?.link);
export const linkTypes = config => new Set(Object.keys(config.types).filter(t => config.types[t]?.link));

const isBlank = v => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

// Blank properties a new component starts with: its type's template, then the
// chosen one, minus keys already written and keys the model already sets.
export function templateProperties(config, { type, template = '', modelProps = {}, existing = [] }) {
  const lists = [config.types[type]?.template, template].filter(Boolean).map(t => asList(config.templates?.[t]));
  const skip = new Set(existing);
  return [...new Set(lists.flat().map(String))].filter(k => !skip.has(k) && isBlank(modelProps[k]));
}
