---
name: ink
description: Build, debug, test, and maintain React-based terminal UIs with Ink for Node.js/TypeScript/JavaScript CLIs. Use when working with Ink components, hooks, lifecycle APIs, Flexbox/Yoga terminal layout, scrolling, terminal handoff, accessibility, testing, or CI/non-interactive behavior. Treat the supplied Ink reference as the source of truth and do not invent undocumented Ink APIs or behavior.
compatibility: Node.js application using React and Ink; interactive features depend on TTY/terminal capabilities.
---

# Ink

## Use When

Use this skill whenever a task involves the `ink` package as a React renderer for terminal/CLI applications, especially when an agent needs exact component props, hooks, lifecycle behavior, terminal input/output handling, layout rules, accessibility, testing, or rendering semantics.

Ink provides a React component model for command-line apps and uses Yoga for Flexbox-style terminal layout. React features are supported because Ink is a React renderer; this skill focuses on Ink-specific APIs and behavior. The supplied reference explicitly notes that its README documents an upcoming Ink version and points stable-release users to npm, so version-sensitive work must be checked against the installed package/version when available.

## Don't Use When

Do not use Ink-specific guidance for browser React rendering, DOM/CSS APIs, or a different terminal UI framework. Use general React knowledge for React APIs that are not Ink-specific, and verify the installed Ink version before asserting that a feature exists in production code.

## Workflow

1. Identify the task as one of: rendering/layout, input, focus, terminal streams, lifecycle, measurement/scrolling, accessibility, testing, or terminal/CI behavior.
2. Use the exact Ink API names and semantics in this skill. Do not substitute browser DOM elements for Ink components.
3. Remember the layout model: every element behaves as a Flexbox container; `display` defaults to `flex`; terminal text must be inside `<Text>`.
4. For interactive apps, account for the Node.js event loop. A mounted tree with no active asynchronous work can render once and exit.
5. Prefer Ink lifecycle APIs (`useInput`, `usePaste`, `useApp`, `useStdin`, `useStdout`, `useStderr`) instead of manually bypassing Ink's terminal state when an Ink API exists.
6. For terminal-size-dependent UI, use `useWindowSize` and/or `useBoxMetrics`; do not assume browser viewport semantics.
7. For scrollable views, use `overflow="hidden"` plus `contentOffsetX/Y`, measure the content wrapper separately, keep the content wrapper at `flexShrink={0}`, clamp offsets, and put padding on the content wrapper rather than the viewport.
8. For focusable UIs, use `useFocus`/`useFocusManager`; make focus order and `isActive` behavior explicit.
9. For terminal handoff to programs such as editors, pagers, or fuzzy finders, use `suspendTerminal()` and restore Ink state through its documented async/disposable behavior.
10. For accessibility, use `aria-label`, `aria-hidden`, `aria-role`, and `aria-state` only with the supported values below, and use `useIsScreenReaderEnabled` when alternate output is useful.
11. For deterministic output tests, prefer `renderToString()` or `ink-testing-library` as appropriate; know that terminal-session hooks are no-op/default-valued under `renderToString()`.
12. Before shipping, verify version-sensitive behavior against the installed Ink package, run tests/examples relevant to the change, and check interactive versus CI/non-interactive behavior.

## Rules

