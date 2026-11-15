// The look plan, in one place. SABLE LINE is a dusk rail depot: deep
// blue-grey concrete, warm sodium amber, one cool steel blue for the
// defending team. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#171a21',
  surface: '#232833',
  hairline: '#39404d',
  ink: '#ece7da',
  muted: '#8d9aa8',
  accent: '#f2a33c',
  teamA: '#f2a33c',
  teamB: '#5f9bd8',
  danger: '#e0524d',
};

export function shade(name) {
  return PALETTE[name];
}
