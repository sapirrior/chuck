import { describe, expect, it } from 'bun:test';
import TerminalEngine from '../../src/tui/engine/TerminalEngine.js';
import PromptInput from '../../src/tui/components/PromptInput.js';

describe('PromptInput Spinner & Permission Dock Lifecycle (Section 17 & 18)', () => {
  it('resumes spinner frame animation after unmount and remount while disabled', async () => {
    const engine = new TerminalEngine();
    const promptInput = new PromptInput({
      onSubmit: () => {},
      onAbort: () => {},
    });

    // 1. Set disabled (as occurs during agent turn generation)
    promptInput.setDisabled(true);

    // 2. Mount to engine
    engine.mount(promptInput, { kind: 'input' });

    // 3. Wait 200ms to allow spinner frames to advance
    await new Promise((resolve) => setTimeout(resolve, 200));
    const frameAfterMount = promptInput.state.spinnerFrame;
    expect(frameAfterMount).toBeGreaterThan(0);

    // 4. Simulate BashPermissionDock opening -> unmount PromptInput
    engine.unmount(promptInput);

    const frameAtUnmount = promptInput.state.spinnerFrame;

    // 5. Wait a moment while unmounted (frames should pause)
    await new Promise((resolve) => setTimeout(resolve, 150));
    const frameWhileUnmounted = promptInput.state.spinnerFrame;
    expect(frameWhileUnmounted).toBe(frameAtUnmount);

    // 6. User resolves permission dock (Yes/No) -> remount SAME PromptInput instance
    engine.mount(promptInput, { kind: 'input' });

    // 7. Wait 200ms to ensure spinner resumes advancing
    await new Promise((resolve) => setTimeout(resolve, 200));
    const frameAfterRemount = promptInput.state.spinnerFrame;
    expect(frameAfterRemount).toBeGreaterThan(frameWhileUnmounted);

    // 8. Turn completes -> setDisabled(false)
    promptInput.setDisabled(false);
    const frameAtDisabledFalse = promptInput.state.spinnerFrame;

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(promptInput.state.spinnerFrame).toBe(frameAtDisabledFalse);

    // 9. Clean unmount and engine teardown
    engine.unmount(promptInput);
    engine.cleanupSync();
  });
});
