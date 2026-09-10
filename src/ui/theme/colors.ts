/**
 * Palette colors matching Claude Code's theme system with TrueColor RGB and ANSI fallbacks.
 */
export interface UITheme {
  brand: string;
  brandShimmer: string;
  permission: string;
  permissionShimmer: string;
  success: string;
  error: string;
  warning: string;
  text: string;
  subtle: string;
  inactive: string;
  promptBorder: string;
  userCardBg: string;
  toolHeaderBg: string;
}

export const darkTheme: UITheme = {
  brand: 'rgb(215,119,87)', // Brand coral / orange
  brandShimmer: 'rgb(235,159,127)',
  permission: 'rgb(177,185,249)', // Soft blue-purple
  permissionShimmer: 'rgb(207,215,255)',
  success: 'rgb(78,186,101)', // Green
  error: 'rgb(255,107,128)', // Red
  warning: 'rgb(255,193,7)', // Amber
  text: 'rgb(255,255,255)', // White
  subtle: 'rgb(80,80,80)', // Dark gray
  inactive: 'rgb(153,153,153)', // Muted gray
  promptBorder: 'rgb(136,136,136)',
  userCardBg: 'rgb(45,45,45)',
  toolHeaderBg: 'rgb(35,35,40)',
};

export const lightTheme: UITheme = {
  brand: 'rgb(215,119,87)',
  brandShimmer: 'rgb(245,149,117)',
  permission: 'rgb(87,105,247)',
  permissionShimmer: 'rgb(137,155,255)',
  success: 'rgb(44,122,57)',
  error: 'rgb(171,43,63)',
  warning: 'rgb(150,108,30)',
  text: 'rgb(0,0,0)',
  subtle: 'rgb(175,175,175)',
  inactive: 'rgb(102,102,102)',
  promptBorder: 'rgb(153,153,153)',
  userCardBg: 'rgb(240,240,240)',
  toolHeaderBg: 'rgb(230,230,235)',
};

/**
 * Returns active theme (defaulting to darkTheme).
 */
export function getTheme(): UITheme {
  return darkTheme;
}