- Always import Ink primitives from `ink` (for example, `render`, `Text`, `Box`, `useInput`).
- Always wrap terminal text in `<Text>`; raw text is not a valid replacement for Ink text layout.
- `<Text>` may contain text nodes and nested `<Text>` components, not `<Box>` components.
- Treat `Box` as Flexbox by default. Its default `flexDirection` is the Yoga default used by Ink (`row`).
- Use numeric dimensions in terminal cells/rows or percentages where the documented prop accepts strings. Do not assume browser CSS units.
- Do not mutate terminal input state directly when Ink exposes an equivalent. In particular, prefer Ink's `setRawMode` over `process.stdin.setRawMode`.
- `setRawMode()` throws when raw mode is unsupported; check `isRawModeSupported` when fallback behavior matters.
- `useInput` normally invokes its handler per character/key event, but a multi-character paste is delivered once as a whole `input` string. When exact paste semantics are required, use `usePaste`.
- `usePaste` and `useInput` are separate channels; active paste content is not forwarded to `useInput` handlers.
- Focus management is enabled by default. `focusNext()` wraps from the last focusable component to the first; `focusPrevious()` wraps from the first to the last.
- `useBoxMetrics` reports zeroed metrics until the first layout pass, and also when the tracked ref is detached.
- `measureElement()` must not be used during render; before layout it returns zeroed metrics. Use post-render code such as effects, input handlers, or timers.
- `contentOffsetX/Y` are terminal cell/row offsets. Fractional values are truncated toward zero and non-finite values are treated as `0`.
- Do not build a scroll viewport with only a fixed-height parent and shrinking children. Keep the measured content wrapper at `flexShrink={0}`.
- Do not place padding on a scroll viewport when using `clientHeight`/`clientWidth` as the scroll bound; put padding on the content wrapper.
- `Transform` should be applied to `<Text>` children and must not change output dimensions, or layout can become incorrect.
- Styled `<Text>` output passed to `Transform` may contain ANSI escape sequences; use ANSI-aware helpers for whitespace/string surgery when needed.
- `render()` writes to streams and creates terminal behavior; `renderToString()` does not start a live terminal session.
- `onRender` runs after an Ink frame commits but does not wait for stream flush; use `waitUntilRenderFlush()` when flush completion matters.
- Do not reuse the same stdout across multiple `render()` calls without unmounting/cleanup when changing rendering options such as `concurrent` or `interactive`.
- `alternateScreen` is only effective in interactive mode; it removes access to terminal scrollback while active.
- In alternate-screen teardown, Ink treats teardown-time output as disposable and does not preserve/replay it after returning to the primary screen.
- Non-interactive/CI behavior differs from interactive terminal rendering. Do not assume cursor manipulation, resize handling, ANSI erase behavior, synchronized output, or kitty keyboard auto-detection are available there.
- Verify API details against the installed version when the supplied reference may describe an upcoming release.

## Examples

### Minimal CLI

```tsx
import React from 'react';
import {render, Text} from 'ink';

const App = () => <Text color="green">Hello World</Text>;

render(<App />);
```

### Counter with React state/effects

```tsx
import React, {useEffect, useState} from 'react';
import {render, Text} from 'ink';

const Counter = () => {
	const [counter, setCounter] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setCounter(value => value + 1);
		}, 100);

		return () => clearInterval(timer);
	}, []);

	return <Text color="green">{counter} tests passed</Text>;
};

render(<Counter />);
```

### Keyboard input

```tsx
import {useInput, useApp} from 'ink';

const App = () => {
	const {exit} = useApp();

	useInput((input, key) => {
		if (input === 'q' || key.escape) {
			exit();
		}

		if (key.upArrow) {
			// Move selection up
		}
	});

	return null;
};
```

### Focus

```tsx
import {Text, useFocus} from 'ink';

const Item = () => {
	const {isFocused} = useFocus({autoFocus: true});
	return <Text inverse={isFocused}>Item</Text>;
};
```

### Measure a Box after layout

```tsx
import React, {useEffect, useRef} from 'react';
import {Box, Text, measureElement} from 'ink';

const App = () => {
	const ref = useRef(null);

	useEffect(() => {
		if (!ref.current) return;
		const {x, y, width, height} = measureElement(ref.current);
		// Use values after layout has been calculated.
	}, []);

	return (
		<Box width={40}>
			<Box ref={ref}>
				<Text>Measured content</Text>
			</Box>
		</Box>
	);
};
```

### Scrollable viewport pattern

