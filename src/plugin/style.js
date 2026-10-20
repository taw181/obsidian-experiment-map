// Cytoscape can't read CSS variables, so the theme's colours are copied in.
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([^()]*\)|hsla?\([^()]*\))$/i;

export function readTheme(el) {
  const css = getComputedStyle(el);
  const pick = (name, fallback) => {
    const v = css.getPropertyValue(name).trim();
    return COLOR.test(v) ? v : fallback;
  };
  return {
    bg: pick('--background-primary', '#1e1e1e'),
    bgAlt: pick('--background-secondary', '#262626'),
    border: pick('--background-modifier-border', '#444444'),
    text: pick('--text-normal', '#dddddd'),
    muted: pick('--text-muted', '#999999'),
    accent: pick('--interactive-accent', '#7b6cd9'),
  };
}

export function buildStyle(theme) {
  return [
    { selector: 'node', style: { shape: 'round-rectangle', width: 150, height: 46, 'background-color': theme.bgAlt, 'border-width': 1.5, 'border-color': theme.border, label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 142, 'text-valign': 'center', 'text-halign': 'center', 'font-size': 11, color: theme.text, 'overlay-opacity': 0 } },
    { selector: 'node[color]', style: { 'background-color': 'data(color)', 'background-opacity': 0.2, 'border-color': 'data(color)' } },
    { selector: 'node[shape = "round"]', style: { shape: 'ellipse' } },
    { selector: 'node.electronics', style: { shape: 'rectangle', 'background-opacity': 0.35 } },
    { selector: 'node.status-broken', style: { 'border-color': '#e5484d', 'border-width': 3, 'background-color': '#e5484d' } },
    { selector: 'node.has-problem', style: { 'border-style': 'dashed' } },
    { selector: 'node.location', style: { shape: 'round-rectangle', 'background-color': theme.bgAlt, 'background-opacity': 0.55, 'border-width': 1, 'border-color': theme.border, 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -6, 'font-size': 13, 'font-weight': 600, color: theme.muted, padding: 28 } },
    { selector: 'node.root', style: { 'border-width': 3.5, 'border-color': theme.accent } },
    { selector: 'node.marker', style: { shape: 'ellipse', width: 14, height: 14, label: '', 'background-opacity': 1, 'border-width': 1.5 } },
    { selector: 'node.marker.root', style: { 'border-width': 3, 'border-color': theme.accent } },
    { selector: 'edge', style: { width: 2, 'curve-style': 'bezier', 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.9, 'overlay-opacity': 0 } },
    { selector: 'edge.beam', style: { width: 3.5 } },
    { selector: 'edge[sourceEndpoint]', style: { 'source-endpoint': 'data(sourceEndpoint)' } },
    { selector: 'edge.rf', style: { 'line-style': 'dashed', 'line-dash-pattern': [7, 5] } },
    { selector: 'edge.control', style: { 'line-style': 'dotted' } },
    { selector: 'edge.link', style: { 'text-events': 'yes', 'curve-style': 'unbundled-bezier', 'control-point-distances': [40], 'control-point-weights': [0.5], label: 'data(label)', 'font-size': 10, color: theme.text, 'text-background-color': theme.bg, 'text-background-opacity': 0.9, 'text-background-padding': 2, 'text-rotation': 'autorotate' } },
    { selector: 'edge.link[outline]', style: { 'line-outline-width': 2, 'line-outline-color': 'data(outline)' } },
    { selector: 'edge.lit', style: { label: 'data(label)', 'font-size': 10, color: theme.text, 'text-background-color': theme.bg, 'text-background-opacity': 0.9, 'text-background-padding': 2, 'text-rotation': 'autorotate' } },
    { selector: '.dim', style: { opacity: 0.15 } },
    { selector: '.hidden', style: { display: 'none' } },
  ];
}
