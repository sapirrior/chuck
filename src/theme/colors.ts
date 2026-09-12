/**
 * Theme palette with TrueColor RGB and ANSI fallbacks.
 */
export interface UITheme {
  brand: string;
  brandShimmer: string;
  permission: string;
  permissionDim: string;
  permissionShimmer: string;
  lavenderHeader: string;
  lavenderLight: string;
  bashPink: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  bulletSuccess: string;
  bulletError: string;
  bulletRunning: string;
  text: string;
  textMuted: string;
  subtle: string;
  inactive: string;
  promptBorder: string;
  userCardBg: string;
  userChevron: string;
  toolHeaderBg: string;
  diffAddBG: string;
  diffAddFG: string;
  diffDeleteBG: string;
  diffDeleteFG: string;
  dividerRule: string;
  dashedRule: string;
}

export const darkTheme: UITheme = {
  brand: 'rgb(215,119,87)', // Brand terracotta / coral (#D77757)
  brandShimmer: 'rgb(235,159,127)',
  permission: 'rgb(177,185,249)', // Soft blue-purple (#B1B9F9)
  permissionDim: 'rgb(93,100,128)',
  permissionShimmer: 'rgb(207,215,255)',
  lavenderHeader: 'rgb(129,136,165)', // #8188A5
  lavenderLight: 'rgb(183,184,228)', // #B7B8E4
  bashPink: 'rgb(253,93,177)', // Vibrant pink for bash mode (#FD5DB1)
  success: 'rgb(78,186,101)', // Green (#4EBA65)
  error: 'rgb(255,107,128)', // Red (#FF6B80)
  warning: 'rgb(255,193,7)', // Amber (#FFC107)
  info: 'rgb(123,165,218)', // Info sky blue (#7BA5DA)
  bulletSuccess: 'rgb(75,185,99)', // #4BB963
  bulletError: 'rgb(159,82,92)', // #9F525C
  bulletRunning: 'rgb(123,165,218)', // #7BA5DA
  text: 'rgb(255,255,255)', // White
  textMuted: 'rgb(110,110,110)', // #6E6E6E
  subtle: 'rgb(80,80,80)', // Dark gray (#505050)
  inactive: 'rgb(153,153,153)', // Muted gray
  promptBorder: 'rgb(136,136,136)',
  userCardBg: 'rgb(38,38,38)', // #262626 shaded user message background
  userChevron: 'rgb(82,82,82)', // #525252
  toolHeaderBg: 'rgb(35,35,40)',
  diffAddBG: 'rgb(19,54,14)', // #13360E
  diffAddFG: 'rgb(126,231,135)', // #7EE787
  diffDeleteBG: 'rgb(54,5,9)', // #360509
  diffDeleteFG: 'rgb(255,123,114)', // #FF7B72
  dividerRule: 'rgb(129,136,165)',
  dashedRule: 'rgb(51,51,51)',
};

export const lightTheme: UITheme = {
  brand: 'rgb(215,119,87)',
  brandShimmer: 'rgb(245,149,117)',
  permission: 'rgb(87,105,247)',
  permissionDim: 'rgb(140,150,200)',
  permissionShimmer: 'rgb(137,155,255)',
  lavenderHeader: 'rgb(100,110,145)',
  lavenderLight: 'rgb(120,130,190)',
  bashPink: 'rgb(219,39,119)',
  success: 'rgb(44,122,57)',
  error: 'rgb(171,43,63)',
  warning: 'rgb(150,108,30)',
  info: 'rgb(40,100,180)',
  bulletSuccess: 'rgb(44,122,57)',
  bulletError: 'rgb(171,43,63)',
  bulletRunning: 'rgb(87,105,247)',
  text: 'rgb(0,0,0)',
  textMuted: 'rgb(120,120,120)',
  subtle: 'rgb(175,175,175)',
  inactive: 'rgb(102,102,102)',
  promptBorder: 'rgb(153,153,153)',
  userCardBg: 'rgb(240,240,240)',
  userChevron: 'rgb(160,160,160)',
  toolHeaderBg: 'rgb(230,230,235)',
  diffAddBG: 'rgb(220,245,220)',
  diffAddFG: 'rgb(30,120,40)',
  diffDeleteBG: 'rgb(255,230,230)',
  diffDeleteFG: 'rgb(180,40,40)',
  dividerRule: 'rgb(120,130,160)',
  dashedRule: 'rgb(200,200,200)',
};

/**
 * Returns active theme (defaulting to darkTheme).
 * TODO: Wire dynamic theme selection to ~/.xd/settings.json (theme: 'dark' | 'light').
 */
export function getTheme(): UITheme {
  return darkTheme;
}