```tsx
import React, {useRef, useState} from 'react';
import {Box, useBoxMetrics, useInput} from 'ink';

const ScrollView = ({height, children}) => {
	const viewportRef = useRef(null);
	const contentRef = useRef(null);
	const {clientHeight} = useBoxMetrics(viewportRef);
	const content = useBoxMetrics(contentRef);
	const [requestedScrollTop, setRequestedScrollTop] = useState(0);
	const maxScrollTop = Math.max(0, content.height - clientHeight);
	const scrollTop = Math.min(requestedScrollTop, maxScrollTop);

	useInput((_, key) => {
		if (key.upArrow) setRequestedScrollTop(Math.max(0, scrollTop - 1));
		if (key.downArrow) setRequestedScrollTop(Math.min(maxScrollTop, scrollTop + 1));
	});

	return (
		<Box
			ref={viewportRef}
			height={height}
			overflow="hidden"
			contentOffsetY={scrollTop}
			flexDirection="column"
		>
			<Box ref={contentRef} flexDirection="column" flexShrink={0}>
				{children}
			</Box>
		</Box>
	);
};
```

### Render to a string

```tsx
import {renderToString, Box, Text} from 'ink';

const output = renderToString(
	<Box padding={1}>
		<Text color="green">Hello World</Text>
	</Box>,
	{columns: 40},
);
```

## Edge Cases

### Lifecycle and exit

An Ink app is a Node.js process. Active event-loop work such as timers, pending promises, or `useInput` listening keeps it alive. A tree with no active async work can render once and exit. The app can exit via Ctrl+C (enabled by default), `useApp().exit()`, or the `unmount()` method returned by `render()`. `waitUntilExit()` resolves/rejects according to the documented exit value/error, and waits for unmount-related stdout writes when unmount is manual.

`useApp().exit(errorOrResult)` behaves as follows: `exit()` resolves `waitUntilExit()` with `undefined`; an `Error` rejects it; another value resolves it with that value. `waitUntilRenderFlush()` instead waits for pending render output to flush to stdout.

### `useInput` key model

`useInput` exposes these boolean key fields: `leftArrow`, `rightArrow`, `upArrow`, `downArrow`, `return`, `escape`, `ctrl`, `shift`, `tab`, `backspace`, `delete`, `pageDown`, `pageUp`, `home`, `end`, `meta`, `super`, `hyper`, `capsLock`, and `numLock` (the documented default for key flags is `false`). `super`, `hyper`, `capsLock`, `numLock`, and `eventType` require the kitty keyboard protocol. `eventType` is `'press' | 'repeat' | 'release'` and is `undefined` without the protocol.

