// Core TUI interfaces and classes

// Autocomplete support
export {
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  CombinedAutocompleteProvider,
  type SlashCommand,
} from './autocomplete.js';

// Components
export { Box } from './components/box.js';
export { CancellableLoader } from './components/cancellable-loader.js';
export { Editor, type EditorOptions, type EditorTheme } from './components/editor.js';
export { HStack } from './components/h-stack.js';
export { Input } from './components/input.js';
export { Loader, type LoaderIndicatorOptions } from './components/loader.js';
export {
  type DefaultTextStyle,
  Markdown,
  type MarkdownOptions,
  type MarkdownTheme,
} from './components/markdown.js';
export { MouseRegion, type MouseRegionHandler } from './components/mouse-region.js';
export {
  ScrollView,
  type ScrollViewOptions,
  type ScrollViewScrollbar,
  type ScrollViewScrollToOptions,
} from './components/scroll-view.js';
export {
  type SelectItem,
  SelectList,
  type SelectListLayoutOptions,
  type SelectListTheme,
  type SelectListTruncatePrimaryContext,
} from './components/select-list.js';
export {
  type SettingItem,
  SettingsList,
  type SettingsListTheme,
} from './components/settings-list.js';
export { Spacer } from './components/spacer.js';
export { Text } from './components/text.js';
export { TruncatedText } from './components/truncated-text.js';
export {
  type StackChild,
  type StackEntry,
  type StackEntryOptions,
  type StackOptions,
  VStack,
} from './components/v-stack.js';

// Editor component interface (for custom editors)
export type { EditorComponent } from './editor-component.js';

// Fuzzy matching
export { type FuzzyMatch, fuzzyFilter, fuzzyMatch } from './fuzzy.js';

// Keybindings
export {
  getKeybindings,
  type Keybinding,
  type KeybindingConflict,
  type KeybindingDefinition,
  type KeybindingDefinitions,
  type Keybindings,
  type KeybindingsConfig,
  KeybindingsManager,
  setKeybindings,
  TUI_KEYBINDINGS,
} from './keybindings.js';

// Keyboard input handling
export {
  decodeKittyPrintable,
  isKeyRelease,
  isKeyRepeat,
  isKittyProtocolActive,
  Key,
  type KeyEventType,
  type KeyId,
  matchesKey,
  parseKey,
  setKittyProtocolActive,
} from './keys.js';

// Input buffering for batch splitting
export { StdinBuffer, type StdinBufferEventMap, type StdinBufferOptions } from './stdin-buffer.js';

// Terminal interface and implementations
export { ProcessTerminal, type Terminal } from './terminal.js';

// Terminal colors
export {
  parseOsc11BackgroundColor,
  parseTerminalColorSchemeReport,
  type RgbColor,
  type TerminalColorScheme,
} from './terminal-colors.js';

// Layout
export {
  LAYOUT_NODE,
  type LayoutComponent,
  type LayoutNode,
  type LayoutViewport,
  type ScrollLayoutNode,
  type ScrollLayoutState,
  type StackLayoutEntry,
  type StackLayoutNode,
  getLayoutNode,
} from './layout-node.js';

export {
  type Component,
  Container,
  CURSOR_MARKER,
  compositeTuiLine,
  type Focusable,
  isFocusable,
  isViewportTUI,
  type OverlayAnchor,
  type OverlayBounds,
  type OverlayHandle,
  type OverlayMargin,
  type OverlayOptions,
  type OverlayUnfocusOptions,
  type SizeValue,
  type TUI,
  type TuiInputListener,
  type TuiInputListenerResult,
  type TuiMode,
  type TuiMouseButton,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  type TuiMouseEventType,
  type TuiStopOptions,
  type ViewportTUI,
} from './tui.js';
export { TuiAltScreen, type TuiAltScreenOptions } from './tui-alt-screen.js';
export { TuiMainScreen, type TuiMainScreenRenderState } from './tui-main-screen.js';

// Utilities
export {
  getOsc8LinkAtColumn,
  hyperlink,
  sliceByColumn,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from './utils.js';