With kitty keyboard support enabled, non-printable keys produce empty `input` and should be detected via the `key` object. The protocol can disambiguate cases such as Ctrl+I vs Tab, Shift+Enter vs Enter, and Escape vs Ctrl+[. With `reportEventTypes`, press/repeat/release is available through `key.eventType`.

### Kitty keyboard protocol

`render(..., {kittyKeyboard})` accepts `mode: 'auto' | 'enabled' | 'disabled'` with default `'auto'`. Auto mode uses a heuristic precheck followed by protocol query confirmation. Enabled mode forces the protocol and requires TTY stdin and stdout. Disabled mode never enables it.

Available flags are `disambiguateEscapeCodes`, `reportEventTypes`, `reportAlternateKeys`, `reportAllKeysAsEscapeCodes`, and `reportAssociatedText`. The default flags value is `['disambiguateEscapeCodes']`.

### Terminal handoff

`useApp().suspendTerminal(callback?)` temporarily hands the terminal to a child process and then restores Ink state with a full redraw. During suspension, Ink stops writing output and consuming input and restores terminal modes expected by the child: raw mode off, cursor visible, bracketed paste off, alternate screen exited, and kitty keyboard protocol off. Suspension is supported only in interactive TTY mode; in non-interactive output the callback still runs but no terminal handoff occurs. Nested active suspensions throw.

With a callback, suspension lasts until the callback settles, including when it throws. Without a callback, `await suspendTerminal()` returns a suspension whose async `resume()` restores the terminal; the suspension is also disposable for `await using`.

### Layout measurement and hit-testing

`useBoxMetrics(ref)` returns `width`, `height`, `left`, `top`, `clientWidth`, `clientHeight`, and `hasMeasured`. `left` and `top` are layout coordinates and do not include ancestor `contentOffsetX/Y`. For hit-testing inside a scrolled container, subtract the applicable content offsets and account for the live region's viewport position when converting pointer/event coordinates.

`measureElement(ref.current)` returns `x`, `y`, `width`, `height`, `clientWidth`, and `clientHeight`. Its `x`/`y` coordinates are layout-tree coordinates, not automatically converted terminal viewport coordinates. `clientWidth` and `clientHeight` exclude borders but not padding.

### Wide-character scrolling

When `contentOffsetX/Y` splits a wide terminal character such as CJK text, the hidden half still occupies a terminal cell and is rendered as blank so following columns remain aligned. Styling of that blank is best-effort; inline background/color from the split character is not necessarily carried over.

### Static output

`<Static>` permanently renders its output above the live content. It is suited to completed tasks or logs whose item count is not known in advance. Only newly added `items` render; changes to previously rendered items do not trigger a rerender. Each item renderer's root component must receive a React `key`.

### Transform dimensions and ANSI

`<Transform>` receives string output from child `<Text>` content and transforms it line by line. It may be called as `transform(outputLine, index)`, where `index` is the zero-based output-line index. Do not change output dimensions. Styled text may include ANSI escape sequences, so plain `.trim()`/slicing can be unsafe.

### `renderToString()` semantics

`renderToString(tree, options?)` synchronously returns a string and does not write to stdout, set terminal listeners, or start a persistent terminal app. The default virtual width is 80 columns, configurable with `columns`.

The terminal-oriented hooks `useInput`, `useStdin`, `useStdout`, `useStderr`, `useWindowSize`, `useApp`, `useFocus`, and `useFocusManager` return default/no-op values under `renderToString()`. They do not behave like a live terminal session. `useEffect` runs during synchronous rendering, but state updates it triggers do not alter the returned output; `useLayoutEffect` state updates can be reflected. `<Static>` output is supported and prepended to dynamic output. Render errors propagate after cleanup.

### CI and non-interactive output

Ink detects interactive behavior from CI status and `stdout.isTTY` unless `interactive` is explicitly overridden. Default interactive behavior is `true`, but becomes `false` in CI or when `stdout.isTTY` is falsy. Non-interactive mode skips terminal-specific ANSI erase sequences, cursor manipulation, synchronized output, resize handling, and kitty keyboard auto-detection; only the final frame of non-static output is written at unmount.

CI rendering also does not listen for terminal resize events by default. The documented way to opt out of CI behavior is `CI=false`.

### Alternate screen

`alternateScreen` defaults to `false`, only works in interactive mode, and uses the terminal's alternate screen buffer. Scrollback is unavailable while active. Ink intentionally treats alternate-screen teardown output as disposable.

## Reference

### Installation and scaffolding

```sh
npm install ink react
```

Recommended scaffolding:

```sh
npx create-ink-app my-ink-cli
npx create-ink-app --typescript my-ink-cli
```

The supplied reference also documents a manual Babel setup for JSX using `@babel/preset-react`, but modern project setup should follow the installed project's toolchain rather than copying an obsolete bundler configuration blindly.

### Built-in components

| Component | Purpose | Key details |
|---|---|---|
| `<Text>` | Render styled terminal text | Text nodes/nested `<Text>` only; `color`, `backgroundColor`, `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, `inverse`, `wrap` |
| `<Box>` | Flexbox layout container | Dimensions, padding, margin, gap, flex, alignment, position, visibility, scrolling offsets, borders, background |
| `<Newline>` | Insert line breaks | Must be inside `<Text>`; `count` defaults to `1` |
| `<Spacer>` | Flexible major-axis space | Fills available space between siblings; useful with row/column layouts |
| `<Static>` | Permanently rendered output | New `items` only; root item needs a `key` |
| `<Transform>` | Transform rendered text strings | Text children only; preserve dimensions; transform is line-oriented |

### `<Text>` props

- `color: string` - text color; Ink uses Chalk and supports its color functionality.
- `backgroundColor: string` - text background color.
- `dimColor: boolean = false` - dim color.
- `bold: boolean = false` - bold.
- `italic: boolean = false` - italic.
- `underline: boolean = false` - underline.
- `strikethrough: boolean = false` - crossed-out text.
- `inverse: boolean = false` - invert foreground/background colors.
- `wrap: 'wrap' | 'hard' | 'truncate' | 'truncate-start' | 'truncate-middle' | 'truncate-end' = 'wrap'` - wrap or truncate when width is insufficient. `truncate` aliases `truncate-end`.

### `<Box>` layout props

**Dimensions**

- `width: number | string` - width in spaces; percentage strings use the parent width.
- `height: number | string` - height in rows; percentage strings use the parent height.
- `minWidth: number` - minimum width; percentages are not supported by the documented reference.
- `minHeight: number | string` - minimum height; percentages are supported relative to the parent.
- `maxWidth: number` - maximum width; percentages are not supported by the documented reference.
- `maxHeight: number | string` - maximum height; percentages are supported relative to the parent.
- `aspectRatio: number` - width/height ratio; use with at least one size constraint.

**Spacing**

- `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight: number = 0`.
- `paddingX`, `paddingY`, `padding: number = 0`; these are shorthand combinations.
- `marginTop`, `marginBottom`, `marginLeft`, `marginRight: number = 0`.
- `marginX`, `marginY`, `margin: number = 0`; these are shorthand combinations.
- `gap`, `columnGap`, `rowGap: number = 0`.

**Flex**

- `flexGrow: number = 0`.
- `flexShrink: number = 1`.
- `flexBasis: number | string`.
- `flexDirection: 'row' | 'row-reverse' | 'column' | 'column-reverse'`.
- `flexWrap: 'nowrap' | 'wrap' | 'wrap-reverse'`.
- `alignItems: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline'`.
- `alignSelf: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline'`, default `auto`.
- `alignContent: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'space-between' | 'space-around' | 'space-evenly'`, default `flex-start`.
- `justifyContent: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly'`.

**Position and visibility**

- `position: 'relative' | 'absolute' | 'static'`, default `relative`.
- `top`, `right`, `bottom`, `left: number | string`.
- `display: 'flex' | 'none'`, default `flex`.
- `overflowX`, `overflowY`, `overflow: 'visible' | 'hidden'`, defaults `visible`.
- `contentOffsetX`, `contentOffsetY: number`, default `0`.

**Borders**

- `borderStyle: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic' | BoxStyle`.
- `borderColor: string` plus side-specific `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor`.
- `borderDimColor: boolean = false` plus side-specific `borderTopDimColor`, `borderBottomDimColor`, `borderLeftDimColor`, `borderRightDimColor`.
- `borderBackgroundColor: string` plus side-specific `borderTopBackgroundColor`, `borderBottomBackgroundColor`, `borderRightBackgroundColor`, `borderLeftBackgroundColor`. Side-specific background values fall back to `borderBackgroundColor` when unspecified.
- `borderTop`, `borderRight`, `borderBottom`, `borderLeft: boolean = true` control side visibility.

**Background**

- `backgroundColor: string` - fills the entire `<Box>` area and is inherited by child `<Text>` unless overridden there.

### `<Static>` props

- `items: Array` - items rendered through the child function.
- `style: object` - container styles using supported `<Box>` properties.
- `children(item): Function` - called with the item and its index; root output must have a `key`.

### `<Transform>`

`transform(outputLine, index)` receives a `string` and a zero-based line index and must return transformed children/string output without changing dimensions.

### Hooks

| Hook | Returns/does | Important options/values |
|---|---|---|
| `useInput(handler, options?)` | Handles terminal input | `isActive` default `true`; handler gets `(input, key)` |
| `usePaste(handler, options?)` | Receives pasted text | `isActive` default `true`; bracketed paste enabled while active |
| `useApp()` | App lifecycle | `exit`, `waitUntilRenderFlush`, `suspendTerminal` |
| `useStdin()` | stdin utilities | `stdin`, `isRawModeSupported`, `setRawMode` |
| `useStdout()` | stdout utilities | `stdout`, `write(string)` |
| `useBoxMetrics(ref)` | Current tracked layout metrics | `width`, `height`, `left`, `top`, `clientWidth`, `clientHeight`, `hasMeasured` |
| `useStderr()` | stderr utilities | `stderr`, `write(string)` |
| `useWindowSize()` | Terminal dimensions | `columns`, `rows`; rerenders on resize in interactive mode |
| `useFocus(options?)` | Focus state/control | `autoFocus`, `isActive`, optional `id` |
| `useFocusManager()` | Global focus control | `enableFocus`, `disableFocus`, `focusNext`, `focusPrevious`, `focus(id)`, `activeId` |
| `useCursor()` | Cursor position after render | `setCursorPosition({x, y} | undefined)` |
| `useIsScreenReaderEnabled()` | Screen-reader detection | boolean |
| `useAnimation(options?)` | Shared animation clock | `interval` default `100`; `isActive` default `true`; returns `frame`, `time`, `delta`, `reset` |

### `useAnimation()` semantics

All `useAnimation` consumers share a single internal timer. `frame` increments once per interval. `time` is elapsed milliseconds since animation start/reset. `delta` is milliseconds since the previous rendered tick and accounts for throttled renders. `reset()` zeroes `frame`, `time`, and `delta` and restarts timing. Setting `isActive` to `false` stops the animation; switching it back to `true` resets the values to zero.

### `useCursor()` semantics

`setCursorPosition(undefined)` hides the cursor. `x` is a 0-based column and `y` is a row from the top of the Ink output, with `0` as the first line. Use `string-width` for `x` calculations involving wide characters such as CJK text or emoji.

### Render API

`render(tree, options?)` returns an Ink `Instance`.

Options:

- `stdout: stream.Writable`, default `process.stdout`.
- `stdin: stream.Readable`, default `process.stdin`.
- `stderr: stream.Writable`, default `process.stderr`.
- `exitOnCtrlC: boolean`, default `true`.
- `patchConsole: boolean`, default `true`; patches `console.*` output so it does not overlap Ink rendering and restores native console behavior when unmount starts.
- `onRender: ({renderTime: number}) => void`; runs after commit, before stream flush completion.
- `isScreenReaderEnabled: boolean`; default `process.env['INK_SCREEN_READER'] === 'true'`.
- `debug: boolean`, default `false`; renders each update separately instead of replacing the previous output.
- `maxFps: number`, default `30`.
- `incrementalRendering: boolean`, default `false`; updates changed lines rather than redrawing the whole output.
- `concurrent: boolean`, default `false`; enables React Concurrent Rendering behavior.
- `interactive: boolean`; default `true`, except `false` in CI or when `stdout.isTTY` is falsy.
- `alternateScreen: boolean`, default `false`.
- `kittyKeyboard: {mode, flags}?`; default `undefined`.

Concurrent rendering supports Suspense for async data fetching, `useTransition`, and `useDeferredValue`, and can interrupt lower-priority work. Tests may need `act()` to await updates correctly.

### `renderToString()`

`renderToString(tree, options?) -> string` renders synchronously without starting a terminal session. `columns` is the documented option and defaults to `80`.

### `Instance` methods

The object returned by `render()` exposes:

- `rerender(tree)` - replace the root node or update current root props.
- `unmount()` - manually unmount the app.
- `waitUntilExit()` - promise settled when the app unmounts; resolves with an exit value or rejects with an exit error.
- `waitUntilRenderFlush()` - promise settled after pending render output flushes to stdout.
- `cleanup()` - unmounts and deletes the internal Ink instance associated with the current stdout; useful for tests/fresh instances and also tears down terminal state.
- `clear()` - clears Ink output.

### Measurement API

`measureElement(ref)` measures a referenced `<Box>` and returns `x`, `y`, `width`, `height`, `clientWidth`, and `clientHeight`. Call it after layout has occurred.

### Accessibility

Ink provides basic screen-reader support. Enable it with `render(..., {isScreenReaderEnabled: true})` or `INK_SCREEN_READER=true`. The documented ARIA subset is:

- `aria-label: string` - accessible label.
- `aria-hidden: boolean = false` - hide from screen readers.
- `aria-role: string` - supported roles: `button`, `checkbox`, `combobox`, `list`, `listbox`, `listitem`, `menu`, `menuitem`, `option`, `progressbar`, `radio`, `radiogroup`, `tab`, `tablist`, `table`, `textbox`, `timer`, `toolbar`.
- `aria-state: object` - supported boolean state keys: `busy`, `checked`, `disabled`, `expanded`, `multiline`, `multiselectable`, `readonly`, `required`, `selected`.

Use `useIsScreenReaderEnabled()` when you need to produce different or more descriptive output for screen-reader users.

### Testing and debugging

For component testing, the supplied reference recommends `ink-testing-library` and demonstrates `render(<Test />)` with `lastFrame()` assertions.

For React Devtools:

```sh
npm install react-devtools-core
DEV=true my-cli
npx react-devtools
```

After Devtools is running, the CLI component tree can be inspected and component props can be changed live. The supplied reference notes that the CLI must be manually stopped with Ctrl+C after testing.

For examples in the Ink repository:

```sh
npm run example examples/[example-name]
```

The supplied reference lists examples for Jest-style output, counters, forms, borders, Suspense, tables, focus management, user input, stdout/stderr writes, Static output, child-process output, and router usage.

### Common useful companion packages

The supplied reference lists ecosystem packages including `ink-text-input`, `ink-spinner`, `ink-select-input`, `ink-link`, `ink-gradient`, `ink-big-text`, `ink-picture`, `ink-tab`, `ink-color-pipe`, `ink-multi-select`, `ink-divider`, `ink-progress-bar`, `ink-table`, `ink-ascii`, `ink-markdown`, `ink-quicksearch-input`, `ink-confirm-input`, `ink-syntax-highlight`, `ink-form`, `ink-task-list`, `ink-spawn`, `ink-titled-box`, `ink-chart`, `ink-scroll-view`, `ink-scroll-list`, `ink-stepper`, `ink-virtual-list`, and `ink-color-picker`. These are separate packages; do not assume they are built into Ink.

## Verification Checklist

Before considering Ink work complete:

1. Confirm the API exists in the version actually installed or explicitly state that the supplied reference documents an upcoming version.
2. Confirm all terminal text is under `<Text>` and the layout is built with `<Box>`/documented primitives.
3. Check Flexbox defaults, dimensions, wrapping/truncation, padding/margins, gaps, and shrink behavior.
4. For input, verify the chosen handler (`useInput` vs `usePaste`), active-state gating, and key fields.
5. For focus, verify focus order, activation state, IDs, and keyboard shortcuts.
6. For measurement/scrolling, check post-layout timing, `clientHeight`/`clientWidth`, `contentOffsetX/Y`, content-wrapper `flexShrink={0}`, and padding placement.
7. For cursor/IME behavior, verify coordinates and wide-character width calculations.
8. For lifecycle, verify exit/unmount behavior and use `waitUntilRenderFlush()` when output flush ordering matters.
9. For external programs, use `suspendTerminal()` rather than manually reconstructing Ink's terminal modes.
10. Test both interactive and non-interactive/CI execution when behavior depends on TTY capabilities.
11. For accessibility, test screen-reader mode and only use the documented ARIA role/state subset.
12. For string rendering, use `renderToString()` or `ink-testing-library` deliberately and account for their documented hook semantics.

## References

Primary source: the supplied `ink.md` reference/readme. It describes Ink as React for CLIs, its Yoga/Flexbox layout model, lifecycle, components, hooks, API, testing, accessibility, examples, and CI behavior. It also explicitly says the document describes an upcoming version of Ink rather than necessarily the latest stable npm release.

Format basis: [Agent Skills specification](https://agentskills.io/specification). The skill follows its required frontmatter model and progressive-disclosure guidance, while using explicit routing, rules, workflow, examples, edge cases, and verification sections for agent reliability.

Local design references: the installed `docx` and `pdfs` skills use explicit routing, non-negotiable rules, staged workflows, troubleshooting/edge-case guidance, and final verification gates. Their structure informed this skill.
